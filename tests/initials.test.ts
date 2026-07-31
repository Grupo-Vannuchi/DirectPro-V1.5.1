import { describe, it, expect } from "vitest";
import { initial } from "@/lib/initials";

// Este teste nasceu de um erro real em produção: o nome "🪄Lx.KHAN...🎀"
// derrubava a hidratação da página inteira, porque .slice(0,1) partia o emoji
// no meio do par substituto e sobrava uma unidade UTF-16 solta.

describe("initial", () => {
  it("pega a primeira letra de um nome comum", () => {
    expect(initial("João Vitor Siqueira")).toBe("J");
    expect(initial("carlos junior")).toBe("C");
  });

  it("pula o emoji e acha a primeira letra de verdade", () => {
    // O caso que quebrou: antes devolvia meio 🪄 e a página não hidratava.
    expect(initial("🪄Lx.KHAN...🎀")).toBe("L");
    expect(initial("🔥 Promoções")).toBe("P");
  });

  it("acha a letra mesmo depois de pontuação e símbolo", () => {
    expect(initial("@fulano")).toBe("F");
    expect(initial("...BLACIA🏴‍☠️")).toBe("B");
  });

  it("aceita dígito quando o nome começa por número", () => {
    expect(initial("4082887")).toBe("4");
  });

  it("nome só de emoji devolve o emoji INTEIRO, nunca metade", () => {
    // Aqui está a regressão que importa: o resultado precisa ser um caractere
    // válido. Meia unidade UTF-16 é o que causava o erro de hidratação.
    const r = initial("🪄🎀");
    expect(r).toBe("🪄");
    expect(Array.from(r)).toHaveLength(1);
    expect(r.codePointAt(0)).toBeGreaterThan(0xffff); // fora do BMP, par intacto
  });

  it("nunca devolve unidade substituta solta", () => {
    for (const nome of ["🪄Lx", "🎀", "𝐀BC", "👨‍👩‍👧 Família", "🏴‍☠️"]) {
      const r = initial(nome);
      const cod = r.charCodeAt(0);
      const solta = cod >= 0xd800 && cod <= 0xdbff && r.length === 1;
      expect(solta, `"${nome}" devolveu unidade solta`).toBe(false);
    }
  });

  it("aguenta vazio, nulo e só espaço", () => {
    expect(initial("")).toBe("?");
    expect(initial(null)).toBe("?");
    expect(initial(undefined)).toBe("?");
    expect(initial("   ")).toBe("?");
  });

  it("acentuada vira maiúscula sem virar outra letra", () => {
    expect(initial("Ângela")).toBe("Â");
    expect(initial("ácaro")).toBe("Á");
  });
});
