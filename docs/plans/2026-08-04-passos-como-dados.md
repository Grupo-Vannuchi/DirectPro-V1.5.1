# Passos como dados: plano de implementação (Fase 1a)

> **Para quem for executar:** as etapas usam `- [ ]` para acompanhamento. Cada
> tarefa termina em algo verificável por conta própria.

**Objetivo:** tirar a sequência do fluxo de dentro do `lib/engine.ts` e colocá-la
numa lista ordenada de passos, executada por um interpretador — sem mudar uma
linha da tela.

**Arquitetura:** o interpretador é **função pura**: recebe a lista de passos e o
índice onde parar de pular, devolve o que enfileirar e onde parou. Ele não toca
banco, não chama a Meta, não conhece a fila. O motor vira a casca que lê o
cursor, chama o interpretador e enfileira o que ele mandar.

**Decisões e justificativas:** [docs/specs/2026-08-04-passos-como-dados.md](../specs/2026-08-04-passos-como-dados.md)

**Ferramentas:** TypeScript, Vitest, Postgres 17 (Supabase), Next.js 16.

## Restrições globais

- **Identificadores em inglês, comentários em português**, como no resto do
  projeto. Os tipos de passo são exceção deliberada: `dm`, `esperar`,
  `pedir_follow` — o domínio é escrito em português e a lista é lida por quem
  monta automação, não só por quem programa.
- **A TELA NÃO MUDA nesta fase.** `app/automacoes/form.tsx`,
  `phone-preview.tsx` e `list-client.tsx` não são tocados. Se algum deles
  aparecer num diff, a tarefa saiu do escopo.
- **A suíte cobre função pura e não abre conexão com banco.** É decisão
  registrada. O interpretador foi desenhado puro justamente para caber nela; o
  resto se verifica exercitando fluxo real.
- **Schema evolui pelo array `DDL` de `lib/db.ts`**, com `if not exists`. Não há
  ferramenta de migração.
- **Nada de código de migração de dados.** A única automação existente é de
  teste e será apagada. Escrever tradução para zero linhas é código morto.
- **`npm run verify` verde** antes de todo commit, lendo o código de saída de
  verdade: `$out = npm run verify 2>&1 | Out-String; $LASTEXITCODE`. Num pipe
  para `Select-String` o código se perde e um build quebrado passa por bom.

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/steps.ts` | **criar** — os tipos de passo e o interpretador puro |
| `tests/steps.test.ts` | **criar** — os testes do interpretador |
| `lib/db.ts` | **modificar** — coluna `steps` e coluna `flow_step_index` |
| `app/automacoes/actions.ts` | **modificar** — o formulário passa a gravar passos |
| `lib/engine.ts` | **modificar** — o motor executa o que o interpretador manda |

`lib/steps.ts` existe separado de propósito: é a peça mais arriscada da mudança e
a única testável sem banco. Misturá-la ao `engine.ts` perderia isso.

---

## Tarefa 1: Os tipos e o interpretador

**Arquivos:**
- Criar: `lib/steps.ts`
- Criar: `tests/steps.test.ts`

**Interfaces:**
- Produz: `type Passo`, `type Resultado`, `interpretar(passos: unknown, deIndice: number): Resultado`

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/steps.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { interpretar } from "../lib/steps";

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
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/steps.test.ts
```

Esperado: falha com `Failed to resolve import "../lib/steps"`.

- [ ] **Passo 3: Escrever o interpretador**

Criar `lib/steps.ts`:

```ts
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

// Passos que PARAM o fluxo: mandam o pedido e esperam a pessoa responder.
const ESPERAM = new Set(["pedir_follow", "pedir_email"]);

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

    if (ESPERAM.has(passo.tipo)) {
      r.pararEm = i;
      return r;
    }
  }

  return r;
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/steps.test.ts
```

Esperado: 10 testes passando.

- [ ] **Passo 5: Verificar e commitar**

