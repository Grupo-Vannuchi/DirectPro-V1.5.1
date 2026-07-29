"use client";
import { useActionState } from "react";
import { login } from "./actions";
import { card, input, muted } from "../ui";

export default function EntrarPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <div className="mx-auto mt-20 max-w-sm">
      <div className={`p-6 ${card}`}>
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-base font-bold text-white">
            M
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight">Entrar no painel</h1>
            <p className={`text-xs ${muted}`}>Use a senha do administrador.</p>
          </div>
        </div>
        <form action={action} className="space-y-3">
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder="Senha"
            className={input}
          />
          {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
          <button
            disabled={pending}
            className="w-full rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
