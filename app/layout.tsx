import type { Metadata } from "next";
import { Sora } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import "./globals.css";
import AppShell from "./app-shell";
import { SwitcherAccount } from "./account-switcher";
import { listAccounts } from "@/lib/db";
import { ACCOUNT_COOKIE } from "@/lib/account";

const sora = Sora({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DirectPro — comentário vira DM",
  description: "Automação do seu Instagram: palavra-chave no comentário vira DM com seu link.",
};

// Aplica o tema salvo antes da primeira pintura (evita flash de cor errada)
const themeScript = `try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Contas conectadas alimentam o seletor da sidebar. Sem banco/config ainda
  // (primeiro acesso, páginas públicas), a sidebar aparece sem conta.
  let accounts: SwitcherAccount[] = [];
  let selectedId: string | null = null;
  try {
    accounts = (await listAccounts()).map((a) => ({
      ig_user_id: a.ig_user_id,
      username: a.username,
      profile_picture_url: a.profile_picture_url,
    }));
    const cookieId = (await cookies()).get(ACCOUNT_COOKIE)?.value;
    selectedId =
      accounts.find((a) => a.ig_user_id === cookieId)?.ig_user_id ??
      accounts[0]?.ig_user_id ??
      null;
  } catch {
    // banco indisponível: segue sem contas
  }

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${sora.className} min-h-screen bg-zinc-100 text-zinc-900 antialiased dark:bg-black dark:text-zinc-100`}
      >
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <AppShell accounts={accounts} selectedId={selectedId}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