```bash
npm run verify
git add lib/steps.ts tests/steps.test.ts
git commit -m "O fluxo da automacao vira dado, com interpretador puro

Antes a sequencia morava dentro do engine: advanceFlow chamava followGate, que
chamava enqueueFollowups, nessa ordem e so nessa. Isso punha um teto na tela —
um editor de blocos sobre aquele motor so poderia arrastar dois blocos.

O interpretador recebe a lista e o indice, devolve o que enfileirar e onde
parou. Nao toca banco, nao chama a Meta, nao conhece a fila: e a peca mais
arriscada da mudanca e agora e a unica testavel sem banco, o que importa numa
suite que nao abre conexao.

esperar nao e enfileirado — soma no atraso dos passos seguintes. A fila ja
funciona assim, entao espera como passo custa zero mudanca no dreno.

Lista invalida nao estoura: pula e diz o motivo. Automacao mal montada tem que
virar linha em Atividade, nao excecao que derruba o webhook e faz a Meta
reenviar o mesmo evento por 36 horas."
```

---

## Tarefa 2: A coluna dos passos e o cursor

**Arquivos:**
- Modificar: `lib/db.ts` (fim do array `DDL`)

**Interfaces:**
- Produz: `automations.steps jsonb`, `contacts.flow_step_index int`

- [ ] **Passo 1: Acrescentar as duas colunas**

Em `lib/db.ts`, no fim do array `DDL` (depois de `events_media_idx`):

```ts
  // O fluxo da automação como lista ordenada de passos. Substitui a sequência
  // que estava codificada no engine e as colunas que a alimentavam.
  //
  // jsonb e não tabela: a lista é sempre lida e gravada inteira, a ordem é o
  // próprio índice, e não há consulta que precise de um passo isolado.
  `alter table automations add column if not exists steps jsonb not null default '[]'::jsonb`,
  // Em que passo desta pessoa o fluxo parou, esperando resposta. Junto com
  // last_automation_id, que já existe, responde "qual automação e onde".
  // Nulo = não está no meio de nada.
  //
  // Substitui `awaiting`, que só sabia guardar 'follow' ou 'email' porque só
  // havia dois lugares onde parar. Com passos como dados, os lugares são
  // quantos a lista tiver.
  `alter table contacts add column if not exists flow_step_index int`,
```

- [ ] **Passo 2: Acrescentar `steps` ao tipo `Automation`**

Sem isto o `auto.steps` da Tarefa 4 não compila. Em `lib/db.ts`, no `type
Automation`, logo depois de `story_reaction: string;` (linha 181):

```ts
  // O fluxo como lista ordenada. `unknown[]` de propósito: o que vem do banco
  // não tem garantia de forma, e quem valida é o interpretador de lib/steps.ts.
  // Tipar como Passo[] aqui seria afirmar uma garantia que o jsonb não dá.
  steps: unknown[];
```

- [ ] **Passo 3: Conferir que as colunas existem**

```bash
npm run dev
```

Abrir `http://localhost:3000/automacoes` — a página carrega, o que significa que
o `ensureSchema` rodou. Parar o servidor e conferir:

```bash
node -e "
import('postgres').then(async ({default: postgres})=>{
  const fs=await import('node:fs');
  const sql=postgres(fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim(),{prepare:false,ssl:'require',max:1});
  const a=await sql\`select column_name, data_type from information_schema.columns where table_name='automations' and column_name='steps'\`;
  const c=await sql\`select column_name, data_type from information_schema.columns where table_name='contacts' and column_name='flow_step_index'\`;
  console.log('automations.steps      :', a[0] ? a[0].data_type : 'AUSENTE');
  console.log('contacts.flow_step_index:', c[0] ? c[0].data_type : 'AUSENTE');
  await sql.end();
});"
```

Esperado: `jsonb` e `integer`.

- [ ] **Passo 4: Verificar e commitar**

```bash
npm run verify
git add lib/db.ts
git commit -m "Duas colunas: a lista de passos e onde a pessoa parou

steps guarda o fluxo da automacao como lista ordenada. jsonb e nao tabela: a
lista e sempre lida e gravada inteira, a ordem e o proprio indice, e nenhuma
consulta precisa de um passo isolado.

flow_step_index substitui awaiting, que so sabia guardar 'follow' ou 'email'
porque so havia dois lugares onde o fluxo podia parar. Com passos como dados os
lugares sao quantos a lista tiver.

awaiting continua no banco, sem ser lida, ate 11/08 — mesmo prazo que o Neon
teve na migracao. E o caminho de volta."
```

---

## Tarefa 3: O formulário grava passos

A tela não muda. O que muda é o que a ação de salvar escreve: além das colunas de
sempre, ela monta a lista de passos equivalente.

Gravar nos dois lugares é deliberado: a Tarefa 4 troca quem o motor lê, e manter
as colunas antigas escritas é o que permite reverter aquela tarefa sozinha.

