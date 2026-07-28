import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/engine";
import { refreshLongLivedToken, getUserProfile } from "@/lib/ig";
import { listAccounts, updateAccountToken, sql } from "@/lib/db";

export const maxDuration = 60;

// Cron diário da Vercel (o plano grátis permite 1x/dia). Para CADA conta
// conectada:
// 1) renova o token longo do Instagram quando ele tem mais de 7 dias
// 2) atualiza nome/foto dos contatos recentes (as URLs de foto expiram)
// e no fim drena a fila como rede de segurança.
export async function GET(req: NextRequest) {
  // se CRON_SECRET existir, a Vercel manda "Authorization: Bearer <segredo>"
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  let refreshed = 0;
  let profiles = 0;
  const accounts = await listAccounts();

  for (const account of accounts) {
    let token = account.access_token;

    if (account.token_expires_at) {
      const expires = new Date(account.token_expires_at).getTime();
      const ageDays = 60 - (expires - Date.now()) / 86_400_000; // token longo dura 60 dias
      if (ageDays >= 7) {
        try {
          const r = await refreshLongLivedToken(token);
          await updateAccountToken(
            account.ig_user_id,
            r.access_token,
            new Date(Date.now() + r.expires_in * 1000)
          );
          token = r.access_token;
          refreshed++;
        } catch {
          // token com menos de 24h ou erro transitório: tenta de novo amanhã
        }
      }
    }

    const contacts = (await sql().query(
      `select ig_id from contacts
       where account_id = $1
       order by coalesce(last_reply_at, first_contact_at) desc
       limit 20`,
      [account.ig_user_id]
    )) as { ig_id: string }[];

    for (const c of contacts) {
      try {
        const p = await getUserProfile(c.ig_id, token);
        await sql().query(
          `update contacts set
             username = coalesce($3, username),
             name = coalesce($4, name),
             profile_pic = coalesce($5, profile_pic)
           where account_id = $1 and ig_id = $2`,
          [account.ig_user_id, c.ig_id, p.username ?? null, p.name ?? null, p.profile_pic ?? null]
        );
        profiles++;
      } catch {
        // conta privada/apagada ou só comentou: mantém o que já temos
      }
    }
  }

  const drained = await drainQueue();
  return NextResponse.json({ accounts: accounts.length, refreshed, profiles, ...drained });
}
