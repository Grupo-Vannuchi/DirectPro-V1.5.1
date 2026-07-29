import "server-only";
import { sql, ensureSchema, listAccounts, getConfig, QueueItem } from "./db";
import { scheduleTick } from "./qstash";
import {
  sendMessage,
  replyToComment,
  linkMessage,
  sendReaction,
  IgError,
  OutgoingMessage,
} from "./ig";
import { renderVariables, type VariableContext } from "./variables";

// ============================================================
// Envio: drena a fila respeitando limites da Meta
// ============================================================

const WINDOW_MS = 24 * 60 * 60 * 1000;
const HOURLY_CAP = 190; // margem sobre o limite prático de ~200/h, POR CONTA
const BATCH_SIZE = 15;
const GAP_MS = 600; // ~1,6 envios/segundo

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function windowOpen(accountId: string, contactIgId: string | null): Promise<boolean> {
  if (!contactIgId) return false;
  const rows = (await sql().query(
    `select last_reply_at from contacts where account_id = $1 and ig_id = $2`,
    [accountId, contactIgId]
  )) as { last_reply_at: Date | null }[];
  const last = rows[0]?.last_reply_at ? new Date(rows[0].last_reply_at).getTime() : 0;
  return Date.now() - last < WINDOW_MS - 5 * 60_000; // margem de 5 min
}

async function finish(id: string, fields: { status: string; sent_at?: Date; not_before?: Date; error?: string }) {
  await sql().query(
    `update queue set
       status = $2,
       sent_at = coalesce($3, sent_at),
       not_before = coalesce($4, not_before),
       error = coalesce($5, error)
     where id = $1`,
    [
      id,
      fields.status,
      fields.sent_at?.toISOString() ?? null,
      fields.not_before?.toISOString() ?? null,
      fields.error ?? null,
    ]
  );
}

// Dados de quem vai receber a mensagem, para resolver as variáveis
// ({{first_name}} e afins). Uma consulta só, no momento do envio — assim vale
// para toda automação, inclusive as criadas antes deste recurso existir.
async function variableContext(
  accountId: string,
  contactIgId: string | null | undefined
): Promise<VariableContext> {
  if (!contactIgId) return {};
  try {
    const rows = (await sql().query(
      `select username, name, email from contacts where account_id = $1 and ig_id = $2`,
      [accountId, contactIgId]
    )) as { username: string | null; name: string | null; email: string | null }[];
    return rows[0] ?? {};
  } catch {
    // sem contato salvo: as variáveis caem no fallback (ou somem)
    return {};
  }
}

async function processItem(
  item: QueueItem,
  igUserId: string,
  token: string
): Promise<"sent" | "skipped"> {
  const p = item.payload as {
    text?: string;
    quick_reply_label?: string;
    quick_reply_payload?: string;
    button_label?: string;
    url?: string;
    message_id?: string;
    reaction?: string;
  };

  // Único ponto de saída de texto do sistema: resolver as variáveis aqui faz
  // TODA mensagem — atual ou futura — suportá-las, sem tocar em cada fluxo.
  const ctx = await variableContext(igUserId, item.contact_ig_id);
  const texto = renderVariables(p.text ?? "", ctx);
  const rotuloBotao = renderVariables(p.button_label ?? "", ctx);
  const rotuloResposta = renderVariables(p.quick_reply_label ?? "", ctx);

  if (item.kind === "comment_reply") {
    await replyToComment(item.comment_id!, token, texto);
    return "sent";
  }

  // Reação (coraçãozinho) na mensagem que a pessoa mandou
  if (item.kind === "story_reaction") {
    if (!p.message_id || !item.contact_ig_id) return "skipped";
    if (!(await windowOpen(igUserId, item.contact_ig_id))) return "skipped";
    await sendReaction(igUserId, token, item.contact_ig_id, p.message_id, p.reaction || "❤️");
    return "sent";
  }

  let recipient: { comment_id: string } | { id: string };
  if (item.kind === "private_reply") {
    recipient = { comment_id: item.comment_id! };
  } else {
    // DMs comuns só dentro da janela de 24h — regra da Meta
    if (!(await windowOpen(igUserId, item.contact_ig_id))) return "skipped";
    recipient = { id: item.contact_ig_id! };
  }

  let message: OutgoingMessage;
  if (item.kind === "dm_link" || item.kind === "dm_reminder") {
    message = linkMessage(texto, rotuloBotao || "Abrir link", p.url ?? "");
  } else if (p.quick_reply_label && p.quick_reply_payload) {
    message = {
      text: texto,
      quick_replies: [
        { content_type: "text", title: rotuloResposta, payload: p.quick_reply_payload },
      ],
    };
  } else {
    message = { text: texto };
  }

  await sendMessage(igUserId, token, recipient, message);
  return "sent";
}