**Arquivos:**
- Modificar: `app/automacoes/actions.ts`

**Interfaces:**
- Consome: `type Passo` de `lib/steps.ts`
- Produz: toda automação salva passa a ter `steps` preenchido

- [ ] **Passo 1: Escrever a montagem da lista**

Em `app/automacoes/actions.ts`, acrescentar o import no topo:

```ts
import type { Passo } from "@/lib/steps";
```

E acrescentar esta função antes da action que salva:

```ts
// Monta a lista de passos a partir dos campos do formulário.
//
// A ordem aqui é EXATAMENTE a que o engine executava codificada — é isso que
// faz a Tarefa 4 não mudar comportamento nenhum. Quando o editor de blocos
// chegar (Fase 1b), esta função sai: a lista virá pronta da tela.
function montarPassos(f: {
  triggers: string[];
  publicReplies: string[];
  welcomeText: string;
  quickReplyLabel: string;
  storyReaction: string;
  requireFollow: boolean;
  followText: string;
  followButtonLabel: string;
  askEmail: boolean;
  emailText: string;
  followups: { kind: string; text: string; button_label: string | null; url: string | null; delay_minutes: number }[];
}): Passo[] {
  const passos: Passo[] = [];

  // Reação ao story vem antes de tudo: é o coraçãozinho instantâneo.
  if (f.triggers.includes("story") && f.storyReaction) {
    passos.push({ tipo: "reagir_story", emoji: f.storyReaction });
  }
  if (f.triggers.includes("comment") && f.publicReplies.length) {
    passos.push({ tipo: "resposta_publica", textos: f.publicReplies });
  }
  if (f.welcomeText.trim()) {
    passos.push({
      tipo: "dm",
      texto: f.welcomeText,
      botao_label: f.quickReplyLabel || undefined,
    });
  }
  if (f.requireFollow) {
    passos.push({
      tipo: "pedir_follow",
      texto: f.followText || "Antes de te mandar o link, me segue lá no perfil 🙏",
      botao_label: f.followButtonLabel || "Já sigo! ✅",
    });
  }
  if (f.askEmail) {
    passos.push({
      tipo: "pedir_email",
      texto: f.emailText || "Me manda seu melhor e-mail que eu te envio o link 👇",
    });
  }
  // O atraso do followup deixa de ser propriedade dele e vira passo próprio.
  for (const fu of f.followups) {
    if (fu.delay_minutes > 0) passos.push({ tipo: "esperar", minutos: fu.delay_minutes });
    if (fu.text.trim()) {
      passos.push({
        tipo: "dm",
        texto: fu.text,
        botao_label: fu.button_label || undefined,
        url: fu.url || undefined,
      });
    }
  }

  return passos;
}
```

- [ ] **Passo 2: Gravar a lista ao salvar**

Ainda em `app/automacoes/actions.ts`. O array `params` termina em
`storyReaction` (por volta da linha 96) e é usado nas duas consultas. Logo depois
de `let automationId = id;`, montar a lista:

```ts
  const passos = montarPassos({
    triggers,
    publicReplies,
    welcomeText,
    quickReplyLabel,
    storyReaction,
    requireFollow,
    followText,
    followButtonLabel,
    askEmail,
    emailText,
    followups,
  });
```

Use os nomes de variável que a action já tem em mãos naquele ponto — se algum
diferir do usado acima, ajuste a chamada, não a assinatura de `montarPassos`.

No `update automations set`, o array passa a ser `[...params, passos, id,
accountId]`. Como `params` ocupa `$1`–`$24`, isso põe `passos` em `$25`, `id` em
`$26` e `accountId` em `$27`. A consulta inteira fica:

```ts
      `update automations set
         name = $1, active = $2, triggers = $3, keywords = $4, match_type = $5,
         media_id = $6, media_thumbnail_url = $7, media_caption = $8,
         story_id = $9, story_thumbnail_url = $10,
         public_replies = $11, welcome_text = $12, quick_reply_label = $13,
         link_text = $14, link_button_label = $15, link_url = $16,
         reminder_text = $17, reminder_delay_minutes = $18,
         require_follow = $19, follow_text = $20, follow_button_label = $21,
         ask_email = $22, email_text = $23, story_reaction = $24,
         steps = $25, updated_at = now()
       where id = $26 and account_id = $27`,
      [...params, passos, id, accountId]
```

