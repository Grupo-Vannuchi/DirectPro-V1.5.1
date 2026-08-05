// O fluxo de uma automação, como dado.
//
// Antes a sequência morava dentro do lib/engine.ts: advanceFlow chamava
// followGate, que chamava enqueueFollowups, nessa ordem e só nessa. Isso punha
// um teto na tela — um editor de blocos sobre aquele motor só poderia arrastar
// dois blocos, e arrastar os outros mostraria uma ordem que o motor não executa.
//
// Este arquivo é FUNÇÃO PURA de propósito: não toca banco, não chama a Meta, não
// conhece a fila. É a peça mais arriscada da mudança, e assim ela é a única
// testável sem banco — o que importa num projeto cuja suíte não abre conexão.

export type Passo =
  | { tipo: "resposta_publica"; textos: string[] }
  | { tipo: "dm"; texto: string; botao_label?: string; url?: string }
  | { tipo: "esperar"; minutos: number }
  | { tipo: "reagir_story"; emoji: string }
  | { tipo: "pedir_follow"; texto: string; botao_label: string }
  | { tipo: "pedir_email"; texto: string };

// Um passo espera resposta quando ele PEDE alguma coisa.
//
// `dm` entra nessa conta quando tem rótulo de botão e não tem url: isso é uma
// resposta rápida, e resposta rápida existe para ser tocada. Com url é botão de
// link — a pessoa abre e a vida segue, sem nada para esperar.
//
// A distinção não foi inventada aqui: é exatamente como o formulário já grava,
// boas-vindas com rótulo e sem url, link com rótulo e com url.
function esperaResposta(p: Passo): boolean {
  if (p.tipo === "pedir_follow" || p.tipo === "pedir_email") return true;
  if (p.tipo === "dm") return Boolean(p.botao_label) && !p.url;
  return false;
}

export type AcaoEnfileirar = {
  passo: Passo;
  indice: number;
  // Atraso acumulado pelos `esperar` que vieram antes deste passo.
  atrasoSegundos: number;
};

export type Resultado = {
  enfileirar: AcaoEnfileirar[];
  // Índice do passo que espera resposta, ou null se a lista terminou.
  pararEm: number | null;
  ignorados: { indice: number; motivo: string }[];
};

// Valida e normaliza um passo. Devolve o motivo quando não dá para usar.
function conferir(p: unknown): { passo?: Passo; motivo?: string } {
  if (!p || typeof p !== "object") return { motivo: "passo não é um objeto" };
  const o = p as Record<string, unknown>;
  const tipo = o.tipo;

  if (tipo === "dm") {
    if (typeof o.texto !== "string" || !o.texto.trim()) return { motivo: "dm sem texto" };
    return { passo: p as Passo };
  }
  if (tipo === "esperar") {
    if (typeof o.minutos !== "number" || !Number.isFinite(o.minutos) || o.minutos < 0) {
      return { motivo: "esperar com minutos inválido" };
    }
    return { passo: p as Passo };
  }
  if (tipo === "resposta_publica") {
    if (!Array.isArray(o.textos) || !o.textos.length) return { motivo: "resposta pública vazia" };
    return { passo: p as Passo };
  }
  if (tipo === "reagir_story") {
    if (typeof o.emoji !== "string" || !o.emoji) return { motivo: "reagir_story sem emoji" };
    return { passo: p as Passo };
  }
  if (tipo === "pedir_follow") {
    if (typeof o.texto !== "string" || !o.texto.trim()) return { motivo: "pedir_follow sem texto" };
    return { passo: p as Passo };
  }
  if (tipo === "pedir_email") {
    if (typeof o.texto !== "string" || !o.texto.trim()) return { motivo: "pedir_email sem texto" };
    return { passo: p as Passo };
  }
  return { motivo: `tipo desconhecido: ${String(tipo)}` };
}

// O passo em que o cursor de um contato está parado — validado, e confirmado
// como passo de espera.
//
// Existe porque quem lê o cursor (lib/engine.ts) lê `steps[i]` CRU do banco, e
// confiar no `tipo` sem passar pela mesma validação do interpretador diverge do
// que o fluxo faz: um `pedir_email` sem texto é ignorado por `interpretar` — e
// portanto nunca foi enviado —, mas o ramo do cursor o trataria como pedido de
// e-mail e consumiria a mensagem da pessoa como endereço.
//
// Devolve undefined quando o índice não existe mais, quando o passo não passa
// na validação, ou quando ele não espera resposta nenhuma. Esse último caso é
// cursor obsoleto: a lista foi editada depois de o cursor ser gravado, e não há
// resposta a esperar naquele índice.
export function passoEsperado(passos: unknown, indice: number): Passo | undefined {
  if (!Array.isArray(passos)) return undefined;
  const { passo } = conferir(passos[indice]);
  if (!passo || !esperaResposta(passo)) return undefined;
  return passo;
}

