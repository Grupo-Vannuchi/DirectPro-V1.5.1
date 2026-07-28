// Design system compartilhado (claro + escuro).
// Strings simples: funcionam em componentes de servidor e de cliente.
//
// Princípios desta versão:
// - Superfícies calmas: borda sutil + sombra baixa, sem "caixa dentro de caixa".
// - Um único tom de destaque (indigo) para ação; verde só para sucesso real.
// - Foco sempre visível (ring), porque contorno de foco é acessibilidade.
// - Escala de espaçamento e raio consistentes para a interface parecer única.

/* ---------- superfícies ---------- */

export const card =
  "rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-none";

// Cartão de leitura (métricas, listas) com leve elevação no hover.
export const cardHover =
  "transition-[box-shadow,border-color] duration-200 hover:border-zinc-300 hover:shadow-[0_4px_16px_-6px_rgba(0,0,0,0.10)] dark:hover:border-zinc-700";

// Superfície interna: agrupa campos relacionados dentro de um cartão.
export const subtle =
  "rounded-xl border border-zinc-200/70 bg-zinc-50/60 dark:border-zinc-800/80 dark:bg-zinc-950/40";

export const divider = "border-t border-zinc-200/80 dark:border-zinc-800";

/* ---------- tipografia ---------- */

export const pageTitle =
  "text-[22px] font-bold tracking-[-0.01em] text-zinc-900 sm:text-2xl dark:text-zinc-50";

export const pageSubtitle = "mt-1 text-sm text-zinc-600 dark:text-zinc-400";

export const sectionTitle =
  "text-sm font-semibold tracking-[-0.005em] text-zinc-900 dark:text-zinc-100";

export const muted = "text-zinc-600 dark:text-zinc-400";

export const eyebrow =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-500";

/* ---------- formulários ---------- */

export const label = "mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-200";

export const hint = "mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500";

export const input =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:ring-indigo-500/15";

// Campo com erro: a borda vermelha aparece junto da mensagem no próprio campo.
export const inputError =
  "border-red-400 focus:border-red-500 focus:ring-red-500/10 dark:border-red-800";

export const fieldError = "mt-1.5 text-xs font-medium text-red-600 dark:text-red-400";

/* ---------- botões ---------- */

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-[background-color,transform,box-shadow] hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50";

export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500/15 active:scale-[0.985] dark:border-zinc-700 dark:bg-transparent dark:text-zinc-200 dark:hover:bg-zinc-800/60";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500/15 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

export const btnDanger =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/15 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40";

export const link =
  "font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 transition-colors hover:decoration-indigo-500 dark:text-indigo-400 dark:decoration-indigo-700";

/* ---------- selos ---------- */

export const badge =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold";

export const badgeNeutral = `${badge} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400`;
export const badgeOk = `${badge} bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400`;
export const badgeWarn = `${badge} bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400`;
export const badgeErr = `${badge} bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400`;
export const badgeAccent = `${badge} bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300`;

/* ---------- tabelas ---------- */

export const tableWrap =
  "overflow-x-auto rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-none";

export const thead =
  "bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-500 dark:bg-zinc-950/50 dark:text-zinc-500";

export const rowDivide = "divide-y divide-zinc-100 dark:divide-zinc-800/60";

export const rowHover = "transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30";

/* ---------- avisos ---------- */

const alertBase = "rounded-xl border px-4 py-3 text-sm";

export const alertError = `${alertBase} border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300`;

// Sucesso em verde: indigo é a cor de ação, e usar indigo para "deu certo"
// confundia confirmação com botão.
export const alertOk = `${alertBase} border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300`;

export const alertWarn = `${alertBase} border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300`;

export const alertInfo = `${alertBase} border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300`;

/* ---------- estados ---------- */

export const skeleton = "animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800/60";

export const emptyWrap =
  "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700";
