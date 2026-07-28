"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { getSelectedAccountId } from "@/lib/account";

function splitList(raw: string, sep: RegExp): string[] {
  return raw
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveAutomation(formData: FormData): Promise<void> {
  await ensureSchema();
  const accountId = await getSelectedAccountId();
  if (!accountId)
    redirect(`/automacoes?erro=${encodeURIComponent("Conecte uma conta do Instagram antes.")}`);
  const id = String(formData.get("id") ?? "");
  // Gatilho único por automação (comment, story ou dm)
  const trigger = String(formData.get("trigger") ?? "");
  if (!["comment", "story", "dm"].includes(trigger))
    redirect(`/automacoes?erro=${encodeURIComponent("Escolha o gatilho da automação.")}`);
  const triggers = [trigger];

  const name = String(formData.get("name") ?? "").trim();
  const active = Boolean(formData.get("active"));
  const keywords = splitList(String(formData.get("keywords") ?? ""), /,/);
  const matchType = String(formData.get("match_type") ?? "contains");
  // post/story/resposta pública só fazem sentido no gatilho correspondente
  const mediaId =
    trigger === "comment" ? String(formData.get("media_id") ?? "") || null : null;
  const mediaThumb =
    trigger === "comment" ? String(formData.get("media_thumbnail_url") ?? "") || null : null;
  const mediaCaption =
    trigger === "comment" ? String(formData.get("media_caption") ?? "") || null : null;
  const storyId = trigger === "story" ? String(formData.get("story_id") ?? "") || null : null;
  const storyThumb =
    trigger === "story" ? String(formData.get("story_thumbnail_url") ?? "") || null : null;
  const publicReplies =
    trigger === "comment" ? splitList(String(formData.get("public_replies") ?? ""), /\r?\n/) : [];
  const welcomeText = String(formData.get("welcome_text") ?? "").trim();
  const quickReplyLabel =
    String(formData.get("quick_reply_label") ?? "").trim() || "Quero o link! 🔗";
  const linkText = String(formData.get("link_text") ?? "").trim();
  const linkButtonLabel = String(formData.get("link_button_label") ?? "").trim() || "Abrir link";
  const linkUrl = String(formData.get("link_url") ?? "").trim();
  // Etapas opcionais do fluxo
  const requireFollow = Boolean(formData.get("require_follow"));
  const followText = String(formData.get("follow_text") ?? "").trim();
  const followButtonLabel =
    String(formData.get("follow_button_label") ?? "").trim() || "Já sigo! ✅";
  const askEmail = Boolean(formData.get("ask_email"));
  const emailText = String(formData.get("email_text") ?? "").trim();
  // o coraçãozinho só faz sentido no gatilho de story
  const storyReaction =
    trigger === "story" ? String(formData.get("story_reaction") ?? "").trim() : "";

  const reminderText = String(formData.get("reminder_text") ?? "").trim();
  const reminderDelay = Math.max(
    5,
    Math.min(20 * 60, Number(formData.get("reminder_delay_minutes") ?? 60) || 60)
  );

  if (!name) redirect(`/automacoes?erro=${encodeURIComponent("Dê um nome à automação.")}`);
  if (matchType !== "any" && !keywords.length)
    redirect(`/automacoes?erro=${encodeURIComponent("Informe as palavras-chave.")}`);
  if (!welcomeText)
    redirect(`/automacoes?erro=${encodeURIComponent("Escreva a DM de boas-vindas.")}`);

  const params = [
    name,
    active,
    triggers,
    keywords,
    matchType,
    mediaId,
    mediaThumb,
    mediaCaption,
    storyId,
    storyThumb,
    publicReplies,
    welcomeText,
    quickReplyLabel,
    linkText,
    linkButtonLabel,
    linkUrl,
    reminderText,
    reminderDelay,
    requireFollow,
    followText,
    followButtonLabel,
    askEmail,
    emailText,
    storyReaction,
  ];

  let automationId = id;
  if (id) {
    // o account_id no where impede editar automação de outra conta
    await sql().query(
      `update automations set
         name = $1, active = $2, triggers = $3, keywords = $4, match_type = $5,
         media_id = $6, media_thumbnail_url = $7, media_caption = $8,
         story_id = $9, story_thumbnail_url = $10,
         public_replies = $11, welcome_text = $12, quick_reply_label = $13,
         link_text = $14, link_button_label = $15, link_url = $16,
         reminder_text = $17, reminder_delay_minutes = $18,
         require_follow = $19, follow_text = $20, follow_button_label = $21,
         ask_email = $22, email_text = $23, story_reaction = $24, updated_at = now()
       where id = $25 and account_id = $26`,
      [...params, id, accountId]
    );
  } else {
    const rows = (await sql().query(
      `insert into automations
         (account_id, name, active, triggers, keywords, match_type, media_id, media_thumbnail_url,
          media_caption, story_id, story_thumbnail_url, public_replies, welcome_text,
          quick_reply_label, link_text, link_button_label, link_url, reminder_text,
          reminder_delay_minutes, require_follow, follow_text, follow_button_label,
          ask_email, email_text, story_reaction)
       values ($25,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21,$22,$23,$24)
       returning id`,
      [...params, accountId]
    )) as { id: string }[];
    automationId = rows[0].id;
  }

  // regenera a sequência de follow-ups a partir da automação
  await sql().query(`delete from followups where automation_id = $1`, [automationId]);
  await sql().query(
    `insert into followups (automation_id, position, kind, text, button_label, url, delay_minutes)
     values ($1, 1, 'link', $2, $3, $4, 0)`,
    [automationId, linkText || "Aqui está o seu link! 👇", linkButtonLabel, linkUrl]
  );
  if (reminderText) {
    await sql().query(
      `insert into followups (automation_id, position, kind, text, button_label, url, delay_minutes)
       values ($1, 2, 'reminder', $2, $3, $4, $5)`,
      [automationId, reminderText, linkButtonLabel, linkUrl, reminderDelay]
    );
  }

  revalidatePath("/automacoes");
  redirect("/automacoes");
}

export async function toggleAutomation(id: string, active: boolean): Promise<void> {
  const accountId = await getSelectedAccountId();
  if (!accountId) return;
  await sql().query(
    `update automations set active = $1, updated_at = now() where id = $2 and account_id = $3`,
    [active, id, accountId]
  );
  revalidatePath("/automacoes");
}

export async function deleteAutomation(id: string): Promise<void> {
  const accountId = await getSelectedAccountId();
  if (!accountId) return;
  await sql().query(`delete from automations where id = $1 and account_id = $2`, [id, accountId]);
  revalidatePath("/automacoes");
}

// Duplica a automação inteira, inclusive os follow-ups. As colunas são copiadas
// por nome (em vez de listadas uma a uma) para a cópia continuar completa
// quando colunas novas forem adicionadas no futuro.
export async function duplicateAutomation(id: string): Promise<void> {
  const accountId = await getSelectedAccountId();
  if (!accountId) return;

  const rows = (await sql().query(
    `select * from automations where id = $1 and account_id = $2`,
    [id, accountId]
  )) as Record<string, unknown>[];
  const original = rows[0];
  if (!original) return;

  // colunas geradas pelo banco não entram na cópia
  const ignorar = new Set(["id", "created_at", "updated_at"]);
  const colunas = Object.keys(original).filter((c) => !ignorar.has(c));
  const valores = colunas.map((c) => {
    if (c === "name") return `${String(original.name ?? "Automação")} (cópia)`;
    // a cópia nasce pausada: evita duas automações disputando a mesma
    // palavra-chave sem o usuário perceber
    if (c === "active") return false;
    return original[c];
  });

  const placeholders = colunas.map((_, i) => `$${i + 1}`).join(", ");
  const novo = (await sql().query(
    `insert into automations (${colunas.map((c) => `"${c}"`).join(", ")})
     values (${placeholders}) returning id`,
    valores
  )) as { id: string }[];

  const novoId = novo[0]?.id;
  if (novoId) {
    await sql().query(
      `insert into followups (automation_id, position, kind, text, button_label, url, delay_minutes)
       select $1, position, kind, text, button_label, url, delay_minutes
       from followups where automation_id = $2`,
      [novoId, id]
    );
  }
  revalidatePath("/automacoes");
}
