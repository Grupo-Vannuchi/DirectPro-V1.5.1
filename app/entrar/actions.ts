"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidPassword, sessionValue, SESSION_COOKIE } from "@/lib/auth";

export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  if (!isValidPassword(password)) {
    return { error: "Senha incorreta." };
  }
  const store = await cookies(); // Next 16: cookies() é assíncrono
  store.set(SESSION_COOKIE, sessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/");
}
