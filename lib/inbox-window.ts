// A janela de 24h da Meta, como função pura.
//
// A regra já existia dentro do motor de envio, mas só respondia "dá ou não dá".
// O inbox precisa mostrar QUANTO tempo resta antes de a pessoa digitar — senão
// ela escreve, clica em enviar e toma erro, o que parece defeito do produto.

export const WINDOW_MS = 24 * 60 * 60 * 1000;

// Fecha 5 minutos antes do limite real. A mesma margem que o motor de envio
// sempre usou: uma mensagem que sai faltando 10 segundos pode chegar tarde.
export const WINDOW_MARGIN_MS = 5 * 60 * 1000;

export type WindowState = { open: boolean; msLeft: number };

export function windowState(
  lastReplyAt: Date | string | null | undefined,
  now: number = Date.now()
): WindowState {
  const last = lastReplyAt ? new Date(lastReplyAt).getTime() : 0;
  if (!last) return { open: false, msLeft: 0 };
  const msLeft = WINDOW_MS - WINDOW_MARGIN_MS - (now - last);
  return { open: msLeft > 0, msLeft: Math.max(0, msLeft) };
}

export function formatWindowLeft(msLeft: number): string {
  if (msLeft <= 0) return "fechada";
  if (msLeft < 60_000) return "menos de 1 min";
  const minutos = Math.floor(msLeft / 60_000);
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
}