// Percorre a lista a partir de `deIndice` e diz o que fazer.
//
// `esperar` NÃO é enfileirado: ele soma no atraso dos passos seguintes. É assim
// que a fila já funciona — cada item carrega o próprio atraso —, então espera
// como passo custa zero mudança no dreno.
export function interpretar(passos: unknown, deIndice: number): Resultado {
  const r: Resultado = { enfileirar: [], pararEm: null, ignorados: [] };

  if (!Array.isArray(passos)) {
    r.ignorados.push({ indice: -1, motivo: "a automação não tem lista de passos" });
    return r;
  }

  // Lista VAZIA tem que dar sinal, e por um motivo que não é simetria: é a
  // única forma de falha do produto que passaria sem deixar rastro nenhum.
  //
  // O laço abaixo simplesmente não itera, e o resultado sai
  // `{enfileirar: [], pararEm: null, ignorados: []}` — indistinguível de uma
  // lista que terminou. O motor então limpa o cursor e ninguém recebe nada,
  // sem uma linha em Atividade dizendo por quê.
  //
  // E não é caso hipotético: `[]` é o `default '[]'::jsonb` da coluna, ou
  // seja, é exatamente o que toda automação criada ANTES desta branch tem até
  // alguém salvá-la de novo pelo formulário.
  //
  // O motivo é próprio, e não o mesmo de "não é lista", porque as duas causas
  // são diferentes: aqui a coluna está íntegra e o conteúdo é que falta.
  if (!passos.length) {
    r.ignorados.push({ indice: -1, motivo: "a automação não tem nenhum passo" });
    return r;
  }

  let atrasoSegundos = 0;

  for (let i = Math.max(0, deIndice); i < passos.length; i++) {
    const { passo, motivo } = conferir(passos[i]);
    if (!passo) {
      r.ignorados.push({ indice: i, motivo: motivo! });
      continue;
    }

    if (passo.tipo === "esperar") {
      atrasoSegundos += passo.minutos * 60;
      continue;
    }

    r.enfileirar.push({ passo, indice: i, atrasoSegundos });

    if (esperaResposta(passo)) {
      r.pararEm = i;
      return r;
    }
  }

  return r;
}

// Quantos passos da lista PARAM o fluxo de vez.
//
// Só a `dm` de resposta rápida entra nesta conta, e a distinção não é
// decorativa: `pedir_follow` e `pedir_email` são portões que a própria execução
// reavalia (o portão reconsulta a Meta; o pedido de e-mail é pulado quando o
// endereço já é conhecido), então o fluxo pode atravessá-los sozinho. A `dm` de
// resposta rápida não: nada além do toque da pessoa a destrava.
//
// Passo inválido não conta, pelo mesmo motivo de `passoEsperado`: `interpretar`
// o ignora, então ele nunca foi enviado e nunca parou nada.
function contarParadasDuras(passos: unknown[]): number {
  let n = 0;
  for (const p of passos) {
    const { passo } = conferir(p);
    if (passo && passo.tipo === "dm" && esperaResposta(passo)) n++;
  }
  return n;
}

