import { describe, it, expect } from "vitest";
import {
  interpretar,
  passoEsperado,
  retomadaDoFallback,
  interrompeOFluxo,
  indiceDoPortao,
  cursorDesta,
} from "../lib/steps";

describe("interpretar", () => {
  it("enfileira uma sequência simples até o fim", () => {
    const r = interpretar(
      [
        { tipo: "dm", texto: "oi" },
        { tipo: "dm", texto: "aqui está o link", url: "https://x.y" },
      ],
      0
    );
    expect(r.enfileirar.map((a) => a.indice)).toEqual([0, 1]);
    expect(r.pararEm).toBeNull();
  });

  it("para no passo que espera, e o inclui no que enfileira", () => {
    // O pedido de follow É enviado; o que para é o fluxo depois dele.
    const r = interpretar(
      [
        { tipo: "dm", texto: "oi" },
        { tipo: "pedir_follow", texto: "me segue", botao_label: "já sigo" },
        { tipo: "dm", texto: "link" },
      ],
      0
    );
    expect(r.enfileirar.map((a) => a.indice)).toEqual([0, 1]);
    expect(r.pararEm).toBe(1);
  });

  it("dm com botão e sem url é resposta rápida: enfileira e para", () => {
    // O fluxo antigo mandava as boas-vindas com botão e só seguia depois do
    // toque. Sem isto, o portão de follow consultaria a Meta antes de a pessoa
    // ter engajado.
    const r = interpretar(
      [
        { tipo: "dm", texto: "oi", botao_label: "quero!" },
        { tipo: "pedir_follow", texto: "me segue", botao_label: "já sigo" },
      ],
      0
    );
    expect(r.enfileirar.map((a) => a.indice)).toEqual([0]);
    expect(r.pararEm).toBe(0);
  });

  it("dm com botão E url é botão de link: não para", () => {
    // A pessoa abre o link e a vida segue — não há toque para esperar.
    const r = interpretar(
      [
        { tipo: "dm", texto: "o link", botao_label: "abrir", url: "https://x.y" },
        { tipo: "dm", texto: "depois" },
      ],
      0
    );
    expect(r.enfileirar.map((a) => a.indice)).toEqual([0, 1]);
    expect(r.pararEm).toBeNull();
  });

  it("dm sem botão não para", () => {
    const r = interpretar(
      [
        { tipo: "dm", texto: "oi" },
        { tipo: "dm", texto: "tchau" },
      ],
      0
    );
    expect(r.enfileirar.map((a) => a.indice)).toEqual([0, 1]);
    expect(r.pararEm).toBeNull();
  });

  it("retoma do índice pedido, sem repetir o que já saiu", () => {
    const r = interpretar(
      [
        { tipo: "dm", texto: "oi" },
        { tipo: "pedir_follow", texto: "me segue", botao_label: "já sigo" },
        { tipo: "dm", texto: "link" },
      ],
      2
    );
    expect(r.enfileirar.map((a) => a.indice)).toEqual([2]);
    expect(r.pararEm).toBeNull();
  });

  it("esperar não é enfileirado: ele atrasa o que vem depois", () => {
    const r = interpretar(
      [
        { tipo: "dm", texto: "link" },
        { tipo: "esperar", minutos: 60 },
        { tipo: "dm", texto: "lembrete" },
      ],
      0
    );
    expect(r.enfileirar.map((a) => [a.indice, a.atrasoSegundos])).toEqual([
      [0, 0],
      [2, 3600],
    ]);
  });

  it("esperas somam", () => {
    const r = interpretar(
      [
        { tipo: "esperar", minutos: 10 },
        { tipo: "esperar", minutos: 5 },
        { tipo: "dm", texto: "depois" },
      ],
      0
    );
    expect(r.enfileirar[0].atrasoSegundos).toBe(900);
  });

  it("pula passo inválido e diz por quê, em vez de estourar", () => {
    // Automação mal montada tem que virar linha em Atividade, não exceção que
    // derruba o webhook e faz a Meta reenviar por 36 horas.
    const r = interpretar(
      [{ tipo: "dm", texto: "ok" }, { tipo: "inventado" }, { tipo: "dm", texto: "fim" }],
      0
    );
    expect(r.enfileirar.map((a) => a.indice)).toEqual([0, 2]);
    expect(r.ignorados).toEqual([{ indice: 1, motivo: "tipo desconhecido: inventado" }]);
  });

  it("pula dm sem texto", () => {
    const r = interpretar([{ tipo: "dm" }, { tipo: "dm", texto: "vale" }], 0);
    expect(r.enfileirar.map((a) => a.indice)).toEqual([1]);
    expect(r.ignorados[0].motivo).toBe("dm sem texto");
  });

  it("lista que não é lista não estoura", () => {
    const r = interpretar(null, 0);
    expect(r.enfileirar).toEqual([]);
    expect(r.pararEm).toBeNull();
    expect(r.ignorados[0].motivo).toBe("a automação não tem lista de passos");
  });

  it("lista VAZIA registra o motivo, em vez de entregar zero em silêncio", () => {
    // Impede a única falha do produto que não deixaria rastro em Atividade: o
    // laço não itera, o resultado fica igual ao de uma lista que TERMINOU, o
    // motor limpa o cursor e ninguém recebe nada — sem nenhum evento dizendo
    // por quê. E `[]` é o `default '[]'::jsonb` da coluna, ou seja, é o que
    // toda automação criada antes desta branch tem até ser salva de novo.
    const r = interpretar([], 0);
    expect(r.enfileirar).toEqual([]);
    expect(r.pararEm).toBeNull();
    expect(r.ignorados).toEqual([{ indice: -1, motivo: "a automação não tem nenhum passo" }]);
    // Motivo PRÓPRIO: quem lê Atividade precisa distinguir "a coluna não é uma
    // lista" (dado corrompido) de "a lista está vazia" (automação sem fluxo).
    expect(r.ignorados[0].motivo).not.toBe(interpretar(null, 0).ignorados[0].motivo);
  });

  it("dm com rótulo VAZIO não espera nada", () => {
    // Impede o fluxo travar para sempre: string vazia é ausência de rótulo, e
    // sem rótulo o dreno não monta botão nenhum. Se ela contasse como resposta
    // rápida, `interpretar` pararia num passo cujo botão nunca foi entregue —
    // não haveria o que tocar, e o link nunca sairia.
    const r = interpretar(
      [
        { tipo: "dm", texto: "oi", botao_label: "" },
        { tipo: "dm", texto: "o link", url: "https://x.y" },
      ],
      0
    );
    expect(r.enfileirar.map((a) => a.indice)).toEqual([0, 1]);
    expect(r.pararEm).toBeNull();
  });

  it("índice além do fim devolve nada, sem estourar", () => {
    const r = interpretar([{ tipo: "dm", texto: "oi" }], 99);
    expect(r.enfileirar).toEqual([]);
    expect(r.pararEm).toBeNull();
  });

  it("esperar com minutos inválido é ignorado e não atrasa nada", () => {
    const r = interpretar(
      [{ tipo: "esperar", minutos: -5 }, { tipo: "dm", texto: "x" }],
      0
    );
    expect(r.enfileirar[0].atrasoSegundos).toBe(0);
    expect(r.ignorados[0].motivo).toBe("esperar com minutos inválido");
  });
});

