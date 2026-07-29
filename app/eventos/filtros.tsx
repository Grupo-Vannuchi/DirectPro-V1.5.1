"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  SEARCH_MAX_LENGTH,
  PERIODS,
  NO_FILTERS,
  EVENT_TYPES,
  hasFilters,
  toQueryString,
  type EventFilters,
  type EventTypeKey,
} from "@/lib/event-filters";
import { eventBadge } from "../labels";
import { subtle } from "../ui";

export type OpcaoPost = { id: string; total: number; thumb: string | null; caption: string | null };

// Os filtros chegam prontos do servidor, que já validou tudo. A barra não lê a
// URL — só escreve nela. Isso mantém uma única fonte da verdade e dispensa o
// Suspense que useSearchParams exigiria.

const controle =
  "inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:border-zinc-600";

const ativo = "border-indigo-500 text-zinc-900 dark:border-indigo-500 dark:text-zinc-100";

export default function Filtros({ filtros, posts }: { filtros: EventFilters; posts: OpcaoPost[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendente, iniciar] = useTransition();
  const [abrirPosts, setAbrirPosts] = useState(false);
  const [busca, setBusca] = useState(filtros.q ?? "");

  function navigate(mudanca: Partial<EventFilters>) {
    const qs = toQueryString({ ...filtros, ...mudanca });
    setAbrirPosts(false);
    iniciar(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  // O post filtrado pode estar fora da lista oferecida (é a dos mais recentes).
  // Nesse caso o botão continua marcado — só não tem capa para mostrar.
  const escolhido = filtros.post ? posts.find((p) => p.id === filtros.post) : undefined;
  const rotuloPost = filtros.post
    ? escolhido?.caption?.replace(/\s+/g, " ").trim() || "Post selecionado"
    : "Todos os posts";

  return (
    <div
      className={`mt-4 flex flex-wrap items-center gap-2 p-2.5 ${subtle} ${pendente ? "opacity-60" : ""}`}
      aria-busy={pendente}
    >
      {/* período */}
      <div className="inline-flex gap-0.5 rounded-xl border border-zinc-300 p-0.5 dark:border-zinc-700">
        {PERIODS.map((p) => {
          const marcado = filtros.period === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => navigate({ period: p.key })}
              aria-pressed={marcado}
              className={`rounded-[9px] px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 ${
                marcado
                  ? "bg-indigo-500 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* post */}
      {posts.length > 0 && (
        <div className="inline-flex items-center">
          <button
            type="button"
            onClick={() => setAbrirPosts((v) => !v)}
            aria-expanded={abrirPosts}
            className={`${controle} ${filtros.post ? ativo : ""}`}
          >
            {escolhido?.thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={escolhido.thumb} alt="" className="h-4 w-4 flex-none rounded object-cover" />
            )}
            <span className="max-w-[10rem] truncate">{rotuloPost}</span>
            <span aria-hidden="true" className="text-[10px] text-zinc-500">
              {abrirPosts ? "▴" : "▾"}
            </span>
          </button>
          {filtros.post && (
            <button
              type="button"
              onClick={() => navigate({ post: null })}
              aria-label="Remover filtro de post"
              className="ml-1 rounded-lg px-1.5 py-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* tipo */}
      <select
        value={filtros.type ?? ""}
        onChange={(e) => navigate({ type: (e.target.value || null) as EventTypeKey | null })}
        aria-label="Tipo de interação"
        className={`${controle} ${filtros.type ? ativo : ""}`}
      >
        <option value="">Todos os tipos</option>
        {EVENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {eventBadge(t).label}
          </option>
        ))}
      </select>

      {/* busca */}
      <form
        className="flex min-w-[11rem] flex-1 items-center"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ q: busca.trim() || null });
        }}
      >
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder="Buscar palavra ou @perfil…"
          aria-label="Buscar por palavra ou perfil"
          className={`w-full ${controle} ${filtros.q ? ativo : ""} placeholder:text-zinc-400 dark:placeholder:text-zinc-600`}
        />
      </form>

      {hasFilters(filtros) && (
        <button
          type="button"
          onClick={() => {
            setBusca("");
            navigate(NO_FILTERS);
          }}
          className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Limpar filtros
        </button>
      )}

      {/* grade de posts */}
      {abrirPosts && (
        <div className="w-full rounded-xl border border-zinc-300 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-950/60">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-500">
            Posts com interação
          </p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
            {posts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate({ post: p.id })}
                title={p.caption ?? p.id}
                className="flex flex-col gap-1 focus-visible:outline-none"
              >
                <span
                  className={`block aspect-square overflow-hidden rounded-lg border ${
                    filtros.post === p.id
                      ? "border-indigo-500 ring-2 ring-indigo-500/30"
                      : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                      ?
                    </span>
                  )}
                </span>
                <span className="text-center text-[9px] tabular-nums text-zinc-500">{p.total}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
