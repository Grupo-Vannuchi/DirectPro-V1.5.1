import { sql, ensureSchema, QueueItem } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import { fmtDate } from "@/lib/format";
import { card, muted, tableWrap, thead, rowDivide } from "../ui";
import {
  eventBadge,
  kindLabel,
  statusBadge,
  friendlyError,
  eventText,
  eventUsername,
  eventMedia,
} from "../labels";
import Avatar from "../avatar";
import PostLine from "./post-line";
import Realce from "./realce";
import Filtros, { type OpcaoPost } from "./filtros";
import { resolvePosts, type PostRef } from "@/lib/media-lookup";
import { LIMITE_EVENTOS, parseFilters, temFiltro } from "@/lib/event-filters";
import { EVENTS_FROM, buildWhere, postsComEventos } from "@/lib/event-query";

export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  type: string;
  payload: unknown;
  created_at: Date;
  person_username: string | null;
  person_pic: string | null;
};

type QueueRow = QueueItem & {
  person_username: string | null;
  person_name: string | null;
  person_pic: string | null;
};

// Quantos posts o seletor oferece. Mais que isso vira parede de miniaturas e
// estoura o teto de buscas avulsas do resolvePosts().
const POSTS_NO_SELETOR = 12;

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureSchema();
  const account = await getSelectedAccount();
  const filtros = parseFilters(await searchParams);
  const where = account ? buildWhere(account.ig_user_id, filtros) : null;
  const opcoes = account ? postsComEventos(account.ig_user_id, POSTS_NO_SELETOR) : null;

  // Junta com contatos para mostrar QUEM é a pessoa, não o número dela.
  // As quatro consultas são independentes — em paralelo para não empilhar
  // latência de rede uma atrás da outra.
  const [eventRows, queueRows, totalRows, postRows] =
    account && where && opcoes
      ? await Promise.all([
          sql().query(
            `select e.*,
                    coalesce(cf.username, cs.username) as person_username,
                    coalesce(cf.profile_pic, cs.profile_pic) as person_pic
             ${EVENTS_FROM}
             where ${where.sql}
             order by e.created_at desc limit ${LIMITE_EVENTOS}`,
            where.params
          ),
          sql().query(
            `select q.*, c.username as person_username, c.name as person_name,
                    c.profile_pic as person_pic
             from queue q
             left join contacts c
               on c.account_id = q.account_id and c.ig_id = q.contact_ig_id
             where q.account_id = $1
             order by q.created_at desc limit 50`,
            [account.ig_user_id]
          ),
          // Mesmo where da listagem: o número na tela nunca discorda da lista.
          sql().query(`select count(*)::int as total ${EVENTS_FROM} where ${where.sql}`, where.params),
          sql().query(opcoes.sql, opcoes.params),
        ])
      : [[], [], [], []];

  const events = eventRows as EventRow[];
  const queue = queueRows as QueueRow[];
  const total = (totalRows as { total: number }[])[0]?.total ?? 0;
  const contagens = postRows as { id: string; total: number }[];

  // De qual post veio cada comentário, e as capas do seletor. Os ids repetem
  // muito (vários comentários no mesmo post), então juntamos os dois conjuntos
  // e resolvemos os distintos numa chamada só.
  const mediaIds = [
    ...new Set([
      ...contagens.map((p) => p.id),
      ...events.map((e) => eventMedia(e.payload)?.id).filter((id) => Boolean(id)),
    ]),
  ] as string[];
  const posts: Map<string, PostRef> =
    account && mediaIds.length
      ? await resolvePosts(account.ig_user_id, account.access_token, mediaIds)
      : new Map();

  const opcoesPost: OpcaoPost[] = contagens.map((p) => ({
    id: p.id,
    total: p.total,
    thumb: posts.get(p.id)?.thumb ?? null,
    caption: posts.get(p.id)?.caption ?? null,
  }));

  const filtrando = temFiltro(filtros);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Mensagens enviadas</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            Tudo que o robô mandou por você — e o que ainda está a caminho.
          </p>
        </div>

        {!queue.length ? (
          <p className={`p-6 text-sm ${card} ${muted}`}>
            {account
              ? "Nenhuma mensagem enviada ainda. Assim que alguém comentar sua palavra-chave, aparece aqui."
              : "Conecte uma conta do Instagram primeiro."}
          </p>
        ) : (
          <div className={tableWrap}>
            <table className="w-full text-left text-sm">
              <thead className={thead}>
                <tr>
                  <th className="px-4 py-3">Para quem</th>
                  <th className="px-4 py-3">O que foi enviado</th>
                  <th className="px-4 py-3">Quando</th>
                  <th className="px-4 py-3">Situação</th>
                </tr>
              </thead>
              <tbody className={rowDivide}>
                {queue.map((q) => {
                  const badge = statusBadge(q.status);
                  const erro = friendlyError(q.error);
                  return (
                    <tr key={q.id}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            src={q.person_pic}
                            name={q.person_name ?? q.person_username ?? "?"}
                            className="h-8 w-8"
                            textClassName="text-xs"
                          />
                          <span className="truncate font-medium">
                            {q.person_username
                              ? `@${q.person_username}`
                              : q.person_name ?? "Visitante"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">{kindLabel(q.kind)}</td>
                      <td className={`px-4 py-2.5 ${muted}`}>
                        {fmtDate(q.sent_at ?? q.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={badge.className}>{badge.label}</span>
                        {erro && (
                          <p className="mt-1 max-w-xs text-xs text-zinc-500">{erro}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">O que aconteceu no seu Instagram</h2>
          <p className={`mt-1 text-sm ${muted}`}>
            Cada comentário, story respondido e mensagem que chegou até você.
          </p>
          {account && <Filtros filtros={filtros} posts={opcoesPost} />}
          {account && (
            <p className={`mt-3 text-xs ${muted}`}>
              <b className="font-semibold">{total}</b>{" "}
              {total === 1 ? "interação" : "interações"}
              {filtrando && " neste recorte"}
              {total > LIMITE_EVENTOS && ` · mostrando as ${LIMITE_EVENTOS} mais recentes`}
            </p>
          )}
        </div>

        {!events.length ? (
          <div className={`flex flex-col items-center gap-3 p-8 text-center text-sm ${card} ${muted}`}>
            {!account ? (
              <p>Conecte uma conta do Instagram primeiro.</p>
            ) : filtrando ? (
              <>
                <p>Nenhuma interação com esses filtros.</p>
                <a
                  href="/eventos"
                  className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Limpar filtros
                </a>
              </>
            ) : (
              <p>Nada por aqui ainda. Quando alguém interagir com seus posts, aparece nesta lista.</p>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => {
              const badge = eventBadge(e.type);
              const texto = eventText(e.payload, e.type);
              const quem = e.person_username ?? eventUsername(e.payload);
              const media = eventMedia(e.payload);
              return (
                <li key={e.id} className={`px-4 py-3 ${card}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={badge.className}>{badge.label}</span>
                    {quem && (
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Avatar
                          src={e.person_pic}
                          name={quem}
                          className="h-5 w-5"
                          textClassName="text-[9px]"
                        />
                        @{quem}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-zinc-500">{fmtDate(e.created_at)}</span>
                  </div>

                  {texto && (
                    <p className="mt-2 border-l-2 border-zinc-200 pl-3 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                      “<Realce texto={texto} termo={filtros.q} />”
                    </p>
                  )}

                  {media && <PostLine kind={media.kind} post={posts.get(media.id) ?? null} />}

                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                      Ver detalhes técnicos
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
