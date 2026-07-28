"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountSwitcher, { SwitcherAccount } from "./account-switcher";
import {
  IconHome,
  IconZap,
  IconUsers,
  IconActivity,
  IconSettings,
  IconStore,
  IconSun,
  IconMoon,
  IconMenu,
  IconX,
} from "./icons";

// Agrupado: "Gerenciar" é o trabalho do dia a dia, "Sistema" é o que se mexe
// uma vez. Sem os grupos, cinco itens soltos têm todos o mesmo peso.
const NAV_GROUPS: {
  label: string | null;
  items: { href: string; label: string; icon: (p: { className?: string }) => React.ReactNode }[];
}[] = [
  {
    label: null,
    items: [{ href: "/", label: "Painel", icon: IconHome }],
  },
  {
    label: "Gerenciar",
    items: [
      { href: "/automacoes", label: "Automações", icon: IconZap },
      { href: "/contatos", label: "Contatos", icon: IconUsers },
      { href: "/eventos", label: "Atividade", icon: IconActivity },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/loja", label: "Loja", icon: IconStore },
      { href: "/setup", label: "Configuração", icon: IconSettings },
    ],
  },
];

// Páginas sem painel (login e páginas públicas exigidas pela Meta)
const PUBLIC_PATHS = ["/entrar", "/privacidade", "/exclusao-de-dados"];

function ThemeToggle() {
  // O estado mora só na classe do <html> (posta pelo script no layout antes
  // da hidratação); o botão alterna via CSS — nada de estado React, nada de
  // divergência servidor/cliente.
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-100"
    >
      <IconSun className="hidden h-[17px] w-[17px] text-zinc-400 dark:block dark:text-zinc-500" />
      <IconMoon className="h-[17px] w-[17px] text-zinc-400 dark:hidden" />
      <span className="hidden dark:inline">Tema claro</span>
      <span className="dark:hidden">Tema escuro</span>
    </button>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.label ?? gi} className="flex flex-col gap-0.5">
          {group.label && (
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-600">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800/70 dark:text-white"
                    : "text-zinc-500 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-100"
                }`}
              >
                {/* marcador do item ativo: barra fina à esquerda */}
                <span
                  aria-hidden
                  className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-indigo-500 transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <Icon
                  className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                    active ? "text-indigo-500" : "text-zinc-400 group-hover:text-zinc-500 dark:text-zinc-500"
                  }`}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center px-3 text-[17px] font-semibold tracking-[-0.02em] text-zinc-900 transition-opacity hover:opacity-70 dark:text-zinc-50"
    >
      DirectPro<span className="text-indigo-500">.</span>
    </Link>
  );
}

function SidebarBody({
  accounts,
  selectedId,
  onNavigate,
}: {
  accounts: SwitcherAccount[];
  selectedId: string | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-6 py-5">
      <Brand />
      <div className="flex-1 px-2">
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="space-y-1 px-2">
        <div className="mb-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800/70">
          <AccountSwitcher accounts={accounts} selectedId={selectedId} />
        </div>
        <ThemeToggle />
        {/* Crédito: prioridade visual baixa de propósito — texto pequeno, cor
            apagada e só ganha contraste no hover. */}
        <a
          href="https://n8xmarketing.com.br"
          target="_blank"
          rel="noreferrer noopener"
          className="block px-3 pt-2 text-[10px] leading-relaxed text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
        >
          Criado por N8X Marketing
        </a>
      </div>
    </div>
  );
}

export default function AppShell({
  accounts,
  selectedId,
  children,
}: {
  accounts: SwitcherAccount[];
  selectedId: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isPublic) {
    return <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>;
  }

  return (
    <div>
      {/* Sidebar fixa (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-zinc-200/80 bg-zinc-50/50 lg:block dark:border-zinc-800/80 dark:bg-zinc-950">
        <SidebarBody accounts={accounts} selectedId={selectedId} />
      </aside>

      {/* Barra superior + gaveta (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-black/90">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <IconMenu className="h-5 w-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl dark:bg-black">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-4 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <IconX className="h-5 w-5" />
            </button>
            <SidebarBody
              accounts={accounts}
              selectedId={selectedId}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="lg:pl-[248px]">
        <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
