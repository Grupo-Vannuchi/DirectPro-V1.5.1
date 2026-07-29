import { describe, it, expect } from "vitest";
import { matches, normalize } from "@/lib/match";

// Estas regras decidem se uma pessoa recebe ou não a DM. Errar para mais manda
// mensagem a quem não pediu; errar para menos perde cliente em silêncio.

describe("normalize", () => {
  it("ignora maiúsculas, acentos e espaço nas pontas", () => {
    expect(normalize("  QUERO  ")).toBe("quero");
    expect(normalize("Açaí")).toBe("acai");
    expect(normalize("PROMOÇÃO")).toBe("promocao");
  });

  it("preserva emoji, que é conteúdo e não acento", () => {
    expect(normalize("quero 🔥")).toBe("quero 🔥");
  });
});

describe("matches", () => {
  it("'any' libera qualquer texto, inclusive vazio", () => {
    expect(matches("", [], "any")).toBe(true);
    expect(matches("qualquer coisa", ["nada a ver"], "any")).toBe(true);
  });

  it("'contains' acha a palavra dentro da frase", () => {
    expect(matches("eu quero muito esse link", ["quero"], "contains")).toBe(true);
    expect(matches("me manda aí", ["quero"], "contains")).toBe(false);
  });

  it("'exact' exige a frase inteira, não um pedaço", () => {
    expect(matches("quero", ["quero"], "exact")).toBe(true);
    expect(matches("eu quero", ["quero"], "exact")).toBe(false);
  });

  it("compara sem acento e sem caixa dos dois lados", () => {
    expect(matches("QUERO", ["quero"], "exact")).toBe(true);
    expect(matches("promocao", ["PROMOÇÃO"], "exact")).toBe(true);
    expect(matches("Me manda o AÇAÍ", ["acai"], "contains")).toBe(true);
  });

  it("basta uma palavra-chave da lista bater", () => {
    expect(matches("quero o link", ["eu", "quero", "link"], "contains")).toBe(true);
  });

  it("texto vazio nunca casa fora do 'any'", () => {
    expect(matches("", ["quero"], "contains")).toBe(false);
    expect(matches("   ", ["quero"], "exact")).toBe(false);
  });

  it("palavra-chave vazia é ignorada em vez de casar com tudo", () => {
    // Uma automação salva com um campo em branco liberaria a base inteira.
    expect(matches("qualquer texto", [""], "contains")).toBe(false);
    expect(matches("qualquer texto", ["  "], "contains")).toBe(false);
    expect(matches("qualquer texto", ["", "quero"], "contains")).toBe(false);
  });

  it("lista de palavras-chave vazia não casa", () => {
    expect(matches("quero", [], "contains")).toBe(false);
  });
});
