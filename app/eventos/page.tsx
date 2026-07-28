import { sql, ensureSchema, QueueItem } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import { fmtDate } from "@/lib/format";
import { card, muted, tableWrap, thead, rowDivide } from "../ui";
import { eventBadge, kindLabel, statusBadge, friendlyError, eventText, eventUsername } from "../labels";
import Avatar from "../avatar";

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

export default async function EventosPage() {
  await ensureSchema();
  const account = await getSelectedAccount();

  // Junta com contatos para mostrar QUEM é a pessoa, não o número dela
  const [eventRows, queueRows] = account
    ? await Promise.all([
        sql().query(
          `select e.*,
                  coalesce(cf.username, cs.username) as person_username,
                  coalesce(cf.profile_pic, cs.profile_pic) as person_pic
           from events e
           left join contacts cf
             on cf.account_id = e.account_id and cf.ig_id = e.payload->'from'->>'id'
           left join contacts cs
             on cs.account_id = e.account_id and cs.ig_id = e.payload->'sender'->>'id'
           where e.account_id = $1 or e.account_id is null
           order by e.created_at desc limit 50`,
          [account.ig_user_id]
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
      ])
    : [[], []];
  const events = eventRows as EventRow[];
  const queue = queueRows as QueueRow[];

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
        </div>

        {!events.length ? (
          <p className={`p-6 text-sm ${card} ${muted}`}>
            Nada por aqui ainda. Quando alguém interagir com seus posts, aparece nesta lista.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => {
              const badge = eventBadge(e.type);
              const texto = eventText(e.payload, e.type);
              const quem = e.person_username ?? eventUsername(e.payload);
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
                      “{texto}”
                    </p>
                  )}

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
