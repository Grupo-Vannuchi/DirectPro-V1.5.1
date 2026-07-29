"use client";
import { card } from "../ui";
import {
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
import type { Account, Picked, TriggerKind } from "./types";

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
export default PhonePreview;
