import { describe, it, expect } from "vitest";
import { buildWhere } from "@/lib/event-query";
import { NO_FILTERS, type EventFilters } from "@/lib/event-filters";

const filtros = (p: Partial<EventFilters> = {}): EventFilters => ({ ...NO_FILTERS, ...p });

// A partir de agora o webhook grava também as respostas que a própria conta
// envia pelo celular ("message_sent"), para o histórico de conversa. Essas
// linhas NÃO podem vazar para a lista de /eventos, que se apresenta como o que
// chegou até o usuário — senão a tela passa a mostrar o dono do painel
// conversando consigo mesmo.

describe("respostas da própria conta ficam fora da lista de interações", () => {
  it("exclui message_sent mesmo sem nenhum filtro", () => {
    expect(buildWhere("conta-1", filtros()).sql).toContain("e.type <> 'message_sent'");
  });

  it("continua excluindo com filtro de período", () => {
    expect(buildWhere("conta-1", filtros({ period: "7d" })).sql).toContain(
      "e.type <> 'message_sent'"
    );
  });

  it("continua excluindo com busca por texto", () => {
    expect(buildWhere("conta-1", filtros({ q: "quero" })).sql).toContain(
      "e.type <> 'message_sent'"
    );
  });

  it("a exclusão não consome parâmetro — o valor é constante nossa, não do usuário", () => {
    const w = buildWhere("conta-1", filtros());
    expect(w.params).toEqual(["conta-1"]);
  });

  it("não atrapalha a numeração dos parâmetros dos filtros", () => {
    const w = buildWhere("c", filtros({ type: "comment", q: "oi" }));
    expect(w.params).toEqual(["c", "comment", "%oi%"]);
    expect(w.sql).toContain("e.type = $2");
    expect(w.sql).toContain("ilike $3");
  });
});
