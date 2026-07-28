// Exibição de datas sempre em horário de Brasília (o servidor roda em UTC).
const fmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : fmt.format(d);
}

// "há 5 min", "há 3 h", "ontem" — para status que precisa de leitura rápida
export function fmtRelative(value: string | Date | null | undefined): string {
  const h = hoursAgo(value);
  if (h === null) return "—";
  const min = h * 60;
  if (min < 2) return "agora";
  if (min < 60) return `há ${Math.floor(min)} min`;
  if (h < 24) return `há ${Math.floor(h)} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export function hoursAgo(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const d = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(d)) return null;
  return (Date.now() - d) / 3_600_000;
}
