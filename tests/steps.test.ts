import { describe, it, expect } from "vitest";
import {
  interpretar,
  passoEsperado,
  retomadaDoFallback,
  interrompeOFluxo,
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
    // O índice vem de `contacts.flow_step_index`, uma coluna int sem `check`:
    // um valor negativo é gravável por fora, e `passos[-1]` em JavaScript não
    // estoura nem devolve o último elemento — devolve undefined. Isto fixa que
    // o resultado é "não há passo esperado", e não uma leitura de propriedade
    // qualquer do array. Sem isso, o ramo do cursor poderia capturar a
    // mensagem da pessoa como resposta a um passo que não existe.
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
