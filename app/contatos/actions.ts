"use server";
import { revalidatePath } from "next/cache";
import { sql, ensureSchema } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import { getUserProfile } from "@/lib/ig";

// Preenche nome/@ dos contatos que ficaram salvos só com o número (IGSID),
// criados antes de o app buscar o perfil na hora do webhook.
export async function atualizarPerfis(): Promise<void> {
  await ensureSchema();
  const account = await getSelectedAccount();
  if (!account) return;

  const rows = (await sql().query(
    `select ig_id from contacts
     where account_id = $1 and username is null
     order by first_contact_at desc limit 30`,
    [account.ig_user_id]
  )) as { ig_id: string }[];

  for (const r of rows) {
    try {
      const p = await getUserProfile(r.ig_id, account.access_token);
      await sql().query(
        `update contacts set
           username = coalesce($3, username),
           name = coalesce($4, name),
           profile_pic = coalesce($5, profile_pic)
         where account_id = $1 and ig_id = $2`,
        [account.ig_user_id, r.ig_id, p.username ?? null, p.name ?? null, p.profile_pic ?? null]
      );
    } catch {
      // perfil indisponível (conta privada/apagada ou só comentou): pula
    }
  }
  revalidatePath("/contatos");
}
