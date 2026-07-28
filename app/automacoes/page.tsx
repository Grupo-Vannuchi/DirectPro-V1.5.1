import Link from "next/link";
import { sql, ensureSchema, Automation } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import AutomationsList, { ListaVazia, AutomationRow } from "./list-client";
import { card, btnPrimary, muted, alertError, link, pageTitle, pageSubtitle } from "../ui";

export const dynamic = "force-dynamic";

export default async function AutomacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const sp = await searchParams;
  await ensureSchema();
  const account = await getSelectedAccount();
  // cada automação pertence a uma conta conectada
  const automations = account
    ? ((await sql().query(
        `select * from automations where account_id = $1 order by created_at desc`,
        [account.ig_user_id]
      )) as Automation[])
    : [];

  // Só o que a lista precisa — a data vira string para atravessar a fronteira
  // servidor → cliente sem surpresa de serialização.
  const rows: AutomationRow[] = automations.map((a) => ({
    id: a.id,
    name: a.name,
    active: a.active,
    triggers: a.triggers,
    keywords: a.keywords,
    match_type: a.match_type,
    created_at: new Date(a.created_at).toISOString(),
    thumb: a.media_thumbnail_url ?? a.story_thumbnail_url ?? null,
  }));

  return (
    <div className="space-y-6">
      {sp.erro && <div className={alertError}>{sp.erro}</div>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={pageTitle}>Automações</h1>
          <p className={pageSubtitle}>
            {account ? (
              <>
                {automations.length === 0
                  ? "Nenhuma automação"
                  : `${automations.length} ${
                      automations.length === 1 ? "automação" : "automações"
                    }`}{" "}
                em <span className="font-medium">@{account.username ?? account.ig_user_id}</span>
              </>
            ) : (
              "Conecte uma conta para começar"
            )}
          </p>
        </div>
        {account && automations.length > 0 && (
          <Link href="/automacoes/nova" className={btnPrimary}>
            Nova automação
          </Link>
        )}
      </div>

      {!account ? (
        <div className={`p-8 text-center text-sm ${card} ${muted}`}>
          Conecte uma conta do Instagram em{" "}
          <Link href="/setup" className={link}>
            Configuração
          </Link>{" "}
          para criar automações.
        </div>
      ) : rows.length === 0 ? (
        <ListaVazia />
      ) : (
        <AutomationsList automations={rows} />
      )}
    </div>
  );
}
