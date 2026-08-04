"use server";
import { getSelectedAccount } from "@/lib/account";
import { sql, ensureSchema } from "@/lib/db";

// Registra que esta conversa foi vista agora.
//
// É Server Action, chamada pelo CLIENTE, e isso não é preferência de estilo. A
// lista usa <Link>, e o prefetch do Next renderiza a página no servidor sem
// ninguém abrir nada — três conversas apareceram renderizadas no log de rede
// durante outro teste. Gravar isto na renderização marcaria como lida toda
// conversa que passasse perto do mouse, e o sintoma seria "às vezes as não
// lidas somem sozinhas": impossível de reproduzir sob demanda.
export async function marcarVisto(contactIgId: string): Promise<void> {
  if (!/^\d{1,32}$/.test(contactIgId)) return;
  await ensureSchema();
  const account = await getSelectedAccount();
  if (!account) return;
  await sql().query(
    `update contacts set last_seen_at = now() where account_id = $1 and ig_id = $2`,
    [account.ig_user_id, contactIgId]
  );
}
