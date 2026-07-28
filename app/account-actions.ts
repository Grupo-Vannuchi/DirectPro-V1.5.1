"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACCOUNT_COOKIE } from "@/lib/account";

// Troca a conta ativa do painel (server action chamada pelo seletor).
export async function selectAccount(formData: FormData): Promise<void> {
  const id = String(formData.get("account_id") ?? "");
  if (!id) return;
  (await cookies()).set(ACCOUNT_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // revalida todo o layout: dashboard, automações e contatos mudam de conta
  revalidatePath("/", "layout");
}
