import { describe, it, expect } from "vitest";
import { mergeMessages, type InboxMessage } from "@/lib/conversations";

const msg = (
  mid: string | null,
  direction: "in" | "out",
  text: string,
  minuto: number
): InboxMessage => ({ mid, direction, text, at: new Date(2026, 6, 29, 10, minuto) });

describe("mergeMessages", () => {
  it("junta as duas fontes em ordem de tempo", () => {
    const r = mergeMessages(
      [msg("m1", "in", "oi", 0), msg("m3", "out", "opa", 2)],
      [msg("m2", "out", "um momento", 1)]
    );
    expect(r.map((m) => m.text)).toEqual(["oi", "um momento", "opa"]);
  });

  it("descarta a linha da fila quando o eco da mesma mensagem já veio", () => {
    // A Meta devolve o mid ao aceitar a mensagem E manda o eco depois. Sem esta
    // regra, toda resposta automática apareceria duas vezes na conversa.
    const r = mergeMessages([msg("m1", "out", "bem-vindo", 0)], [msg("m1", "out", "bem-vindo", 0)]);
    expect(r).toHaveLength(1);
  });

  it("mantém a linha da fila quando não há eco correspondente", () => {
    const r = mergeMessages([msg("m1", "in", "oi", 0)], [msg("m9", "out", "resposta", 1)]);
    expect(r.map((m) => m.text)).toEqual(["oi", "resposta"]);
  });

  it("mantém linha antiga da fila sem mid, que é de antes deste recurso existir", () => {
    const r = mergeMessages([msg("m1", "in", "oi", 0)], [msg(null, "out", "antiga", 1)]);
    expect(r).toHaveLength(2);
  });

  it("não deduplica mensagens recebidas entre si", () => {
    const r = mergeMessages([msg("m1", "in", "oi", 0), msg("m2", "in", "oi", 1)], []);
    expect(r).toHaveLength(2);
  });

  it("aguenta as duas listas vazias", () => {
    expect(mergeMessages([], [])).toEqual([]);
  });

  it("empate de horário não perde mensagem", () => {
    const r = mergeMessages([msg("m1", "in", "a", 0)], [msg("m2", "out", "b", 0)]);
    expect(r).toHaveLength(2);
  });
});
