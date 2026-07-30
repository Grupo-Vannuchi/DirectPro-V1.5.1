"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { windowState, formatWindowLeft } from "@/lib/inbox-window";
import { fmtDate } from "@/lib/format";
import { muted, badgeOk } from "../ui";
import Avatar from "../avatar";

// A coluna da esquerda do inbox.
//
// É componente de cliente por um motivo só: marcar a conversa aberta. O layout
// que a renderiza não sabe qual rota filha está ativa — só o navegador sabe, via
// usePathname. Os dados continuam vindo do servidor, por props.

export type ConversaResumo = {
  ig_id: string;
  last_at: Date | string;
  total: number;
  username: string | null;
  name: string | null;
  profile_pic: string | null;
  last_reply_at: Date | string | null;
};

export default function Lista({
  conversas,
  semConta,
}: {
  conversas: ConversaResumo[];
  semConta: boolean;
}) {
  const pathname = usePathname();

  if (!conversas.length) {
    return (
      <p className={`p-5 text-sm ${muted}`}>
        {semConta
          ? "Conecte uma conta do Instagram primeiro."
          : "Nenhuma conversa ainda. Assim que alguém mandar mensagem, ela aparece aqui."}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
      {conversas.map((c) => {
        const janela = windowState(c.last_reply_at);
        const aberta = pathname === `/conversas/${c.ig_id}`;
        return (
          <li key={c.ig_id}>
            <Link
              href={`/conversas/${c.ig_id}`}
              aria-current={aberta ? "page" : undefined}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                aberta
                  ? "bg-indigo-50 dark:bg-indigo-950/40"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              }`}
            >
              <Avatar
                src={c.profile_pic}
                name={c.name ?? c.username ?? "?"}
                className="h-9 w-9"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.username ? `@${c.username}` : (c.name ?? "Visitante")}
                  </p>
                  <span className={`shrink-0 text-[11px] ${muted}`}>{fmtDate(c.last_at)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={`text-xs ${muted}`}>
                    {c.total} {c.total === 1 ? "mensagem" : "mensagens"}
                  </span>
                  {/* Só destaca o que exige ação. "Só leitura" é o estado da
                      maioria das conversas antigas e viraria ruído em todas. */}
                  {janela.open && (
                    <span className={badgeOk}>{formatWindowLeft(janela.msLeft)}</span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
