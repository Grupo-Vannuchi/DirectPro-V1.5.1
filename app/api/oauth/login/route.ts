import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/ig";
import { oauthState } from "@/lib/auth";
import { getConfig, updateConfig } from "@/lib/db";
import { canonicalAppUrl, isEphemeralUrl } from "@/lib/app-url";

export async function GET(req: NextRequest) {
  const config = await getConfig();
  if (!config.instagram_app_id) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/setup?erro=${encodeURIComponent("Cadastre o App ID no passo 2 antes de conectar.")}`
    );
  }
  // O redirect_uri precisa bater EXATAMENTE com o cadastrado na Meta. Usamos a
  // URL canônica (estável) em vez da origem do navegador: se o usuário abrir o
  // painel por uma URL de deployment da Vercel, a origem muda a cada deploy e o
  // OAuth passa a falhar com "Invalid redirect_uri".
  const appUrl = canonicalAppUrl(config.app_url, req.nextUrl.origin);
  if (appUrl !== config.app_url && !isEphemeralUrl(appUrl)) {
    await updateConfig({ app_url: appUrl });
  }
  const redirectUri = `${appUrl}/api/oauth/callback`;
  return NextResponse.redirect(authorizeUrl(config.instagram_app_id, redirectUri, oauthState()));
}
