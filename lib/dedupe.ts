// Chaves de deduplicação da fila.
//
// A coluna `dedupe_key` é UNIQUE: o `on conflict do nothing` do enqueue é o que
// garante que ninguém receba a mesma mensagem duas vezes. Ou seja, o formato
// destas strings é uma regra de negócio — não detalhe de implementação.
//
// Estavam escritas como oito literais espalhados pelo motor. Juntas aqui por
// dois motivos: dá para ver de relance o que torna cada envio único, e dá para
// testar. Mudar qualquer formato abaixo faz itens já enfileirados deixarem de
// casar com os novos — na prática, autoriza envio em dobro. Os testes em
// tests/dedupe.test.ts existem para essa mudança nunca passar despercebida.

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

export const followupKey = (followupId: string, contactIgId: string, dia: string) =>
  `fu:${followupId}:${contactIgId}:${dia}`;

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
