import { describe, it, expect } from "vitest";
import { badgeDaConversa } from "../lib/inbox-badge";

describe("badgeDaConversa", () => {
  it("mostra a contagem quando há não lidas", () => {
    expect(badgeDaConversa({ naoLidas: 3, semResposta: false })).toBe("contagem");
  });

  it("dá precedência à contagem quando as duas condições valem", () => {
    // O caso mais comum: mensagem chegou E ninguém respondeu. O número carrega
    // mais informação que o ponto, então ganha.
    expect(badgeDaConversa({ naoLidas: 3, semResposta: true })).toBe("contagem");
  });

  it("mostra o ponto quando foi lida mas não respondida", () => {
    expect(badgeDaConversa({ naoLidas: 0, semResposta: true })).toBe("ponto");
  });

  it("não mostra nada quando está em dia", () => {
    expect(badgeDaConversa({ naoLidas: 0, semResposta: false })).toBe("nenhum");
  });

  it("trata contagem negativa como zero", () => {
    // Defesa contra relógio ou consulta devolvendo lixo: um número negativo
    // nunca deve virar badge.
    expect(badgeDaConversa({ naoLidas: -1, semResposta: false })).toBe("nenhum");
  });

  it("mostra o ponto mesmo com contagem negativa, se está sem resposta", () => {
    // A mesma defesa do caso acima, mas combinada com semResposta: o número
    // negativo não deve mascarar o ponto que a segunda condição pede.
    expect(badgeDaConversa({ naoLidas: -1, semResposta: true })).toBe("ponto");
  });
});