No `insert into automations`, o array passa a ser `[...params, accountId,
passos]` — `accountId` em `$25` (como já era) e `passos` em `$26`:

```ts
      `insert into automations
         (account_id, name, active, triggers, keywords, match_type, media_id, media_thumbnail_url,
          media_caption, story_id, story_thumbnail_url, public_replies, welcome_text,
          quick_reply_label, link_text, link_button_label, link_url, reminder_text,
          reminder_delay_minutes, require_follow, follow_text, follow_button_label,
          ask_email, email_text, story_reaction, steps)
       values ($25,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21,$22,$23,$24,$26)
       returning id`,
      [...params, accountId, passos]
```

`passos` vai **cru**, sem `JSON.stringify`. O motivo está registrado no projeto:
o driver tipa o parâmetro pela coluna de destino, e uma string pré-serializada
vira ESCALAR json — a contagem de linhas bateria e toda leitura por operador
jsonb quebraria em silêncio.

- [ ] **Passo 3: Salvar uma automação e conferir a lista**

```bash
npm run dev
```

Abrir `http://localhost:3000/automacoes`, criar uma automação com: gatilho DM,
palavra-chave `quero`, boas-vindas com botão, "pedir follow" ligado, um link e um
lembrete de 60 minutos. Salvar. Depois:

```bash
node -e "
import('postgres').then(async ({default: postgres})=>{
  const fs=await import('node:fs');
  const sql=postgres(fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim(),{prepare:false,ssl:'require',max:1});
  const [a]=await sql\`select name, steps from automations order by created_at desc limit 1\`;
  console.log('automacao:', a.name);
  console.log('steps e objeto?', typeof a.steps === 'object' && Array.isArray(a.steps) ? 'sim (array)' : 'NAO -> virou escalar json');
  for (const [i,p] of (a.steps||[]).entries()) console.log('  ', i, p.tipo, JSON.stringify(p).slice(0,60));
  await sql.end();
});"
```

Esperado, nesta ordem: `dm` (boas-vindas), `pedir_follow`, `dm` (link),
`esperar`, `dm` (lembrete). E `steps e objeto? sim (array)`.

- [ ] **Passo 4: Verificar e commitar**

```bash
npm run verify
git add app/automacoes/actions.ts
git commit -m "O formulario passa a gravar a lista de passos

A tela nao muda. O que muda e o que a acao de salvar escreve: alem das colunas
de sempre, ela monta a lista equivalente em steps.

A ordem que montarPassos produz e exatamente a que o engine executava
codificada. E isso que faz a proxima tarefa nao mudar comportamento nenhum —
ela so troca de onde a ordem vem.

Gravar nos dois lugares e deliberado: manter as colunas antigas escritas e o que
permite reverter a troca do motor sozinha, sem perder o que foi salvo no meio.

Valores crus, sem JSON.stringify: o driver tipa o parametro pela coluna de
destino, e string pre-serializada vira escalar json — a contagem bateria e toda
leitura por operador jsonb quebraria."
```

---

## Tarefa 4: O motor executa a lista

A troca de verdade. `advanceFlow`, `followGate` e `enqueueFollowups` deixam de
codificar a sequência e passam a executar o que o interpretador devolve.

**Arquivos:**
- Modificar: `lib/engine.ts` (linhas 267-388 e 495-553)

**Interfaces:**
- Consome: `interpretar` de `lib/steps.ts`; `automations.steps` e
  `contacts.flow_step_index` da Tarefa 2

- [ ] **Passo 1: Trocar o executor**

Em `lib/engine.ts`, acrescentar aos imports do topo:

```ts
import { interpretar, type Passo, type AcaoEnfileirar } from "@/lib/steps";
import { passoKey } from "@/lib/dedupe";
```

`passoKey` entra junto das chaves que o arquivo já importa de `lib/dedupe.ts`
(`followGateKey`, `emailAskKey`, `emailAnswerKey`, `followupKey`); acrescente ao
import existente em vez de criar um segundo.

Depois, substituir as funções `followGate`, `advanceFlow` e `enqueueFollowups`
por um executor único:

