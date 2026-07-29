import { describe, it, expect } from "vitest";
import { extractEmail } from "@/lib/match";

// Quando a automação pede o e-mail, é isto que decide se o endereço foi
// capturado. Errar para menos trava a pessoa num loop de "me manda de novo";
// errar para mais grava lixo na base de contatos.

describe("extractEmail", () => {
  it("acha o endereço no meio da frase", () => {
    expect(extractEmail("meu email é ana@email.com")).toBe("ana@email.com");
    expect(extractEmail("ana@email.com obrigada!")).toBe("ana@email.com");
    expect(extractEmail("ana@email.com")).toBe("ana@email.com");
  });

  it("normaliza para minúsculas, porque quem digita no celular capitaliza", () => {
    expect(extractEmail("ANA@EMAIL.COM")).toBe("ana@email.com");
    expect(extractEmail("Ana.Silva@Email.com.BR")).toBe("ana.silva@email.com.br");
  });

  it("aceita ponto, mais e hífen, que são válidos e comuns", () => {
    expect(extractEmail("ana.silva@email.com")).toBe("ana.silva@email.com");
    expect(extractEmail("ana+promo@email.com")).toBe("ana+promo@email.com");
    expect(extractEmail("contato@e-mail.com")).toBe("contato@e-mail.com");
  });

  it("aceita domínio com mais de um nível", () => {
    expect(extractEmail("ana@email.com.br")).toBe("ana@email.com.br");
  });

  it("devolve nulo quando não há e-mail", () => {
    expect(extractEmail("quero o link")).toBeNull();
    expect(extractEmail("")).toBeNull();
    expect(extractEmail("@ana")).toBeNull();
    expect(extractEmail("ana@")).toBeNull();
    expect(extractEmail("ana@email")).toBeNull();
  });

  it("não confunde arroba de perfil do Instagram com e-mail", () => {
    // "responde @fulano" chega o tempo todo na DM.
    expect(extractEmail("responde lá @fulano")).toBeNull();
  });

  it("pega o primeiro quando vêm dois", () => {
    expect(extractEmail("ana@email.com ou ana2@outro.com")).toBe("ana@email.com");
  });
});
