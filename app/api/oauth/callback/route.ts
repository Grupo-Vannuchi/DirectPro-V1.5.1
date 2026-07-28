import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForShortToken,
  exchangeForLongLivedToken,
  getProfile,
  subscribeToWebhooks,
} from "@/lib/ig";
import { oauthState } from "@/lib/auth";
import { getConfig, upsertAccount } from "@/lib/db";
import { logEvent } from "@/lib/engine";
import { canonicalAppUrl } from "@/lib/app-url";
import { ACCOUNT_COOKIE } from "@/lib/account";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const appUrl = req.nextUrl.origin;
  const q = req.nextUrl.searchParams;
  const code = q.get("code");
  const state = q.get("state");

  const fail = (reason: string) =>
    NextResponse.redirect(`${appUrl}/setup?erro=${encodeURIComponent(reason)}`);

  if (q.get("error")) return fail(q.get("error_description") ?? "autorização negada");
  if (!code) return fail("código ausente");
  if (state !== oauthState()) return fail("state inválido");

  const config = await getConfig();
  if (!config.instagram_app_id || !config.instagram_app_secret) {
    return fail("App ID e chave secreta não cadastrados no /setup");
  }

  try {
    const short = await exchangeCodeForShortToken({
      appId: config.instagram_app_id,
      appSecret: config.instagram_app_secret,
      // precisa ser IDÊNTICO ao usado no /api/oauth/login
      redirectUri: `${canonicalAppUrl(config.app_url, appUrl)}/api/oauth/callback`,
      code,
    });
    const long = await exchangeForLongLivedToken(config.instagram_app_secret, short.access_token);
    const profile = await getProfile(long.access_token);

    const igUserId = String(profile.user_id ?? short.user_id);
    // Cada conta autorizada vira uma linha em accounts — conectar outra conta
    // não substitui a anterior.
    await upsertAccount({
      ig_user_id: igUserId,
      username: profile.username ?? null,
      name: profile.name ?? null,
      profile_picture_url: profile.profile_picture_url ?? null,
      access_token: long.access_token,
      token_expires_at: new Date(Date.now() + long.expires_in * 1000),
    });

    // Liga os webhooks de comments/messages para esta conta.
    // NÃO é fatal: a conta já está salva e o login deu certo. Se a assinatura
    // falhar aqui, mandar o usuário para uma tela de erro faz parecer que a
    // conexão não funcionou — quando na verdade só falta reassinar (botão no
    // /setup). Então registramos o aviso e seguimos.
    let avisoAssinatura: string | null = null;
    try {
      await subscribeToWebhooks(igUserId, long.access_token);
    } catch (err) {
      avisoAssinatura = err instanceof Error ? err.message.slice(0, 160) : "erro";
      try {
        await logEvent(igUserId, "subscribe_failed", { message: avisoAssinatura });
      } catch {
        // banco fora do ar: o aviso na URL ainda chega ao usuário
      }
    }

    // já deixa o painel abrir na conta recém-conectada
    const destino = avisoAssinatura
      ? `${appUrl}/setup?erro=${encodeURIComponent(
          `Conta conectada, mas a assinatura dos webhooks falhou (${avisoAssinatura}). Clique em "Reassinar webhooks" no passo 5.`
        )}`
      : `${appUrl}/?conectado=1`;
    const res = NextResponse.redirect(destino);
    res.cookies.set(ACCOUNT_COOKIE, igUserId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (err) {
    return fail(err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido");
  }
}