```ts
// Executa o fluxo desta automação a partir de `deIndice`.
//
// A sequência não está mais aqui: ela vem de `auto.steps`, e quem decide o que
// fazer é o interpretador puro de lib/steps.ts. Esta função é só a casca que
// toca banco, chama a Meta e enfileira.
// `contexto` carrega os ids que só o gatilho conhece. Sem ele, `resposta_publica`
// e `reagir_story` não teriam como ser enfileirados aqui e continuariam tratados
// à parte, lendo as colunas antigas — a lista teria dois passos decorativos e o
// fluxo não seria dado de verdade.
export type ContextoGatilho = { commentId?: string; messageId?: string };

async function executarFluxo(
  account: Account,
  auto: Automation,
  contactIgId: string,
  deIndice: number,
  contexto: ContextoGatilho = {}
): Promise<void> {
  const r = interpretar(auto.steps, deIndice);

  // Passo mal montado vira linha em Atividade, não exceção. Automação quebrada
  // não pode derrubar o webhook: a Meta reenviaria o evento por 36 horas.
  for (const ig of r.ignorados) {
    await logEvent(account.ig_user_id, "step_ignorado", {
      automation_id: auto.id,
      indice: ig.indice,
      motivo: ig.motivo,
    });
  }

  for (const acao of r.enfileirar) {
    const p = acao.passo;

    if (p.tipo === "pedir_follow") {
      // O portão é o único passo que consulta a Meta antes de decidir.
      const passou = await resolverFollow(account, auto, contactIgId, p, acao.indice);
      if (passou) continue;
      await gravarCursor(account.ig_user_id, contactIgId, auto.id, acao.indice);
      return;
    }

    if (p.tipo === "pedir_email") {
      const rows = (await sql().query(
        `select email from contacts where account_id = $1 and ig_id = $2`,
        [account.ig_user_id, contactIgId]
      )) as { email: string | null }[];
      if (rows[0]?.email) continue;
      await enqueue({
        account_id: account.ig_user_id,
        kind: "dm_email_ask",
        contact_ig_id: contactIgId,
        automation_id: auto.id,
        payload: { text: p.texto },
        dedupe_key: emailAskKey(auto.id, contactIgId, dayBucket()),
      });
      await gravarCursor(account.ig_user_id, contactIgId, auto.id, acao.indice);
      return;
    }

    await enfileirarPasso(account, auto, contactIgId, acao, contexto);
  }

  // A lista acabou: esta pessoa não está mais no meio de nada.
  await limparCursor(account.ig_user_id, contactIgId);
}
```

E as auxiliares, no mesmo arquivo:

```ts
async function gravarCursor(
  accountId: string,
  contactIgId: string,
  automationId: string,
  indice: number
) {
  await sql().query(
    `update contacts set flow_step_index = $3, last_automation_id = $4
     where account_id = $1 and ig_id = $2`,
    [accountId, contactIgId, indice, automationId]
  );
}

async function limparCursor(accountId: string, contactIgId: string) {
  await sql().query(
    `update contacts set flow_step_index = null where account_id = $1 and ig_id = $2`,
    [accountId, contactIgId]
  );
}

// Enfileira um passo que não espera resposta.
async function enfileirarPasso(
  account: Account,
  auto: Automation,
  contactIgId: string,
  acao: AcaoEnfileirar,
  contexto: ContextoGatilho
) {
  const p = acao.passo;
  const base = {
    account_id: account.ig_user_id,
    contact_ig_id: contactIgId,
    automation_id: auto.id,
    delaySeconds: acao.atrasoSegundos,
  };

  if (p.tipo === "dm") {
    await enqueue({
      ...base,
      kind: "dm_link",
      payload: { text: p.texto, button_label: p.botao_label ?? null, url: p.url ?? null },
      dedupe_key: passoKey(auto.id, contactIgId, acao.indice, dayBucket()),
    });
    return;
  }

  if (p.tipo === "resposta_publica") {
    // Só faz sentido quando o gatilho foi comentário: sem o id, não há o que
    // responder. Numa automação de DM este passo simplesmente não acontece —
    // e isso é comportamento, não erro, então não vira `step_ignorado`.
    if (!contexto.commentId) return;
    await enqueue({
      ...base,
      kind: "comment_reply",
      comment_id: contexto.commentId,
      payload: { text: pickRandom(p.textos) },
      dedupe_key: commentReplyKey(contexto.commentId),
    });
    return;
  }

  if (p.tipo === "reagir_story") {
    // Mesma lógica: sem mensagem para reagir, o passo não acontece.
    if (!contexto.messageId) return;
    await enqueue({
      ...base,
      kind: "story_reaction",
      payload: { message_id: contexto.messageId, reaction: p.emoji },
      dedupe_key: storyReactionKey(contexto.messageId),
    });
    return;
  }
}
```

