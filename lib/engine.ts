import "server-only";
import {
  sql,
  ensureSchema,
  getConfig,
  listAccounts,
  Account,
  Automation,
  Followup,
  QueueItem,
} from "./db";
import { matches, pickRandom, extractEmail } from "./match";
import { getUserProfile, checkFollowsAccount } from "./ig";
import { scheduleTick } from "./qstash";
import {
  privateReplyKey,
  commentReplyKey,
  followGateKey,
  emailAskKey,
  followupKey,
  emailAnswerKey,
  welcomeMessageKey,
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
export async function logEventThrottled(
  accountId: string | null,
  type: string,
  payload: unknown,
  minutos = 10
): Promise<void> {
  await ensureSchema();
  const recentes = (await sql().query(
    `select 1 from events
     where type = $1 and created_at > now() - make_interval(mins => $2::int)
     limit 1`,
    [type, minutos]
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

async function clearFollowState(accountId: string, igId: string) {
  await sql().query(
    `update contacts set
       awaiting = case when awaiting = 'follow' then null else awaiting end,
       follow_attempts = 0
     where account_id = $1 and ig_id = $2`,
    [accountId, igId]
  );
}

// Portão de seguidor: devolve true só quando a pessoa REALMENTE segue.
// Enquanto não seguir, marca o estado, repete o pedido (com moderação) e
// devolve false — o próximo passo do fluxo não sai.
async function followGate(
  account: Account,
  auto: Automation,
  contactIgId: string
): Promise<boolean> {
  if (!auto.require_follow) return true;

  const segue = await checkFollowsAccount(contactIgId, account.access_token);

  if (segue === null) {
    // A Meta não informou. Barrar aqui deixaria TODA a base presa caso o campo
    // fique indisponível (permissão, instabilidade) — e o dono do painel só
    // descobriria pelos clientes reclamando. Então libera e registra, para o
    // erro aparecer em Atividade em vez de virar uma automação morta e muda.
    await logEvent(account.ig_user_id, "follow_check_unavailable", {
      contact_ig_id: contactIgId,
      automation_id: auto.id,
    });
    await clearFollowState(account.ig_user_id, contactIgId);
    return true;
  }

  if (segue) {
    await clearFollowState(account.ig_user_id, contactIgId);
    return true;
  }

  // Ainda não segue: guarda o estado e conta a tentativa
  const rows = (await sql().query(
    `update contacts set awaiting = 'follow', follow_attempts = follow_attempts + 1
     where account_id = $1 and ig_id = $2
     returning follow_attempts`,
    [account.ig_user_id, contactIgId]
  )) as { follow_attempts: number }[];
  const tentativa = rows[0]?.follow_attempts ?? 1;

  if (tentativa <= MAX_FOLLOW_REQUESTS) {
    await enqueue({
      account_id: account.ig_user_id,
      kind: "dm_follow_gate",
      contact_ig_id: contactIgId,
      automation_id: auto.id,
      payload: {
        text:
          tentativa === 1
            ? auto.follow_text || "Antes de te mandar o link, me segue lá no perfil 🙏"
            : "Ainda não consegui ver você na minha lista de seguidores 👀 Segue lá e toca no botão de novo.",
        quick_reply_label: auto.follow_button_label || "Já sigo! ✅",
        quick_reply_payload: `FOLLOW:${auto.id}`,
      },
      // a tentativa entra na chave: cada pedido é um item novo na fila
      dedupe_key: followGateKey(auto.id, contactIgId, dayBucket(), tentativa),
    });
  }
  return false;
}

// Decide qual é o PRÓXIMO passo do fluxo desta pessoa:
// seguir o perfil → informar o e-mail → receber o link.
// Cada etapa é opcional; sem nenhuma ligada, o link sai direto (como antes).
async function advanceFlow(account: Account, auto: Automation, contactIgId: string) {
  if (!(await followGate(account, auto, contactIgId))) return;

  if (auto.ask_email) {
    const rows = (await sql().query(
      `select email from contacts where account_id = $1 and ig_id = $2`,
      [account.ig_user_id, contactIgId]
    )) as { email: string | null }[];
    if (!rows[0]?.email) {
      await sql().query(
        `update contacts set awaiting = 'email' where account_id = $1 and ig_id = $2`,
        [account.ig_user_id, contactIgId]
      );
      await enqueue({
        account_id: account.ig_user_id,
        kind: "dm_email_ask",
        contact_ig_id: contactIgId,
        automation_id: auto.id,
        payload: {
          text: auto.email_text || "Me manda seu melhor e-mail que eu te envio o link 👇",
        },
        dedupe_key: emailAskKey(auto.id, contactIgId, dayBucket()),
      });
      return;
    }
  }

  await enqueueFollowups(account.ig_user_id, auto.id, contactIgId);
}

async function enqueueFollowups(accountId: string, automationId: string, contactIgId: string) {
  const followups = (await sql().query(
    `select * from followups where automation_id = $1 order by position asc`,
    [automationId]
  )) as Followup[];
  for (const f of followups) {
    await enqueue({
      account_id: accountId,
      kind: f.kind === "link" ? "dm_link" : "dm_reminder",
      contact_ig_id: contactIgId,
      automation_id: automationId,
      payload: { text: f.text, button_label: f.button_label, url: f.url },
      dedupe_key: followupKey(f.id, contactIgId, dayBucket()),
      delaySeconds: f.delay_minutes * 60,
    });
  }
}

// Já houve boas-vindas recentes (e o link ainda não saiu)?
// Evita reenviar o link quando a pessoa só manda "obrigado" depois.
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

  // Resposta PRIVADA ao comentário: fura a janela de 24h,
  // 1 vez por comentário, válida por até 7 dias.
  if (auto.welcome_text) {
    await enqueue({
      account_id: account.ig_user_id,
      kind: "private_reply",
      contact_ig_id: fromId,
      automation_id: auto.id,
      comment_id: commentId,
      payload: {
        text: auto.welcome_text,
        quick_reply_label: auto.quick_reply_label,
        quick_reply_payload: `AUTO:${auto.id}`,
      },
      dedupe_key: privateReplyKey(commentId),
    });
  }

  // Resposta pública opcional no comentário (sorteia variação)
  const publicReply = pickRandom(auto.public_replies);
  if (publicReply) {
    await enqueue({
      account_id: account.ig_user_id,
      kind: "comment_reply",
      contact_ig_id: fromId,
      automation_id: auto.id,
      comment_id: commentId,
      payload: { text: publicReply },
      dedupe_key: commentReplyKey(commentId),
    });
  }
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
      const auto = await loadAutomation(account.ig_user_id, payload.slice(5));
      if (auto) await advanceFlow(account, auto, senderId);
    } else if (payload.startsWith("FOLLOW:")) {
      // "Já sigo!" — consulta a API de novo. Só passa se realmente seguir.
      const auto = await loadAutomation(account.ig_user_id, payload.slice(7));
      if (auto) await advanceFlow(account, auto, senderId);
    }
    return;
  }

  const text = msg.text ?? "";

  // Estamos esperando o e-mail desta pessoa?
  const estado = (await sql().query(
    `select awaiting, last_automation_id from contacts where account_id = $1 and ig_id = $2`,
    [account.ig_user_id, senderId]
  )) as { awaiting: string | null; last_automation_id: string | null }[];

  // Esperando que ela siga? Qualquer mensagem ("já segui", "pronto", "ok")
  // vale como "quero continuar" e dispara nova consulta à API.
  if (estado[0]?.awaiting === "follow") {
    const auto = estado[0].last_automation_id
      ? await loadAutomation(account.ig_user_id, estado[0].last_automation_id)
      : undefined;
    if (auto) await advanceFlow(account, auto, senderId);
    return;
  }

  if (estado[0]?.awaiting === "email") {
    const email = extractEmail(text);
    if (email) {
      await sql().query(
        `update contacts set email = $3, awaiting = null where account_id = $1 and ig_id = $2`,
        [account.ig_user_id, senderId, email]
      );
      const auto = estado[0].last_automation_id
        ? await loadAutomation(account.ig_user_id, estado[0].last_automation_id)
        : undefined;
      if (auto) await enqueueFollowups(account.ig_user_id, auto.id, senderId);
      return;
    }
    // não parecia um e-mail: pede de novo, uma vez por mensagem recebida
    await enqueue({
      account_id: account.ig_user_id,
      kind: "dm_email_ask",
      contact_ig_id: senderId,
      automation_id: estado[0].last_automation_id ?? undefined,
      payload: { text: "Acho que esse e-mail saiu errado 🤔 Me manda de novo, só o e-mail." },
      dedupe_key: emailAnswerKey(msg.mid, senderId, Date.now()),
    });
    return;
  }
  const automations = await activeAutomations(account.ig_user_id);
  const trigger = isStoryReply ? "story" : "dm";
  const auto = findMatch(automations, trigger, text, msg.reply_to?.story?.id);

  if (auto) {
    // Coraçãozinho na resposta de story, como no ManyChat
    if (isStoryReply && auto.story_reaction && msg.mid) {
      await enqueue({
        account_id: account.ig_user_id,
        kind: "story_reaction",
        contact_ig_id: senderId,
        automation_id: auto.id,
        payload: { message_id: msg.mid, reaction: auto.story_reaction },
        dedupe_key: storyReactionKey(msg.mid),
      });
    }

    // Conversa já aberta (a pessoa nos mandou mensagem) → DM direta
    if (auto.welcome_text) {
      await enqueue({
        account_id: account.ig_user_id,
        kind: "dm_welcome",
        contact_ig_id: senderId,
        automation_id: auto.id,
        payload: {
          text: auto.welcome_text,
          quick_reply_label: auto.quick_reply_label,
          quick_reply_payload: `AUTO:${auto.id}`,
        },
        dedupe_key: welcomeMessageKey(msg.mid, senderId, Date.now()),
      });
      await upsertContact(account.ig_user_id, senderId, { last_automation_id: auto.id });
    }
    return;
  }

  // Sem palavra-chave, mas a pessoa respondeu com texto em vez de tocar
  // no botão: se a última automação dela ainda está ativa, segue o fluxo.
  const lastAuto = estado[0]?.last_automation_id;
  if (
    lastAuto &&
    automations.some((a) => a.id === lastAuto) &&
    (await shouldFallbackFollowup(account.ig_user_id, lastAuto, senderId))
  ) {
    await enqueueFollowups(account.ig_user_id, lastAuto, senderId);
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
