import "server-only";
import {
  sql,
  ensureSchema,
  getConfig,
  listAccounts,
  Account,
  Automation,
  QueueItem,
} from "./db";
import { matches, pickRandom, extractEmail } from "./match";
import { getUserProfile, checkFollowsAccount } from "./ig";
import { scheduleTick } from "./qstash";
// `retomadaDoFallback`, `interrompeOFluxo`, `retomadaDoBotao` e
// `retomadaDoFollow` moraram aqui e agora vêm de lib/steps.ts: as quatro são
// decisão pura, e dentro de um arquivo `server-only` nenhum teste as alcançava.
// Foram justamente as que mais deram defeito. As duas últimas saíram inteiras, e
// não em pedaços: as peças (`cursorDesta`, `indiceDoPortao`, `passoEsperado`) já
// eram testadas uma a uma — o que estava descoberto era a COMPOSIÇÃO delas.
import {
  interpretar,
  passoEsperado,
  retomadaDoFallback,
  retomadaDoBotao,
  retomadaDoFollow,
  interrompeOFluxo,
  type AcaoEnfileirar,
} from "./steps";
// `welcomeMessageKey` não é mais importado aqui: era a chave do enfileiramento
// de boas-vindas por coluna, que saiu. Ela continua em lib/dedupe.ts, com teste,
// e o motivo está escrito lá (lib/dedupe.ts, nota do topo) — não é a fila ter
// linhas antigas com esse prefixo, que era a justificativa errada: a tabela só
// tem `mr:` e `passo:`. É o desmonte pela metade das colunas órfãs.
//
// `privateReplyKey` voltou a ser usado. Não é resíduo: a resposta privada ao
// comentário é o ÚNICO caminho de entrega de uma automação disparada por
// comentário (ver `gastarRespostaPrivada`), e a chave dela continua sendo o id
// do comentário, como sempre foi.
import {
  privateReplyKey,
  commentReplyKey,
  followGateKey,
  emailAskKey,
  passoKey,
  emailAnswerKey,
  storyReactionKey,
  manualReplyKey,
} from "./dedupe";

// ============================================================
// Recepção: transforma eventos do webhook em itens na fila
// ============================================================

// Exportados porque o webhook precisa nomear o que está entregando. Todos os
// campos são opcionais de propósito: é JSON vindo da Meta, e a única garantia é
// a assinatura do corpo — não o formato dele.
export type CommentValue = {
  id: string; // comment_id
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
  text?: string;
  parent_id?: string;
};

export type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload?: string };
    reply_to?: { story?: { url?: string; id?: string }; mid?: string };
  };
};

export async function logEvent(accountId: string | null, type: string, payload: unknown) {
  await ensureSchema();
  // O payload vai CRU para uma coluna jsonb — sem JSON.stringify.
  //
  // Isto já foi `JSON.stringify(payload)` e estava certo no driver HTTP, que só
  // aceitava texto. O driver por TCP tipa o parâmetro como json sozinho, então a
  // string pré-serializada era gravada como ESCALAR json — o texto `{"a":1}` em
  // vez do objeto {a:1}. Nada acusava: o insert passava, a coluna aceitava.
  //
  // O estrago aparecia depois, na leitura: `payload->'sender'->>'id'` devolvia
  // nulo em escalar, derrubando o inbox e os filtros de /eventos, e o jsonb_set
  // do dreno falhava com "cannot set path in scalar".
  //
  // Cru funciona para toda forma que este parâmetro recebe — objeto, array,
  // string, número —, verificado uma a uma contra o banco.
  await sql().query(`insert into events (account_id, type, payload) values ($1, $2, $3)`, [
    accountId,
    type,
    payload,
  ]);
}

// Registra no máximo um evento deste tipo por janela.
//
// Para diagnósticos que nascem de requisição NÃO autenticada. O webhook aceita
// qualquer coisa da internet, e gravar uma linha por tentativa transforma o
// diagnóstico num canal de escrita aberto: quem quiser enche a tabela e a cota
// do banco. Um aviso a cada 10 minutos diz a mesma coisa ao dono do painel.
//
// A corrida entre duas requisições simultâneas pode gravar duas linhas em vez
// de uma. Tudo bem: o que não pode é gravar dez mil.
//
// O `discriminador` ESTREITA a janela, e é opcional porque os dois usos são
// diferentes:
//
//   SEM ele a janela é por TIPO e só por tipo — global, atravessando contas.
//     É o que os diagnósticos de webhook não autenticado querem: eles nascem de
//     requisição anônima, o `accountId` pode ser null, e o ponto é justamente
//     não deixar a internet encher a tabela, doa a quem doer.
//   COM ele a janela passa a ser por tipo + conta + um campo do payload. Sem
//     isso, um passo quebrado da automação A silenciava por 10 minutos o aviso
//     de OUTRA automação — e, em painel multi-conta, uma conta silenciava a
//     outra. Isso não é redução de ruído, é perda de diagnóstico.
//
// O `account_id` só entra no filtro quando não é null: `account_id = null` não
// casa com nada em SQL, e a janela por conta nunca fecharia — o throttle viraria
// enfeite. Sem conta, discrimina só pelo campo do payload.
export async function logEventThrottled(
  accountId: string | null,
  type: string,
  payload: unknown,
  minutos = 10,
  discriminador?: { campo: string; valor: string }
): Promise<void> {
  await ensureSchema();
  // `payload` é jsonb (ver lib/db.ts), então `->>` devolve o campo como texto —
  // e a CHAVE também vai como parâmetro, verificado contra o banco.
  const filtros = ["type = $1", "created_at > now() - make_interval(mins => $2::int)"];
  const params: unknown[] = [type, minutos];
  if (discriminador) {
    params.push(discriminador.campo, discriminador.valor);
    filtros.push(`payload->>$${params.length - 1} = $${params.length}`);
    if (accountId !== null) {
      params.push(accountId);
      filtros.push(`account_id = $${params.length}`);
    }
  }
  const recentes = (await sql().query(
    `select 1 from events where ${filtros.join(" and ")} limit 1`,
    params
  )) as unknown[];
  if (recentes.length) return;
  await logEvent(accountId, type, payload);
}

