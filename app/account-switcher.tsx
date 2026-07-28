"use client";
import { useState, useOptimistic, useTransition } from "react";
import Link from "next/link";
import Avatar from "./avatar";
import { selectAccount } from "./account-actions";
import { IconSettings } from "./icons";

export type SwitcherAccount = {
  ig_user_id: string;
  username: string | null;
  profile_picture_url: string | null;
};

// Seletor de conta na base da sidebar. Sem conta conectada, vira um atalho
// direto para a configuração.
export default function AccountSwitcher({
  accounts,
  selectedId,
}: {
  accounts: SwitcherAccount[];
  selectedId: string | null;
}) {
  const [open, setOpen] = useState(false);
  // A troca envolve uma ida ao servidor (cookie + recarregar os dados da nova
  // conta). Sem estado otimista, o seletor continua mostrando a conta antiga
  // durante todo esse tempo e a interface parece travada. Aqui o nome/foto
  // mudam na hora e o pendente vira feedback visual.
  const [pending, startTransition] = useTransition();
  const [optimisticId, setOptimisticId] = useOptimistic(selectedId);

  if (!accounts.length) {
    return (
      <Link
        href="/setup"
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
      >
        <IconSettings className="h-4 w-4" />
        Conectar Instagram
      </Link>
    );
  }

  const current = accounts.find((a) => a.ig_user_id === optimisticId) ?? accounts[0];

  // Fecha o menu e troca a conta imediatamente; o servidor confirma depois.
  const trocar = (id: string) => {
    if (id === optimisticId) {
      setOpen(false);
      return;
    }
    setOpen(false);
    startTransition(async () => {
      setOptimisticId(id);
      const fd = new FormData();
      fd.set("account_id", id);
      await selectAccount(fd);
    });
  };

  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <ul className="max-h-64 overflow-y-auto py-1">
            {accounts.map((a) => (
              <li key={a.ig_user_id}>
                {/* Botão comum + transição: o menu fecha e o seletor já mostra
                    a nova conta, sem esperar o servidor. */}
                <button
                  type="button"
                  onClick={() => trocar(a.ig_user_id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/60 ${
                    a.ig_user_id === current.ig_user_id
                      ? "font-semibold text-indigo-600 dark:text-indigo-400"
                      : "text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <Avatar
                    src={a.profile_picture_url}
                    name={a.username ?? "?"}
                    className="h-6 w-6"
                    textClassName="text-[10px]"
                  />
                  <span className="min-w-0 flex-1 truncate">@{a.username ?? a.ig_user_id}</span>
                  {a.ig_user_id === current.ig_user_id && (
                    <span className="text-indigo-500">✓</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-zinc-200 dark:border-zinc-800">
            <a
              href="/api/oauth/login"
              className="block px-3 py-2 text-sm text-indigo-600 transition-colors hover:bg-zinc-100 dark:text-indigo-400 dark:hover:bg-zinc-800/60"
            >
              + Conectar outra conta
            </a>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
      >
        <Avatar
          src={current.profile_picture_url}
          name={current.username ?? "?"}
          className="h-8 w-8"
          textClassName="text-xs"
        />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            @{current.username ?? current.ig_user_id}
          </p>
          <p className="text-[10px] text-zinc-500">
            {pending ? "trocando…" : accounts.length > 1 ? "trocar conta" : "conectado"}
          </p>
        </div>
        <span className="text-zinc-400">{open ? "▾" : "▸"}</span>
      </button>
    </div>
  );
}
