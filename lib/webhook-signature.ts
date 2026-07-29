import "server-only";
import { createHmac } from "node:crypto";
import { safeEqualHex } from "./crypto";

// Verificação da assinatura que a Meta manda no cabeçalho x-hub-signature-256.
//
// Morava dentro do route handler do webhook. Saiu de lá por dois motivos: uma
// rota não deveria ser dona de criptografia, e ali dentro não havia como testar
// — é a única coisa que separa um evento real de qualquer POST da internet.

// O corpo precisa ser o texto CRU. Reserializar o JSON muda espaços e ordem de
// chaves, e a assinatura passa a não bater nunca.
export function signatureMatches(
  rawBody: string,
  header: string | null,
  secret: string
): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqualHex(expected, header.slice(7));
}

// Um app de Instagram tem duas chaves fáceis de confundir — a do "Login do
// Instagram" e a do app em Configurações → Básico — e a Meta assina com a do
// app. Conferir contra uma só faria a instalação que salvou a outra recusar
// 100% dos eventos com 401, silenciosamente: o sintoma clássico de "conectei,
// criei a automação e não acontece nada".
export function signatureMatchesAny(
  rawBody: string,
  header: string | null,
  secrets: string[]
): boolean {
  return secrets.some((s) => signatureMatches(rawBody, header, s));
}