describe("passoEsperado", () => {
  it("devolve o passo quando ele espera resposta", () => {
    const passos = [
      { tipo: "dm", texto: "oi", botao_label: "quero!" },
      { tipo: "pedir_follow", texto: "me segue", botao_label: "já sigo" },
      { tipo: "pedir_email", texto: "seu e-mail?" },
    ];
    expect(passoEsperado(passos, 0)?.tipo).toBe("dm");
    expect(passoEsperado(passos, 1)?.tipo).toBe("pedir_follow");
    expect(passoEsperado(passos, 2)?.tipo).toBe("pedir_email");
  });

  it("não devolve passo que não espera nada", () => {
    // Cursor obsoleto: a lista foi editada depois de ele ser gravado.
    const passos = [
      { tipo: "dm", texto: "o link", botao_label: "abrir", url: "https://x.y" },
      { tipo: "dm", texto: "texto puro" },
    ];
    expect(passoEsperado(passos, 0)).toBeUndefined();
    expect(passoEsperado(passos, 1)).toBeUndefined();
  });

  it("não devolve passo que o interpretador ignoraria", () => {
    // O ramo do cursor não pode tratar como pedido de e-mail um passo que nunca
    // chegou a ser enviado: ele consumiria a mensagem da pessoa como endereço.
    expect(passoEsperado([{ tipo: "pedir_email" }], 0)).toBeUndefined();
    expect(passoEsperado([{ tipo: "pedir_follow", botao_label: "x" }], 0)).toBeUndefined();
    expect(passoEsperado([{ tipo: "inventado" }], 0)).toBeUndefined();
  });

  it("índice inexistente ou lista que não é lista devolve undefined", () => {
    expect(passoEsperado([{ tipo: "dm", texto: "oi", botao_label: "b" }], 9)).toBeUndefined();
    expect(passoEsperado(null, 0)).toBeUndefined();
    expect(passoEsperado(undefined, 0)).toBeUndefined();
  });

  it("índice NEGATIVO devolve undefined", () => {
    // O que este teste fixa é a SEMÂNTICA DE INDEXAÇÃO, e só isso: acesso por
    // `passos[i]`, em que índice negativo é propriedade inexistente e devolve
    // undefined — não o último elemento, como em linguagens que contam de trás
    // para frente. Trocar o acesso por algo como `.at(i)` mudaria o resultado
    // em silêncio, e o ramo do cursor passaria a tratar o ÚLTIMO passo da lista
    // como o passo esperado.
    //
    // O que ele NÃO faz, e a versão anterior deste comentário prometia: impedir
    // um cenário real. Nenhum caminho grava índice negativo — `interpretar` já
    // faz `Math.max(0, deIndice)` e o cursor só recebe índices de passo. É rede
    // contra mudança de implementação, não contra dado do banco.
    const passos = [
      { tipo: "dm", texto: "oi", botao_label: "quero!" },
      { tipo: "pedir_email", texto: "seu e-mail?" },
    ];
    expect(passoEsperado(passos, -1)).toBeUndefined();
    expect(passoEsperado(passos, -2)).toBeUndefined();
  });
});

