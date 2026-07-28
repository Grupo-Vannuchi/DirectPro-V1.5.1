import { NextRequest, NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

// Next 16: middleware.ts virou proxy.ts (roda em Node).
// Protege o painel com a sessão de senha; rotas públicas passam direto.
const PUBLIC_PREFIXES = [
  "/api/webhook",
  "/api/oauth",
  "/api/cron",
  "/api/queue/tick",
  "/privacidade",
  "/exclusao-de-dados",
  "/entrar",
  "/_next",
  "/favicon.ico",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
