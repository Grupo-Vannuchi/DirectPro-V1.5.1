import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureSchema, sql } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import { conversationMessages } from "@/lib/conversations";
import { windowState, formatWindowLeft } from "@/lib/inbox-window";
import { fmtDate } from "@/lib/format";
import { card, muted, pageTitle, badgeOk, badgeNeutral } from "../../ui";
import Avatar from "../../avatar";
import ReplyForm from "./reply-form";

export const dynamic = "force-dynamic";

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,32}$/.test(id)) notFound();

  await ensureSchema();
  const account = await getSelectedAccount();
  if (!account) notFound();

  // As duas consultas em paralelo. O `as` vai no resultado já resolvido, que é
  // o padrão do resto do projeto — converter a Promise confunde o TypeScript.
  const [linhasContato, mensagens] = await Promise.all([
    sql().query(
      `select username, name, profile_pic, last_reply_at
       from contacts where account_id = $1 and ig_id = $2`,
      [account.ig_user_id, id]
    ),
    conversationMessages(account.ig_user_id, id),
  ]);

  const contato = (
    linhasContato as {
      username: string | null;
      name: string | null;
      profile_pic: string | null;
      last_reply_at: Date | null;
    }[]
  )[0];
  const janela = windowState(contato?.last_reply_at ?? null);
  const quem = contato?.username ? `@${contato.username}` : (contato?.name ?? "Visitante");

  return (
    <div className="space-y-5">
      <div>
        <Link href="/conversas" className={`text-xs ${muted} hover:underline`}>
          ← Conversas
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <Avatar src={contato?.profile_pic ?? null} name={quem} className="h-10 w-10" textClassName="text-sm" />
          <h1 className={pageTitle}>{quem}</h1>
          <span className={janela.open ? badgeOk : badgeNeutral}>
            {janela.open ? `responde por ${formatWindowLeft(janela.msLeft)}` : "só leitura"}
          </span>
        </div>
      </div>

      <div className={`flex flex-col gap-2 p-4 ${card}`}>
        {!mensagens.length && (
          <p className={`py-8 text-center text-sm ${muted}`}>Nenhuma mensagem nesta conversa.</p>
        )}
        {mensagens.map((m, i) => {
          const falhou = m.delivery === "failed";
          const saindo = m.delivery === "sending";
          return (
            <div
              key={`${m.mid ?? "sem-id"}-${i}`}
              className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                m.direction === "in"
                  ? "self-start bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  : falhou
                    ? "self-end border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
                    : `self-end bg-indigo-500 text-white ${saindo ? "opacity-60" : ""}`
              }`}
            >
              {m.text || <span className="italic opacity-70">(sem texto)</span>}
              <span
                className={`mt-1 block text-[10px] ${
                  m.direction === "in" || falhou ? "text-zinc-500" : "text-indigo-100"
                }`}
              >
                {/* Enquanto não saiu, a hora ainda é a de criação e não diz nada
                    útil — o que importa é que está a caminho. */}
                {saindo ? "enviando…" : falhou ? "não enviada" : fmtDate(m.at)}
              </span>
            </div>
          );
        })}
      </div>

      <ReplyForm
        contactIgId={id}
        open={janela.open}
        closedReason="A janela de 24h fechou. Você pode ler esta conversa, mas só é possível responder quem falou há menos de 24 horas — é regra da Meta, não do painel."
      />
    </div>
  );
}
