import "server-only";
import { createHash, createHmac } from "node:crypto";
import { safeEqualHex, safeEqualSecret } from "./crypto";

export const SESSION_COOKIE = "many_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function adminPassword(): string {
  const s = process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("ADMIN_PASSWORD é obrigatória");
  return s;
}

// Chave da sessão, derivada da senha por um SHA-256 com separação de domínio.
//
// ISTO JÁ FOI scrypt E FOI REVERTIDO DE PROPÓSITO. Não volte a colocar sem ler
// o que segue.
//
// O scrypt protegia contra um cenário estreito: alguém que roubasse o cookie
// não conseguiria descobrir a senha por força bruta a partir dele. Mas quem tem
// o cookie JÁ TEM o painel — e o cookie é httpOnly, secure e sameSite.
//
// O preço foi medido em produção: ~640 ms por processo novo, pagos no login e
// em qualquer página protegida cujo proxy estivesse frio. Um login que era
// instantâneo passou a levar 1,3 s.
//
// A defesa que de fato importa contra adivinhação de senha é o freio de
// tentativas em lib/login-throttle.ts, que continua de pé.
//
// Derivada uma vez por processo; a esse custo, mais por hábito que por
// necessidade.
let cachedKey: Buffer | null = null;

function sessionKey(): Buffer {
  if (!cachedKey) {
    cachedKey = createHash("sha256").update(`directpro-session:${adminPassword()}`).digest();
  }
  return cachedKey;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionKey()).update(payload).digest("hex");
}

// Cookie: v2.<expira_em>.<assinatura>
//
// A validade vai DENTRO do valor assinado. O maxAge do cookie é apenas uma dica
// ao navegador — quem decide o que enviar é o cliente. Uma sessão só expira de
// verdade quando o servidor confere o prazo.
export function createSessionValue(now: number = Date.now()): string {
  const payload = `v2.${Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS}`;
  return `${payload}.${sign(payload)}`;
}

export function isValidSession(value: string | undefined, now: number = Date.now()): boolean {
  if (!value) return false;
  const [versao, expira, assinatura] = value.split(".");
  if (versao !== "v2" || !expira || !assinatura) return false;

  const exp = Number(expira);
  if (!Number.isSafeInteger(exp) || exp * 1000 <= now) return false;

  // A assinatura cobre o prazo, não só a versão: sem isso, esticar a data no
  // cookie à mão renovaria a sessão sozinho.
  return safeEqualHex(sign(`${versao}.${expira}`), assinatura);
}

// state fixo do OAuth: só confirma que o fluxo começou no nosso app
export function oauthState(): string {
  return createHmac("sha256", sessionKey()).update("oauth-state-v1").digest("hex");
}

export function isValidPassword(password: string): boolean {
  return safeEqualSecret(password, adminPassword());
}