E a chave de deduplicação nova, em `lib/dedupe.ts`:

```ts
// Um passo por pessoa por dia. O índice entra na chave porque a mesma automação
// pode ter vários passos do mesmo tipo — dois lembretes, três DMs.
export function passoKey(
  automationId: string,
  contactIgId: string,
  indice: number,
  bucket: string
): string {
  return `passo:${automationId}:${contactIgId}:${indice}:${bucket}`;
}
```

- [ ] **Passo 2: Trocar quem retoma**

Em `lib/engine.ts`, dentro de `handleMessagingEvent`, substituir o bloco que lê
`awaiting` (linhas 514-553) por um que lê o cursor:

```ts
  // Esta pessoa está parada em algum passo?
  const estado = (await sql().query(
    `select flow_step_index, last_automation_id from contacts
     where account_id = $1 and ig_id = $2`,
    [account.ig_user_id, senderId]
  )) as { flow_step_index: number | null; last_automation_id: string | null }[];

  const parado = estado[0];
  if (parado?.flow_step_index !== null && parado?.flow_step_index !== undefined) {
    const auto = parado.last_automation_id
      ? await loadAutomation(account.ig_user_id, parado.last_automation_id)
      : undefined;
    if (auto) {
      const passo = (auto.steps as Passo[] | undefined)?.[parado.flow_step_index];

      if (passo?.tipo === "pedir_email") {
        const email = extractEmail(text);
        if (!email) {
          // Não parecia e-mail: pede de novo, uma vez por mensagem recebida.
          await enqueue({
            account_id: account.ig_user_id,
            kind: "dm_email_ask",
            contact_ig_id: senderId,
            automation_id: auto.id,
            payload: { text: "Acho que esse e-mail saiu errado 🤔 Me manda de novo, só o e-mail." },
            dedupe_key: emailAnswerKey(msg.mid, senderId, Date.now()),
          });
          return;
        }
        await sql().query(
          `update contacts set email = $3 where account_id = $1 and ig_id = $2`,
          [account.ig_user_id, senderId, email]
        );
      }

      // Qualquer mensagem vale como "quero continuar": retoma do passo seguinte.
      await executarFluxo(account, auto, senderId, parado.flow_step_index + 1);
    }
    return;
  }
```

E, nos dois pontos de resposta rápida (linhas 501-508), trocar
`advanceFlow(account, auto, senderId)` por:

```ts
      // `FOLLOW:` é o botão "já sigo": o passo de follow é reavaliado, então
      // retoma DELE, não do seguinte.
      const doIndice = payload.startsWith("FOLLOW:")
        ? ((await lerCursor(account.ig_user_id, senderId)) ?? 0)
        : 0;
      if (auto) await executarFluxo(account, auto, senderId, doIndice);
```

com:

```ts
async function lerCursor(accountId: string, contactIgId: string): Promise<number | null> {
  const rows = (await sql().query(
    `select flow_step_index from contacts where account_id = $1 and ig_id = $2`,
    [accountId, contactIgId]
  )) as { flow_step_index: number | null }[];
  return rows[0]?.flow_step_index ?? null;
}
```

- [ ] **Passo 3: Manter o portão de follow com o limite de tentativas**

O limite continua sendo regra do motor, não dado do passo — ele protege contra
virar spam, e isso não é escolha de quem monta a automação:

