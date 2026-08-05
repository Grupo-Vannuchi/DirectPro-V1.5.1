// Chaves de deduplicação da fila.
//
// A coluna `dedupe_key` é UNIQUE: o `on conflict do nothing` do enqueue é o que
// garante que ninguém receba a mesma mensagem duas vezes. Ou seja, o formato
// destas strings é uma regra de negócio — não detalhe de implementação.
//
// Começaram como oito literais espalhados pelo motor. Hoje são DEZ funções
// neste arquivo: as oito de origem, mais `passoKey` (que nasceu com o fluxo por
// passos) e `manualReplyKey`. Juntas aqui por dois motivos: dá para ver de
// relance o que torna cada envio único, e dá para testar. Mudar qualquer
// formato abaixo faz itens já enfileirados deixarem de casar com os novos — na
// prática, autoriza envio em dobro. Os testes em tests/dedupe.test.ts (e
// tests/manual-reply-key.test.ts) existem para essa mudança nunca passar
// despercebida.
//
// DUAS NÃO TÊM MAIS CHAMADOR, e cada uma por um motivo diferente:
//
//   `followupKey` está MORTA. Ela era a chave dos itens gerados a partir da
//     tabela `followups`, e desde que os lembretes viraram passos da lista
//     ninguém a chama — só os testes. Fica até a tabela `followups` sair (o
//     mesmo prazo das colunas órfãs), porque a fila ainda tem linhas antigas
//     gravadas com o prefixo `fu:`; sai junto com elas.
//   `welcomeMessageKey` também não é mais chamada (o enfileiramento de
//     boas-vindas por coluna saiu), e fica pelo mesmo motivo: existem linhas
//     `wm:` gravadas na fila.

// Resposta privada e resposta pública nascem de um comentário. O id do
// comentário é único e permanente, então basta ele.
export const privateReplyKey = (commentId: string) => `pr:${commentId}`;
export const commentReplyKey = (commentId: string) => `cr:${commentId}`;

// Estes três repetem por pessoa e por dia: o `dia` é o balde que permite a
// mesma automação rodar de novo amanhã sem liberar duas vezes hoje.
export const followGateKey = (
  automationId: string,
  contactIgId: string,
  dia: string,
  tentativa: number
) => `fg:${automationId}:${contactIgId}:${dia}:${tentativa}`;

export const emailAskKey = (automationId: string, contactIgId: string, dia: string) =>
  `ea:${automationId}:${contactIgId}:${dia}`;

// MORTA: nenhum chamador fora dos testes. Ver a nota no topo do arquivo.
export const followupKey = (followupId: string, contactIgId: string, dia: string) =>
  `fu:${followupId}:${contactIgId}:${dia}`;

// Um passo por pessoa por dia. O índice entra na chave porque a mesma automação
// pode ter vários passos do mesmo tipo — dois lembretes, três DMs.
export function passoKey(
  automationId: string,
  contactIgId: string,
  indice: number,
  bucket: string
): string {
  return `passo:${automationId}:${contactIgId}:${indice}:${bucket}`;
}

// Os que nascem de uma mensagem recebida usam o id dela (mid). Quando a Meta
// não manda o mid, cai no par remetente+instante: não deduplica de verdade, mas
// é melhor que uma chave nula, que faria o UNIQUE barrar envios legítimos de
// pessoas diferentes.
const porMensagem = (prefixo: string, mid: string | undefined, senderId: string, agora: number) =>
  `${prefixo}:${mid ?? `${senderId}:${agora}`}`;

export const emailAnswerKey = (mid: string | undefined, senderId: string, agora: number) =>
  porMensagem("ear", mid, senderId, agora);

export const welcomeMessageKey = (mid: string | undefined, senderId: string, agora: number) =>
  porMensagem("wm", mid, senderId, agora);

// Reação a story só é enfileirada quando existe mid, então aqui ele é exigido.
export const storyReactionKey = (mid: string) => `rx:${mid}`;

// Resposta digitada por uma pessoa. Ao contrário das automáticas, ela PODE se
// repetir de propósito ("oi" duas vezes é legítimo), então o instante entra na
// chave e cada envio é único.
export const manualReplyKey = (contactIgId: string, agora: number) =>
  `mr:${contactIgId}:${agora}`;
