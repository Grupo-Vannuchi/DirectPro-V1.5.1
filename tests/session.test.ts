import { describe, it, expect, vi } from "vitest";

// O cookie de sessão é a única coisa entre a internet e o painel. Não tinha
// teste nenhum até aqui — e acabou de mudar de forma de derivação, o que é
// exatamente quando um engano passa despercebido.

process.env.ADMIN_PASSWORD = "senha-de-teste";
const auth = await import("@/lib/auth");
const { createSessionValue, isValidSession, SESSION_MAX_AGE_SECONDS } = auth;

const AGORA = 1_800_000_000_000; // instante fixo: teste não pode depender do relógio

describe("ida e volta", () => {
  it("aceita o cookie que ele mesmo acabou de emitir", () => {
    expect(isValidSession(createSessionValue(AGORA), AGORA)).toBe(true);
  });

  it("emite no formato v2.<expira>.<assinatura>", () => {
    const [versao, expira, assinatura] = createSessionValue(AGORA).split(".");
    expect(versao).toBe("v2");
    expect(Number(expira)).toBe(Math.floor(AGORA / 1000) + SESSION_MAX_AGE_SECONDS);
    expect(assinatura).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("prazo de validade", () => {
  it("vale um instante antes de expirar", () => {
    const cookie = createSessionValue(AGORA);
    const quaseLa = AGORA + SESSION_MAX_AGE_SECONDS * 1000 - 1000;
    expect(isValidSession(cookie, quaseLa)).toBe(true);
  });

  it("não vale depois de expirar", () => {
    const cookie = createSessionValue(AGORA);
    const depois = AGORA + (SESSION_MAX_AGE_SECONDS + 1) * 1000;
    expect(isValidSession(cookie, depois)).toBe(false);
  });
});

describe("adulteração", () => {
  it("recusa assinatura trocada", () => {
    const [v, e] = createSessionValue(AGORA).split(".");
    expect(isValidSession(`${v}.${e}.${"a".repeat(64)}`, AGORA)).toBe(false);
  });

  it("recusa prazo esticado, porque a assinatura cobre o prazo", () => {
    // A tentativa óbvia: pegar um cookie válido e aumentar a validade na mão.
    const [v, e, s] = createSessionValue(AGORA).split(".");
    const esticado = `${v}.${Number(e) + 999_999}.${s}`;
    expect(isValidSession(esticado, AGORA)).toBe(false);
  });

  it("recusa versão desconhecida", () => {
    const [, e, s] = createSessionValue(AGORA).split(".");
    expect(isValidSession(`v1.${e}.${s}`, AGORA)).toBe(false);
    expect(isValidSession(`v3.${e}.${s}`, AGORA)).toBe(false);
  });
});

describe("entrada torta não derruba a verificação", () => {
  it("recusa sem estourar", () => {
    for (const valor of [
      undefined,
      "",
      "qualquer-coisa",
      "v2",
      "v2.",
      "v2.123",
      "v2..assinatura",
      "v2.nao-e-numero.abc",
      "v2.123.nao-e-hex",
      "a.b.c.d.e",
    ]) {
      expect(isValidSession(valor as string | undefined, AGORA)).toBe(false);
    }
  });
});

describe("troca de senha", () => {
  it("invalida as sessões abertas", () => {
    // É assim que se desloga todo mundo: trocar a ADMIN_PASSWORD. Não há outro
    // botão de revogar, e este teste é o que garante que esse caminho funciona.
    vi.resetModules();
    process.env.ADMIN_PASSWORD = "outra-senha-completamente-diferente";
    return import("@/lib/auth").then((outro) => {
      const cookieDaOutraSenha = outro.createSessionValue(AGORA);
      expect(outro.isValidSession(cookieDaOutraSenha, AGORA)).toBe(true);
      expect(isValidSession(cookieDaOutraSenha, AGORA)).toBe(false);
    });
  });
});