```ts
// Resolve o passo de follow: consulta a Meta e decide se o fluxo segue.
// Devolve true quando pode continuar.
async function resolverFollow(
  account: Account,
  auto: Automation,
  contactIgId: string,
  passo: { texto: string; botao_label: string },
  indice: number
): Promise<boolean> {
  const segue = await checkFollowsAccount(contactIgId, account.access_token);

  if (segue === null) {
    // A Meta não informou. Barrar aqui deixaria TODA a base presa caso o campo
    // fique indisponível — e o dono do painel só descobriria pelos clientes
    // reclamando. Libera e registra, para o erro aparecer em Atividade.
    await logEvent(account.ig_user_id, "follow_check_unavailable", {
      contact_ig_id: contactIgId,
      automation_id: auto.id,
    });
    return true;
  }
  if (segue) return true;

  const rows = (await sql().query(
    `update contacts set follow_attempts = follow_attempts + 1
     where account_id = $1 and ig_id = $2 returning follow_attempts`,
    [account.ig_user_id, contactIgId]
  )) as { follow_attempts: number }[];
  const tentativa = rows[0]?.follow_attempts ?? 1;

  if (tentativa <= MAX_FOLLOW_REQUESTS) {
    await enqueue({
      account_id: account.ig_user_id,
      kind: "dm_follow_gate",
      contact_ig_id: contactIgId,
      automation_id: auto.id,
      payload: {
        text:
          tentativa === 1
            ? passo.texto
            : "Ainda não consegui ver você na minha lista de seguidores 👀 Segue lá e toca no botão de novo.",
        quick_reply_label: passo.botao_label,
        quick_reply_payload: `FOLLOW:${auto.id}`,
      },
      dedupe_key: followGateKey(auto.id, contactIgId, dayBucket(), tentativa),
    });
  }
  return false;
}
```

- [ ] **Passo 4: Tirar o tratamento inline dos dois passos com contexto**

Agora que o executor enfileira `resposta_publica` e `reagir_story`, o tratamento
antigo vira duplicata — e duplicata que lê coluna, não a lista.

Em `handleCommentEvent` (por volta da linha 455), **remover** o bloco que monta
`comment_reply` a partir de `auto.public_replies`, e passar o id do comentário ao
executor:

```ts
  await executarFluxo(account, auto, fromId, 0, { commentId: value.id });
```

Em `handleMessagingEvent` (por volta da linha 560), **remover** o bloco que monta
`story_reaction` a partir de `auto.story_reaction`, e passar o id da mensagem:

```ts
  await executarFluxo(account, auto, senderId, 0, { messageId: msg.mid });
```

Use os nomes de variável que cada handler já tem em mãos para o id do comentário
e o do remetente — se diferirem de `value.id` e `fromId`, ajuste a chamada.

- [ ] **Passo 5: Trocar as chamadas restantes**

Procurar o que sobrou:

```bash
grep -n "advanceFlow\|enqueueFollowups\|awaiting\|auto.public_replies\|auto.story_reaction" lib/engine.ts
```

Esperado: nenhuma ocorrência. Cada uma que restar é uma chamada apontando para
função que não existe mais, ou uma leitura de coluna que deveria vir da lista.

- [ ] **Passo 6: Verificar**

```bash
npm run verify
```

Esperado: lint, typecheck, os testes (incluindo os 10 novos) e build passando.

- [ ] **Passo 7: Commitar**

```bash
git add lib/engine.ts lib/dedupe.ts
git commit -m "O motor executa a lista, em vez de conhecer a sequencia

advanceFlow, followGate e enqueueFollowups deixam de codificar a ordem. Agora o
interpretador puro le auto.steps e devolve o que enfileirar e onde parar; o
motor e so a casca que toca banco, chama a Meta e enfileira.

O cursor substitui awaiting. awaiting so sabia guardar 'follow' ou 'email'
porque so havia dois lugares onde parar; flow_step_index guarda qualquer indice,
entao a lista pode ter quantos pontos de espera quiser.

O limite de tentativas do follow continua regra do motor, nao dado do passo: ele
protege contra virar spam, e isso nao e escolha de quem monta a automacao. O
passo diz o que perguntar; o motor decide quantas vezes insistir.

Passo mal montado vira evento step_ignorado em Atividade, nao excecao —
automacao quebrada nao pode derrubar o webhook e fazer a Meta reenviar por 36h."
```

---

## Tarefa 5: Apagar a automação de teste e exercitar o fluxo

O interpretador tem teste; o motor não tem como ter, porque a suíte não abre
banco. Esta tarefa é a verificação que substitui isso — e ela não é opcional.

**Arquivos:** nenhum. Esta tarefa é de verificação.

- [ ] **Passo 1: Apagar a automação antiga**

Ela é de teste interno e não representa nada. Apagar evita confundir o que é
resultado da mudança com o que era resíduo:

```bash
node -e "
import('postgres').then(async ({default: postgres})=>{
  const fs=await import('node:fs');
  const sql=postgres(fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim(),{prepare:false,ssl:'require',max:1});
  const r=await sql\`delete from automations returning name\`;
  console.log('apagadas:', r.map(x=>x.name).join(', ') || 'nenhuma');
  await sql\`update contacts set flow_step_index = null, awaiting = null\`;
  console.log('cursores limpos');
  await sql.end();
});"
```

