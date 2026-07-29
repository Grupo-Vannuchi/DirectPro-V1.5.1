// O QUE é o filtro: forma, valores aceitos e leitura da URL. Sem "server-only"
// de propósito — a barra de filtros é componente de cliente e precisa das
// mesmas listas, senão navegador e servidor discordariam do que é válido.
// A tradução para SQL fica em lib/event-query.ts, que não sai do servidor.

export const EVENTS_LIMIT = 50;
export const SEARCH_MAX_LENGTH = 80;

export const PERIODS = [
  { key: "24h", label: "24h", days: 1 },
  { key: "7d", label: "7 dias", days: 7 },
  { key: "30d", label: "30 dias", days: 30 },
  { key: "tudo", label: "tudo", days: null },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

// Quais `type` de evento podem ser consultados. Os rótulos não moram aqui:
// vêm de eventBadge(), para não existirem dois lugares dizendo a mesma coisa.
export const EVENT_TYPES = ["comment", "message", "story_reply", "quick_reply", "error"] as const;
export type EventTypeKey = (typeof EVENT_TYPES)[number];

export type EventFilters = {
  post: string | null;
  type: EventTypeKey | null;
  period: PeriodKey;
  q: string | null;
};

export const NO_FILTERS: EventFilters = { post: null, type: null, period: "tudo", q: null };

export function hasFilters(f: EventFilters): boolean {
  return Boolean(f.post || f.type || f.q) || f.period !== "tudo";
}

// Os nomes dos parâmetros na URL seguem em português, junto com as rotas
// (/eventos, /automacoes, /contatos). Quem vê a barra de endereço é o dono do
// painel, não o programa.
const PARAM = { post: "post", type: "tipo", period: "periodo", q: "q" } as const;

type Raw = Record<string, string | string[] | undefined>;

function firstValue(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

// Lista branca em tudo: o que não for reconhecido vira "sem filtro" e nunca
// chega ao banco.
export function parseFilters(raw: Raw): EventFilters {
  const post = firstValue(raw[PARAM.post]);
  const type = firstValue(raw[PARAM.type]);
  const period = firstValue(raw[PARAM.period]);
  const q = firstValue(raw[PARAM.q]);
  return {
    // id de mídia do Instagram é numérico; qualquer outra coisa é descartada
    post: post && /^\d{1,32}$/.test(post) ? post : null,
    type: EVENT_TYPES.includes(type as EventTypeKey) ? (type as EventTypeKey) : null,
    period: PERIODS.some((p) => p.key === period) ? (period as PeriodKey) : "tudo",
    q: q ? q.slice(0, SEARCH_MAX_LENGTH) : null,
  };
}

// Filtro → query string, na mesma ordem sempre. Omite o que está no padrão,
// para a URL de "sem filtro" ser simplesmente /eventos.
export function toQueryString(f: EventFilters): string {
  const p = new URLSearchParams();
  if (f.period !== "tudo") p.set(PARAM.period, f.period);
  if (f.type) p.set(PARAM.type, f.type);
  if (f.post) p.set(PARAM.post, f.post);
  if (f.q) p.set(PARAM.q, f.q);
  return p.toString();
}