// A Meta manda o id da conta que recebeu o evento em entry.id — é ele que diz
// qual das contas conectadas deve responder. Se não bater (id em formato
// inesperado) e só existir uma conta, ela assume.
async function resolveAccount(entryId: string | undefined): Promise<Account | null> {
  const accounts = await listAccounts();
  if (!accounts.length) return null;
  if (entryId) {
    const found = accounts.find((a) => a.ig_user_id === entryId);
    if (found) return found;
  }
  return accounts.length === 1 ? accounts[0] : null;
}

async function activeAutomations(accountId: string): Promise<Automation[]> {
  return (await sql().query(
    `select * from automations
     where account_id = $1 and active = true
     order by created_at asc`,
    [accountId]
  )) as Automation[];
}

function findMatch(
  automations: Automation[],
  trigger: "comment" | "story" | "dm",
  text: string,
  mediaId?: string
): Automation | undefined {
  const candidates = automations.filter((a) => {
    if (!a.triggers.includes(trigger)) return false;
    if (trigger === "comment" && a.media_id && a.media_id !== mediaId) return false;
    if (trigger === "story" && a.story_id && a.story_id !== mediaId) return false;
    return matches(text, a.keywords, a.match_type);
  });
  // automação presa a um post/story específico ganha da genérica
  return (
    candidates.find((a) => (trigger === "story" ? a.story_id : a.media_id)) ?? candidates[0]
  );
}

// O atraso vem em SEGUNDOS a partir de agora, não como instante absoluto — e a
// conta de "agora" é feita pelo BANCO.
//
// Antes isto recebia um Date do relógio da aplicação. Só que quem busca o item
// compara com `now()`, o relógio do banco. Dois relógios na mesma comparação: se
// a aplicação estiver adiantada, o item nasce no futuro e ninguém o pega até a
// diferença passar.
//
// Não é hipótese. Medido nesta máquina: 53,9 segundos de diferença, e toda
// resposta manual ficava presa quase um minuto. Na Vercel os relógios são
// sincronizados e a diferença é de milissegundos, e foi por isso que isso nunca
// apareceu em produção.
async function enqueue(item: {
  account_id: string;
  kind: QueueItem["kind"];
  contact_ig_id?: string;
  automation_id?: string;
  comment_id?: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
  delaySeconds?: number;
}): Promise<boolean> {
  const atraso = Math.max(0, Math.round(item.delaySeconds ?? 0));
  const rows = (await sql().query(
    `insert into queue (account_id, kind, contact_ig_id, automation_id, comment_id, payload, dedupe_key, not_before)
     values ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8::int))
     on conflict (dedupe_key) do nothing
     returning id`,
    [
      item.account_id,
      item.kind,
      item.contact_ig_id ?? null,
      item.automation_id ?? null,
      item.comment_id ?? null,
      // Cru, não JSON.stringify — mesmo motivo explicado em logEvent. Aqui a
      // consequência seria mais visível: o dreno faz jsonb_set neste payload
      // para registrar o texto entregue, e sobre escalar isso é erro duro.
      item.payload,
      item.dedupe_key,
      atraso,
    ]
  )) as { id: string }[];
  const inserted = rows.length > 0;

  // item com atraso: pede pro QStash acordar o app na hora certa
  if (inserted && atraso > 15) {
    const config = await getConfig();
    await scheduleTick(config.app_url ?? "", atraso + 5);
  }
  return inserted;
}

async function upsertContact(
  accountId: string,
  igId: string,
  fields: {
    username?: string | null;
    name?: string | null;
    profile_pic?: string | null;
    last_reply_at?: Date;
    last_automation_id?: string;
  }
) {
  await sql().query(
    `insert into contacts (account_id, ig_id, username, name, profile_pic, last_reply_at, last_automation_id)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (account_id, ig_id) do update set
       username = coalesce(excluded.username, contacts.username),
       name = coalesce(excluded.name, contacts.name),
       profile_pic = coalesce(excluded.profile_pic, contacts.profile_pic),
       last_reply_at = coalesce(excluded.last_reply_at, contacts.last_reply_at),
       last_automation_id = coalesce(excluded.last_automation_id, contacts.last_automation_id)`,
    [
      accountId,
      igId,
      fields.username ?? null,
      fields.name ?? null,
      fields.profile_pic ?? null,
      fields.last_reply_at?.toISOString() ?? null,
      fields.last_automation_id ?? null,
    ]
  );
}

// O webhook de mensagens só traz o IGSID (um número). Busca o perfil na
// primeira mensagem para o contato não ficar salvo como "1436974448...".
async function fetchProfileFields(
  accountId: string,
  igId: string,
  token: string | null
): Promise<{ username?: string | null; name?: string | null; profile_pic?: string | null }> {
  if (!token) return {};
  const rows = (await sql().query(
    `select username from contacts where account_id = $1 and ig_id = $2`,
    [accountId, igId]
  )) as { username: string | null }[];
  if (rows[0]?.username) return {}; // já conhecido
  try {
    const p = await getUserProfile(igId, token);
    return { username: p.username ?? null, name: p.name ?? null, profile_pic: p.profile_pic ?? null };
  } catch {
    return {}; // perfil indisponível (conta privada/apagada): segue só com o id
  }
}

// dia atual em UTC — 1 sequência de follow-up por pessoa/automação/dia
function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadAutomation(
  accountId: string,
  automationId: string
): Promise<Automation | undefined> {
  const rows = (await sql().query(
    `select * from automations where id = $1 and account_id = $2 and active = true`,
    [automationId, accountId]
  )) as Automation[];
  return rows[0];
}

// Quantas vezes repetimos o pedido antes de parar de insistir. A verificação
// continua acontecendo depois disso — só o lembrete para, para não virar spam
// (e não chamar a atenção da Meta).
const MAX_FOLLOW_REQUESTS = 5;

