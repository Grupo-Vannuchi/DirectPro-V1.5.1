// Casamento de palavras-chave, insensível a maiúsculas e acentos.
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function matches(
  text: string,
  keywords: string[],
  matchType: "contains" | "exact" | "any"
): boolean {
  if (matchType === "any") return true;
  const t = normalize(text);
  if (!t) return false;
  return keywords.some((k) => {
    const kw = normalize(k);
    if (!kw) return false;
    return matchType === "exact" ? t === kw : t.includes(kw);
  });
}

export function pickRandom<T>(arr: T[]): T | undefined {
  if (!arr.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Acha o e-mail dentro de uma mensagem, que quase nunca vem só com o endereço:
// chega como "meu email é ana@email.com" ou "ana@email.com obrigada!".
//
// Mora aqui, e não no motor, porque é leitura de texto do usuário — a mesma
// família de match() — e porque assim dá para testar sem carregar banco e Meta
// junto.
export function extractEmail(text: string): string | null {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/);
  return m ? m[0].toLowerCase() : null;
}
