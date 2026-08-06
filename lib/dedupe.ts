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
// DUAS NÃO TÊM MAIS CHAMADOR:
//
//   `followupKey` era a chave dos itens gerados a partir da tabela `followups`,
//     e desde que os lembretes viraram passos da lista ninguém a chama.
//   `welcomeMessageKey` era a do enfileiramento de boas-vindas lido da coluna
//     `welcome_text`, que saiu pelo mesmo motivo.
//
// As duas FICAM, e o motivo não é a fila: consultei a tabela — hoje ela só tem
// os prefixos `mr:` e `passo:`, ZERO linhas `fu:` e ZERO `wm:`. A justificativa
// que dizia o contrário estava errada.
//
// O motivo real é o desmonte pela metade: a tabela `followups` e as colunas
// órfãs de `automations` ainda existem, e a decisão foi tirá-las todas de uma
// vez depois do merge, não em pedaços dentro da branch que trocou o motor.
// Estas duas funções são o par dessas colunas e saem no mesmo movimento. Até
// lá são código morto com teste — o que custa nada e evita que alguém recrie
// um formato incompatível se as colunas voltarem à discussão.

// Resposta privada e resposta pública nascem de um comentário. O id do
// comentário é único e permanente, então basta ele.
export const privateReplyKey = (commentId: string) => `pr:${commentId}`;
export const commentReplyKey = (commentId: string) => `cr:${commentId}`;

// Que dia é "hoje" para efeito de deduplicação, em BRASÍLIA.
//
// O fuso não é detalhe de exibição aqui: este valor entra na `dedupe_key`, ou
// seja, é ele que decide quando a mesma automação pode entregar de novo.
//
// Era `new Date().toISOString().slice(0, 10)`, que é UTC, e isso fazia o dia
// virar às 21h de Brasília. Quem acionasse a automação às 20h e de novo às 22h
// da mesma noite caía em dois baldes diferentes e recebia a sequência DUAS
// VEZES — todo dia, entre 21h e meia-noite, que é justamente o horário de pico
// no Instagram. O resto do sistema já assumia Brasília (lib/format.ts na
// exibição, o `at time zone` do gráfico em app/page.tsx); só este ponto, o
// único em que o fuso muda comportamento e não aparência, estava em UTC.
//
// Recebe o instante em vez de ler o relógio para poder ser testada — é a
// mesma razão de tudo neste arquivo ser função pura.
//
// `en-CA` porque é o locale que formata como `YYYY-MM-DD`, que é o formato que
// as chaves já usavam. Trocar o formato reabriria envio em dobro em tudo que
// já está enfileirado.
export function diaDaChave(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

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
