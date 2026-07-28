"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateConfig, listAccounts, getConfig } from "@/lib/db";
import { subscribeToWebhooks, configureAppWebhook } from "@/lib/ig";
import { canonicalAppUrl, isEphemeralUrl } from "@/lib/app-url";

// Reassina comments/messages em todas as contas conectadas. A assinatura já
// acontece sozinha no OAuth, mas se falhar naquele momento nada chega e o
// painel fica mudo — este botão conserta sem precisar reconectar tudo.
export async function reassinarWebhooks(): Promise<void> {
  const accounts = await listAccounts();
  let ok = 0;
  const falhas: string[] = [];
  for (const a of accounts) {
    try {
      await subscribeToWebhooks(a.ig_user_id, a.access_token);
      ok++;
    } catch (err) {
      falhas.push(
        `@${a.username ?? a.ig_user_id}: ${err instanceof Error ? err.message.slice(0, 80) : "erro"}`
      );
    }
  }
  revalidatePath("/setup");
  if (falhas.length) {
    redirect(`/setup?erro=${encodeURIComponent(falhas.join(" | "))}`);
  }
  redirect(`/setup?salvo=${encodeURIComponent(`Webhooks reassinados em ${ok} conta(s).`)}`);
}

// ============================================================
// Autoteste do webhook: faz exatamente o que a Meta faz (GET com hub.mode,
// hub.verify_token e hub.challenge) contra a própria URL pública e reporta o
// resultado REAL. É isto que transforma o erro genérico da Meta
// ("não foi possível validar a URL de callback ou o token de verificação")
// num diagnóstico específico e acionável.
// ============================================================
export async function testarWebhook(): Promise<void> {
  const config = await getConfig();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const appUrl = canonicalAppUrl(config.app_url, host ? `${proto}://${host}` : null);

  if (!appUrl) {
    redirect(`/setup?erro=${encodeURIComponent("Não consegui detectar a URL pública do app.")}`);
  }

  const token = config.webhook_verify_token ?? process.env.WEBHOOK_VERIFY_TOKEN ?? "";
  if (!token) {
    redirect(
      `/setup?erro=${encodeURIComponent("Este install ainda não tem token de verificação.")}`
    );
  }

  const desafio = `teste${Date.now()}`;
  const url =
    `${appUrl}/api/webhook?hub.mode=subscribe` +
    `&hub.verify_token=${encodeURIComponent(token)}` +
    `&hub.challenge=${desafio}`;

  let status = 0;
  let corpo = "";
  try {
    const res = await fetch(url, { redirect: "manual", cache: "no-store" });
    status = res.status;
    corpo = (await res.text()).slice(0, 400);
  } catch (err) {
    redirect(
      `/setup?erro=${encodeURIComponent(
        `Não consegui acessar ${appUrl}/api/webhook (${
          err instanceof Error ? err.message.slice(0, 120) : "erro de rede"
        }). A Meta também não vai conseguir.`
      )}`
    );
  }

  if (status === 200 && corpo.trim() === desafio) {
    revalidatePath("/setup");
    redirect(
      `/setup?salvo=${encodeURIComponent(
        `Webhook validado ✓ — ${appUrl}/api/webhook respondeu corretamente. Pode salvar na Meta com este token.`
      )}`
    );
  }

  // Traduz o que deu errado em algo que o usuário consegue resolver.
  const pareceLoginDaVercel =
    /vercel|authentication|sso|login/i.test(corpo) && (status === 401 || status === 403);
  let diagnostico: string;
  if (pareceLoginDaVercel || (status === 401 && isEphemeralUrl(appUrl))) {
    diagnostico =
      "a Vercel está exigindo login para acessar esta URL (Deployment Protection). " +
      "Desligue em Vercel → Settings → Deployment Protection, ou use o domínio de produção.";
  } else if (isEphemeralUrl(appUrl)) {
    diagnostico =
      "esta é uma URL de deployment temporária da Vercel, que muda a cada deploy e costuma " +
      "exigir login. Use o domínio de produção do projeto (ou defina a variável APP_URL).";
  } else if (status === 503) {
    diagnostico = "o banco de dados não está acessível. Conecte o Neon ao projeto e refaça o deploy.";
  } else if (status === 404) {
    diagnostico = "a rota /api/webhook não existe nesta URL — confira se o deploy é deste app.";
  } else if (status === 403) {
    diagnostico = `o app recusou a verificação: ${corpo.slice(0, 200)}`;
  } else {
    diagnostico = `resposta inesperada (HTTP ${status}): ${corpo.slice(0, 200)}`;
  }

  redirect(`/setup?erro=${encodeURIComponent(`Teste do webhook falhou — ${diagnostico}`)}`);
}

