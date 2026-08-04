"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { windowState, formatWindowLeft } from "@/lib/inbox-window";
import { fmtRelative } from "@/lib/format";
import { muted, badgeOk } from "../ui";
import Avatar from "../avatar";
import { badgeDaConversa } from "@/lib/inbox-badge";

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
  nao_lidas: number;
  sem_resposta: boolean;
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
        // A janela entra aqui: fora dela a Meta recusa o envio, então
        // marcar seria pedir uma ação impossível.
        const marca = badgeDaConversa({
          naoLidas: c.nao_lidas,
          semResposta: c.sem_resposta && janela.open,
        });
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
                {/* Nome primeiro, como no Instagram — o @ fica no cabeçalho da
                    conversa, onde sobra espaço. Nome do Instagram é campo livre
                    e às vezes vem só com enfeite (༄●⃝ᶫᵒꪜe☯), então o @ é o
                    reserva quando não há nome.

                    A data desceu para a segunda linha: ao lado do nome ela
                    espremia os dois e cortava quem tem usuário longo. */}
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.name?.trim() || (c.username ? `@${c.username}` : "Visitante")}
                  </p>
                  {/* Só destaca o que exige ação. "Só leitura" é o estado da
                      maioria das conversas antigas e viraria ruído em todas. */}
                  {janela.open && (
                    <span className={`${badgeOk} shrink-0`}>
                      {formatWindowLeft(janela.msLeft)}
                    </span>
                  )}
                </div>
                <div className={`mt-0.5 flex items-center gap-2 text-xs ${muted}`}>
                  <span className="shrink-0">{fmtRelative(c.last_at)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">
                    {c.total} {c.total === 1 ? "msg" : "msgs"}
                  </span>
                  {/* A direita da SEGUNDA linha, sob o contador da janela que
                      ocupa a primeira — é como aplicativo de mensagem organiza,
                      e evita que as duas marcas disputem o mesmo canto. */}
                  {marca === "contagem" && (
                    <span
                      role="img"
                      className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[11px] font-semibold tabular-nums text-white"
                      aria-label={`${c.nao_lidas} ${c.nao_lidas === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
                    >
                      {c.nao_lidas > 99 ? "99+" : c.nao_lidas}
                    </span>
                  )}
                  {marca === "ponto" && (
                    <span
                      role="img"
                      className="ml-auto h-2 w-2 shrink-0 rounded-full bg-indigo-400/70"
                      aria-label="Ainda sem resposta"
                    />
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