// Executa o fluxo desta automação a partir de `deIndice`.
//
// A sequência não está mais aqui: ela vem de `auto.steps`, e quem decide o que
// fazer é o interpretador puro de lib/steps.ts. Esta função é só a casca que
// toca banco, chama a Meta e enfileira.
// `contexto` carrega os ids que só o gatilho conhece. Sem ele, `resposta_publica`
// e `reagir_story` não teriam como ser enfileirados aqui e continuariam tratados
// à parte, lendo as colunas antigas — a lista teria dois passos decorativos e o
// fluxo não seria dado de verdade.
export type ContextoGatilho = {
  commentId?: string;
  messageId?: string;
  // Mutável de propósito, e escrito só por `gastarRespostaPrivada`: marca que a
  // resposta privada deste comentário já foi gasta. Fica no contexto, e não numa
  // variável local, porque `executarFluxo` chama a si mesmo (portão de follow,
  // e-mail já conhecido) passando o MESMO objeto — a marca precisa atravessar
  // essas chamadas, senão a segunda mensagem gastaria a resposta privada de novo.
  respostaPrivadaGasta?: boolean;
};

// A resposta privada ao comentário: a única mensagem que fura a janela de 24h.
//
// POR QUE isto existe: quem comenta num post quase nunca mandou DM para a conta
// antes, então NÃO existe janela de 24h aberta para essa pessoa. `processItem`
// descarta como `skipped`, em silêncio, toda DM comum fora da janela. Sem
// resposta privada, automação com gatilho de comentário — o recurso central
// deste produto — não entrega absolutamente nada.
//
// A Meta permite UMA resposta privada por comentário; a segunda falha. Por isso
// esta função é um consumo, não uma consulta: a primeira mensagem da execução
// gasta o direito e marca o contexto. As seguintes (o link, o lembrete) saem
// pelos tipos normais — a essa altura a pessoa já tocou no botão ou respondeu, e
// a janela está aberta.
//
// Na prática a primeira é a de boas-vindas, porque o fluxo para nela esperando o
// toque. Mas isso é consequência da lista que o formulário grava hoje, não uma
// garantia: a marca no contexto vale para qualquer lista, inclusive uma que não
// tenha passo de espera logo no começo.
//
// Devolve o id do comentário quando esta mensagem deve sair como resposta
// privada, e null quando deve sair como DM comum.
function gastarRespostaPrivada(contexto: ContextoGatilho): string | null {
  if (!contexto.commentId || contexto.respostaPrivadaGasta) return null;
  contexto.respostaPrivadaGasta = true;
  return contexto.commentId;
}

async function executarFluxo(
  account: Account,
  auto: Automation,
  contactIgId: string,
  deIndice: number,
  contexto: ContextoGatilho = {}
): Promise<void> {
  const r = interpretar(auto.steps, deIndice);

  // Passo mal montado vira linha em Atividade, não exceção. Automação quebrada
  // não pode derrubar o webhook: a Meta reenviaria o evento por 36 horas.
  //
  // UMA linha por interpretação, com TODOS os ignorados dentro dela. As duas
  // decisões — juntar e limitar por janela — resolvem coisas diferentes:
  //
  // JUNTAR resolve a auto-supressão. Uma chamada por ignorado, dentro do laço,
  // se estrangulava sozinha: a primeira volta INSERE a linha do tipo, e da
  // segunda em diante, na MESMA interpretação, todas a encontram e desistem.
  // Uma automação com N passos quebrados reportava só o de menor índice, e como
  // a ordem do laço é estável os outros não apareciam NUNCA — perda permanente
  // de diagnóstico, não redução de ruído.
  //
  // A JANELA resolve a repetição entre eventos: os ignorados são recalculados a
  // cada interpretação, `executarFluxo` chama a si mesmo (portão vencido, e-mail
  // já conhecido) e o webhook aceita o que a Meta mandar — sem throttle o
  // diagnóstico virava o maior escritor da tabela.
  //
  // O que AINDA é suprimido, dito por inteiro: dentro de 10 minutos, a mesma
  // automação da mesma conta só grava uma vez. Se a lista for editada nesse
  // intervalo e passar a ignorar OUTROS passos, essa segunda leva não aparece
  // até a janela virar. Outra automação, ou outra conta, não é mais afetada — o
  // discriminador limita a janela a `automation_id` + `account_id`.
  if (r.ignorados.length) {
    await logEventThrottled(
      account.ig_user_id,
      "step_ignorado",
      { automation_id: auto.id, passos: r.ignorados },
      10,
      { campo: "automation_id", valor: auto.id }
    );
  }

  for (const acao of r.enfileirar) {
    const p = acao.passo;

    if (p.tipo === "pedir_follow") {
      // O portão é o único passo que consulta a Meta antes de decidir.
      const passou = await resolverFollow(account, auto, contactIgId, p, acao.indice, contexto);
      // Passou: `interpretar` PAROU neste passo, então o resto da lista sequer
      // foi olhado — este é o último item que ele devolveu, e seguir o laço não
      // faria nada. Retoma do próximo índice, senão vencer o portão seria o fim
      // do fluxo e o link nunca chegaria a quem seguiu.
      if (passou) return executarFluxo(account, auto, contactIgId, acao.indice + 1, contexto);
      await gravarCursor(account.ig_user_id, contactIgId, auto.id, acao.indice);
      return;
    }

    if (p.tipo === "pedir_email") {
      const rows = (await sql().query(
        `select email from contacts where account_id = $1 and ig_id = $2`,
        [account.ig_user_id, contactIgId]
      )) as { email: string | null }[];
      // Mesmo motivo do portão: o e-mail que já temos resolve este passo, e o
      // que vem depois dele só é visto numa nova interpretação.
      if (rows[0]?.email) {
        return executarFluxo(account, auto, contactIgId, acao.indice + 1, contexto);
      }
      // Quando o pedido de e-mail é o primeiro envio de uma execução nascida de
      // comentário, ele também tem que furar a janela: como DM comum seria
      // descartado e o fluxo morreria antes de mandar qualquer coisa.
      const comentario = gastarRespostaPrivada(contexto);
      await enqueue({
        account_id: account.ig_user_id,
        kind: comentario ? "private_reply" : "dm_email_ask",
        contact_ig_id: contactIgId,
        automation_id: auto.id,
        comment_id: comentario ?? undefined,
        payload: { text: p.texto },
        dedupe_key: comentario
          ? privateReplyKey(comentario)
          : emailAskKey(auto.id, contactIgId, dayBucket()),
      });
      await gravarCursor(account.ig_user_id, contactIgId, auto.id, acao.indice);
      return;
    }

    await enfileirarPasso(account, auto, contactIgId, acao, contexto);
  }

  // Chegar aqui com um ponto de parada só acontece quando quem para é uma `dm`
  // de resposta rápida — portão e e-mail já retornaram acima. Ela espera o toque
  // da pessoa, e sem gravar o cursor o toque recomeçaria a lista do zero e
  // pararia no mesmo passo, para sempre.
  if (r.pararEm !== null) {
    await gravarCursor(account.ig_user_id, contactIgId, auto.id, r.pararEm);
    return;
  }

  // A lista acabou: esta pessoa não está mais no meio de nada.
  await limparCursor(account.ig_user_id, contactIgId);
}

