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
  passoKey,
  diaDaChave,
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

describe("passoKey", () => {
  // É a chave de TODO passo `dm` que não sai como resposta privada — ou seja, a
  // que segura a repetição do fluxo novo inteiro. Estava sem teste enquanto o
  // arquivo afirmava, logo acima, que os testes existem para nenhuma mudança de
  // formato passar despercebida.

  it("mantém o formato por automação, pessoa, ÍNDICE e dia", () => {
    expect(passoKey("auto-1", "user-9", 2, "2026-07-28")).toBe(
      "passo:auto-1:user-9:2:2026-07-28"
    );
  });

  it("o índice separa passos da MESMA automação no mesmo dia", () => {
    // Sem o índice, dois lembretes da mesma automação colidiriam no UNIQUE e o
    // segundo seria engolido pelo `on conflict do nothing`: a pessoa receberia
    // uma mensagem só, em silêncio.
    expect(passoKey("auto-1", "user-9", 0, "2026-07-28")).not.toBe(
      passoKey("auto-1", "user-9", 1, "2026-07-28")
    );
  });

  it("libera de novo no dia seguinte, mas não duas vezes no mesmo dia", () => {
    const hoje = passoKey("auto-1", "user-9", 0, "2026-07-28");
    expect(passoKey("auto-1", "user-9", 0, "2026-07-28")).toBe(hoje);
    expect(passoKey("auto-1", "user-9", 0, "2026-07-29")).not.toBe(hoje);
  });

  it("não confunde pessoas nem automações diferentes", () => {
    expect(passoKey("auto-1", "user-1", 0, "d")).not.toBe(passoKey("auto-1", "user-2", 0, "d"));
    expect(passoKey("auto-1", "user-1", 0, "d")).not.toBe(passoKey("auto-2", "user-1", 0, "d"));
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

describe("o dia da chave é o dia de Brasília, não o de UTC", () => {
  // Estes três são a correção inteira. Antes, o dia virava às 21h locais, e
  // quem acionasse às 20h e às 22h da mesma noite recebia a sequência duas
  // vezes. Os instantes estão em UTC (o `Z`) de propósito: é assim que o
  // servidor da Vercel enxerga o relógio, e é dali que a conversão parte.
  it("às 20h de Brasília ainda é o mesmo dia", () => {
    // 2026-08-06 23:00Z = 2026-08-06 20:00 em São Paulo
    expect(diaDaChave(new Date("2026-08-06T23:00:00Z"))).toBe("2026-08-06");
  });

  it("às 22h de Brasília CONTINUA sendo o mesmo dia — era aqui que virava", () => {
    // 2026-08-07 01:00Z = 2026-08-06 22:00 em São Paulo.
    // Em UTC isto dava "2026-08-07": balde novo, mensagem repetida.
    expect(diaDaChave(new Date("2026-08-07T01:00:00Z"))).toBe("2026-08-06");
    expect(diaDaChave(new Date("2026-08-07T01:00:00Z"))).not.toBe("2026-08-07");
  });

  it("à meia-noite de Brasília o dia vira", () => {
    // 2026-08-07 02:59Z = 2026-08-06 23:59 | 03:00Z = 2026-08-07 00:00
    expect(diaDaChave(new Date("2026-08-07T02:59:00Z"))).toBe("2026-08-06");
    expect(diaDaChave(new Date("2026-08-07T03:00:00Z"))).toBe("2026-08-07");
  });

  it("o formato continua YYYY-MM-DD, senão as chaves já gravadas não casam", () => {
    expect(diaDaChave(new Date("2026-01-09T15:00:00Z"))).toBe("2026-01-09");
  });

  it("dois instantes do mesmo dia local dão a MESMA chave", () => {
    const manha = passoKey("a", "c", 0, diaDaChave(new Date("2026-08-06T13:00:00Z")));
    const noite = passoKey("a", "c", 0, diaDaChave(new Date("2026-08-07T01:00:00Z")));
    expect(noite).toBe(manha);
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
      passoKey("a", "c", 0, "d"),
    ].map((k) => k.split(":")[0]);

    expect(new Set(prefixos).size).toBe(prefixos.length);
  });
});
