import { notFound } from "next/navigation";
import { sql, ensureSchema, Automation } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import AutomationForm, { Account } from "../form";

export const dynamic = "force-dynamic";

export default async function EditarAutomacaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // Next 16: params é assíncrono
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await ensureSchema();
  const selected = await getSelectedAccount();
  if (!selected) notFound();

  // só abre automação da conta selecionada
  const rows = (await sql().query(
    `select * from automations where id = $1 and account_id = $2`,
    [id, selected.ig_user_id]
  )) as unknown[];
  const data = rows[0];
  if (!data) notFound();

  const account: Account = {
    username: selected.username,
    avatar: selected.profile_picture_url,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Editar automação</h1>
      <AutomationForm automation={data as Automation} account={account} />
    </div>
  );
}
