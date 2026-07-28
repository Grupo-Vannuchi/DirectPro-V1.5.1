"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  isValidPassword,
  createSessionValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { isLockedOut, recordFailure, clearAttempts, LOCKOUT_MESSAGE } from "@/lib/login-throttle";

// Quem está tentando entrar. Atrás da Vercel, o IP real é o PRIMEIRO item de
// x-forwarded-for — os seguintes são os proxies do caminho, que o cliente pode
// forjar acrescentando itens à esquerda... por isso o primeiro é o que a borda
// escreveu, e é o único confiável aqui.
async function clientIp(): Promise<string> {
  const h = await headers();
  const encaminhado = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return encaminhado || h.get("x-real-ip") || "desconhecido";
}

export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const ip = await clientIp();

  if (await isLockedOut(ip)) {
    return { error: LOCKOUT_MESSAGE };
  }

  const password = String(formData.get("password") ?? "");
  if (!isValidPassword(password)) {
    await recordFailure(ip);
    return { error: "Senha incorreta." };
  }

  await clearAttempts(ip);

  const store = await cookies(); // Next 16: cookies() é assíncrono
  store.set(SESSION_COOKIE, createSessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  redirect("/");
}
