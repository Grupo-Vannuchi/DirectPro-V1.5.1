# Automações como passos: o motor deixa de ter o fluxo escrito nele

**Data:** 04/08/2026
**Estado:** aprovado
**Base:** `24d7607`
**Fase:** 1a de duas. A 1b é o editor de blocos; a Fase 2, ramificação.

---

## O problema

Montar uma automação hoje é preencher um formulário de 612 linhas com uma
prévia ao lado. O pedido foi deixar isso em blocos, no estilo n8n.

Investigando o motor antes de desenhar a tela, apareceu o que decide tudo:
**o fluxo não é dado, é código.** `lib/engine.ts` executa uma sequência fixa:

```
gatilho → resposta pública → DM de boas-vindas → pedir follow → pedir e-mail → followups
```

Só os `followups` são ordenáveis, porque só eles têm `position` numa tabela. Os
portões estão codificados em `advanceFlow`, um chamando o outro.

Isso põe um teto na tela: um editor de blocos sobre esse motor só poderia
arrastar dois blocos. Arrastar os outros mostraria uma ordem que o motor não
executa — uma interface que mente.

## A escolha, e o que ela custa

Perguntado se queria a aparência de blocos ou a capacidade de reordenar de
verdade, a resposta foi a segunda: **o motor se ajusta junto.**

Isso deixa de ser trabalho de interface. O que era uma reorganização de tela
vira a troca do que executa as automações.

**O momento é o mais barato que vai existir.** Levantado no banco:

| | |
|---|---|
| Automações | **1**, chamada "teste" |
| Contatos no meio de um fluxo | **0** |
| Itens de fila pendentes | **0** |

A automação existente é de teste interno e **será apagada** antes da virada.
Não há o que migrar, e por isso não se escreve código de migração — seria
lógica de tradução para zero linhas. Cada semana de uso real encarece isso.

---

## O que é um passo

Uma lista ordenada em `automations.steps`, do tipo `jsonb`. Escolhido em vez de
tabela porque a lista é sempre lida e gravada inteira, a ordem é o índice, e o
projeto já trata `jsonb` bem.

| tipo | campos | comportamento |
|---|---|---|
| `resposta_publica` | `textos: string[]` | enfileira |
| `dm` | `texto`, `botao_label?`, `url?` | enfileira, e **espera** quando tem `botao_label` e não tem `url` |
| `esperar` | `minutos` | enfileira |
| `reagir_story` | `emoji` | enfileira |
| `pedir_follow` | `texto`, `botao_label` | **espera** |
| `pedir_email` | `texto` | **espera** |

O caso da `dm` não é exceção: um passo espera resposta quando **pede** alguma
coisa. `dm` com rótulo de botão e sem url é uma resposta rápida, e resposta
rápida existe para ser tocada; com url é botão de link — a pessoa abre e a vida
segue, sem nada para esperar.

Sem isso a lista não conseguiria dizer o que o fluxo antigo fazia: a DM de
boas-vindas saía com um botão de resposta rápida e **só depois do toque** o fluxo
ia para o portão de follow. Numa lista sem esse conceito, o executor corre do
índice 0 até o portão e consulta a Meta antes de a pessoa ter engajado — gastando
chamada de API com quem nunca respondeu, e perdendo o degrau que o toque era.

A distinção não foi inventada para isso: é exatamente como o formulário já grava
— boas-vindas com rótulo e sem url, link com rótulo e com url.

O gatilho fica **fora** da lista, nas colunas que já existem (`triggers`,
`keywords`, `match_type`, `media_id`). Ele não é um passo: é o que faz a lista
começar.

### Duas unificações que dão o poder de verdade

**`dm` absorve três tipos.** Hoje `dm_welcome`, `dm_link` e `dm_reminder` são
distintos no código e fazem a mesma coisa: mandar texto com botão opcional. Como
um tipo só, a automação pode ter três DMs ou nenhuma — hoje ela tem exatamente
as que o formulário previu.

**`esperar` vira passo.** Hoje o atraso é campo dentro do lembrete
(`followups.delay_minutes`). Como passo próprio, a espera vai a qualquer lugar,
inclusive antes do link — impossível hoje.

Sem essas duas, o editor de blocos seria o mesmo formulário com bordas.

---

## O interpretador

O motor deixa de conhecer a sequência e passa a executá-la:

```
para cada passo a partir do cursor:
    passo que ENFILEIRA  → enfileira e segue para o próximo
    passo que ESPERA     → enfileira o pedido, grava o cursor, PARA
lista acabou             → limpa o cursor
```

Quando a pessoa responde, o motor lê o cursor, resolve aquele passo — confere se
já segue, valida o e-mail — e retoma **do passo seguinte**. A exceção é o
`pedir_follow`: dele se retoma **dele mesmo**, para a consulta à Meta acontecer
de novo. O portão só é portão se cada tentativa reconsultar — retomando do
seguinte, bastaria mandar "ok" para pular o passo e receber o link sem nunca ter
seguido.

### O que o interpretador faz quando a lista está errada

Lista vazia, tipo desconhecido, campo faltando: **pula o passo e registra um
evento**, em vez de estourar. Uma automação mal montada tem que virar uma linha
em Atividade, não uma exceção que derruba o webhook e faz a Meta reenviar o
mesmo evento por 36 horas.

O formulário não consegue produzir lista inválida — ele monta a partir de campos
conhecidos. Mas o `jsonb` é editável por fora, e a Fase 1b vai gerar listas bem
mais variadas.

### Onde mora o limite de tentativas do follow

Hoje `MAX_FOLLOW_REQUESTS` limita quantas vezes o portão insiste, contando em
`contacts.follow_attempts`. Isso **não** vira dado do passo: continua sendo
regra do motor, aplicada ao resolver um `pedir_follow`.

O motivo é que o limite protege contra virar spam, e isso não é escolha de quem
monta a automação. Passo diz o que perguntar; o motor decide quantas vezes é
aceitável insistir.

### O cursor

Hoje `contacts.awaiting` guarda `'follow'` ou `'email'`: dois valores fixos,
porque só há dois lugares onde parar. Com passos como dados, os lugares são
quantos a lista tiver.

Vira uma coluna nova, `contacts.flow_step_index int`. Junto com
`last_automation_id`, que já existe, ela responde "qual automação e em que
ponto". Nula significa "não está no meio de nada".

`awaiting` fica no banco por 7 dias sem ser lida, como o Neon ficou na migração:
é o caminho de volta se algo aparecer que ninguém previu.

---

## O que NÃO muda

E isso é o que mantém o raio de alcance pequeno:

| | |
|---|---|
| A fila e o dreno | os mesmos `kind`, o mesmo `enqueue` |
| A janela de 24h | intocada |
| A deduplicação | as mesmas chaves |
| Webhooks e inbox | nada |
| **O formulário atual** | continua funcionando, agora lendo e gravando passos |

A última linha é a parte importante da Fase 1a: **a tela não muda.** O
formulário passa a montar uma lista de passos em vez de preencher 28 colunas, e
quem usa o painel não vê diferença. Se o motor novo estiver errado, o erro
aparece sem uma interface nova em cima confundindo o diagnóstico.

É o mesmo princípio que funcionou na migração do banco: separar a mudança
arriscada da mudança visível, para saber qual das duas quebrou.

---

## Riscos

**O interpretador é o motor.** Se ele errar, automação não dispara — e o sintoma
é silêncio, não erro. É por isso que a 1a existe separada, e por isso a
verificação exercita fluxo real ponta a ponta, não só função pura.

**Os 141 testes não cobrem isto.** A suíte é de função pura por decisão
registrada. Mas o interpretador **é** função pura se receber a lista de passos e
o cursor e devolver "o que enfileirar e onde parar" — sem tocar em banco. Isso é
desenho deliberado: a peça mais arriscada da mudança passa a ser a única
testável sem banco.

**Colunas órfãs.** `welcome_text`, `link_url`, `reminder_delay_minutes` e as
outras 20 deixam de ser lidas. Ficam por 7 dias e saem depois, junto com a
tabela `followups`. Apagar no mesmo dia tira o caminho de volta.

---

## Fora de escopo

**O editor de blocos (Fase 1b).** É o objetivo, e vem em seguida — sobre um
motor já provado.

**Ramificação (Fase 2).** Caminhos diferentes conforme a resposta. O cursor
desenhado aqui é o que torna isso viável depois: ramificar é o cursor poder ir
para mais de um lugar.

**Tipos de passo que não existem hoje** — mandar imagem, esperar por dias,
chamar API externa. Cada um é trabalho próprio.

**React Flow.** Entra na Fase 2, quando houver ramificação para desenhar. Para
uma corrente linear, uma tela com zoom e pan é mais trabalho para fazer o que
uma lista faz melhor.
