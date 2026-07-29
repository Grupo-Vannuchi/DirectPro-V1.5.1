"use client";
import { useState } from "react";
import Link from "next/link";
import type { Automation } from "@/lib/db";
import { saveAutomation } from "./actions";
import MessageField from "./variable-picker";
import {
  card,
  input,
  label,
  hint,
  btnPrimary,
  btnSecondary,
  alertError,
  muted,
  sectionTitle,
  badgeAccent,
  badgeNeutral,
} from "../ui";
import { IconComment, IconStory, IconSend } from "../icons";
import MediaPicker from "./media-picker";
import PhonePreview from "./phone-preview";
import type { Account, Picked, TriggerKind } from "./types";

// Reexportado porque as páginas /automacoes/nova e /automacoes/[id] montam a
// conta e passam para cá; o tipo em si mora em ./types.
export type { Account } from "./types";

const inputCls = input;
const labelCls = label;
const hintCls = hint;

const TRIGGER_OPTIONS: {
  value: TriggerKind;
  icon: (props: { className?: string }) => React.ReactNode;
  title: string;
  desc: string;
}[] = [
  {
    value: "comment",
    icon: IconComment,
    title: "Comentário em post/reels",
    desc: "Alguém comenta a palavra-chave e recebe sua DM.",
  },
  {
    value: "story",
    icon: IconStory,
    title: "Resposta a story",
    desc: "Alguém responde seu story com a palavra-chave.",
  },
  {
    value: "dm",
    icon: IconSend,
    title: "DM recebida",
    desc: "Alguém manda a palavra-chave direto na sua DM.",
  },
];

const KEYWORD_HINT: Record<TriggerKind, string> = {
  comment: "O que a pessoa precisa comentar no post.",
  story: "O que a pessoa precisa responder no seu story.",
  dm: "O que a pessoa precisa mandar na sua DM.",
};

// Cada etapa é um "nó" do fluxo: bolinha numerada + trilho conectando ao nó
// seguinte, para a automação ser lida de cima para baixo como uma sequência —
// e não como um formulário longo de campos soltos.
function Section({
  step,
  title,
  subtitle,
  kind = "acao",
  opcional,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  kind?: "gatilho" | "acao";
  opcional?: boolean;
  children: React.ReactNode;
}) {
  const isGatilho = kind === "gatilho";
  return (
    <section className="relative pl-10 sm:pl-12">
      {/* trilho vertical do fluxo */}
      <span
        aria-hidden
        className="absolute left-[15px] top-10 bottom-[-20px] w-px bg-zinc-200 dark:bg-zinc-800"
      />
      <span
        aria-hidden
        className={`absolute left-0 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
          isGatilho
            ? "bg-indigo-500 text-white shadow-[0_0_0_4px_rgba(99,102,241,0.12)]"
            : "border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
        }`}
      >
        {step}
      </span>

      <div className={`${card} p-5`}>
        <header className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={isGatilho ? badgeAccent : badgeNeutral}>
              {isGatilho ? "Gatilho" : "Ação"}
            </span>
            {opcional && <span className={badgeNeutral}>opcional</span>}
          </div>
          <h2 className={`${sectionTitle} mt-2 text-[15px]`}>{title}</h2>
          {subtitle && <p className={`mt-1 text-xs ${muted}`}>{subtitle}</p>}
        </header>
        <div className="space-y-4">{children}</div>
      </div>
    </section>
  );
}


// ---------- Formulário ----------