async function gravarCursor(
  accountId: string,
  contactIgId: string,
  automationId: string,
  indice: number
) {
  await sql().query(
    `update contacts set flow_step_index = $3, last_automation_id = $4
     where account_id = $1 and ig_id = $2`,
    [accountId, contactIgId, indice, automationId]
  );
}

async function limparCursor(accountId: string, contactIgId: string) {
  await sql().query(
    `update contacts set flow_step_index = null where account_id = $1 and ig_id = $2`,
    [accountId, contactIgId]
  );
}

// Lê o cursor JUNTO com a automação dona dele.
//
// O índice sozinho não quer dizer nada: ele é a posição dentro de UMA lista de
// passos, e cada automação tem a sua. É a dupla que responde "qual automação, em
// que ponto" — o ramo de texto de `handleMessagingEvent` já lia assim.
//
// A dupla NÃO é garantida por `gravarCursor` sozinho, e afirmar isso seria
// falso: `last_automation_id` tem três escritores, e dois deles escrevem só ele
// — os `upsertContact` do gatilho de comentário e do gatilho de texto, que
// deixam `flow_step_index` intocado. O que mantém a dupla coerente é o PAR: os
// dois são imediatamente seguidos de um `executarFluxo`, e todo caminho de
// `executarFluxo` termina em `gravarCursor` (que escreve os dois campos) ou em
// `limparCursor`. A invariante é da sequência escrita-seguida-de-execução, não
// de uma função só; quem inserir uma escrita de `last_automation_id` sem
// execução logo depois a quebra.
//
// Ler só o índice era o defeito: quem recebeu o botão da automação A, foi
// interrompido pela B e depois tocou no botão antigo de A tinha o cursor de B
// aplicado à lista de A. Eram dois estragos, e ler a dupla mata UM:
//
//   SUMIU — índice de B válido dentro da lista de A pulava passos de A, o
//     portão de follow inclusive, e entregava o link a quem não segue. Com
//     `cursorDesta` (lib/steps.ts), o índice emprestado nunca mais é aplicado.
//   CONTINUA DE PÉ — o lugar da pessoa em B se perde, e pelas DUAS formas, que
//     coexistem. A comum é a sobrescrita: `executarFluxo(A, ...)` termina em
//     `gravarCursor(A, ...)`, que escreve `flow_step_index` sem olhar de quem
//     era. A outra é o apagamento, exatamente como antes: se o portão de A passa
//     e a lista de A termina, `executarFluxo` cai no `limparCursor` (logo
//     abaixo) e o cursor de B some. Qual das duas acontece depende só de a lista
//     de A terminar ou parar; o resultado para B é o mesmo.
//
// A causa do que continua é outra: `gravarCursor` e `limparCursor` não conferem
// de quem é o cursor antes de escrever — há um cursor só por contato, e ele é do
// último a escrever. Consertar isso é mudar a ESCRITA do cursor (dono, ou um
// cursor por automação), e ramo de cursor já produziu defeito pior que o
// original duas vezes nesta branch. Fica para uma mudança própria, com o
// desenho decidido antes: aqui seria correção de escrita embutida numa onda de
// correção de leitura.
async function lerCursor(
  accountId: string,
  contactIgId: string
): Promise<{ indice: number | null; automationId: string | null }> {
  const rows = (await sql().query(
    `select flow_step_index, last_automation_id from contacts
     where account_id = $1 and ig_id = $2`,
    [accountId, contactIgId]
  )) as { flow_step_index: number | null; last_automation_id: string | null }[];
  return {
    indice: rows[0]?.flow_step_index ?? null,
    automationId: rows[0]?.last_automation_id ?? null,
  };
}