export async function drainQueue(): Promise<{ sent: number; skipped: number; failed: number }> {
  const result = { sent: 0, skipped: 0, failed: 0 };
  await ensureSchema();
  const accounts = await listAccounts();
  if (!accounts.length) return result;
  const byId = new Map(accounts.map((a) => [a.ig_user_id, a]));

  // O limite horário da Meta é POR CONTA: contas no teto ficam de fora do
  // lote (em vez de serem reivindicadas e devolvidas, o que inflaria attempts).
  const capRows = (await sql()`
    select account_id, count(*)::int as n from queue
    where status = 'sent' and sent_at > now() - interval '1 hour'
    group by account_id
  `) as { account_id: string | null; n: number }[];
  const blocked = capRows
    .filter((r) => r.account_id && r.n >= HOURLY_CAP)
    .map((r) => r.account_id as string);

  // Trava atômica: FOR UPDATE SKIP LOCKED garante que dois drenos
  // simultâneos nunca peguem o mesmo item. Itens presos em 'sending'
  // há mais de 3 minutos são recuperados.
  const items = (await sql().query(
    `update queue q
     set status = 'sending', claimed_at = now(), attempts = q.attempts + 1
     where q.id in (
       select id from queue
       where ((status = 'pending' and not_before <= now())
          or (status = 'sending' and claimed_at < now() - interval '3 minutes'))
         and (account_id is null or not (account_id = any($2::text[])))
       order by created_at
       limit $1
       for update skip locked
     )
     returning q.*`,
    [BATCH_SIZE, blocked]
  )) as QueueItem[];

  for (const item of items) {
    const account = item.account_id ? byId.get(item.account_id) : undefined;
    if (!account) {
      // conta desconectada (ou item órfão antigo): não há token para enviar
      await finish(item.id, { status: "skipped", error: "conta não conectada" });
      result.skipped++;
      continue;
    }
    try {
      const outcome = await processItem(item, account.ig_user_id, account.access_token);
      if (outcome === "sent") {
        await finish(item.id, { status: "sent", sent_at: new Date() });
        result.sent++;
        await sleep(GAP_MS);
      } else {
        await finish(item.id, { status: "skipped", error: "janela de 24h fechada" });
        result.skipped++;
      }
    } catch (err) {
      const permanent = err instanceof IgError && err.status >= 400 && err.status < 500;
      const giveUp = permanent || item.attempts >= 3;
      await finish(item.id, {
        status: giveUp ? "failed" : "pending",
        not_before: new Date(Date.now() + 2 * 60_000),
        error: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
      result.failed++;
    }
  }

  // sobrou item pendente? agenda o próximo despertar
  // (item já vencido — ex.: lote cheio — volta em ~20s)
  const nextRows = (await sql()`
    select extract(epoch from (min(not_before) - now()))::float8 as secs
    from queue where status = 'pending'
  `) as { secs: number | null }[];
  const secs = nextRows[0]?.secs;
  if (secs !== null && secs !== undefined) {
    const config = await getConfig();
    await scheduleTick(config.app_url ?? "", Math.max(secs + 5, 20));
  }

  return result;
}