- [ ] **Passo 2: Montar uma automação completa pelo formulário**

`npm run dev`, abrir `/automacoes`, criar com: gatilho **DM**, palavra-chave
`quero`, boas-vindas com botão, **pedir follow ligado**, um link, e um lembrete
de **1 minuto** (não 60 — para o teste caber numa sessão).

- [ ] **Passo 3: Exercitar o fluxo de ponta a ponta**

Do perfil de teste `@jvsiqueira_` ou `@alicistica` — **e de nenhum outro** —
mandar `quero` por DM para a conta conectada.

Conferir, nesta ordem:

1. Chega a DM de boas-vindas com botão
2. Chega o pedido de follow (porque o gate está ligado)
3. O cursor foi gravado:

```bash
node -e "
import('postgres').then(async ({default: postgres})=>{
  const fs=await import('node:fs');
  const sql=postgres(fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim(),{prepare:false,ssl:'require',max:1});
  const r=await sql\`select username, flow_step_index, last_automation_id from contacts where flow_step_index is not null\`;
  for(const x of r) console.log('@'+x.username, 'parado no passo', x.flow_step_index);
  console.log(r.length ? 'cursor gravado' : 'NENHUM cursor — o fluxo nao parou onde devia');
  await sql.end();
});"
```

4. Tocar no botão "Já sigo!" — o fluxo retoma, o link chega
5. Um minuto depois, o lembrete chega
6. O cursor foi limpo:

```bash
node -e "
import('postgres').then(async ({default: postgres})=>{
  const fs=await import('node:fs');
  const sql=postgres(fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim(),{prepare:false,ssl:'require',max:1});
  const [r]=await sql\`select count(*)::int n from contacts where flow_step_index is not null\`;
  console.log('pessoas ainda paradas:', r.n, r.n===0 ? '(certo: o fluxo terminou)' : '(o cursor nao foi limpo)');
  const q=await sql\`select kind, status, payload->>'text' t from queue order by created_at desc limit 6\`;
  for(const x of q) console.log('  ', x.status.padEnd(7), x.kind.padEnd(14), JSON.stringify((x.t||'').slice(0,32)));
  await sql.end();
});"
```

Esperado: `pessoas ainda paradas: 0` e os itens da fila todos `sent`.

- [ ] **Passo 4: Conferir que passo inválido não derruba nada**

```bash
node -e "
import('postgres').then(async ({default: postgres})=>{
  const fs=await import('node:fs');
  const sql=postgres(fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim(),{prepare:false,ssl:'require',max:1});
  const [a]=await sql\`select id, steps from automations limit 1\`;
  const quebrado=[...a.steps, {tipo:'inventado'}];
  await sql\`update automations set steps = \${sql.json(quebrado)} where id = \${a.id}\`;
  console.log('passo invalido acrescentado — mande a palavra-chave de novo e confira /eventos');
  await sql.end();
});"
```

Mandar a palavra-chave de novo pelo perfil de teste. Esperado: o fluxo roda
normalmente, e aparece um evento `step_ignorado` em `/eventos` com o motivo. O
webhook **não** pode devolver erro.

- [ ] **Passo 5: Registrar o resultado**

Acrescentar ao fim de `docs/specs/2026-08-04-passos-como-dados.md` uma seção
"Resultado" com: a data, o que foi exercitado, o que quebrou (se algo quebrou), e
a data em que as colunas órfãs podem sair.

```bash
git add docs/specs/2026-08-04-passos-como-dados.md
git commit -m "Registra o resultado da troca do motor para passos"
```

---

## O que este plano não faz

**O editor de blocos.** É a Fase 1b, e o motivo de ela vir depois é que um motor
novo com uma tela nova em cima esconde qual dos dois quebrou.

**Ramificação.** Fase 2. O cursor desenhado aqui é o que a torna viável: ramificar
é o cursor poder ir para mais de um lugar.

**Apagar as colunas órfãs.** `welcome_text`, `link_url`, `reminder_delay_minutes`
e as outras, mais a tabela `followups` e a coluna `awaiting`, ficam até 11/08.
Apagar no mesmo dia tira o caminho de volta.

**Tipos de passo novos** — mandar imagem, esperar por dias, chamar API. Cada um é
trabalho próprio.
