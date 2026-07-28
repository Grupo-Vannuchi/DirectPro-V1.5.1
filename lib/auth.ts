import "server-only";
import { createHmac, scryptSync } from "node:crypto";
import { safeEqualHex, safeEqualSecret } from "./crypto";

export const SESSION_COOKIE = "many_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function adminPassword(): string {
  const s = process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("ADMIN_PASSWORD é obrigatória");
  return s;
}

// A senha NÃO é usada como chave HMAC direta. Se um cookie vazar, uma chave
// derivada por HMAC deixaria testar bilhões de senhas por segundo até achar a
// que produz aquele valor. scrypt encarece cada tentativa a ponto de tornar a
// busca inviável.
//
// O sal é uma constante da aplicação. O ideal seria um valor por instalação,
// mas ele teria de vir do banco — e esta função roda no proxy.ts, a cada
// requisição do painel. Consultar o banco ali custaria mais do que o ganho.
//
// Derivada uma vez por processo, porque scrypt é lento de propósito.
let cachedKey: Buffer | null = null;

function sessionKey(): Buffer {
  if (!cachedKey) cachedKey = scryptSync(adminPassword(), "directpro-session-v2", 32);
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

  return safeEqualHex(sign(`${versao}.${expira}`), assinatura);
}

// state fixo do OAuth: só confirma que o fluxo começou no nosso app
export function oauthState(): string {
  return createHmac("sha256", sessionKey()).update("oauth-state-v1").digest("hex");
}

export function isValidPassword(password: string): boolean {
  return safeEqualSecret(password, adminPassword());
}
