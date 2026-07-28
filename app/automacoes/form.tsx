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
  btnGhost,
  btnPrimary,
  btnSecondary,
  alertError,
  muted,
  sectionTitle,
  badgeAccent,
  badgeNeutral,
} from "../ui";
import {
  IconComment,
  IconStory,
  IconSend,
  IconCamera,
  IconImage,
  IconMic,
  IconSmile,
  IconPhone,
  IconVideo,
  IconChevronLeft,
  IconWifi,
  IconClock,
  IconTap,
} from "../icons";

type Media = {
  id: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  permalink?: string;
};

type Picked = { id: string; thumb: string; caption: string };
type TriggerKind = "comment" | "story" | "dm";
export type Account = { username: string | null; avatar: string | null };

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

// Seletor visual de posts/reels ou stories da conta conectada.
function MediaPicker({
  kind,
  selected,
  onSelect,
}: {
  kind: "posts" | "stories";
  selected: Picked | null;
  onSelect: (m: Picked | null) => void;
}) {
  const [media, setMedia] = useState<Media[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isStories = kind === "stories";

  async function openPicker() {
    setOpen(true);
    if (media.length) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(isStories ? "/api/media?type=stories" : "/api/media");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "erro ao buscar mídias");
      setMedia(json.media ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
    } finally {
      setLoading(false);
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-3">
        {selected.thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selected.thumb}
            alt=""
            className="h-16 w-16 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
          />
        )}
        <p className="max-w-xs truncate text-xs text-zinc-600 dark:text-zinc-400">
          {selected.caption || selected.id}
        </p>
        <button type="button" onClick={() => onSelect(null)} className={btnGhost}>
          Remover
        </button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={openPicker} className={btnGhost}>
        {isStories ? "Escolher story…" : "Escolher post…"}
      </button>
      {open && (
        <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
          {loading && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {isStories ? "Carregando seus stories…" : "Carregando seus posts…"}
            </p>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!loading && !error && media.length === 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {isStories
                ? "Nenhum story ativo agora. Stories só aparecem enquanto estão no ar (24h)."
                : "Nenhum post encontrado."}
            </p>
          )}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {media.map((m) => {
              const thumb = m.thumbnail_url ?? m.media_url ?? "";
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    onSelect({ id: m.id, thumb, caption: (m.caption ?? "").slice(0, 120) })
                  }
                  className="overflow-hidden rounded-lg border border-zinc-200 transition-colors hover:border-indigo-500 dark:border-zinc-800"
                  title={m.caption ?? m.id}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="flex aspect-square items-center justify-center text-[10px] text-zinc-500">
                      {m.media_type}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Pré-visualização em celular (inspirada no ManyChat) ----------

function MiniAvatar({ account, size = "h-5 w-5" }: { account: Account | null; size?: string }) {
  if (account?.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={account.avatar} alt="" className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-orange-400 text-[9px] font-bold text-white`}
    >
      {(account?.username ?? "S").slice(0, 1).toUpperCase()}
    </span>
  );
}

function Incoming({
  account,
  dim,
  children,
}: {
  account: Account | null;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex max-w-[85%] items-end gap-1.5 self-start ${dim ? "opacity-50" : ""}`}>
      <MiniAvatar account={account} />
      <div className="min-w-0 overflow-hidden rounded-2xl rounded-bl-md bg-zinc-800 text-[11px] leading-snug text-zinc-100">
        {children}
      </div>
    </div>
  );
}

function Outgoing({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-[#3797f0] px-3 py-1.5 text-[11px] leading-snug text-white">
      {children}
    </div>
  );
}

function ChatCaption({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="my-0.5 flex items-center gap-1 self-center text-[9px] text-zinc-600">
      {icon}
      {children}
    </p>
  );
}

function Placeholder({ text }: { text: string }) {
  return <span className="italic text-zinc-500">{text}</span>;
}

function PhonePreview(props: {
  account: Account | null;
  trigger: TriggerKind;
  post: Picked | null;
  story: Picked | null;
  keyword: string;
  publicReply: string | undefined;
  welcomeText: string;
  quickReplyLabel: string;
  linkText: string;
  linkButtonLabel: string;
  linkUrl: string;
  reminderText: string;
  reminderDelay: number;
  requireFollow: boolean;
  followText: string;
  followButtonLabel: string;
  askEmail: boolean;
  emailText: string;
  storyReaction: string;
}) {
  const { account, trigger, post, story } = props;
  const username = account?.username ?? "sua_conta";

  return (
    <div>
      {/* Cena do comentário: acontece no post, fora da DM */}
      {trigger === "comment" && (
        <div className={`mx-auto mb-3 w-[300px] p-3 ${card}`}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            No post
          </p>
          <div className="flex gap-2.5">
            {post?.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.thumb} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                <IconImage className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">
              <p>
                <span className="font-semibold">@visitante</span> {props.keyword}
              </p>
              {props.publicReply && (
                <p className="mt-1 border-l border-zinc-300 pl-2 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    @{username}
                  </span>{" "}
                  {props.publicReply}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Celular com a DM */}
      <div className="mx-auto w-[300px] overflow-hidden rounded-[2.4rem] border-[5px] border-zinc-800 bg-black shadow-2xl">
        {/* Barra de status */}
        <div className="relative flex items-center justify-between px-5 pb-1 pt-2 text-[9px] font-semibold text-zinc-200">
          <span>9:41</span>
          <span className="absolute left-1/2 top-1.5 h-4 w-16 -translate-x-1/2 rounded-full bg-zinc-900" />
          <span className="flex items-center gap-1">
            <span className="flex items-end gap-[2px]">
              <span className="h-1 w-[2.5px] rounded-sm bg-zinc-200" />
              <span className="h-1.5 w-[2.5px] rounded-sm bg-zinc-200" />
              <span className="h-2 w-[2.5px] rounded-sm bg-zinc-200" />
              <span className="h-2.5 w-[2.5px] rounded-sm bg-zinc-500" />
            </span>
            <IconWifi className="h-3 w-3" />
            <span className="flex h-2.5 w-[18px] items-center rounded-[3px] border border-zinc-500 p-[1.5px]">
              <span className="h-full w-3/4 rounded-[1px] bg-zinc-200" />
            </span>
          </span>
        </div>

        {/* Cabeçalho da DM */}
        <div className="flex items-center gap-2 border-b border-zinc-800/80 px-3 py-2">
          <IconChevronLeft className="h-4 w-4 text-zinc-300" />
          <span className="rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
            <span className="block rounded-full bg-black p-[2px]">
              <MiniAvatar account={account} size="h-6 w-6" />
            </span>
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-semibold text-zinc-100">{username}</p>
            <p className="text-[9px] text-zinc-500">Instagram</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-zinc-300">
            <IconPhone className="h-4 w-4" />
            <IconVideo className="h-4 w-4" />
          </div>
        </div>

        {/* Conversa */}
        <div className="flex min-h-[340px] flex-col gap-1.5 px-3 py-3">
          <ChatCaption>Hoje</ChatCaption>

          {trigger === "story" && (
            <div className="flex flex-col items-end gap-1 self-end">
              <p className="text-[9px] text-zinc-500">Respondeu ao seu story</p>
              {props.storyReaction && (
                <span className="order-last -mt-1 mr-1 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px]">
                  {props.storyReaction}
                </span>
              )}
              <span className="rounded-xl bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
                {story?.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={story.thumb}
                    alt=""
                    className="block h-20 w-12 rounded-[10px] object-cover"
                  />
                ) : (
                  <span className="flex h-20 w-12 items-center justify-center rounded-[10px] bg-zinc-900 text-zinc-500">
                    <IconCamera className="h-4 w-4" />
                  </span>
                )}
              </span>
              <Outgoing>{props.keyword}</Outgoing>
            </div>
          )}
          {trigger === "dm" && <Outgoing>{props.keyword}</Outgoing>}

          <Incoming account={account}>
            <p className="px-3 py-1.5">
              {props.welcomeText || <Placeholder text="Sua DM de boas-vindas…" />}
            </p>
          </Incoming>

          {props.quickReplyLabel && (
            <>
              <span className="mt-0.5 self-center rounded-full border border-[#3797f0]/60 bg-[#3797f0]/10 px-3 py-1 text-[10px] font-medium text-[#3797f0]">
                {props.quickReplyLabel}
              </span>
              <ChatCaption icon={<IconTap className="h-2.5 w-2.5" />}>
                quando a pessoa toca no botão
              </ChatCaption>
              <Outgoing>{props.quickReplyLabel}</Outgoing>
            </>
          )}

          {props.requireFollow && (
            <>
              <ChatCaption>quem ainda não segue vê isto</ChatCaption>
              <Incoming account={account}>
                <p className="px-3 py-1.5">
                  {props.followText || (
                    <Placeholder text="Antes de te mandar o link, me segue lá 🙏" />
                  )}
                </p>
              </Incoming>
              <span className="mt-0.5 self-center rounded-full border border-[#3797f0]/60 bg-[#3797f0]/10 px-3 py-1 text-[10px] font-medium text-[#3797f0]">
                {props.followButtonLabel || "Já sigo! ✅"}
              </span>
            </>
          )}

          {props.askEmail && (
            <>
              <Incoming account={account}>
                <p className="px-3 py-1.5">
                  {props.emailText || <Placeholder text="Me manda seu melhor e-mail 👇" />}
                </p>
              </Incoming>
              <Outgoing>ana@email.com</Outgoing>
            </>
          )}

          <Incoming account={account}>
            <p className="px-3 py-1.5">
              {props.linkText || <Placeholder text="Sua mensagem com o link…" />}
            </p>
            {props.linkUrl && (
              <p className="border-t border-zinc-700 px-3 py-1.5 text-center font-semibold text-[#3797f0]">
                {props.linkButtonLabel || "Abrir link"}
              </p>
            )}
          </Incoming>

          {props.reminderText && (
            <>
              <ChatCaption icon={<IconClock className="h-2.5 w-2.5" />}>
                {props.reminderDelay} min depois, se não clicou
              </ChatCaption>
              <Incoming account={account} dim>
                <p className="px-3 py-1.5">{props.reminderText}</p>
              </Incoming>
            </>
          )}
        </div>

        {/* Barra de mensagem */}
        <div className="flex items-center gap-2 px-2.5 py-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3797f0] text-white">
            <IconCamera className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 rounded-full border border-zinc-800 px-3 py-1.5 text-[11px] text-zinc-500">
            Mensagem…
          </span>
          <span className="flex items-center gap-2.5 text-zinc-400">
            <IconMic className="h-4 w-4" />
            <IconImage className="h-4 w-4" />
            <IconSmile className="h-4 w-4" />
          </span>
        </div>
        <div className="pb-1.5">
          <div className="mx-auto h-1 w-24 rounded-full bg-zinc-800" />
        </div>
      </div>
    </div>
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