describe("interrompeOFluxo", () => {
  const parada = { id: "A", match_type: "contains" };

  it("a mesma automação não interrompe a si mesma", () => {
    // Impede o defeito que fazia o link nunca sair, em silêncio: quem respondia
    // à boas-vindas repetindo a própria palavra-chave era tratado como pedido de
    // outra coisa, o fluxo reiniciava do índice 0, parava de novo na boas-vindas
    // e não enfileirava nada — a `passoKey` do dia já estava na fila e o
    // `on conflict do nothing` engolia o item. O cursor não andava, nenhuma
    // mensagem saía, e no dia seguinte a boas-vindas era reenviada.
    expect(interrompeOFluxo({ id: "A", match_type: "contains" }, parada)).toBe(false);
  });

  it("outra automação com palavra-chave específica interrompe", () => {
    // Impede o oposto: sem isto, quem está parado esperando o toque num botão
    // fica surdo a toda outra automação. A pessoa digitou a palavra-chave da B —
    // é pedido explícito, e não atendê-lo prende o contato na A para sempre.
    expect(interrompeOFluxo({ id: "B", match_type: "contains" }, parada)).toBe(true);
  });

  it('outra automação em "Qualquer texto" NÃO interrompe', () => {
    // Impede o sequestro: uma automação com `match_type: "any"` casa com toda
    // mensagem, de todo mundo, sempre. Quando ela podia interromper, qualquer
    // resposta de quem estava no meio de outro fluxo era lida como gatilho dela,
    // todo contato parado era arrastado para a mesma automação, e ninguém
    // chegava ao link.
    expect(interrompeOFluxo({ id: "B", match_type: "any" }, parada)).toBe(false);
  });

  it("nenhuma automação casada não interrompe", () => {
    // Sem gatilho novo não há o que interromper: a mensagem é resposta ao passo
    // em que a pessoa está parada, e tratá-la como interrupção descartaria o
    // cursor de quem só estava conversando.
    expect(interrompeOFluxo(undefined, parada)).toBe(false);
  });
});