// Enfileira um passo que não espera resposta.
async function enfileirarPasso(
  account: Account,
  auto: Automation,
  contactIgId: string,
  acao: AcaoEnfileirar,
  contexto: ContextoGatilho
) {
  const p = acao.passo;
  const base = {
    account_id: account.ig_user_id,
    contact_ig_id: contactIgId,
    automation_id: auto.id,
    delaySeconds: acao.atrasoSegundos,
  };

  if (p.tipo === "dm") {
    // UM tipo de passo, TRÊS mensagens diferentes — e quem decide qual é a forma
    // do próprio passo: a presença do rótulo de botão e a da url.
    //
    // Isto não é preferência de estilo, é o que o dreno sabe fazer. `processItem`
    // manda todo `dm_link` por `linkMessage`, que sem url devolve TEXTO PURO —
    // então enfileirar tudo como `dm_link`, como era feito aqui, apagava o botão
    // de resposta rápida da mensagem de boas-vindas. E com o botão sumia o
    // payload `AUTO:<id>`, que é o que retoma o fluxo quando a pessoa toca.
    //
    // Pior: `esperaResposta` (lib/steps.ts) PARA o fluxo justamente no `dm` com
    // rótulo e sem url. Parar esperando um toque num botão que não foi enviado
    // deixa a pessoa sem o que tocar e o fluxo travado para sempre.
    //
    // A regra, na mesma ordem em que `esperaResposta` decide parar:
    //   rótulo e SEM url → resposta rápida (`dm_welcome`), o único caminho do
    //     dreno que monta `quick_replies`. O payload volta no webhook como
    //     `AUTO:<id da automação>`, e é ele que `handleMessagingEvent` lê para
    //     continuar do passo seguinte ao que ficou no cursor.
    //   COM url → botão de link (`dm_link`), que `linkMessage` transforma em
    //     template de botão. Vale também sem rótulo: aí o título cai no padrão
    //     "Abrir link" do próprio `linkMessage`, em vez de a url desaparecer da
    //     mensagem — e `esperaResposta` também não para aqui, porque a pessoa
    //     abre o link e a vida segue.
    //   sem rótulo e sem url → texto puro, que é `dm_link` sem url: o mesmo
    //     `linkMessage` devolve só `{ text }`.
    const respostaRapida = Boolean(p.botao_label) && !p.url;

    // ...e sobre essas três formas vem uma quarta decisão, que é de ENTREGA, não
    // de conteúdo: a primeira mensagem de uma execução disparada por comentário
    // sai como `private_reply`, presa ao id do comentário. É o que fura a janela
    // de 24h (ver `gastarRespostaPrivada`) — sem isso ela é descartada como
    // `skipped` e a automação por comentário não entrega nada.
    //
    // O `payload` NÃO muda por causa disso, e é isso que preserva o botão: o
    // dreno só desvia para `linkMessage` quando o tipo é `dm_link`/`dm_reminder`
    // ou quando há url; fora daí, rótulo + payload de resposta rápida viram
    // `quick_replies`. Então a resposta privada sai com o mesmo botão e o mesmo
    // `AUTO:<id da automação>` que retoma o fluxo quando a pessoa toca.
    const comentario = gastarRespostaPrivada(contexto);

    await enqueue({
      ...base,
      kind: comentario ? "private_reply" : respostaRapida ? "dm_welcome" : "dm_link",
      comment_id: comentario ?? undefined,
      payload: respostaRapida
        ? {
            text: p.texto,
            quick_reply_label: p.botao_label,
            quick_reply_payload: `AUTO:${auto.id}`,
          }
        : { text: p.texto, button_label: p.botao_label ?? null, url: p.url ?? null },
      // A chave da resposta privada é a mesma do motor antigo: o id do
      // comentário. É ele que garante uma única resposta privada por comentário,
      // que é exatamente o que a Meta permite — `passoKey` (por passo e por dia)
      // deixaria dois eventos do mesmo comentário virarem dois envios, e o
      // segundo falharia.
      dedupe_key: comentario
        ? privateReplyKey(comentario)
        : passoKey(auto.id, contactIgId, acao.indice, dayBucket()),
    });
    return;
  }

  if (p.tipo === "resposta_publica") {
    // Só faz sentido quando o gatilho foi comentário: sem o id, não há o que
    // responder. Numa automação de DM este passo simplesmente não acontece —
    // e isso é comportamento, não erro, então não vira `step_ignorado`.
    if (!contexto.commentId) return;
    // O sorteio pode sair vazio: `conferir` (lib/steps.ts) só exige que a lista
    // não esteja vazia, então `{"textos":[""]}` passa na validação. A Meta
    // recusa comentário sem texto com 400, e o item viraria `failed` em
    // Atividade sem que ninguém tivesse escrito nada errado de propósito.
    // Melhor não enfileirar — a resposta pública é enfeite, não o fluxo.
    const texto = pickRandom(p.textos);
    if (!texto?.trim()) return;
    await enqueue({
      ...base,
      kind: "comment_reply",
      comment_id: contexto.commentId,
      payload: { text: texto },
      dedupe_key: commentReplyKey(contexto.commentId),
    });
    return;
  }

  if (p.tipo === "reagir_story") {
    // Mesma lógica: sem mensagem para reagir, o passo não acontece.
    if (!contexto.messageId) return;
    await enqueue({
      ...base,
      kind: "story_reaction",
      payload: { message_id: contexto.messageId, reaction: p.emoji },
      dedupe_key: storyReactionKey(contexto.messageId),
    });
    return;
  }
}

// Zera o contador de pedidos de follow deste contato.
//
// Sem isto o contador só sobe: `clearFollowState` saiu junto com o fluxo antigo
// e nada mais repõe o valor.
//
// O QUE ISTO NÃO RESOLVE, e é preciso estar escrito com a medida certa: o
// contador só volta a zero quando o portão PASSA — a pessoa seguiu, ou a Meta
// não informou. Estourado o MAX_FOLLOW_REQUESTS, o que fica cortado é a
// MENSAGEM de pedido, não a reconsulta: `resolverFollow` consulta a Meta ANTES
// de olhar `follow_attempts`, então toda passagem pelo portão pergunta de novo.
//
// A saída, portanto, existe e não precisa de banco: seguir o perfil e mandar
// QUALQUER mensagem de texto. Quem está parado num `pedir_follow` captura
// qualquer texto (a condição de interrupção do ramo do cursor só olha passo
// `dm`), e o ramo retoma DO PRÓPRIO portão — o que chama `resolverFollow`,
// zera o contador e segue o fluxo. O botão é conveniência, não a única porta.
//
// O que sobra de armadilha, e não é pouco: passado o limite, a pessoa deixa de
// receber qualquer aviso do que falta fazer — o fluxo trava em silêncio, e ela
// só sai se tentar por conta própria. E o contador é por CONTATO, não por
// automação nem por dia (`follow_attempts` é coluna de `contacts`): quem
// esgotou as tentativas no portão da automação A também não recebe o pedido da
// B, hoje nem amanhã. Um reset por balde de dia (como as chaves de deduplicação
// já fazem) resolveria, e não foi feito aqui: mudaria o comportamento do limite,
// e esta branch já trocou o motor.
//
// A condição no fim evita escrever à toa em quem já está zerado, que é o caso
// comum: todo passo de follow vencido passaria por aqui.
async function zerarTentativasFollow(accountId: string, contactIgId: string) {
  await sql().query(
    `update contacts set follow_attempts = 0
     where account_id = $1 and ig_id = $2 and follow_attempts > 0`,
    [accountId, contactIgId]
  );
}

