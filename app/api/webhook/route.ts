import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { handleCommentEvent, handleMessagingEvent, drainQueue, logEvent } from "@/lib/engine";
import { getConfig } from "@/lib/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ============================================================
// GET — handshake de verificação da Meta
//
// Este endpoint precisa responder o hub.challenge mesmo em condições ruins:
// se ele devolver 500 (por exemplo, banco ainda não provisionado), a Meta
// mostra apenas "não foi possível validar a URL de callback ou o token de
// verificação", sem dizer o motivo. Por isso aqui: nada de exceção vazando,
// fallback do token por variável de ambiente e motivo explícito no corpo da
// resposta quando recusamos.
// ============================================================
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  // Chamada que não é handshake (teste no navegador, monitor de uptime):
  // responde 200 para deixar claro que a rota está no ar e acessível.
  if (q.get("hub.mode") !== "subscribe") {
    return new NextResponse("webhook no ar", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const received = q.get("hub.verify_token") ?? "";
  const challenge = q.get("hub.challenge") ?? "";

  let esperado: string | null = null;
  let erroBanco: string | null = null;
  try {
    esperado = (await getConfig()).webhook_verify_token;
  } catch (err) {
    erroBanco = err instanceof Error ? err.message.slice(0, 200) : "erro no banco";
  }
  // Fallback: permite validar mesmo se o banco estiver indisponível no momento
  // exato do handshake (a Meta valida na hora em que o usuário clica em salvar).
  const doAmbiente = process.env.WEBHOOK_VERIFY_TOKEN || null;

  const bate =
    Boolean(received) &&
    Boolean(
      (esperado && safeEqual(received, esperado)) ||
        (doAmbiente && safeEqual(received, doAmbiente))
    );

  if (bate) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Recusado: explica o motivo. Isso aparece no diagnóstico do /setup e
  // transforma o erro genérico da Meta em algo acionável.
  const motivo = erroBanco
    ? `banco indisponível (${erroBanco}) e WEBHOOK_VERIFY_TOKEN não definido`
    : !esperado
      ? "nenhum token de verificação configurado neste install"
      : !received
        ? "a requisição não trouxe hub.verify_token"
        : "o token enviado não confere com o deste install";

  // best-effort: deixa rastro para o usuário ver em /eventos
  try {
    await logEvent(null, "webhook_verify_failed", { motivo });
  } catch {
    // banco fora do ar: o motivo ainda vai no corpo da resposta
  }

  return new NextResponse(`verificação recusada: ${motivo}`, {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function assinaturaConfere(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = header.slice(7);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ============================================================
// POST — evento da Meta
//
// A assinatura é conferida contra TODAS as chaves conhecidas do install. Um
// app de Instagram tem duas chaves fáceis de confundir (a do "Login do
// Instagram" e a do app em Configurações → Básico), e a Meta assina com a do
// app. Conferindo só contra uma, o install que salvou a outra rejeitaria 100%
// dos eventos com 401 — silenciosamente, que é exatamente o sintoma de
// "conecta e cria automação, mas nada acontece".
// ============================================================
export async function POST(req: NextRequest) {
  // corpo CRU antes de qualquer parse — a assinatura é do corpo exato
  const rawBody = await req.text();
  const assinatura = req.headers.get("x-hub-signature-256");

  let config;
  try {
    config = await getConfig();
  } catch {
    // 503 (e não 500): indisponibilidade temporária, a Meta reenvia o evento
    return new NextResponse("banco indisponível", { status: 503 });
  }

  const chaves = [
    config.instagram_app_secret,
    config.meta_app_secret,
    process.env.META_APP_SECRET ?? null,
  ].filter((s): s is string => Boolean(s));

  if (!chaves.length) {
    await logEvent(null, "signature_skipped", {
      motivo: "nenhuma chave secreta configurada — salve as credenciais no /setup",
    });
    return new NextResponse("sem chave secreta configurada", { status: 401 });
  }

  if (!chaves.some((s) => assinaturaConfere(rawBody, assinatura, s))) {
    // NUNCA silencioso: sem este registro, o usuário vê "não chega nada" e não
    // tem como descobrir que o problema é a chave secreta errada.
    await logEvent(null, "signature_mismatch", {
      motivo:
        "a assinatura não confere com nenhuma chave salva — confira a Chave Secreta do app no /setup",
      tem_header: Boolean(assinatura),
      chaves_testadas: chaves.length,
    });
    return new NextResponse("invalid signature", { status: 401 });
  }

  let body: {
    object?: string;
    entry?: {
      id?: string;
      changes?: { field?: string; value?: Record<string, unknown> }[];
      messaging?: Record<string, unknown>[];
    }[];
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  try {
    for (const entry of body.entry ?? []) {
      // entry.id diz QUAL conta conectada recebeu o evento (multi-conta)
      for (const change of entry.changes ?? []) {
        if (change.field === "comments" && change.value) {
          await handleCommentEvent(entry.id, change.value as never);
        }
      }
      for (const messaging of entry.messaging ?? []) {
        await handleMessagingEvent(entry.id, messaging as never);
      }
    }
  } catch (err) {
    // registra e responde 200 mesmo assim — a Meta reenvia com atraso se der erro
    try {
      await logEvent(null, "error", { message: String(err), body });
    } catch {
      // banco fora do ar: nada mais a fazer
    }
  }

  // dispara a drenagem já, sem segurar a resposta (QStash e cron são o backup)
  after(async () => {
    try {
      await drainQueue();
    } catch {
      // a trava atômica garante que o próximo dreno recupera
    }
  });

  return new NextResponse("ok", { status: 200 });
}
