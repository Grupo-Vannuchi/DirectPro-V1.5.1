import { describe, it, expect } from "vitest";
import {
  privateReplyKey,
  commentReplyKey,
  followGateKey,
  emailAskKey,
  followupKey,
  emailAnswerKey,
  welcomeMessageKey,
  storyReactionKey,
} from "@/lib/dedupe";

// A coluna dedupe_key é UNIQUE e o enqueue usa `on conflict do nothing`. Esse
// par é a ÚNICA coisa que impede a mesma pessoa de receber a mesma mensagem
// duas vezes.
//
// Os formatos abaixo estão escritos por extenso de propósito. Não são um
// espelho da implementação: são o valor que já existe no banco de quem está
// usando o sistema. Mudar um deles faz os itens antigos deixarem de casar com
// os novos — ou seja, libera envio em dobro. Se um destes testes ficar
// vermelho, a pergunta certa é "eu quis mesmo mudar isso?", não "como faço o
// teste passar?".

describe("chaves vindas de comentário", () => {
  it("usa o id do comentário, que já é único e permanente", () => {
    expect(privateReplyKey("17900112233")).toBe("pr:17900112233");
    expect(commentReplyKey("17900112233")).toBe("cr:17900112233");
  });

  it("separa resposta privada de resposta pública do MESMO comentário", () => {
    // Sem prefixos diferentes, mandar as duas cairia no UNIQUE e uma sumiria.
    expect(privateReplyKey("abc")).not.toBe(commentReplyKey("abc"));
  });
});

describe("chaves com balde de dia", () => {
  it("mantém o formato por automação, pessoa e dia", () => {
    expect(emailAskKey("auto-1", "user-9", "2026-07-28")).toBe("ea:auto-1:user-9:2026-07-28");
    expect(followupKey("fup-3", "user-9", "2026-07-28")).toBe("fu:fup-3:user-9:2026-07-28");
  });

  it("o portão de seguidor inclui a tentativa, para cada pedido ser um item novo", () => {
    expect(followGateKey("auto-1", "user-9", "2026-07-28", 0)).toBe(
      "fg:auto-1:user-9:2026-07-28:0"
    );
    expect(followGateKey("auto-1", "user-9", "2026-07-28", 1)).toBe(
      "fg:auto-1:user-9:2026-07-28:1"
    );
  });

  it("libera de novo no dia seguinte, mas não duas vezes no mesmo dia", () => {
    const hoje = followupKey("fup-3", "user-9", "2026-07-28");
    const amanha = followupKey("fup-3", "user-9", "2026-07-29");
    expect(hoje).not.toBe(amanha);
    expect(followupKey("fup-3", "user-9", "2026-07-28")).toBe(hoje);
  });

  it("não confunde pessoas diferentes na mesma automação", () => {
    expect(followupKey("fup-3", "user-1", "2026-07-28")).not.toBe(
      followupKey("fup-3", "user-2", "2026-07-28")
    );
  });
});

describe("chaves vindas de mensagem recebida", () => {
  it("usa o id da mensagem quando a Meta manda", () => {
    expect(emailAnswerKey("mid-42", "user-9", 1_700_000_000_000)).toBe("ear:mid-42");
    expect(welcomeMessageKey("mid-42", "user-9", 1_700_000_000_000)).toBe("wm:mid-42");
  });

  it("sem id da mensagem, cai em remetente + instante", () => {
    // Não deduplica de verdade, mas é melhor que uma chave fixa: esta barraria
    // envio legítimo para pessoas diferentes por colisão no UNIQUE.
    expect(emailAnswerKey(undefined, "user-9", 1_700_000_000_000)).toBe(
      "ear:user-9:1700000000000"
    );
    expect(welcomeMessageKey(undefined, "user-9", 1_700_000_000_000)).toBe(
      "wm:user-9:1700000000000"
    );
  });

  it("na ausência de id, pessoas diferentes no mesmo instante não colidem", () => {
    const agora = 1_700_000_000_000;
    expect(welcomeMessageKey(undefined, "user-1", agora)).not.toBe(
      welcomeMessageKey(undefined, "user-2", agora)
    );
  });

  it("reação a story usa o id da mensagem", () => {
    expect(storyReactionKey("mid-42")).toBe("rx:mid-42");
  });
});

describe("os prefixos não se repetem entre tipos", () => {
  it("cada tipo de envio tem o seu", () => {
    const prefixos = [
      privateReplyKey("x"),
      commentReplyKey("x"),
      followGateKey("a", "c", "d", 0),
      emailAskKey("a", "c", "d"),
      followupKey("f", "c", "d"),
      emailAnswerKey("m", "s", 1),
      welcomeMessageKey("m", "s", 1),
      storyReactionKey("m"),
    ].map((k) => k.split(":")[0]);

    expect(new Set(prefixos).size).toBe(prefixos.length);
  });
});
