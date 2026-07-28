import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Comparação de segredo em tempo constante.
//
// Comparar com === vaza informação pelo tempo: o operador para no primeiro byte
// diferente, então medir a resposta revela quantos bytes iniciais já estavam
// certos — e um atacante descobre o segredo byte a byte em vez de tentar todas
// as combinações.

// Iguala dois valores de tamanho conhecido e fixo (digests, assinaturas HMAC).
export function safeEqualBuffers(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function safeEqualHex(a: string, b: string): boolean {
  return safeEqualBuffers(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

// Chave aleatória por processo: os digests comparados abaixo não são
// previsíveis nem reutilizáveis fora desta execução.
const COMPARE_KEY = randomBytes(32);

function digest(value: string): Buffer {
  return createHmac("sha256", COMPARE_KEY).update(value, "utf8").digest();
}

// Iguala valores de tamanho VARIÁVEL (senha digitada, token de cabeçalho).
// Comparar os bytes crus desses valores vazaria o comprimento, porque a
// verificação de tamanho precisa vir antes do timingSafeEqual. Comparar os
// digests resolve: eles têm sempre 32 bytes, aconteça o que acontecer.
export function safeEqualSecret(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}
