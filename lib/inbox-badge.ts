// Qual marca aparece na linha da conversa.
//
// Existe como função pura, fora do componente, porque as duas condições são
// verdadeiras ao mesmo tempo na maioria dos casos — mensagem que chegou e não
// foi respondida é as duas coisas — e a regra de desempate precisa morar num
// lugar só, testada.
//
// Não importa "server-only": é aritmética, e o componente de cliente a usa.

export type BadgeConversa = "contagem" | "ponto" | "nenhum";

export function badgeDaConversa(c: { naoLidas: number; semResposta: boolean }): BadgeConversa {
  if (c.naoLidas > 0) return "contagem";
  if (c.semResposta) return "ponto";
  return "nenhum";
}
