import "server-only";
import { cookies } from "next/headers";
import { listAccounts, Account } from "./db";

// Conta atualmente selecionada no painel. O valor vive num cookie; se estiver
// ausente ou apontar para uma conta que não existe mais, cai na primeira.
export const ACCOUNT_COOKIE = "metodochat_account";

export async function getSelectedAccount(): Promise<Account | null> {
  const accounts = await listAccounts();
  if (!accounts.length) return null;
  const id = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  return accounts.find((a) => a.ig_user_id === id) ?? accounts[0];
}

export async function getSelectedAccountId(): Promise<string | null> {
  return (await getSelectedAccount())?.ig_user_id ?? null;
}
