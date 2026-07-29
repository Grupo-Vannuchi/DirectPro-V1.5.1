import { describe, it, expect } from "vitest";
import { buildWhere } from "@/lib/event-query";
import { NO_FILTERS, type EventFilters } from "@/lib/event-filters";

const filtros = (p: Partial<EventFilters> = {}): EventFilters => ({ ...NO_FILTERS, ...p });

describe("isolamento por conta", () => {
  it("sempre filtra pela conta, mesmo sem nenhum filtro", () => {
    const w = buildWhere("conta-1", filtros());
    expect(w.sql).toContain("e.account_id = $1");
    expect(w.params).toEqual(["conta-1"]);
  });

  it("mantém a condição de conta entre parênteses", () => {
    // Sem os parênteses, `A or B and C` é lido como `A or (B and C)`: bastaria
    // um filtro ao lado para a listagem passar a mostrar evento de OUTRA conta.
    // Foi um bug real; este teste existe para ele não voltar.
    const w = buildWhere("conta-1", filtros({ type: "comment" }));
    expect(w.sql).toContain("(e.account_id = $1 or e.account_id is null)");
    expect(w.sql).toContain("and");
  });
});

describe("filtros viram parâmetro, nunca texto colado no SQL", () => {
  it("tipo entra como $2", () => {
    const w = buildWhere("conta-1", filtros({ type: "comment" }));
    expect(w.sql).toContain("e.type = $2");
    expect(w.params).toEqual(["conta-1", "comment"]);
  });

  it("post entra como parâmetro", () => {
    const w = buildWhere("conta-1", filtros({ post: "17912345" }));
    expect(w.sql).toContain("e.payload->'media'->>'id' = $2");
    expect(w.params).toEqual(["conta-1", "17912345"]);
  });

  it("período vira um número de dias, não um trecho de SQL", () => {
    const w = buildWhere("conta-1", filtros({ period: "7d" }));
    expect(w.sql).toContain("make_interval(days => $2::int)");
    expect(w.params).toEqual(["conta-1", 7]);
  });

  it("'tudo' não acrescenta condição de data", () => {
    const w = buildWhere("conta-1", filtros({ period: "tudo" }));
    expect(w.sql).not.toContain("make_interval");
    expect(w.params).toHaveLength(1);
  });

  it("numera os parâmetros na ordem em que aparecem no SQL", () => {
    const w = buildWhere("c", filtros({ type: "comment", post: "123", period: "30d" }));
    const usados = [...w.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...usados)).toBe(w.params.length);
    expect(w.params).toEqual(["c", "comment", "123", 30]);
  });
});

describe("busca", () => {
  it("procura nos cinco campos onde o texto e o @ podem estar", () => {
    const w = buildWhere("conta-1", filtros({ q: "quero" }));
    expect(w.sql).toContain("e.payload->>'text' ilike $2");
    expect(w.sql).toContain("e.payload->'message'->>'text' ilike $2");
    expect(w.sql).toContain("e.payload->'from'->>'username' ilike $2");
    expect(w.sql).toContain("cf.username ilike $2");
    expect(w.sql).toContain("cs.username ilike $2");
  });

  it("usa um parâmetro só para os cinco campos", () => {
    const w = buildWhere("conta-1", filtros({ q: "quero" }));
    expect(w.params).toEqual(["conta-1", "%quero%"]);
  });

  it("agrupa as alternativas, para o `or` não vazar para fora", () => {
    // Sem o parêntese em volta do bloco de busca, o `or` se juntaria às outras
    // condições e o filtro de conta deixaria de valer.
    const w = buildWhere("conta-1", filtros({ q: "quero", type: "comment" }));
    expect(w.sql).toContain("(e.payload->>'text' ilike");
    expect(w.sql.trimEnd().endsWith(")")).toBe(true);

    // e os parênteses fecham todos
    const abre = (w.sql.match(/\(/g) ?? []).length;
    const fecha = (w.sql.match(/\)/g) ?? []).length;
    expect(abre).toBe(fecha);
  });

  describe("escape de curinga", () => {
    it("% digitado procura o caractere, não 'qualquer coisa'", () => {
      // Sem escape, buscar "100%" devolveria a lista inteira.
      const w = buildWhere("c", filtros({ q: "100%" }));
      expect(w.params[1]).toBe("%100\\%%");
    });

    it("_ digitado procura o caractere, não 'uma letra qualquer'", () => {
      const w = buildWhere("c", filtros({ q: "a_b" }));
      expect(w.params[1]).toBe("%a\\_b%");
    });

    it("a própria barra invertida é escapada", () => {
      const w = buildWhere("c", filtros({ q: "a\\b" }));
      expect(w.params[1]).toBe("%a\\\\b%");
    });

    it("texto comum passa intacto", () => {
      const w = buildWhere("c", filtros({ q: "quero o link" }));
      expect(w.params[1]).toBe("%quero o link%");
    });

    it("aspas e ponto e vírgula seguem sendo dado, não comando", () => {
      const w = buildWhere("c", filtros({ q: "'; drop table events; --" }));
      expect(w.params[1]).toBe("%'; drop table events; --%");
      expect(w.sql).not.toContain("drop table");
    });
  });
});

describe("todos os filtros juntos", () => {
  it("combina as condições com and e não perde nenhum parâmetro", () => {
    const w = buildWhere("conta-1", {
      type: "message",
      post: "999",
      period: "24h",
      q: "oi",
    });
    expect(w.params).toEqual(["conta-1", "message", "999", 1, "%oi%"]);
    expect(w.sql.split("and").length - 1).toBeGreaterThanOrEqual(4);
  });
});
