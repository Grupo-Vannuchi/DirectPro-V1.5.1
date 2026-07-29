import { describe, it, expect } from "vitest";
import { parseFilters, toQueryString, temFiltro, SEM_FILTRO, BUSCA_MAX } from "@/lib/event-filters";

// parseFilters é a fronteira entre a URL, que qualquer um edita, e a consulta
// ao banco. O que passar daqui vira SQL.

describe("parseFilters", () => {
  it("aceita os valores válidos", () => {
    expect(parseFilters({ tipo: "comment", periodo: "7d", post: "17912345", q: "quero" })).toEqual({
      tipo: "comment",
      periodo: "7d",
      post: "17912345",
      q: "quero",
    });
  });

  it("sem parâmetro nenhum, devolve o estado sem filtro", () => {
    expect(parseFilters({})).toEqual(SEM_FILTRO);
  });

  describe("lista branca", () => {
    it("descarta tipo desconhecido", () => {
      expect(parseFilters({ tipo: "inventado" }).tipo).toBeNull();
    });

    it("descarta tentativa de injeção no tipo", () => {
      expect(parseFilters({ tipo: "';drop table events;--" }).tipo).toBeNull();
      expect(parseFilters({ tipo: "comment' or '1'='1" }).tipo).toBeNull();
    });

    it("período desconhecido volta para 'tudo' em vez de virar SQL", () => {
      expect(parseFilters({ periodo: "1 year" }).periodo).toBe("tudo");
      expect(parseFilters({ periodo: "7d; delete from events" }).periodo).toBe("tudo");
    });
  });

  describe("id de post", () => {
    it("aceita só dígitos, que é o formato da Meta", () => {
      expect(parseFilters({ post: "17912345678901234" }).post).toBe("17912345678901234");
    });

    it("recusa qualquer coisa que não seja dígito", () => {
      expect(parseFilters({ post: "abc" }).post).toBeNull();
      expect(parseFilters({ post: "179' or 1=1--" }).post).toBeNull();
      expect(parseFilters({ post: "179 123" }).post).toBeNull();
      expect(parseFilters({ post: "-179" }).post).toBeNull();
    });

    it("recusa número absurdamente longo", () => {
      expect(parseFilters({ post: "9".repeat(33) }).post).toBeNull();
    });
  });

  describe("busca", () => {
    it("tira espaço das pontas", () => {
      expect(parseFilters({ q: "  quero  " }).q).toBe("quero");
    });

    it("vazio ou só espaço vira nulo", () => {
      expect(parseFilters({ q: "" }).q).toBeNull();
      expect(parseFilters({ q: "   " }).q).toBeNull();
    });

    it("corta no limite, para não virar consulta gigante", () => {
      const longo = "a".repeat(BUSCA_MAX + 50);
      expect(parseFilters({ q: longo }).q).toHaveLength(BUSCA_MAX);
    });

    it("não mexe nos curingas aqui — quem escapa é a camada de SQL", () => {
      expect(parseFilters({ q: "100%" }).q).toBe("100%");
    });
  });

  it("com parâmetro repetido na URL, usa o primeiro", () => {
    expect(parseFilters({ tipo: ["comment", "message"] }).tipo).toBe("comment");
  });

  it("ignora valores que não são texto", () => {
    expect(parseFilters({ tipo: undefined, post: undefined }).tipo).toBeNull();
  });
});

describe("toQueryString", () => {
  it("sem filtro, devolve string vazia — a URL fica só /eventos", () => {
    expect(toQueryString(SEM_FILTRO)).toBe("");
  });

  it("omite o período padrão", () => {
    expect(toQueryString({ ...SEM_FILTRO, tipo: "comment" })).toBe("tipo=comment");
  });

  it("mantém sempre a mesma ordem, para a URL não mudar à toa", () => {
    const f = { post: "123", tipo: "comment" as const, periodo: "7d" as const, q: "oi" };
    expect(toQueryString(f)).toBe("periodo=7d&tipo=comment&post=123&q=oi");
  });

  it("escapa o que o usuário digitou", () => {
    expect(toQueryString({ ...SEM_FILTRO, q: "a&b=c" })).toBe("q=a%26b%3Dc");
  });

  it("o que sai daqui volta igual pelo parseFilters", () => {
    const f = { post: "123", tipo: "comment" as const, periodo: "7d" as const, q: "quero" };
    const params = Object.fromEntries(new URLSearchParams(toQueryString(f)));
    expect(parseFilters(params)).toEqual(f);
  });
});

describe("temFiltro", () => {
  it("é falso só no estado inicial", () => {
    expect(temFiltro(SEM_FILTRO)).toBe(false);
  });

  it("qualquer campo preenchido conta", () => {
    expect(temFiltro({ ...SEM_FILTRO, periodo: "24h" })).toBe(true);
    expect(temFiltro({ ...SEM_FILTRO, tipo: "comment" })).toBe(true);
    expect(temFiltro({ ...SEM_FILTRO, post: "1" })).toBe(true);
    expect(temFiltro({ ...SEM_FILTRO, q: "x" })).toBe(true);
  });
});
