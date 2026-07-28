import "server-only";

// ============================================================
// URL pública canônica do install.
//
// Por que isto existe: o app descobria a própria URL pela origem da requisição
// (o endereço que o usuário estava usando no navegador). Se o usuário abre o
// painel por uma URL de DEPLOYMENT da Vercel — do tipo
//   meu-app-n3lfnvdtd-time.vercel.app
// — é essa URL que acaba indo para o webhook e para o redirect do OAuth.
// Duas consequências ruins:
//   1. URLs de deployment costumam ficar atrás da proteção de deployment da
//      Vercel, então a validação da Meta recebe uma página 401 e falha com
//      "não foi possível validar a URL de callback".
//   2. Cada deploy gera uma URL nova, então o webhook cadastrado aponta para
//      um endereço antigo e os eventos param de chegar.
//
// A ordem abaixo prefere sempre um endereço estável.
// ============================================================

function normalize(u: string): string {
  const withProto = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  return withProto.replace(/\/+$/, "");
}

// URL estável vinda do ambiente:
// APP_URL (definida à mão) > domínio de produção do projeto na Vercel.
export function envAppUrl(): string | null {
  const manual = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (manual) return normalize(manual);
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return normalize(prod);
  return null;
}

// Detecta URLs efêmeras da Vercel (deployment específico ou preview de branch).
// Exemplos: app-n3lfnvdtd-time.vercel.app, app-git-minha-branch-time.vercel.app
export function isEphemeralUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(normalize(url)).hostname;
  } catch {
    return false;
  }
  if (!host.endsWith(".vercel.app")) return false;
  if (host.includes("-git-")) return true;
  // Hash de deployment: bloco longo entre hífens misturando letras E dígitos
  // (ex.: "n3lfnvdtd"). Exigir a mistura evita confundir com uma palavra comum
  // do próprio nome do projeto (ex.: "producao").
  return host
    .replace(/\.vercel\.app$/, "") // sem o domínio, senão "app" entra na conta
    .split("-")
    .some((parte) => parte.length >= 8 && /[a-z]/.test(parte) && /\d/.test(parte));
}

// A melhor URL conhecida, em ordem de confiabilidade.
export function canonicalAppUrl(
  storedAppUrl: string | null | undefined,
  requestOrigin?: string | null
): string {
  const fromEnv = envAppUrl();
  if (fromEnv) return fromEnv;
  // um app_url salvo só serve se não for efêmero
  if (storedAppUrl && !isEphemeralUrl(storedAppUrl)) return normalize(storedAppUrl);
  if (requestOrigin && !isEphemeralUrl(requestOrigin)) return normalize(requestOrigin);
  // sobrou só o efêmero: devolve mesmo assim (o painel avisa o usuário)
  return normalize(storedAppUrl || requestOrigin || "");
}