// Resolve o passo de follow: consulta a Meta e decide se o fluxo segue.
// Devolve true quando pode continuar.
async function resolverFollow(
  account: Account,
  auto: Automation,
  contactIgId: string,
  passo: { texto: string; botao_label: string },
  indice: number,
  contexto: ContextoGatilho
): Promise<boolean> {
  const segue = await checkFollowsAccount(contactIgId, account.access_token);

  if (segue === null) {
    // A Meta não informou. Barrar aqui deixaria TODA a base presa caso o campo
    // fique indisponível — e o dono do painel só descobriria pelos clientes
    // reclamando. Libera e registra, para o erro aparecer em Atividade.
    await logEvent(account.ig_user_id, "follow_check_unavailable", {
      contact_ig_id: contactIgId,
      automation_id: auto.id,
      // qual passo da lista foi liberado sem confirmação
      indice,
    });
    await zerarTentativasFollow(account.ig_user_id, contactIgId);
    return true;
  }
  if (segue) {
    await zerarTentativasFollow(account.ig_user_id, contactIgId);
    return true;
  }

  const rows = (await sql().query(
    `update contacts set follow_attempts = follow_attempts + 1
     where account_id = $1 and ig_id = $2 returning follow_attempts`,
    [account.ig_user_id, contactIgId]
  )) as { follow_attempts: number }[];
  const tentativa = rows[0]?.follow_attempts ?? 1;

  if (tentativa <= MAX_FOLLOW_REQUESTS) {
    // Mesma regra do passo `dm`: se o pedido de follow é o primeiro envio de uma
    // execução nascida de comentário, ele sai como resposta privada. É o único
    // jeito de ele chegar — e ele é um portão, então sem ele o fluxo inteiro
    // fica parado esperando um toque num botão que nunca foi entregue.
    const comentario = gastarRespostaPrivada(contexto);
    await enqueue({
      account_id: account.ig_user_id,
      kind: comentario ? "private_reply" : "dm_follow_gate",
      contact_ig_id: contactIgId,
      automation_id: auto.id,
      comment_id: comentario ?? undefined,
      payload: {
        text:
          tentativa === 1
            ? passo.texto
            : "Ainda não consegui ver você na minha lista de seguidores 👀 Segue lá e toca no botão de novo.",
        quick_reply_label: passo.botao_label,
        quick_reply_payload: `FOLLOW:${auto.id}`,
      },
      dedupe_key: comentario
        ? privateReplyKey(comentario)
        : followGateKey(auto.id, contactIgId, dayBucket(), tentativa),
    });
  }
  return false;
}

// Já houve boas-vindas recentes (e o link ainda não saiu)?
// Evita reenviar o link quando a pessoa só manda "obrigado" depois.
//
// Os dois `exists` voltaram a olhar coisas diferentes agora que o passo `dm`
// escolhe o tipo pela forma: o `dm` de resposta rápida (rótulo, sem url) é
// `dm_welcome` e o de link é `dm_link`, exatamente a distinção que esta consulta
// sempre pressupôs. Enquanto todo passo `dm` virava `dm_link`, `welcomed` ficava
// sempre falso para tráfego novo e este fallback não disparava.
//
// `private_reply` na lista não é só compatibilidade com as linhas antigas: é
// como as boas-vindas de um fluxo disparado por comentário são gravadas HOJE
// (ver `gastarRespostaPrivada`). Tirá-la daqui faria `welcomed` ser sempre falso
// justamente para o gatilho mais usado do produto.
async function shouldFallbackFollowup(
  accountId: string,
  automationId: string,
  contactIgId: string
): Promise<boolean> {
  const rows = (await sql().query(
    `select
       exists(
         select 1 from queue
         where account_id = $1 and contact_ig_id = $2 and automation_id = $3
           and kind in ('private_reply','dm_welcome') and status = 'sent'
           and sent_at > now() - interval '7 days'
       ) as welcomed,
       exists(
         select 1 from queue
         where account_id = $1 and contact_ig_id = $2 and automation_id = $3
           and kind = 'dm_link' and status in ('pending','sending','sent')
           and created_at > now() - interval '7 days'
       ) as linked`,
    [accountId, contactIgId, automationId]
  )) as { welcomed: boolean; linked: boolean }[];
  return Boolean(rows[0]?.welcomed) && !rows[0]?.linked;
}

export async function handleCommentEvent(entryId: string | undefined, value: CommentValue) {
  const account = await resolveAccount(entryId);
  if (!account) return;
  const fromId = value.from?.id;
  const commentId = value.id;
  if (!fromId || !commentId) return;
  // ignora comentários da própria conta (senão a resposta pública vira loop)
  if (fromId === account.ig_user_id) return;

  await logEvent(account.ig_user_id, "comment", value);

  const automations = await activeAutomations(account.ig_user_id);
  const auto = findMatch(automations, "comment", value.text ?? "", value.media?.id);
  if (!auto) return;

  await upsertContact(account.ig_user_id, fromId, {
    username: value.from?.username ?? null,
    last_automation_id: auto.id,
  });

  // Não há enfileiramento de boas-vindas aqui, e a ausência é de propósito: a
  // mensagem de boas-vindas virou um passo `dm` da lista (o formulário grava
  // `welcome_text` como o primeiro passo), então quem a envia é `executarFluxo`.
  // O `enqueue` de `private_reply` lido da coluna `auto.welcome_text` continuava
  // aqui por resíduo da migração, e o resultado era a pessoa receber a mesma
  // mensagem DUAS vezes — uma por coluna, outra por passo. As chaves de
  // deduplicação são diferentes (`privateReplyKey` por comentário contra
  // `passoKey` por passo/dia), então nada barrava a segunda.
  //
  // O resto do fluxo é a lista: a resposta pública deixou de ser um caso à
  // parte lido de `public_replies` e virou um passo como qualquer outro.
  //
  // O id do comentário vai junto por DOIS motivos. O primeiro é a resposta
  // pública, que sem ele não teria o que responder. O segundo é a entrega: é
  // esse id que faz a primeira mensagem sair como resposta privada e furar a
  // janela de 24h (ver `gastarRespostaPrivada`). Sem ele, esta automação
  // enfileira tudo como DM comum e o dreno descarta tudo, em silêncio.
  await executarFluxo(account, auto, fromId, 0, { commentId });
}

