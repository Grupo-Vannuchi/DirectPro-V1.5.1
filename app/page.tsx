import Link from "next/link";
import { sql, getConfig, isMetaConfigured } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import { fmtDate, fmtRelative } from "@/lib/format";
import { card, btnPrimary, btnGhost, muted, link, alertError, alertOk, rowDivide } from "./ui";
import { eventBadge } from "./labels";
import { StatCard, SentChart } from "./dashboard-parts";
import { IconUsers, IconSend, IconZap, IconClock, IconAlert } from "./icons";
import Avatar from "./avatar";

export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";
const DIAS_GRAFICO = 14;

type Counts = {
  autos: number;
  contacts: number;
  contacts7: number;
  pending: number;
  sent7: number;
  sent_prev7: number;
  failed24: number;
  last_event: Date | null;
};

const ZERO: Counts = {
  autos: 0,
  contacts: 0,
  contacts7: 0,
  pending: 0,
  sent7: 0,
  sent_prev7: 0,
  failed24: 0,
  last_event: null,
};

// chave YYYY-MM-DD no fuso de Brasília (bate com o to_char da consulta)
function chaveDoDia(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Monta os últimos N dias já com a contagem de cada um. Fica fora do
// componente porque lê o relógio — o compilador do React exige render puro.
function montarSerie(porDia: Map<string, number>) {
  const hoje = Date.now();
  return Array.from({ length: DIAS_GRAFICO }, (_, i) => {
    const chave = chaveDoDia(new Date(hoje - (DIAS_GRAFICO - 1 - i) * 86_400_000));
    return { chave, rotulo: chave.slice(8), n: porDia.get(chave) ?? 0 };
  });
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ conectado?: string; erro?: string }>;
}) {
  const sp = await searchParams; // Next 16: searchParams é assíncrono
  // Em paralelo: são consultas independentes e, em série, cada uma somava uma
  // ida completa ao banco no tempo de carregamento da página.
  const [config, account] = await Promise.all([getConfig(), getSelectedAccount()]);

  // Todos os números são da conta selecionada na sidebar
  const [counts, serie, recentEvents] = await Promise.all([
    (async () =>
      account
        ? ((
        (await sql().query(
          `select
             (select count(*)::int from automations where account_id = $1 and active = true) as autos,
             (select count(*)::int from contacts where account_id = $1) as contacts,
             (select count(*)::int from contacts where account_id = $1
                and first_contact_at > now() - interval '7 days') as contacts7,
             (select count(*)::int from queue where account_id = $1 and status = 'pending') as pending,
             (select count(*)::int from queue where account_id = $1 and status = 'sent'
                and sent_at > now() - interval '7 days') as sent7,
             (select count(*)::int from queue where account_id = $1 and status = 'sent'
                and sent_at > now() - interval '14 days'
                and sent_at <= now() - interval '7 days') as sent_prev7,
             (select count(*)::int from queue where account_id = $1 and status = 'failed'
                and created_at > now() - interval '24 hours') as failed24,
             (select max(created_at) from events where account_id = $1) as last_event`,
          [account.ig_user_id]
        )) as Counts[]
      )[0] ?? ZERO)
        : ZERO)(),

    // Mensagens entregues por dia, para o gráfico
    (async () =>
      account
        ? ((await sql().query(
        `select to_char(sent_at at time zone $2, 'YYYY-MM-DD') as dia, count(*)::int as n
         from queue
         where account_id = $1 and status = 'sent'
           and sent_at > now() - interval '14 days'
         group by 1`,
        [account.ig_user_id, TZ]
      )) as { dia: string; n: number }[])
        : [])(),

    (async () =>
      account
        ? ((await sql().query(
        // O @ vem de contacts OU do próprio evento. Quem comenta sem casar
        // nenhuma palavra-chave não vira contato — o motor sai antes disso —,
        // mas o comentário carrega o username no payload. Sem esta última
        // alternativa, todo comentário que não disparou automação aparecia sem
        // nome nenhum. A /eventos já fazia essa volta; aqui faltava.
        `select e.id, e.type, e.created_at,
                coalesce(
                  cf.username,
                  cs.username,
                  e.payload->'from'->>'username'
                ) as person
         from events e
         left join contacts cf
           on cf.account_id = e.account_id and cf.ig_id = e.payload->'from'->>'id'
         left join contacts cs
           on cs.account_id = e.account_id and cs.ig_id = e.payload->'sender'->>'id'
         where e.account_id = $1
           -- resposta enviada pela própria conta: gravada para o histórico de
           -- conversa, mas este cartão é sobre o que CHEGOU até o usuário
           and e.type <> 'message_sent'
         order by e.created_at desc limit 8`,
        [account.ig_user_id]
      )) as { id: string; type: string; created_at: Date; person: string | null }[])
        : [])(),
  ]);
  const dias = montarSerie(new Map(serie.map((r) => [r.dia, r.n])));

  // Diagnóstico em uma frase: a primeira pergunta de quem abre o painel
  // é "está funcionando?" — e ela merece resposta antes dos números.
  const saude = !counts.autos
    ? {
        cor: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400",
        titulo: "Nenhuma automação ativa",
        texto: "Crie uma automação para o robô começar a responder por você.",
        acao: { href: "/automacoes/nova", label: "Criar automação" },
      }
    : counts.failed24
      ? {
          cor: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400",
          titulo: "Precisa de atenção",
          texto: `${counts.failed24} ${counts.failed24 === 1 ? "mensagem não saiu" : "mensagens não saíram"} nas últimas 24h.`,
          acao: { href: "/eventos", label: "Ver o que houve" },
        }
      : !counts.last_event
        ? {
            cor: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
            titulo: "Tudo pronto, aguardando",
            texto: "Publique um post e comente a palavra-chave usando OUTRA conta para testar.",
            acao: null,
          }
        : {
            cor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
            titulo: "Funcionando",
            texto: `Última interação ${fmtRelative(counts.last_event)}.`,
            acao: null,
          };

  return (
    <div className="space-y-6">
      {sp.conectado && (
        <div className={alertOk}>
          Instagram conectado com sucesso! Os webhooks da conta foram assinados.
        </div>
      )}
      {sp.erro && <div className={alertError}>Erro: {sp.erro}</div>}

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Painel</h1>
          <p className={`mt-0.5 text-sm ${muted}`}>
            {account
              ? `Visão geral de @${account.username ?? account.ig_user_id}`
              : "Comece conectando sua conta do Instagram"}
          </p>
        </div>
        {account ? (
          <a href="/api/oauth/login" className={btnGhost}>
            Reconectar
          </a>
        ) : (
          <Link href="/setup" className={btnPrimary}>
            {isMetaConfigured(config) ? "Continuar configuração" : "Começar configuração"}
          </Link>
        )}
      </header>

      {!account ? (
        <div className={`p-6 text-sm ${card} ${muted}`}>
          Nenhuma conta conectada ainda. Vá em{" "}
          <Link href="/setup" className={link}>
            Configuração
          </Link>{" "}
          — o assistente te guia passo a passo (leva uns 15 minutos, só na primeira vez).
        </div>
      ) : (
        <>
          {/* Status: a resposta para "está funcionando?" */}
          <div className={`flex flex-wrap items-center gap-4 p-4 ${card}`}>
            <Avatar
              src={account.profile_picture_url}
              name={account.username ?? "?"}
              className="h-12 w-12"
              textClassName="text-base"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">@{account.username}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${saude.cor}`}>
                  {saude.titulo}
                </span>
              </div>
              <p className={`mt-0.5 text-sm ${muted}`}>{saude.texto}</p>
            </div>
            {saude.acao && (
              <Link href={saude.acao.href} className={btnGhost}>
                {saude.acao.label}
              </Link>
            )}
          </div>

          {/* Números que importam para quem vende */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={IconUsers}
              label="Pessoas alcançadas"
              value={counts.contacts}
              trend={counts.contacts7}
              hint="novas em 7 dias"
            />
            <StatCard
              icon={IconSend}
              label="Mensagens entregues"
              value={counts.sent7}
              trend={counts.sent7 - counts.sent_prev7}
              hint="vs. 7 dias antes"
            />
            <StatCard
              icon={IconZap}
              label="Automações ativas"
              value={counts.autos}
              hint={counts.autos ? "respondendo agora" : "nenhuma ligada"}
            />
            <StatCard
              icon={counts.pending ? IconClock : IconAlert}
              label="Na fila"
              value={counts.pending}
              hint={counts.pending ? "a caminho" : "nada pendente"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Gráfico: 14 dias de mensagens entregues */}
            <SentChart dias={dias} />

            {/* Últimas interações */}
            <section className={card}>
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
                <h2 className="text-sm font-semibold">Últimas interações</h2>
                <Link
                  href="/eventos"
                  className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  ver todas
                </Link>
              </div>
              {recentEvents.length ? (
                <ul className={rowDivide}>
                  {recentEvents.map((e) => {
                    const badge = eventBadge(e.type);
                    return (
                      <li key={e.id} className="flex items-center gap-2.5 px-5 py-2.5 text-sm">
                        <span className={badge.className}>{badge.label}</span>
                        {e.person && (
                          <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                            @{e.person}
                          </span>
                        )}
                        <span className="ml-auto shrink-0 text-xs text-zinc-500">
                          {fmtRelative(e.created_at)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-5 py-10 text-center text-sm text-zinc-500">
                  Nada ainda. Quando alguém comentar ou mandar mensagem, aparece aqui.
                </p>
              )}
            </section>
          </div>

          <p className={`text-xs ${muted}`}>
            Conta conectada em {fmtDate(account.connected_at)} · acesso renovado
            automaticamente até {fmtDate(account.token_expires_at)}
          </p>
        </>
      )}
    </div>
  );
}
