import "server-only";

// API "Instagram com Login do Instagram" — não precisa de página do Facebook.
export const GRAPH = "https://graph.instagram.com";
// A configuração de webhook do APP (subscriptions) vive no Facebook Graph,
// não no graph.instagram.com — é uma operação de nível de app.
export const FB_GRAPH = "https://graph.facebook.com";
export const API_VERSION = "v25.0";

type Json = Record<string, unknown>;

export class IgError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Instagram API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

async function graphFetch(path: string, init?: RequestInit): Promise<Json> {
  const res = await fetch(`${GRAPH}/${API_VERSION}${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new IgError(res.status, text);
  return text ? (JSON.parse(text) as Json) : {};
}

// ---------- OAuth ----------

export function authorizeUrl(appId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "instagram_business_basic",
      "instagram_business_manage_messages",
      "instagram_business_manage_comments",
    ].join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${p.toString()}`;
}

export async function exchangeCodeForShortToken(opts: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ access_token: string; user_id: string }> {
  const body = new URLSearchParams({
    client_id: opts.appId,
    client_secret: opts.appSecret,
    grant_type: "authorization_code",
    redirect_uri: opts.redirectUri,
    code: opts.code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new IgError(res.status, text);
  const json = JSON.parse(text);
  return { access_token: json.access_token, user_id: String(json.user_id) };
}

export async function exchangeForLongLivedToken(
  appSecret: string,
  shortToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const p = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortToken,
  });
  const res = await fetch(`${GRAPH}/access_token?${p.toString()}`);
  const text = await res.text();
  if (!res.ok) throw new IgError(res.status, text);
  return JSON.parse(text);
}

export async function refreshLongLivedToken(
  token: string
): Promise<{ access_token: string; expires_in: number }> {
  const p = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const res = await fetch(`${GRAPH}/refresh_access_token?${p.toString()}`);
  const text = await res.text();
  if (!res.ok) throw new IgError(res.status, text);
  return JSON.parse(text);
}

// ---------- Perfil / mídia ----------

// A resposta da Meta é JSON solto: nada garante que os campos vieram, nem que
// vieram como texto. Ler `json.username` direto e confiar é o que transforma
// mudança de contrato da Meta em `undefined` silencioso lá na frente, longe
// daqui. Estas duas funções são a fronteira onde isso para.
function texto(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

export type IgProfile = {
  user_id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
};

export async function getProfile(token: string): Promise<IgProfile> {
  const json = await graphFetch(
    `/me?fields=user_id,username,name,profile_picture_url&access_token=${encodeURIComponent(token)}`
  );
  const user_id = texto(json.user_id);
  const username = texto(json.username);
  // Sem id não dá para conectar a conta, e falhar aqui, com a resposta em mãos,
  // é muito mais fácil de diagnosticar do que um id vazio salvo no banco.
  if (!user_id || !username) {
    throw new IgError(502, `perfil sem user_id ou username: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return {
    user_id,
    username,
    name: texto(json.name),
    profile_picture_url: texto(json.profile_picture_url),
  };
}

export async function subscribeToWebhooks(igUserId: string, token: string): Promise<Json> {
  return graphFetch(
    `/${igUserId}/subscribed_apps?subscribed_fields=comments,messages&access_token=${encodeURIComponent(token)}`,
    { method: "POST" }
  );
}

// Configura o webhook do APP direto pela API (callback + verify token + campos),
// no lugar de o usuário colar isso no painel da Meta. Usa o app access token
// (app_id|app_secret) — não precisa de OAuth. A Meta faz o handshake GET no
// callback na hora desta chamada, então o /api/webhook já tem que estar no ar
// respondendo ao verify token (ele responde: config.webhook_verify_token).
export async function configureAppWebhook(opts: {
  appId: string;
  appSecret: string;
  callbackUrl: string;
  verifyToken: string;
  fields?: string;
}): Promise<Json> {
  const body = new URLSearchParams({
    object: "instagram",
    callback_url: opts.callbackUrl,
    verify_token: opts.verifyToken,
    fields: opts.fields ?? "comments,messages",
    access_token: `${opts.appId}|${opts.appSecret}`,
  });
  const res = await fetch(`${FB_GRAPH}/${API_VERSION}/${opts.appId}/subscriptions`, {
    method: "POST",
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new IgError(res.status, text);
  return text ? (JSON.parse(text) as Json) : {};
}

// Quais campos esta conta está assinando hoje. Serve de diagnóstico: se a
// assinatura falhou lá no OAuth, nada chega e não há aviso nenhum.
// null = não deu para consultar.
export async function getSubscribedFields(
  igUserId: string,
  token: string
): Promise<string[] | null> {
  try {
    const json = await graphFetch(
      `/${igUserId}/subscribed_apps?access_token=${encodeURIComponent(token)}`
    );
    const data = (json.data as { subscribed_fields?: string[] }[]) ?? [];
    return data.flatMap((d) => d.subscribed_fields ?? []);
  } catch {
    return null;
  }
}

export async function getMedia(igUserId: string, token: string, limit = 30): Promise<Json[]> {
  const json = await graphFetch(
    `/${igUserId}/media?fields=id,media_type,media_url,thumbnail_url,caption,permalink&limit=${limit}&access_token=${encodeURIComponent(token)}`
  );
  return (json.data as Json[]) ?? [];
}

// Um post específico, pelo id. Serve para o comentário que veio de um post
// antigo, fora da janela que getMedia() devolve.
export async function getMediaById(mediaId: string, token: string): Promise<Json> {
  return graphFetch(
    `/${mediaId}?fields=id,media_type,media_url,thumbnail_url,caption,permalink&access_token=${encodeURIComponent(token)}`
  );
}

// Stories ativos (últimas 24h) — vivem em outro edge, não em /media.
export async function getStories(igUserId: string, token: string): Promise<Json[]> {
  const json = await graphFetch(
    `/${igUserId}/stories?fields=id,media_type,media_url,thumbnail_url,caption,permalink&access_token=${encodeURIComponent(token)}`
  );
  return (json.data as Json[]) ?? [];
}

// Perfil de quem mandou DM (User Profile API). O webhook só entrega o IGSID;
// sem esta chamada o contato fica salvo apenas como número.
export async function getUserProfile(
  igsid: string,
  token: string
): Promise<{ username?: string; name?: string; profile_pic?: string }> {
  const json = await graphFetch(
    `/${igsid}?fields=username,name,profile_pic&access_token=${encodeURIComponent(token)}`
  );
  // Aqui nada é obrigatório: conta privada ou apagada devolve resposta magra, e
  // quem chama já trata isso guardando só o que veio.
  return {
    username: texto(json.username),
    name: texto(json.name),
    profile_pic: texto(json.profile_pic),
  };
}

// A Meta informa se a pessoa segue a conta conectada. Fica numa chamada
// SEPARADA de propósito: se este campo exigir permissão extra e falhar, os
// nomes e fotos dos contatos continuam funcionando normalmente.
// null = não deu para saber (nunca tratar como "não segue").
export async function checkFollowsAccount(
  igsid: string,
  token: string
): Promise<boolean | null> {
  try {
    const json = await graphFetch(
      `/${igsid}?fields=is_user_follow_business&access_token=${encodeURIComponent(token)}`
    );
    const v = (json as { is_user_follow_business?: boolean }).is_user_follow_business;
    return typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
}

// Reage a uma mensagem recebida (o coraçãozinho da DM).
export async function sendReaction(
  igUserId: string,
  token: string,
  recipientIgsid: string,
  messageId: string,
  emoji: string
): Promise<Json> {
  return graphFetch(`/${igUserId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientIgsid },
      sender_action: "react",
      payload: { message_id: messageId, reaction: emoji },
    }),
  });
}

// ---------- Envio de mensagens ----------

export type Recipient = { comment_id: string } | { id: string };

export type OutgoingMessage =
  | { text: string; quick_replies?: { content_type: "text"; title: string; payload: string }[] }
  | {
      attachment: {
        type: "template";
        payload: {
          template_type: "button";
          text: string;
          buttons: { type: "web_url"; url: string; title: string }[];
        };
      };
    };

export async function sendMessage(
  igUserId: string,
  token: string,
  recipient: Recipient,
  message: OutgoingMessage
): Promise<Json> {
  return graphFetch(`/${igUserId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ recipient, message }),
  });
}

export async function replyToComment(
  commentId: string,
  token: string,
  text: string
): Promise<Json> {
  const body = new URLSearchParams({ message: text });
  return graphFetch(`/${commentId}/replies?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    body,
  });
}

// Texto com botão de link (template de botão) ou só texto, se não houver URL.
export function linkMessage(text: string, buttonLabel: string, url: string): OutgoingMessage {
  if (!url) return { text };
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text,
        buttons: [{ type: "web_url", url, title: buttonLabel || "Abrir link" }],
      },
    },
  };
}