// De qual passo o fallback retoma. Null quando não dá para afirmar.
//
// Veio de lib/engine.ts, onde era pura e por isso não testável — e onde esteve
// no centro de dois defeitos. Aqui ela é coberta por teste.
//
// O contexto: `shouldFallbackFollowup` (lib/engine.ts) respondeu "já houve
// boas-vindas e o link não saiu", e a intenção sempre foi MANDAR O LINK — não
// recomeçar a conversa.
//
// A dedução: `interpretar` a partir do zero enfileira tudo até o primeiro passo
// de espera e para NELE. Como a boas-vindas comprovadamente saiu, tudo até esse
// passo já foi entregue, e o que veio depois nunca chegou a ser enfileirado.
//
//   `dm` de resposta rápida → retoma do SEGUINTE. O que ela esperava era o
//     toque no botão, que não veio; o texto que a pessoa mandou vale como
//     resposta, do mesmo jeito que no ramo do cursor.
//   portão de follow ou pedido de e-mail → retoma DELE MESMO, para o portão
//     reconsultar a Meta e o e-mail ser reavaliado. Pular entregaria o link a
//     quem não segue.
//
// O CRITÉRIO CONSERVADOR, e por que ele existe: a dedução acima só vale
// enquanto houver no máximo UMA parada dura na lista (ver `contarParadasDuras`).
// É o que toda lista gravada pelo formulário tem hoje — a boas-vindas é a única
// `dm` com rótulo e sem url —, mas a Fase 1b deixa montar a lista livremente, e
// com duas `dm` de resposta rápida seguidas a dedução vira mentira: a pessoa
// pode ter tocado no primeiro botão, recebido a segunda `dm` e travado ALI. Como
// nenhuma dessas duas é `dm_link`, `shouldFallbackFollowup` continua dizendo sim
// a cada mensagem, e retomar do índice deduzido REENVIA a segunda — mensagem
// repetida para pessoa real.
//
// Havendo mais de uma, não retoma nada. Mandar nada é recuperável: a pessoa
// manda outra mensagem, ou toca no botão que ainda está lá. Mandar de novo o que
// já foi mandado não é.
//
// Os portões ficam fora da conta de propósito: o fallback retoma DELES MESMOS,
// sem afirmar nada sobre o que veio depois, e reenviá-los é o comportamento
// pretendido — o portão só é portão se cada tentativa reconsultar.
//
// Sem passo de espera nenhum, a lista teria sido enfileirada inteira — link
// incluído — e `shouldFallbackFollowup` não teria dito sim. Se ainda assim
// acontecer, também não retoma nada: repetir a lista manda mensagem repetida.
export function retomadaDoFallback(passos: unknown): number | null {
  const { pararEm } = interpretar(passos, 0);
  if (pararEm === null) return null;
  if (Array.isArray(passos) && contarParadasDuras(passos) > 1) return null;
  const passo = passoEsperado(passos, pararEm);
  return passo?.tipo === "dm" ? pararEm + 1 : pararEm;
}

// Quem está parado esperando o toque num botão pode ser interrompido por outra
// automação? Só quando duas coisas valem ao mesmo tempo.
//
// Veio de lib/engine.ts pelo mesmo motivo de `retomadaDoFallback`: é decisão
// pura, e decisão pura sem teste é onde os defeitos apareceram. Recebe só
// `{ id, match_type }` — o bastante para decidir, e nada que arraste o tipo
// `Automation` (lib/db.ts, `server-only`) para dentro deste arquivo.
//
// A PRIMEIRA é que a automação casada seja OUTRA. Comparar por id, e não só
// perguntar "casou com alguma?", é o ponto: quando a pessoa repete a palavra-
// chave da automação em que ela já está parada, isso não é pedido de outra
// coisa, é a mesma conversa continuando — e ela tem que retomar do cursor. Sem
// a comparação, esse caso caía no fluxo normal e reinterpretava a lista do
// índice 0: parava de novo na boas-vindas, regravava o cursor em 0 e não
// enfileirava nada, porque a boas-vindas do dia já estava na fila com a mesma
// `passoKey` e o `on conflict do nothing` engolia o item. Nenhuma mensagem
// saía, o cursor não andava, e cada nova mensagem repetia o mesmo nada — até
// virar o dia, quando a chave mudava de balde e a boas-vindas saía OUTRA VEZ
// para uma pessoa real, com o link ainda sem sair. Basta a pessoa repetir a
// palavra-chave para cair nisso, e a palavra-chave é justamente o que ela
// acabou de ler na boas-vindas.
//
// A SEGUNDA é que a automação nova NÃO seja `match_type: "any"`. A distinção é
// entre "pediu outra coisa" e "caiu na rede": palavra-chave específica é um
// pedido explícito — a pessoa digitou aquilo, e interromper é atendê-la. Já
// "Qualquer texto" não é escolha de ninguém, é rede de arrasto: casa com toda
// mensagem, de todo mundo, sempre. Se ela pudesse interromper, sequestraria
// todo contato parado no meio de qualquer outro fluxo, e ninguém chegaria ao
// link. Pega-tudo serve para quem não tem dono; quem está no meio de uma
// conversa já tem.
export function interrompeOFluxo(
  casada: { id: string; match_type: string } | undefined,
  parada: { id: string }
): boolean {
  if (!casada) return false;
  if (casada.id === parada.id) return false;
  return casada.match_type !== "any";
}