// Configura o webhook do app na Meta automaticamente (callback + verify token +
// campos comments/messages), no lugar de o usuário colar isso à mão no painel.
// Usa o App ID + Chave secreta PRINCIPAIS (Configurações → Básico) — que são
// diferentes das credenciais do login do Instagram. Se vierem no formulário,
// são salvas; senão, usa as já salvas (com fallback nas do login).
export async function configurarWebhookAuto(formData: FormData): Promise<void> {
  const config = await getConfig();

  const metaAppId = String(formData.get("meta_app_id") ?? "").trim();
  const metaAppSecret = String(formData.get("meta_app_secret") ?? "").trim();
  if (metaAppId || metaAppSecret) {
    await updateConfig({
      ...(metaAppId ? { meta_app_id: metaAppId } : {}),
      ...(metaAppSecret ? { meta_app_secret: metaAppSecret } : {}),
    });
  }

  const appId = metaAppId || config.meta_app_id || config.instagram_app_id;
  const appSecret = metaAppSecret || config.meta_app_secret || config.instagram_app_secret;
  if (!appId || !appSecret) {
    redirect(
      `/setup?erro=${encodeURIComponent(
        "Informe o App ID e a Chave secreta do app (Configurações → Básico) para a configuração automática."
      )}`
    );
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const appUrl = config.app_url ?? (host ? `${proto}://${host}` : null);
  if (!appUrl) {
    redirect(`/setup?erro=${encodeURIComponent("Não consegui detectar a URL pública do app.")}`);
  }

  try {
    await configureAppWebhook({
      appId,
      appSecret,
      callbackUrl: `${appUrl}/api/webhook`,
      verifyToken: config.webhook_verify_token ?? "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 160) : "erro";
    redirect(
      `/setup?erro=${encodeURIComponent(
        `Não deu para configurar o webhook automaticamente (${msg}). Você ainda pode configurar manualmente no passo 3b.`
      )}`
    );
  }
  revalidatePath("/setup");
  redirect(
    `/setup?salvo=${encodeURIComponent(
      "Webhook configurado automaticamente ✓ (callback + campos comments e messages)."
    )}`
  );
}

export async function saveMetaCredentials(formData: FormData): Promise<void> {
  const appId = String(formData.get("instagram_app_id") ?? "").trim();
  const appSecret = String(formData.get("instagram_app_secret") ?? "").trim();
  if (!appId || !appSecret) {
    redirect(`/setup?erro=${encodeURIComponent("Preencha o App ID e a chave secreta.")}`);
  }

  // Captura a URL pública do app. Só grava se for um endereço ESTÁVEL: gravar
  // uma URL de deployment da Vercel quebra o webhook e o OAuth no deploy
  // seguinte, porque esse endereço muda toda vez.
  const h = await headers(); // Next 16: headers() é assíncrono
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origem = host ? `${proto}://${host}` : null;
  const appUrl = canonicalAppUrl(null, origem);

  await updateConfig({
    instagram_app_id: appId,
    instagram_app_secret: appSecret,
    ...(appUrl && !isEphemeralUrl(appUrl) ? { app_url: appUrl } : {}),
  });
  revalidatePath("/setup");
  redirect("/setup?salvo=1");
}
