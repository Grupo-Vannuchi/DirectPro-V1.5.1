import { describe, it, expect } from "vitest";
import { windowState, formatWindowLeft, WINDOW_MS } from "@/lib/inbox-window";

const AGORA = 1_800_000_000_000;

describe("windowState", () => {
  it("está aberta logo depois da pessoa falar", () => {
    expect(windowState(new Date(AGORA - 60_000), AGORA).open).toBe(true);
  });

  it("está fechada quando nunca falou", () => {
    expect(windowState(null, AGORA)).toEqual({ open: false, msLeft: 0 });
  });

  it("fecha 5 minutos ANTES das 24h, que é a margem do motor de envio", () => {
    const quaseNoLimite = AGORA - (WINDOW_MS - 6 * 60_000);
    const passouDaMargem = AGORA - (WINDOW_MS - 4 * 60_000);
    expect(windowState(new Date(quaseNoLimite), AGORA).open).toBe(true);
    expect(windowState(new Date(passouDaMargem), AGORA).open).toBe(false);
  });

  it("nunca devolve tempo restante negativo", () => {
    expect(windowState(new Date(AGORA - 10 * WINDOW_MS), AGORA).msLeft).toBe(0);
  });

  it("aceita data em texto, que é como o driver do banco devolve", () => {
    expect(windowState(new Date(AGORA - 60_000).toISOString(), AGORA).open).toBe(true);
  });
});

describe("formatWindowLeft", () => {
  it("mostra horas e minutos", () => {
    expect(formatWindowLeft(3 * 3_600_000 + 20 * 60_000)).toBe("3h20");
  });

  it("abaixo de uma hora, só minutos", () => {
    expect(formatWindowLeft(45 * 60_000)).toBe("45 min");
  });

  it("abaixo de um minuto, avisa que está acabando", () => {
    expect(formatWindowLeft(30_000)).toBe("menos de 1 min");
  });

  it("zero é janela fechada", () => {
    expect(formatWindowLeft(0)).toBe("fechada");
  });
});
