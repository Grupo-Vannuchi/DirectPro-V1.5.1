// A letra que aparece no avatar quando não há foto.
//
// Parece bobo e não é. Nome de Instagram é campo livre e vem cheio de emoji:
// "🪄Lx.KHAN...🎀", "BLACIA🏴‍☠️", "༄●⃝ᶫᵒꪜe☯ᴮᴼᵞ࿐".
//
// O `.slice(0, 1)` que estava aqui corta por UNIDADE UTF-16, não por caractere.
// Um emoji como 🪄 ocupa duas unidades (par substituto), então a fatia devolvia
// meia letra — uma unidade solta e inválida. Servidor e cliente serializavam
// esse lixo de formas diferentes, e o React derrubava a hidratação da página
// inteira com "server rendered text didn't match the client".
//
// Duas correções, então:
//   1. procura a primeira LETRA ou DÍGITO — "🪄Lx.KHAN" vira "L", não "🪄"
//   2. se não houver nenhuma, pega o primeiro caractere de verdade, por ponto
//      de código, o que nunca parte um par ao meio

export function initial(name: string | null | undefined): string {
  const texto = (name ?? "").trim();
  if (!texto) return "?";

  const letra = texto.match(/\p{L}|\p{N}/u);
  if (letra) return letra[0].toUpperCase();

  // Nome só de emoji: mostra o emoji inteiro em vez de metade dele.
  // Array.from percorre por ponto de código, ao contrário do índice cru.
  return Array.from(texto)[0] ?? "?";
}
