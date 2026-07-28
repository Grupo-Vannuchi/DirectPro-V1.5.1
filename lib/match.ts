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
