import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signatureMatches, signatureMatchesAny } from "@/lib/webhook-signature";

// Esta função é a única coisa que separa um evento real da Meta de um POST
// qualquer da internet. Se ela devolver true por engano, estranho manda DM pela
// conta do cliente; se devolver false por engano, nada funciona e o sintoma é
// mudo.

const SEGREDO = "chave-secreta-do-app";
const CORPO = '{"object":"instagram","entry":[{"id":"123"}]}';

const assinar = (corpo: string, segredo: string) =>
  `sha256=${createHmac("sha256", segredo).update(corpo, "utf8").digest("hex")}`;

describe("signatureMatches", () => {
  it("aceita a assinatura correta", () => {
    expect(signatureMatches(CORPO, assinar(CORPO, SEGREDO), SEGREDO)).toBe(true);
  });

  it("confere contra um valor fixo, não só contra o que ela mesma calcula", () => {
    // HMAC-SHA256 de '{"object":"instagram"}' com a chave acima, calculado
    // fora deste arquivo. Gerar o esperado com a mesma função que está sendo
    // testada aprovaria qualquer algoritmo — inclusive o errado.
    const conhecida =
      "sha256=432b63740f9c233de1124dfdc01815258be0987e2a384edf5fd82c216f2235e0";
    expect(signatureMatches('{"object":"instagram"}', conhecida, SEGREDO)).toBe(true);
  });

  it("recusa segredo errado", () => {
    expect(signatureMatches(CORPO, assinar(CORPO, "outra-chave"), SEGREDO)).toBe(false);
  });

  it("recusa quando o corpo mudou, mesmo que só um caractere", () => {
    const assinatura = assinar(CORPO, SEGREDO);
    expect(signatureMatches(CORPO + " ", assinatura, SEGREDO)).toBe(false);
    expect(signatureMatches(CORPO.replace("123", "124"), assinatura, SEGREDO)).toBe(false);
  });

  it("recusa sem cabeçalho", () => {
    expect(signatureMatches(CORPO, null, SEGREDO)).toBe(false);
    expect(signatureMatches(CORPO, "", SEGREDO)).toBe(false);
  });

  it("recusa cabeçalho sem o prefixo sha256=", () => {
    const cru = createHmac("sha256", SEGREDO).update(CORPO, "utf8").digest("hex");
    expect(signatureMatches(CORPO, cru, SEGREDO)).toBe(false);
    expect(signatureMatches(CORPO, `sha1=${cru}`, SEGREDO)).toBe(false);
  });

  it("recusa hex malformado sem estourar", () => {
    expect(signatureMatches(CORPO, "sha256=nao-e-hex", SEGREDO)).toBe(false);
    expect(signatureMatches(CORPO, "sha256=", SEGREDO)).toBe(false);
    expect(signatureMatches(CORPO, "sha256=abc", SEGREDO)).toBe(false);
  });

  it("recusa segredo vazio, em vez de assinar com string vazia", () => {
    expect(signatureMatches(CORPO, assinar(CORPO, ""), "")).toBe(false);
  });

  it("é sensível a espaço em branco do corpo cru", () => {
    // Por isso o handler assina o texto CRU: reserializar o JSON mudaria
    // espaços e ordem de chaves, e nada bateria nunca.
    const comEspaco = '{ "object": "instagram" }';
    const semEspaco = '{"object":"instagram"}';
    expect(signatureMatches(semEspaco, assinar(comEspaco, SEGREDO), SEGREDO)).toBe(false);
  });
});

describe("signatureMatchesAny", () => {
  it("aceita quando bate com qualquer uma das chaves salvas", () => {
    const assinatura = assinar(CORPO, "segunda");
    expect(signatureMatchesAny(CORPO, assinatura, ["primeira", "segunda", "terceira"])).toBe(true);
  });

  it("recusa quando não bate com nenhuma", () => {
    const assinatura = assinar(CORPO, "nenhuma-dessas");
    expect(signatureMatchesAny(CORPO, assinatura, ["primeira", "segunda"])).toBe(false);
  });

  it("recusa quando não há chave configurada", () => {
    expect(signatureMatchesAny(CORPO, assinar(CORPO, SEGREDO), [])).toBe(false);
  });
});