describe("indiceDoPortao", () => {
  it("na lista do formulário, o portão NÃO é o índice 0", () => {
    // Este é o teste que prova que a correção faz diferença. O ramo `FOLLOW:`
    // caía no zero quando o cursor não era desta automação, e o comentário
    // dizia que "a lista é percorrida desde o início e o portão é reavaliado no
    // lugar certo". É falso para TODA lista que o formulário produz, e por
    // construção: a boas-vindas é obrigatória (o `saveAutomation` recusa salvar
    // sem ela), vem sempre antes do portão, e o rótulo do botão tem padrão não
    // vazio — rótulo sem url é resposta rápida, ou seja, PARADA DURA.
    //
    // `interpretar` a partir do zero para na boas-vindas e nunca chega ao
    // portão: o toque em "Já sigo!" não fazia nada.
    const passos = [
      { tipo: "dm", texto: "oi", botao_label: "Quero o link! 🔗" },
      { tipo: "pedir_follow", texto: "me segue", botao_label: "Já sigo! ✅" },
      { tipo: "dm", texto: "o link", url: "https://x.y" },
    ];
    expect(indiceDoPortao(passos)).toBe(1);
    expect(indiceDoPortao(passos)).not.toBe(0);
    // E a confirmação do porquê: do zero, o fluxo para antes do portão.
    expect(interpretar(passos, 0).pararEm).toBe(0);
  });

  it("lista sem pedir_follow devolve null", () => {
    // Quem chama cai no `?? 0` — lista sem portão nenhum não tem o que afirmar.
    expect(indiceDoPortao([{ tipo: "dm", texto: "oi", botao_label: "b" }])).toBeNull();
    expect(indiceDoPortao([])).toBeNull();
    expect(indiceDoPortao(null)).toBeNull();
  });

  it("portão INVÁLIDO não conta, e o válido depois dele é o encontrado", () => {
    // Mesma regra de `contarParadasDuras` e `passoEsperado`: `interpretar`
    // ignora o passo inválido, então ele nunca foi enviado e não é portão. Se
    // ele contasse, o toque em "Já sigo!" retomaria de um passo que a pessoa
    // nunca recebeu — e tudo o que vem depois dele sairia sem portão nenhum,
    // que é entregar o link a quem não segue.
    const passos = [
      { tipo: "dm", texto: "oi", botao_label: "quero!" },
      { tipo: "pedir_follow", botao_label: "já sigo" }, // sem texto: inválido
      { tipo: "pedir_follow", texto: "me segue mesmo", botao_label: "já sigo" },
    ];
    expect(indiceDoPortao(passos)).toBe(2);
  });

  it("portão sem rótulo de botão CONTA — `conferir` só exige o texto", () => {
    // Está aqui porque é contraintuitivo e alguém vai querer "consertar":
    // `Passo` declara `botao_label` obrigatório no `pedir_follow`, mas
    // `conferir` valida só o texto. Apertar `conferir` faria `interpretar`
    // IGNORAR esse portão — e ignorar um portão é pular o portão, entregando o
    // que vem depois a quem não segue. Sem rótulo o pedido sai sem botão, o que
    // é ruim mas ainda barra; ignorado, não barra nada.
    expect(indiceDoPortao([{ tipo: "pedir_follow", texto: "me segue" }])).toBe(0);
  });

  it("o primeiro portão vence, quando há mais de um", () => {
    const passos = [
      { tipo: "pedir_follow", texto: "a", botao_label: "x" },
      { tipo: "pedir_follow", texto: "b", botao_label: "y" },
    ];
    expect(indiceDoPortao(passos)).toBe(0);
  });
});

