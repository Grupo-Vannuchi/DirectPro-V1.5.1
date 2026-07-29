import { describe, it, expect } from "vitest";
import { manualReplyKey } from "@/lib/dedupe";

describe("manualReplyKey", () => {
  it("mantém o formato", () => {
    expect(manualReplyKey("user-9", 1_700_000_000_000)).toBe("mr:user-9:1700000000000");
  });

  it("permite repetir a mesma mensagem em instantes diferentes", () => {
    // Atendente pode mandar "oi" duas vezes; isso não é engano a deduplicar.
    expect(manualReplyKey("user-9", 1)).not.toBe(manualReplyKey("user-9", 2));
  });

  it("não colide entre pessoas no mesmo instante", () => {
    expect(manualReplyKey("user-1", 1)).not.toBe(manualReplyKey("user-2", 1));
  });

  it("não colide com os prefixos já existentes", () => {
    expect(manualReplyKey("x", 1).split(":")[0]).toBe("mr");
  });
});
