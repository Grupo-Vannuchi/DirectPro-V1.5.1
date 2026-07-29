import Link from "next/link";
import { ensureSchema } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import { listConversations } from "@/lib/conversations";
import { windowState, formatWindowLeft } from "@/lib/inbox-window";
import { fmtDate } from "@/lib/format";
import { card, muted, pageTitle, pageSubtitle, badgeOk, badgeNeutral } from "../ui";
import Avatar from "../avatar";

export const dynamic = "force-dynamic";

export default async function ConversasPage() {
  await ensureSchema();
  const account = await getSelectedAccount();
  const conversas = account ? await listConversations(account.ig_user_id) : [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className={pageTitle}>Conversas</h1>
        <p className={pageSubtitle}>
          Quem falou com você no Instagram. Responder só é possível dentro de 24h
          desde a última mensagem da pessoa — regra da Meta.
        </p>
      </header>

      {!conversas.length ? (
        <p className={`p-6 text-sm ${card} ${muted}`}>
          {account
            ? "Nenhuma conversa ainda. Assim que alguém mandar mensagem, ela aparece aqui."
            : "Conecte uma conta do Instagram primeiro."}
        </p>
      ) : (
        <ul className="space-y-2">
          {conversas.map((c) => {
            const janela = windowState(c.last_reply_at);
            return (
              <li key={c.ig_id}>
                <Link
                  href={`/conversas/${c.ig_id}`}
                  className={`flex items-center gap-3 px-4 py-3 ${card} transition-colors hover:border-indigo-500`}
                >
                  <Avatar
                    src={c.profile_pic}
                    name={c.name ?? c.username ?? "?"}
                    className="h-9 w-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.username ? `@${c.username}` : (c.name ?? "Visitante")}
                    </p>
                    <p className={`text-xs ${muted}`}>
                      {c.total} {c.total === 1 ? "mensagem" : "mensagens"}
                    </p>
                  </div>
                  <span className={janela.open ? badgeOk : badgeNeutral}>
                    {janela.open ? `responde por ${formatWindowLeft(janela.msLeft)}` : "só leitura"}
                  </span>
                  <span className={`shrink-0 text-xs ${muted}`}>{fmtDate(c.last_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