describe("cursorDesta", () => {
  it("cursor DESTA automação devolve o índice", () => {
    expect(cursorDesta({ indice: 3, automationId: "A" }, "A")).toBe(3);
    // Zero é índice legítimo, não "sem cursor": quem chama tem que distinguir
    // com `?? `, nunca com falsidade.
    expect(cursorDesta({ indice: 0, automationId: "A" }, "A")).toBe(0);
  });

  it("cursor de OUTRA automação devolve null", () => {
    // O bloqueador mais grave desta onda: o índice é posição dentro de UMA
    // lista. O 3 de B aplicado à lista de A pula os passos 0 a 2 de A — o
    // portão de follow entre eles — e entrega o link a quem não segue.
    expect(cursorDesta({ indice: 3, automationId: "B" }, "A")).toBeNull();
    expect(cursorDesta({ indice: 0, automationId: "B" }, "A")).toBeNull();
  });

  it("contato sem cursor devolve null", () => {
    // Pode ser "nunca começou" ou "o fluxo terminou" — a coluna não separa os
    // dois, e cada ramo do motor decide o que fazer com o null.
    expect(cursorDesta({ indice: null, automationId: "A" }, "A")).toBeNull();
    expect(cursorDesta({ indice: null, automationId: null }, "A")).toBeNull();
    expect(cursorDesta({ indice: 3, automationId: null }, "A")).toBeNull();
  });
});

describe("retomadaDoFallback", () => {
  it("na lista típica, retoma depois da boas-vindas", () => {
    // Impede o defeito de reenviar a boas-vindas: retomar do zero reinterpretava
    // a lista inteira e reenfileirava a mensagem que a pessoa acabou de receber
    // — e sem colisão de chave, porque a primeira saiu como `privateReplyKey` e
    // a repetição sairia como `passoKey`. Duas mensagens iguais, pessoa real.
    const passos = [
      { tipo: "dm", texto: "oi", botao_label: "quero!" },
      { tipo: "pedir_follow", texto: "me segue", botao_label: "já sigo" },
      { tipo: "dm", texto: "o link", url: "https://x.y" },
    ];
    expect(retomadaDoFallback(passos)).toBe(1);
  });

  it("quando o ponto de espera é o portão de follow, retoma DELE MESMO", () => {
    // Impede entregar o link a quem não segue: pular o portão para "adiantar" o
    // fluxo dispensaria a consulta à Meta, e bastaria mandar qualquer texto para
    // receber o link sem nunca ter seguido.
    const passos = [
      { tipo: "dm", texto: "oi" },
      { tipo: "pedir_follow", texto: "me segue", botao_label: "já sigo" },
      { tipo: "dm", texto: "o link", url: "https://x.y" },
    ];
    expect(retomadaDoFallback(passos)).toBe(1);
  });

  it("lista sem ponto de espera não retoma nada", () => {
    // Impede repetir a lista inteira: sem passo de espera tudo já foi
    // enfileirado, link incluído, e retomar do zero mandaria tudo de novo.
    const passos = [
      { tipo: "dm", texto: "oi" },
      { tipo: "dm", texto: "o link", url: "https://x.y" },
    ];
    expect(retomadaDoFallback(passos)).toBeNull();
    // Automação sem lista nenhuma: o `steps` vem CRU do banco.
    expect(retomadaDoFallback(null)).toBeNull();
  });

  it("com duas dm de resposta rápida, não retoma nada", () => {
    // Impede a mensagem repetida que a Fase 1b vai tornar possível: a dedução
    // supõe que o primeiro ponto de espera é o último passo entregue, e com dois
    // botões na lista isso pode ser falso — a pessoa pode ter tocado no primeiro
    // e travado no segundo. Como nenhuma das duas é `dm_link`, o fallback
    // continua disparando a cada mensagem, e retomar do índice deduzido
    // REENVIARIA a segunda. Mandar nada é recuperável; mandar de novo não é.
    const passos = [
      { tipo: "dm", texto: "oi", botao_label: "quero!" },
      { tipo: "dm", texto: "confirma?", botao_label: "confirmo" },
      { tipo: "dm", texto: "o link", url: "https://x.y" },
    ];
    expect(retomadaDoFallback(passos)).toBeNull();
  });
});
