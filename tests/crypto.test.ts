import { describe, it, expect } from "vitest";
import { safeEqualBuffers, safeEqualHex, safeEqualSecret } from "@/lib/crypto";

// O ponto destas funções é não vazar informação pelo tempo de resposta. Isso
// não dá para provar com teste — medir tempo em suíte automatizada é ruído puro.
// O que dá para provar é que elas RESPONDEM certo e, principalmente, que não
// estouram com entrada torta: uma exceção aqui vira 500 num caminho de
// autenticação, e 500 também é resposta.

describe("safeEqualSecret", () => {
  it("aceita valores iguais", () => {
    expect(safeEqualSecret("senha-secreta", "senha-secreta")).toBe(true);
  });

  it("recusa valores diferentes do mesmo tamanho", () => {
    expect(safeEqualSecret("senha-secreta", "senha-secretA")).toBe(false);
  });

  it("recusa valores de tamanhos diferentes sem estourar", () => {
    // Este é o caso que motivou a função: comparar os bytes crus exigiria
    // conferir o tamanho antes, e essa conferência revela o comprimento da
    // senha pelo tempo de resposta.
    expect(safeEqualSecret("a", "senha-bem-mais-longa")).toBe(false);
    expect(safeEqualSecret("senha-bem-mais-longa", "a")).toBe(false);
  });

  it("lida com vazio dos dois lados", () => {
    expect(safeEqualSecret("", "")).toBe(true);
    expect(safeEqualSecret("", "algo")).toBe(false);
  });

  it("distingue acento e caixa", () => {
    expect(safeEqualSecret("Senha", "senha")).toBe(false);
    expect(safeEqualSecret("açaí", "acai")).toBe(false);
  });

  it("compara texto multibyte pelo conteúdo", () => {
    expect(safeEqualSecret("chave🔑", "chave🔑")).toBe(true);
    expect(safeEqualSecret("chave🔑", "chave🔒")).toBe(false);
  });
});

describe("safeEqualHex", () => {
  it("aceita hex igual", () => {
    expect(safeEqualHex("deadbeef", "deadbeef")).toBe(true);
  });

  it("recusa hex diferente", () => {
    expect(safeEqualHex("deadbeef", "deadbeee")).toBe(false);
  });

  it("recusa comprimentos diferentes", () => {
    expect(safeEqualHex("deadbeef", "dead")).toBe(false);
  });

  it("não estoura com texto que não é hex", () => {
    // O cabeçalho da Meta vem da rede: pode chegar qualquer coisa.
    expect(safeEqualHex("deadbeef", "não é hex")).toBe(false);
    expect(safeEqualHex("deadbeef", "")).toBe(false);
    expect(safeEqualHex("", "")).toBe(true);
  });
});

describe("safeEqualBuffers", () => {
  it("compara conteúdo, não identidade", () => {
    expect(safeEqualBuffers(Buffer.from("abc"), Buffer.from("abc"))).toBe(true);
    expect(safeEqualBuffers(Buffer.from("abc"), Buffer.from("abd"))).toBe(false);
  });

  it("recusa tamanhos diferentes em vez de estourar", () => {
    // timingSafeEqual do Node lança quando os tamanhos diferem.
    expect(safeEqualBuffers(Buffer.from("abc"), Buffer.from("abcd"))).toBe(false);
  });
});
