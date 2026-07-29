"use client";
import { useState } from "react";
import { btnGhost } from "../ui";
import type { Media, Picked } from "./types";

// Seletor visual de posts/reels ou stories da conta conectada.
//
// Busca sob demanda, na primeira abertura: a maioria das automações não prende
// a um post específico, e carregar a grade de mídias em toda visita ao
// formulário gastaria chamada da Meta à toa.
export default function MediaPicker({
  kind,
  selected,
  onSelect,
}: {
  kind: "posts" | "stories";
  selected: Picked | null;
  onSelect: (m: Picked | null) => void;
}) {
  const [media, setMedia] = useState<Media[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isStories = kind === "stories";

  async function openPicker() {
    setOpen(true);
    if (media.length) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(isStories ? "/api/media?type=stories" : "/api/media");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "erro ao buscar mídias");
      setMedia(json.media ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
    } finally {
      setLoading(false);
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-3">
        {selected.thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selected.thumb}
            alt=""
            className="h-16 w-16 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
          />
        )}
        <p className="max-w-xs truncate text-xs text-zinc-600 dark:text-zinc-400">
          {selected.caption || selected.id}
        </p>
        <button type="button" onClick={() => onSelect(null)} className={btnGhost}>
          Remover
        </button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={openPicker} className={btnGhost}>
        {isStories ? "Escolher story…" : "Escolher post…"}
      </button>
      {open && (
        <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
          {loading && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {isStories ? "Carregando seus stories…" : "Carregando seus posts…"}
            </p>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!loading && !error && media.length === 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {isStories
                ? "Nenhum story ativo agora. Stories só aparecem enquanto estão no ar (24h)."
                : "Nenhum post encontrado."}
            </p>
          )}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {media.map((m) => {
              const thumb = m.thumbnail_url ?? m.media_url ?? "";
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    onSelect({ id: m.id, thumb, caption: (m.caption ?? "").slice(0, 120) })
                  }
                  className="overflow-hidden rounded-lg border border-zinc-200 transition-colors hover:border-indigo-500 dark:border-zinc-800"
                  title={m.caption ?? m.id}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="flex aspect-square items-center justify-center text-[10px] text-zinc-500">
                      {m.media_type}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