export default function AutomationForm({
  automation,
  account,
}: {
  automation: Automation | null;
  account: Account | null;
}) {
  const a = automation;

  // Gatilho único (automações antigas com vários gatilhos assumem o primeiro)
  const initialTrigger: TriggerKind = a
    ? a.triggers.includes("comment")
      ? "comment"
      : a.triggers.includes("story")
        ? "story"
        : "dm"
    : "comment";

  const [trigger, setTrigger] = useState<TriggerKind>(initialTrigger);
  const [keywords, setKeywords] = useState(a?.keywords.join(", ") ?? "");
  const [matchType, setMatchType] = useState(a?.match_type ?? "contains");
  const [publicReplies, setPublicReplies] = useState(a?.public_replies.join("\n") ?? "");
  const [welcomeText, setWelcomeText] = useState(a?.welcome_text ?? "");
  const [quickReplyLabel, setQuickReplyLabel] = useState(a?.quick_reply_label ?? "Quero o link! 🔗");
  const [linkText, setLinkText] = useState(a?.link_text ?? "");
  const [linkButtonLabel, setLinkButtonLabel] = useState(a?.link_button_label ?? "Abrir link");
  const [linkUrl, setLinkUrl] = useState(a?.link_url ?? "");
  const [reminderText, setReminderText] = useState(a?.reminder_text ?? "");
  const [reminderDelay, setReminderDelay] = useState(a?.reminder_delay_minutes ?? 60);
  const [formError, setFormError] = useState("");

  // Etapas opcionais entre o botão e o link
  const [requireFollow, setRequireFollow] = useState(a?.require_follow ?? false);
  const [followText, setFollowText] = useState(a?.follow_text ?? "");
  const [followButtonLabel, setFollowButtonLabel] = useState(
    a?.follow_button_label ?? "Já sigo! ✅"
  );
  const [askEmail, setAskEmail] = useState(a?.ask_email ?? false);
  const [emailText, setEmailText] = useState(a?.email_text ?? "");
  const [storyReaction, setStoryReaction] = useState(a?.story_reaction ?? "");

  const [post, setPost] = useState<Picked | null>(
    a?.media_id
      ? { id: a.media_id, thumb: a.media_thumbnail_url ?? "", caption: a.media_caption ?? "" }
      : null
  );
  const [story, setStory] = useState<Picked | null>(
    a?.story_id ? { id: a.story_id, thumb: a.story_thumbnail_url ?? "", caption: "" } : null
  );

  function pickTrigger(t: TriggerKind) {
    setTrigger(t);
    // troca de gatilho leva junto o que só existia por causa dele
    if (t !== "comment") setPost(null);
    if (t !== "story") setStory(null);
  }

  function validate(e: React.FormEvent<HTMLFormElement>) {
    if (matchType !== "any" && !keywords.trim()) {
      e.preventDefault();
      setFormError("Informe as palavras-chave (ou mude para “Qualquer texto”).");
      return;
    }
    setFormError("");
  }

  const previewKeyword =
    matchType === "any"
      ? trigger === "comment"
        ? "adorei esse post!"
        : "oi!"
      : keywords.split(",")[0]?.trim() || "palavra-chave";
  const isComment = trigger === "comment";

  return (
    <form
      action={saveAutomation}
      onSubmit={validate}
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="space-y-5">
        <input type="hidden" name="id" defaultValue={a?.id ?? ""} />
        <input type="hidden" name="media_id" value={post?.id ?? ""} readOnly />
        <input type="hidden" name="media_thumbnail_url" value={post?.thumb ?? ""} readOnly />
        <input type="hidden" name="media_caption" value={post?.caption ?? ""} readOnly />
        <input type="hidden" name="story_id" value={story?.id ?? ""} readOnly />
        <input type="hidden" name="story_thumbnail_url" value={story?.thumb ?? ""} readOnly />

        {formError && <div className={alertError}>{formError}</div>}

        <Section
          step={1}
          title="Identificação"
          subtitle="Como você vai reconhecer esta automação na sua lista."
        >
          <div>
            <label className={labelCls}>Nome da automação</label>
            <input
              name="name"
              defaultValue={a?.name ?? ""}
              required
              className={inputCls}
              placeholder="Ex.: Link do e-book"
            />
            <p className={hintCls}>Só você vê esse nome, na lista de automações.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="active"
              defaultChecked={a?.active ?? true}
              className="h-4 w-4 accent-indigo-500"
            />
            Ativa
          </label>
        </Section>

        <Section
          step={2}
          kind="gatilho"
          title="Quando alguém…"
          subtitle="O que dispara a automação. Escolha o canal e as palavras que ativam."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {TRIGGER_OPTIONS.map((o) => {
              const selected = trigger === o.value;
              const Icon = o.icon;
              return (
                <label
                  key={o.value}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                    selected
                      ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500"
                      : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="trigger"
                    value={o.value}
                    checked={selected}
                    onChange={() => pickTrigger(o.value)}
                    className="sr-only"
                  />
                  <Icon
                    className={`h-5 w-5 ${
                      selected
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  />
                  <p
                    className={`mt-2 text-sm font-semibold ${
                      selected
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-zinc-800 dark:text-zinc-200"
                    }`}
                  >
                    {o.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{o.desc}</p>
                </label>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Palavras-chave (separadas por vírgula)</label>
              <input
                name="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                required={matchType !== "any"}
                className={inputCls}
                placeholder="quero, link, eu quero"
              />
              <p className={hintCls}>
                {KEYWORD_HINT[trigger]} Sem diferença de maiúsculas ou acentos.
              </p>
            </div>
            <div>
              <label className={labelCls}>Tipo de correspondência</label>
              <select
                name="match_type"
                value={matchType}
                onChange={(e) => setMatchType(e.target.value as typeof matchType)}
                className={inputCls}
              >
                <option value="contains">Contém a palavra</option>
                <option value="exact">Texto exato</option>
                <option value="any">Qualquer texto</option>
              </select>
            </div>
          </div>
          {trigger === "comment" && (
            <div>
              <span className={labelCls}>Post específico (opcional)</span>
              <MediaPicker kind="posts" selected={post} onSelect={setPost} />
              <p className={hintCls}>Sem post escolhido, vale para todos os posts.</p>
            </div>
          )}
          {trigger === "story" && (
            <div>
              <span className={labelCls}>Story específico (opcional)</span>
              <MediaPicker kind="stories" selected={story} onSelect={setStory} />
              <p className={hintCls}>
                Só stories no ar aparecem aqui (duram 24h). Sem story escolhido, vale para todos.
              </p>
            </div>
          )}
        </Section>

        {isComment && (
          <Section
            step={3}
            opcional
            title="Responder no comentário"
            subtitle="Resposta pública no post, visível para todos. Ajuda no alcance."
          >
            <MessageField
              name="public_replies"
              label="Variações (uma por linha — sorteia uma)"
              value={publicReplies}
              onChange={setPublicReplies}
              rows={3}
              placeholder={"Te chamei na DM! 📩\nAcabei de te mandar mensagem 😉"}
              hint="Aparece no post, abaixo do comentário da pessoa."
            />
          </Section>
        )}

        <Section
          step={isComment ? 4 : 3}
          title="Enviar a DM de boas-vindas"
          subtitle="A primeira mensagem no privado, antes do link."
        >
          <div>
            <MessageField
              name="welcome_text"
              label="Mensagem"
              value={welcomeText}
              onChange={setWelcomeText}
              rows={3}
              required
              placeholder="Oi {{first_name}}! Que bom te ver por aqui 😊 Toca no botão aqui embaixo que eu te mando o link."
            />
            <p className={hintCls}>
              {isComment
                ? "Enviada como resposta privada ao comentário (fura a janela de 24h)."
                : "Enviada como DM direta, na conversa que a pessoa abriu."}
            </p>
          </div>
          <div>
            <label className={labelCls}>Texto do botão de resposta rápida</label>
            <input
              name="quick_reply_label"
              value={quickReplyLabel}
              onChange={(e) => setQuickReplyLabel(e.target.value)}
              maxLength={20}
              className={inputCls}
            />
            <p className={hintCls}>
              Quando a pessoa toca, abre a janela de 24h e o link é enviado. Máx. 20 caracteres.
            </p>
          </div>
        </Section>

        <Section
          step={isComment ? 5 : 4}
          opcional
          title="Condições antes de entregar"
          subtitle="Peça para seguir ou colete o e-mail antes de liberar o link."
        >
          <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="require_follow"
              checked={requireFollow}
              onChange={(e) => setRequireFollow(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-indigo-500"
            />
            <span>
              Só entregar o link para quem segue seu perfil
              <span className={`mt-0.5 block text-xs font-normal ${muted}`}>
                O sistema confere na hora. Quem já segue nem vê esse pedido; quem não segue
                só avança depois que passar a seguir de verdade.
              </span>
            </span>
          </label>
          {requireFollow && (
            <div className="space-y-4 border-l-2 border-indigo-500/30 pl-4">
              <MessageField
                name="follow_text"
                label="Mensagem do pedido"
                value={followText}
                onChange={setFollowText}
                rows={2}
                placeholder="Antes de te mandar o link, me segue lá no perfil 🙏"
              />
              <div>
                <label className={labelCls}>Texto do botão</label>
                <input
                  name="follow_button_label"
                  value={followButtonLabel}
                  onChange={(e) => setFollowButtonLabel(e.target.value)}
                  maxLength={20}
                  className={inputCls}
                />
                <p className={hintCls}>
                  A cada toque no botão (ou mensagem tipo “já segui”), o sistema consulta o
                  Instagram de novo. O link só sai quando a resposta confirmar. Depois de 5
                  tentativas ele para de insistir para não virar spam — mas continua
                  conferindo, e libera assim que ela seguir.
                </p>
              </div>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="ask_email"
              checked={askEmail}
              onChange={(e) => setAskEmail(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-indigo-500"
            />
            <span>
              Pedir o e-mail antes do link
              <span className={`mt-0.5 block text-xs font-normal ${muted}`}>
                A pessoa digita o e-mail na DM e ele fica salvo na sua lista de contatos.
              </span>
            </span>
          </label>
          {askEmail && (
            <div className="space-y-4 border-l-2 border-indigo-500/30 pl-4">
              <MessageField
                name="email_text"
                label="Mensagem do pedido"
                value={emailText}
                onChange={setEmailText}
                rows={2}
                placeholder="Me manda seu melhor e-mail que eu te envio o link 👇"
                hint="Se vier algo que não parece e-mail, o sistema pede de novo uma vez."
              />
            </div>
          )}

          {trigger === "story" && (
            <div>
              <label className={labelCls}>Reagir à resposta do story</label>
              <div className="flex flex-wrap gap-2">
                {["", "❤️", "🔥", "😍", "👏", "🙌"].map((emoji) => (
                  <label
                    key={emoji || "off"}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-lg transition-colors ${
                      storyReaction === emoji
                        ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500"
                        : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
                    }`}
                  >
                    <input
                      type="radio"
                      name="story_reaction"
                      value={emoji}
                      checked={storyReaction === emoji}
                      onChange={() => setStoryReaction(emoji)}
                      className="sr-only"
                    />
                    {emoji || <span className="text-xs text-zinc-500">sem reação</span>}
                  </label>
                ))}
              </div>
              <p className={hintCls}>
                O robô reage à mensagem da pessoa, igual quando você toca e segura na DM.
              </p>
            </div>
          )}
        </Section>

        <Section
          step={isComment ? 6 : 5}
          title="Enviar o link"
          subtitle="A entrega principal: mensagem com o botão que leva ao seu destino."
        >
          <MessageField
            name="link_text"
            label="Mensagem"
            value={linkText}
            onChange={setLinkText}
            rows={2}
            placeholder="Aqui está, {{first_name}}! 👇 Aproveita 😉"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Rótulo do botão</label>
              <input
                name="link_button_label"
                value={linkButtonLabel}
                onChange={(e) => setLinkButtonLabel(e.target.value)}
                maxLength={20}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>URL</label>
              <input
                name="link_url"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className={inputCls}
                placeholder="https://seulink.com"
              />
            </div>
          </div>
        </Section>

        <Section
          step={isComment ? 7 : 6}
          opcional
          title="Lembrar quem não clicou"
          subtitle="Recupera quem recebeu o link mas não abriu."
        >
          <MessageField
            name="reminder_text"
            label="Mensagem do lembrete"
            value={reminderText}
            onChange={setReminderText}
            rows={2}
            placeholder="Ainda tá aí, {{first_name}}? 👀 O link continua te esperando 👇"
            hint="Disparado por tempo (a API não informa se a pessoa clicou no link). Precisa caber na janela de 24h."
          />
          <div>
            <label className={labelCls}>Atraso (minutos)</label>
            <input
              name="reminder_delay_minutes"
              type="number"
              min={5}
              max={1200}
              value={reminderDelay}
              onChange={(e) => setReminderDelay(Number(e.target.value) || 60)}
              className={inputCls}
            />
          </div>
        </Section>

        {/* Barra de ações fixa: o formulário é longo e, com o botão só no fim,
            era preciso rolar tudo para salvar. */}
        <div className="sticky bottom-0 z-20 -mx-1 mt-2 border-t border-zinc-200/80 bg-white/85 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-zinc-800 dark:bg-zinc-950/85 supports-[backdrop-filter]:dark:bg-zinc-950/70">
          <div className="flex items-center gap-3">
            <button className={btnPrimary}>Salvar automação</button>
            <Link href="/automacoes" className={btnSecondary}>
              Cancelar
            </Link>
            <span className={`ml-auto hidden text-xs sm:block ${muted}`}>
              As mudanças aparecem na pré-visualização ao lado
            </span>
          </div>
        </div>
      </div>

      {/* Pré-visualização ao vivo, do ponto de vista de quem interage */}
      <aside className="lg:sticky lg:top-6">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Pré-visualização
        </p>
        <PhonePreview
          account={account}
          trigger={trigger}
          post={post}
          story={story}
          keyword={previewKeyword}
          publicReply={publicReplies.split("\n")[0]?.trim() || undefined}
          welcomeText={welcomeText}
          quickReplyLabel={quickReplyLabel}
          linkText={linkText}
          linkButtonLabel={linkButtonLabel}
          linkUrl={linkUrl}
          reminderText={reminderText}
          reminderDelay={reminderDelay}
          requireFollow={requireFollow}
          followText={followText}
          followButtonLabel={followButtonLabel}
          askEmail={askEmail}
          emailText={emailText}
          storyReaction={storyReaction}
        />
      </aside>
    </form>
  );
}
