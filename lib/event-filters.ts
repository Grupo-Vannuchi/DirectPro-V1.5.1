// O QUE é o filtro: forma, valores aceitos e leitura da URL. Sem "server-only"
// de propósito — a barra de filtros é componente de cliente e precisa das
// mesmas listas, senão navegador e servidor discordariam do que é válido.
// A tradução para SQL fica em lib/event-query.ts, que não sai do servidor.

export const LIMITE_EVENTOS = 50;
export const BUSCA_MAX = 80;

export const PERIODOS = [
  { key: "24h", label: "24h", dias: 1 },
  { key: "7d", label: "7 dias", dias: 7 },
  { key: "30d", label: "30 dias", dias: 30 },
  { key: "tudo", label: "tudo", dias: null },
] as const;

export type PeriodoKey = (typeof PERIODOS)[number]["key"];

// Quais `type` de evento podem ser consultados. Os rótulos não moram aqui:
// vêm de eventBadge(), para não existirem dois lugares dizendo a mesma coisa.
export const TIPOS = ["comment", "message", "story_reply", "quick_reply", "error"] as const;
export type TipoKey = (typeof TIPOS)[number];

export type EventFilters = {
  post: string | null;
  tipo: TipoKey | null;
  periodo: PeriodoKey;
  q: string | null;
};

export const SEM_FILTRO: EventFilters = { post: null, tipo: null, periodo: "tudo", q: null };

export function temFiltro(f: EventFilters): boolean {
  return Boolean(f.post || f.tipo || f.q) || f.periodo !== "tudo";
}

type Raw = Record<string, string | string[] | undefined>;

function primeiro(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

// Lista branca em tudo: o que não for reconhecido vira "sem filtro" e nunca
// chega ao banco.
export function parseFilters(raw: Raw): EventFilters {
  const post = primeiro(raw.post);
  const tipo = primeiro(raw.tipo);
  const periodo = primeiro(raw.periodo);
  const q = primeiro(raw.q);
  return {
    // id de mídia do Instagram é numérico; qualquer outra coisa é descartada
    post: post && /^\d{1,32}$/.test(post) ? post : null,
    tipo: TIPOS.includes(tipo as TipoKey) ? (tipo as TipoKey) : null,
    periodo: PERIODOS.some((p) => p.key === periodo) ? (periodo as PeriodoKey) : "tudo",
    q: q ? q.slice(0, BUSCA_MAX) : null,
  };
}

// Filtro → query string, na mesma ordem sempre. Omite o que está no padrão,
// para a URL de "sem filtro" ser simplesmente /eventos.
export function toQueryString(f: EventFilters): string {
  const p = new URLSearchParams();
  if (f.periodo !== "tudo") p.set("periodo", f.periodo);
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.post) p.set("post", f.post);
  if (f.q) p.set("q", f.q);
  return p.toString();
}