export async function handleMessagingEvent(entryId: string | undefined, ev: MessagingEvent) {
  const account = await resolveAccount(entryId);
  if (!account) return;
  const msg = ev.message;
  const senderId = ev.sender?.id;
  if (!msg || !senderId) return;

  // Mensagem que a PRÓPRIA conta enviou — o "eco" da Meta. Acontece quando
  // alguém responde pelo Instagram do celular, ou por outra ferramenta.
  //
  // A automação continua ignorando: reagir à própria mensagem viraria laço. Mas
  // ela é gravada antes de sair daqui, porque é METADE da conversa. A API do
  // Instagram devolve só as 20 mensagens mais recentes de cada conversa, então
  // o que não for gravado na hora não é recuperável depois — não existe
  // importar histórico.
  if (msg.is_echo || senderId === account.ig_user_id) {
    await logEvent(account.ig_user_id, "message_sent", ev);
    return;
  }

  const isStoryReply = Boolean(msg.reply_to?.story);
  const isQuickReply = Boolean(msg.quick_reply?.payload);
  const type = isQuickReply ? "quick_reply" : isStoryReply ? "story_reply" : "message";
  await logEvent(account.ig_user_id, type, ev);

  // Qualquer mensagem recebida abre/renova a janela de 24h
  const profile = await fetchProfileFields(account.ig_user_id, senderId, account.access_token);
  await upsertContact(account.ig_user_id, senderId, { ...profile, last_reply_at: new Date() });

  // Toque num botão de resposta rápida → segue o fluxo
  if (isQuickReply) {
    const payload = msg.quick_reply!.payload!;
    if (payload.startsWith("AUTO:")) {
      // Onde a lista retoma é decisão pura, e ela mora em `retomadaDoBotao`
      // (lib/steps.ts) — com o porquê de cada ramo e com teste. Aqui era uma
      // expressão solta dentro de `server-only`, que nenhum teste alcança, e foi
      // ela que entregou o link a quem não segue: o `+1` valia para a `dm` de
      // resposta rápida, mas o cursor também pode estar no PORTÃO, e o botão
      // antigo da boas-vindas continua tocável.
      const auto = await loadAutomation(account.ig_user_id, payload.slice(5));
      if (auto) {
        const cursor = await lerCursor(account.ig_user_id, senderId);
        await executarFluxo(account, auto, senderId, retomadaDoBotao(cursor, auto.id, auto.steps));
      }
    } else if (payload.startsWith("FOLLOW:")) {
      // "Já sigo!" — `resolverFollow` consulta a API de novo, então só passa
      // quem realmente seguir. De onde a lista retoma, e o preço de cada ramo
      // dessa escolha, está em `retomadaDoFollow` (lib/steps.ts), junto dos
      // testes. Os dois ramos de resposta rápida são uma chamada cada de
      // propósito: a assimetria entre eles é regra de produto, e regra de
      // produto sem teste foi o que quebrou duas vezes nesta branch.
      const auto = await loadAutomation(account.ig_user_id, payload.slice(7));
      if (auto) {
        const cursor = await lerCursor(account.ig_user_id, senderId);
        await executarFluxo(account, auto, senderId, retomadaDoFollow(cursor, auto.id, auto.steps));
      }
    }
    return;
  }

  const text = msg.text ?? "";

  // A palavra-chave é resolvida ANTES do cursor, embora só seja usada depois
  // dele: o ramo do cursor precisa saber se esta mensagem é, na verdade, o
  // gatilho de outra automação (ver ali embaixo).
  const automations = await activeAutomations(account.ig_user_id);
  const trigger = isStoryReply ? "story" : "dm";
  const auto = findMatch(automations, trigger, text, msg.reply_to?.story?.id);

  // Esta pessoa está parada em algum passo?
  const estado = (await sql().query(
    `select flow_step_index, last_automation_id from contacts
     where account_id = $1 and ig_id = $2`,
    [account.ig_user_id, senderId]
  )) as { flow_step_index: number | null; last_automation_id: string | null }[];

  const parado = estado[0];
  const indiceParado = parado?.flow_step_index ?? null;
  if (indiceParado !== null) {
    const autoParada = parado.last_automation_id
      ? await loadAutomation(account.ig_user_id, parado.last_automation_id)
      : undefined;

    // Sem automação carregável não há passo para retomar — ela foi desativada
    // ou apagada. Voltar daqui deixaria o `flow_step_index` gravado PARA
    // SEMPRE, porque nada mais o limpa: a pessoa ficaria surda a toda palavra-
    // chave, de toda automação, até alguém mexer no banco. Automação desativada
    // não pode sequestrar o contato: limpa o cursor e deixa o evento seguir.
    if (!autoParada) {
      await limparCursor(account.ig_user_id, senderId);
    } else {
      // O passo vem CRU do banco, então passa pela mesma validação que o
      // interpretador faz — e `passoEsperado` ainda confirma que ele espera
      // alguma coisa. Undefined aqui é cursor obsoleto (lista editada depois de
      // gravado, passo inválido, índice que não existe mais): não há resposta a
      // esperar, então o cursor sai da frente e o evento segue.
      const passo = passoEsperado(autoParada.steps, indiceParado);

      // Este ramo só pode CAPTURAR a mensagem quando ela é mesmo a resposta do
      // passo esperado. O critério, por tipo de passo:
      //   pedir_email  → a mensagem é candidata a e-mail. Captura.
      //   pedir_follow → qualquer mensagem vale como "quero continuar". Captura.
      //   dm de resposta rápida → o que ela espera é o TOQUE no botão, não
      //     texto. Então só deixa passar o que for gatilho de OUTRA automação:
      //     toda boas-vindas estaciona o cursor, e sem esta condição quem
      //     recebeu a boas-vindas da automação A e não tocou no botão ficaria
      //     preso — mandar a palavra-chave da automação B seria lido como
      //     "quero continuar em A", e B nunca dispararia.
      if (!passo) {
        await limparCursor(account.ig_user_id, senderId);
      } else if (passo.tipo === "dm" && interrompeOFluxo(auto, autoParada)) {
        // Não é resposta ao passo: é o gatilho de outra automação. Cai fora do
        // ramo e segue para o fluxo normal, que reinicia naquela automação. O
        // cursor não precisa ser limpo aqui — `executarFluxo` da automação nova
        // o reescreve (ou o apaga, se a lista terminar).
      } else {
        if (passo.tipo === "pedir_email") {
          const email = extractEmail(text);
          if (!email) {
            // Não parecia e-mail: pede de novo, uma vez por mensagem recebida.
            await enqueue({
              account_id: account.ig_user_id,
              kind: "dm_email_ask",
              contact_ig_id: senderId,
              automation_id: autoParada.id,
              payload: {
                text: "Acho que esse e-mail saiu errado 🤔 Me manda de novo, só o e-mail.",
              },
              dedupe_key: emailAnswerKey(msg.mid, senderId, Date.now()),
            });
            return;
          }
          await sql().query(
            `update contacts set email = $3 where account_id = $1 and ig_id = $2`,
            [account.ig_user_id, senderId, email]
          );
        }

        // Retoma do passo seguinte — menos no portão de follow, que retoma DELE
        // MESMO, para `resolverFollow` consultar a Meta de novo. O portão só é
        // portão se cada tentativa reconsultar: retomando do seguinte, bastaria
        // mandar "ok" para pular o passo e receber o link sem nunca ter seguido.
        const retomarDe = passo.tipo === "pedir_follow" ? indiceParado : indiceParado + 1;
        await executarFluxo(account, autoParada, senderId, retomarDe);
        return;
      }
    }
  }

  if (auto) {
    // Marca de quem é a conversa a partir de agora. Ficava dentro do `if
    // (auto.welcome_text)` que enfileirava as boas-vindas; saiu junto com ele e
    // passou a ser incondicional, porque não tem nada a ver com boas-vindas: é o
    // que faz o ramo do cursor e o de fallback, mais abaixo, saberem qual
    // automação retomar quando a pessoa responder com texto.
    await upsertContact(account.ig_user_id, senderId, { last_automation_id: auto.id });

    // Também aqui não há enfileiramento de boas-vindas, pelo mesmo motivo do
    // gatilho de comentário: ela é um passo `dm` da lista, e `executarFluxo`
    // logo abaixo a envia. O `enqueue` de `dm_welcome` a partir da coluna
    // `auto.welcome_text` era resíduo da migração e mandava a mensagem duas
    // vezes — `welcomeMessageKey` (por mid/instante) e `passoKey` (por
    // passo/dia) nunca colidem, então a deduplicação não pegava a repetição.
    //
    // O coraçãozinho na resposta de story deixou de ser caso à parte lido de
    // `story_reaction` e virou passo da lista. O id da mensagem vai junto
    // porque só o gatilho o conhece.
    await executarFluxo(account, auto, senderId, 0, { messageId: msg.mid });
    return;
  }

  // Sem palavra-chave, mas a pessoa respondeu com texto em vez de tocar no
  // botão: se a última automação dela ainda está ativa e a boas-vindas já saiu
  // sem o link, segue o fluxo DE ONDE ELE PAROU — não do começo.
  //
  // Do começo era o que estava aqui, e reinterpretava a lista inteira: a
  // boas-vindas voltava para a fila e o fluxo parava nela de novo, exatamente a
  // mensagem que a pessoa já tinha recebido, e o link continuava sem sair. E
  // repetir DUPLICA de verdade: a boas-vindas de um fluxo por comentário é
  // gravada com `privateReplyKey(commentId)`, e a repetição sai com `passoKey`
  // (por passo/pessoa/dia) — chaves diferentes, nada colide, dois envios.
  const lastAuto = estado[0]?.last_automation_id;
  const autoAnterior = lastAuto ? automations.find((a) => a.id === lastAuto) : undefined;
  if (
    autoAnterior &&
    (await shouldFallbackFollowup(account.ig_user_id, autoAnterior.id, senderId))
  ) {
    const de = retomadaDoFallback(autoAnterior.steps);
    if (de !== null) await executarFluxo(account, autoAnterior, senderId, de);
  }
}

// Resposta escrita por uma pessoa no painel.
//
// Entra na MESMA fila das automáticas de propósito: assim ela herda a trava
// atômica, o limite de ~190 envios/hora por conta, as novas tentativas e a
// checagem da janela de 24h. Um caminho de envio paralelo teria que reimplementar
// tudo isso — e erraria em algum ponto.
//
// O processItem já sabe tratar este caso: "dm_manual" não é comment_reply nem
// story_reaction, então cai no caminho de DM comum com texto simples.
export async function enqueueManualReply(
  accountId: string,
  contactIgId: string,
  text: string
): Promise<boolean> {
  return enqueue({
    account_id: accountId,
    kind: "dm_manual",
    contact_ig_id: contactIgId,
    payload: { text },
    dedupe_key: manualReplyKey(contactIgId, Date.now()),
  });
}
