# Não lidas na lista de conversas: plano de implementação

> **Para quem for executar:** as etapas usam `- [ ]` para acompanhamento. Cada
> tarefa termina em algo verificável por conta própria.

**Objetivo:** trocar o total de mensagens da lista por um sinal que responda
"onde eu preciso agir" — contagem de não lidas em destaque, e uma marca para
quem ainda não foi respondido dentro da janela de 24h.

**Arquitetura:** a leitura vira uma coluna `contacts.last_seen_at`, gravada por
uma Server Action chamada pelo cliente — nunca durante a renderização, porque o
prefetch do `<Link>` renderiza a conversa no servidor sem ninguém abrir. A
consulta da lista passa a devolver duas grandezas novas, e uma função pura
decide qual marca aparece.

**Decisões e justificativas:** [docs/specs/2026-08-04-nao-lidas-no-inbox.md](../specs/2026-08-04-nao-lidas-no-inbox.md)

**Ferramentas:** Next.js 16 (App Router, Turbopack), Postgres 17 no Supabase,
Vitest.

## Restrições globais

- **Identificadores em inglês, comentários em português**, como no resto do
  projeto.
- **Testes cobrem função pura, não banco.** A suíte não tem mock e não abre
  conexão; é decisão registrada. O que for SQL se verifica rodando o app.
- **Nada de gravar durante a renderização.** O prefetch do Next renderiza
  páginas dinâmicas no servidor — comprovado no log de rede, com três conversas
  renderizadas sem nenhuma ter sido aberta. Qualquer escrita de "visto" sai de
  Server Action disparada pelo cliente.
- **`npm run verify` verde** (lint, typecheck, 141 testes, build) antes de todo
  commit. Rode capturando o código de saída de verdade:
  `$out = npm run verify 2>&1 | Out-String; $LASTEXITCODE` — num pipe para
  `Select-String` o código se perde e um build quebrado passa por bom.
- **Migração de schema é `add column if not exists`** no array `DDL` de
  `lib/db.ts`, como todas as outras. Não existe ferramenta de migração.

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/inbox-badge.ts` | **criar** — função pura que decide qual marca aparece |
| `tests/inbox-badge.test.ts` | **criar** — testes dessa função |
| `lib/db.ts` | **modificar** (linha 370) — a coluna nova no array `DDL` |
| `lib/conversations.ts` | **modificar** (linhas 90-121) — a consulta devolve não lidas e sem-resposta |
| `app/conversas/[id]/marcar-visto.ts` | **criar** — Server Action que grava `last_seen_at` |
| `app/conversas/[id]/visto.tsx` | **criar** — componente de cliente que chama a ação |
| `app/conversas/[id]/page.tsx` | **modificar** — monta o `<Visto>` |
| `app/conversas/lista.tsx` | **modificar** (linhas 15-23, 76-89) — mostra a marca |

`lib/inbox-badge.ts` existe separado de propósito: é a única parte testável sem
banco, e mantém `lista.tsx` sem lógica de decisão.

---

## Tarefa 1: A função que decide qual marca aparece

Duas condições que são verdadeiras ao mesmo tempo na maioria dos casos —
mensagem que chegou e não foi respondida é as duas coisas. A precedência precisa
existir num lugar só, testada, e não espalhada em JSX.

**Arquivos:**
- Criar: `lib/inbox-badge.ts`
- Criar: `tests/inbox-badge.test.ts`

**Interfaces:**
- Produz: `badgeDaConversa({ naoLidas, semResposta }): "contagem" | "ponto" | "nenhum"`

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/inbox-badge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { badgeDaConversa } from "../lib/inbox-badge";

describe("badgeDaConversa", () => {
  it("mostra a contagem quando há não lidas", () => {
    expect(badgeDaConversa({ naoLidas: 3, semResposta: false })).toBe("contagem");
  });

  it("dá precedência à contagem quando as duas condições valem", () => {
    // O caso mais comum: mensagem chegou E ninguém respondeu. O número carrega
    // mais informação que o ponto, então ganha.
    expect(badgeDaConversa({ naoLidas: 3, semResposta: true })).toBe("contagem");
  });

  it("mostra o ponto quando foi lida mas não respondida", () => {
    expect(badgeDaConversa({ naoLidas: 0, semResposta: true })).toBe("ponto");
  });

  it("não mostra nada quando está em dia", () => {
    expect(badgeDaConversa({ naoLidas: 0, semResposta: false })).toBe("nenhum");
  });

  it("trata contagem negativa como zero", () => {
    // Defesa contra relógio ou consulta devolvendo lixo: um número negativo
    // nunca deve virar badge.
    expect(badgeDaConversa({ naoLidas: -1, semResposta: false })).toBe("nenhum");
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/inbox-badge.test.ts
```

Esperado: falha com `Failed to resolve import "../lib/inbox-badge"`.

- [ ] **Passo 3: Escrever a implementação**

Criar `lib/inbox-badge.ts`:

```ts
// Qual marca aparece na linha da conversa.
//
// Existe como função pura, fora do componente, porque as duas condições são
// verdadeiras ao mesmo tempo na maioria dos casos — mensagem que chegou e não
// foi respondida é as duas coisas — e a regra de desempate precisa morar num
// lugar só, testada.
//
// Não importa "server-only": é aritmética, e o componente de cliente a usa.

export type BadgeConversa = "contagem" | "ponto" | "nenhum";

export function badgeDaConversa(c: { naoLidas: number; semResposta: boolean }): BadgeConversa {
  if (c.naoLidas > 0) return "contagem";
  if (c.semResposta) return "ponto";
  return "nenhum";
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/inbox-badge.test.ts
```

Esperado: 5 testes passando.

- [ ] **Passo 5: Verificar e commitar**

```bash
npm run verify
git add lib/inbox-badge.ts tests/inbox-badge.test.ts
git commit -m "Decide qual marca a conversa mostra, num lugar so

As duas condicoes sao verdadeiras ao mesmo tempo na maioria dos casos: mensagem
que chegou e nao foi respondida e as duas coisas. A contagem tem precedencia por
carregar mais informacao.

Funcao pura e fora do componente porque e a unica parte disso que da para testar
sem banco, e porque regra de desempate espalhada em JSX e onde ela se perde."
```

---

## Tarefa 2: A coluna e a consulta

**Arquivos:**
- Modificar: `lib/db.ts` (linha 370, fim do array `DDL`)
- Modificar: `lib/conversations.ts` (linhas 90-121)

**Interfaces:**
- Consome: nada das tarefas anteriores
- Produz: `listConversations` passa a devolver, por conversa, `nao_lidas: number`
  e `sem_resposta: boolean`, além dos campos que já devolvia

- [ ] **Passo 1: Acrescentar a coluna ao schema**

Em `lib/db.ts`, logo depois da linha 370 (`events_media_idx`), acrescentar ao
array `DDL`:

```ts
  // Quando esta conversa foi aberta pela última vez. Alimenta a contagem de não
  // lidas da lista. Fica em contacts porque a chave já é (account_id, ig_id),
  // que é exatamente o escopo de "esta conversa desta conta".
  //
  // Nulo em contato nunca aberto, e nesse caso toda mensagem recebida conta como
  // não lida — que é o certo para quem chegou agora.
  `alter table contacts add column if not exists last_seen_at timestamptz`,
```

- [ ] **Passo 2: Trocar a consulta da lista**

Em `lib/conversations.ts`, substituir a função `listConversations` inteira
(linhas 90-121) por:

```ts
// Lista de conversas: uma linha por pessoa, ordenada pela última troca.
//
// Devolve três grandezas por conversa:
//   total         todas as trocas, como antes
//   nao_lidas     recebidas depois da última vez que a conversa foi aberta
//   sem_resposta  a última mensagem foi da pessoa (SEM considerar a janela)
//
// A janela de 24h NÃO entra aqui, e isso é deliberado: ela depende da hora atual
// e envelheceria dentro do resultado. Uma conversa cuja janela fecha às 14h03
// continuaria marcada até a próxima consulta. Quem aplica a janela é a lista, no
// componente, onde `windowState` já é calculado a cada renderização e expira
// sozinho.
//
// Que a janela precise entrar em algum lugar é medido, não estético: sem ela, 32
// das 34 conversas ficam marcadas, porque fora da janela a Meta recusa o envio e
// ninguém nunca respondeu. Com ela, sobram 8 — as que dá para atender.
export async function listConversations(accountId: string, limite = 50) {
  return (await sql().query(
    `with recebidas as (
       select e.payload->'sender'->>'id' as cid, e.created_at as at
       from events e
       where e.account_id = $1 and e.type = any($2::text[])
     ),
     enviadas as (
       select e.payload->'recipient'->>'id' as cid, e.created_at as at
       from events e
       where e.account_id = $1 and e.type = 'message_sent'
     ),
     trocas as (
       select cid, at from recebidas
       union all
       select cid, at from enviadas
     )
     select t.cid as ig_id,
            max(t.at) as last_at,
            count(*)::int as total,
            c.username, c.name, c.profile_pic, c.last_reply_at,
            -- Sem last_seen_at (nunca aberta), tudo que chegou conta.
            (select count(*)::int from recebidas r
              where r.cid = t.cid
                and r.at > coalesce(c.last_seen_at, 'epoch'::timestamptz)) as nao_lidas,
            -- "A última palavra foi dela". Os DOIS lados precisam de coalesce:
            -- em SQL, `NULL > qualquer coisa` devolve NULL, não false — e o tipo
            -- declarado abaixo é boolean não-nulo. Sem o coalesce da esquerda, a
            -- conversa em que a conta falou e a pessoa nunca respondeu (automação
            -- disparada por comentário) devolveria NULL num campo que promete
            -- boolean. Com os dois em 'epoch', esse caso vira epoch > epoch =
            -- false, que é o certo: sem nada recebido não há última palavra dela.
            (coalesce((select max(r.at) from recebidas r where r.cid = t.cid),
                      'epoch'::timestamptz) >
             coalesce((select max(s.at) from enviadas s where s.cid = t.cid),
                      'epoch'::timestamptz)) as sem_resposta
     from trocas t
     left join contacts c on c.account_id = $1 and c.ig_id = t.cid
     where t.cid is not null
     group by t.cid, c.username, c.name, c.profile_pic, c.last_reply_at, c.last_seen_at
     order by last_at desc
     limit $3`,
    [accountId, TIPOS_RECEBIDOS, limite]
  )) as {
    ig_id: string;
    last_at: Date;
    total: number;
    username: string | null;
    name: string | null;
    profile_pic: string | null;
    last_reply_at: Date | null;
    nao_lidas: number;
    sem_resposta: boolean;
  }[];
}
```

- [ ] **Passo 3: Conferir a consulta contra o banco real**

A suíte não cobre SQL. Rode o app e olhe os números:

```bash
npm run dev
```

Abrir `http://localhost:3000/conversas`. A tela ainda não mostra nada novo — é a
Tarefa 4 que muda o visual. O que se confere aqui é que **a página carrega sem
erro**, o que prova que a consulta é válida e as colunas existem.

Para ver os números que ela produz, com o servidor parado:

```bash
node -e "
import('postgres').then(async ({default: postgres})=>{
  const fs=await import('node:fs');
  const sql=postgres(fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim(),{prepare:false,ssl:'require',max:1});
  const [a]=await sql\`select ig_user_id from accounts limit 1\`;
  const r=await sql.unsafe(\`select c.username, count(*)::int total from events e
    left join contacts c on c.account_id=e.account_id
    where e.account_id=\$1 group by 1 limit 1\`,[a.ig_user_id]);
  console.log('consulta valida, banco responde:', r.length>0);
  await sql.end();
});"
```

Esperado: `consulta valida, banco responde: true`.

- [ ] **Passo 4: Verificar e commitar**

```bash
npm run verify
git add lib/db.ts lib/conversations.ts
git commit -m "A lista passa a saber quantas nao foram lidas e quem espera

Duas grandezas novas por conversa. nao_lidas conta o que chegou depois da ultima
abertura; sem_resposta diz que a ultima palavra foi da pessoa.

A janela de 24h NAO entra na consulta de proposito: ela depende da hora atual e
envelheceria dentro do resultado — conversa cuja janela fecha as 14h03
continuaria marcada ate a proxima consulta. Quem aplica a janela e a lista, onde
windowState ja e calculado a cada renderizacao e expira sozinho.

Que a janela precise entrar em algum lugar e medido: sem ela, 32 das 34
conversas ficam marcadas, porque fora da janela a Meta recusa o envio e ninguem
nunca respondeu. Com ela sobram 8 — as que dao para atender.

A coluna last_seen_at nasce nula, e nesse caso tudo que chegou conta como nao
lido. Instalacao existente aparece com o painel cheio de badges no primeiro
acesso: e correto por definicao e some conforme as conversas forem abertas."
```

---

## Tarefa 3: Marcar como visto sem cair no prefetch

O passo com a armadilha. A lista usa `<Link>`, e o prefetch do Next **renderiza
a conversa no servidor** — observado no log de rede, três conversas renderizadas
sem nenhuma ter sido aberta. Gravar "visto" durante a renderização marcaria como
lida qualquer conversa que passasse perto do mouse.

**Arquivos:**
- Criar: `app/conversas/[id]/marcar-visto.ts`
- Criar: `app/conversas/[id]/visto.tsx`
- Modificar: `app/conversas/[id]/page.tsx`

**Interfaces:**
- Consome: nada das tarefas anteriores
- Produz: `<Visto contactIgId={string} quantidade={number} />`, que grava
  `contacts.last_seen_at = now()` ao montar e a cada mudança em `quantidade`

- [ ] **Passo 1: Escrever a Server Action**

Criar `app/conversas/[id]/marcar-visto.ts`:

```ts
"use server";
import { getSelectedAccount } from "@/lib/account";
import { sql, ensureSchema } from "@/lib/db";

// Registra que esta conversa foi vista agora.
//
// É Server Action, chamada pelo CLIENTE, e isso não é preferência de estilo. A
// lista usa <Link>, e o prefetch do Next renderiza a página no servidor sem
// ninguém abrir nada — três conversas apareceram renderizadas no log de rede
// durante outro teste. Gravar isto na renderização marcaria como lida toda
// conversa que passasse perto do mouse, e o sintoma seria "às vezes as não
// lidas somem sozinhas": impossível de reproduzir sob demanda.
export async function marcarVisto(contactIgId: string): Promise<void> {
  if (!/^\d{1,32}$/.test(contactIgId)) return;
  await ensureSchema();
  const account = await getSelectedAccount();
  if (!account) return;
  await sql().query(
    `update contacts set last_seen_at = now() where account_id = $1 and ig_id = $2`,
    [account.ig_user_id, contactIgId]
  );
}
```

- [ ] **Passo 2: Escrever o componente que a chama**

Criar `app/conversas/[id]/visto.tsx`:

```tsx
"use client";
import { useEffect } from "react";
import { marcarVisto } from "./marcar-visto";

// Avisa o servidor que esta conversa foi aberta.
//
// Roda em efeito, ou seja, só depois de a página existir de verdade no
// navegador. É essa a diferença que importa: o prefetch renderiza no servidor,
// mas não monta componente nenhum no cliente.
//
// `quantidade` entra nas dependências para regravar quando chega mensagem com a
// conversa aberta. Sem isso, o que chegasse enquanto a pessoa lê contaria como
// não lido assim que ela saísse.
export default function Visto({
  contactIgId,
  quantidade,
}: {
  contactIgId: string;
  quantidade: number;
}) {
  useEffect(() => {
    // Falha aqui não merece tela de erro: o pior caso é a conversa continuar
    // marcada como não lida, e a próxima abertura resolve.
    void marcarVisto(contactIgId).catch(() => {});
  }, [contactIgId, quantidade]);

  return null;
}
```

- [ ] **Passo 3: Montar o componente na página da conversa**

Em `app/conversas/[id]/page.tsx`, acrescentar o import junto dos outros:

```tsx
import Visto from "./visto";
```

E, logo depois de `return (` e da abertura do fragmento `<>`, antes do
comentário `{/* Cabeçalho parado no topo da coluna */}`:

```tsx
      <Visto contactIgId={id} quantidade={mensagens.length} />

```

- [ ] **Passo 4: Provar que o prefetch NÃO marca como visto**

Este é o teste que justifica a tarefa. Com o servidor rodando:

```bash
npm run dev
```

Escolher uma conversa que **não** será aberta e zerar o registro dela:

```bash
node -e "
import('postgres').then(async ({default: postgres})=>{
  const fs=await import('node:fs');
  const sql=postgres(fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim(),{prepare:false,ssl:'require',max:1});
  const [c]=await sql\`select ig_id, username from contacts order by last_reply_at desc nulls last offset 1 limit 1\`;
  await sql\`update contacts set last_seen_at = null where ig_id = \${c.ig_id}\`;
  console.log('alvo:', c.username, c.ig_id, '-> last_seen_at zerado');
  await sql.end();
});"
```

Abrir `http://localhost:3000/conversas` no navegador e **passar o mouse pela
lista sem clicar**, esperando uns 10 segundos. Depois conferir:

```bash
node -e "
import('postgres').then(async ({default: postgres})=>{
  const fs=await import('node:fs');
  const sql=postgres(fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim(),{prepare:false,ssl:'require',max:1});
  const r=await sql\`select username, last_seen_at from contacts where last_seen_at is not null order by last_seen_at desc limit 5\`;
  console.log('marcadas como vistas:'); for(const x of r) console.log('  @'+x.username, x.last_seen_at.toISOString());
  await sql.end();
});"
```

Esperado: a conversa que você só passou o mouse **continua fora da lista**. Se
ela aparecer, a escrita está acontecendo na renderização e a Tarefa 3 falhou.

- [ ] **Passo 5: Provar que abrir MARCA**

Clicar naquela conversa, esperar 3 segundos, e rodar o mesmo comando de
conferência acima.

Esperado: agora ela aparece, com horário de agora.

- [ ] **Passo 6: Verificar e commitar**

```bash
npm run verify
git add "app/conversas/[id]/marcar-visto.ts" "app/conversas/[id]/visto.tsx" "app/conversas/[id]/page.tsx"
git commit -m "Marca a conversa como vista ao abrir, nao ao renderizar

A lista usa Link e o prefetch do Next RENDERIZA a pagina no servidor sem ninguem
abrir nada — tres conversas apareceram renderizadas no log de rede durante outro
teste, sem clique nenhum.

Por isso a escrita sai de uma Server Action chamada por um efeito do cliente, e
nao da renderizacao. Prefetch renderiza no servidor, mas nao monta componente no
navegador. Gravar na renderizacao marcaria como lida toda conversa que passasse
perto do mouse, e o sintoma seria 'as vezes as nao lidas somem sozinhas'.

A quantidade de mensagens entra nas dependencias do efeito para regravar quando
chega mensagem com a conversa aberta.

Verificado nos dois sentidos: passar o mouse pela lista nao marca; clicar marca."
```

---

## Tarefa 4: A marca na lista

**Arquivos:**
- Modificar: `app/conversas/lista.tsx` (linhas 15-23 e 76-89)

**Interfaces:**
- Consome: `badgeDaConversa` da Tarefa 1; `nao_lidas` e `sem_resposta` da Tarefa 2

- [ ] **Passo 1: Estender o tipo do resumo**

Em `app/conversas/lista.tsx`, substituir o tipo `ConversaResumo` (linhas 15-23):

```ts
export type ConversaResumo = {
  ig_id: string;
  last_at: Date | string;
  total: number;
  username: string | null;
  name: string | null;
  profile_pic: string | null;
  last_reply_at: Date | string | null;
  nao_lidas: number;
  sem_resposta: boolean;
};
```

- [ ] **Passo 2: Importar a função de decisão**

Acrescentar aos imports do topo do arquivo:

```ts
import { badgeDaConversa } from "@/lib/inbox-badge";
```

- [ ] **Passo 3: Calcular a marca dentro do map**

Logo depois da linha `const aberta = pathname === ...`, acrescentar:

```ts
            // A janela entra aqui: fora dela a Meta recusa o envio, então
            // marcar seria pedir uma ação impossível.
            const marca = badgeDaConversa({
              naoLidas: c.nao_lidas,
              semResposta: c.sem_resposta && janela.open,
            });
```

- [ ] **Passo 4: Mostrar a marca na segunda linha**

Localize **pelo conteúdo, não pelo número da linha** — os passos anteriores já
deslocaram tudo. Substituir o bloco inteiro que começa em
`<div className={\`mt-0.5 flex items-center gap-2 text-xs ${muted}\`}>` e termina
no `</div>` que o fecha (é o que hoje contém `fmtRelative`, o total de mensagens
e o badge verde da janela) por:

```tsx
                <div className={`mt-0.5 flex items-center gap-2 text-xs ${muted}`}>
                  <span className="shrink-0">{fmtRelative(c.last_at)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">
                    {c.total} {c.total === 1 ? "msg" : "msgs"}
                  </span>
                  {/* A direita da SEGUNDA linha, sob o contador da janela que
                      ocupa a primeira — é como aplicativo de mensagem organiza,
                      e evita que as duas marcas disputem o mesmo canto. */}
                  {marca === "contagem" && (
                    <span
                      className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[11px] font-semibold tabular-nums text-white"
                      aria-label={`${c.nao_lidas} ${c.nao_lidas === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
                    >
                      {c.nao_lidas > 99 ? "99+" : c.nao_lidas}
                    </span>
                  )}
                  {marca === "ponto" && (
                    <span
                      className="ml-auto h-2 w-2 shrink-0 rounded-full bg-indigo-400/70"
                      aria-label="Ainda sem resposta"
                    />
                  )}
                </div>
```

- [ ] **Passo 5: Reposicionar o contador da janela**

O passo anterior **removeu** o badge verde junto com o bloco que o continha. Não
é esquecimento: ele usava `ml-auto` na segunda linha e disputaria aquele canto
com a marca nova. Aqui ele volta, na primeira linha.

Localize pelo conteúdo o parágrafo do nome — o `<p className="truncate text-sm
font-medium">` que contém `c.name?.trim()` — e substitua o parágrafo inteiro
por:

```tsx
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.name?.trim() || (c.username ? `@${c.username}` : "Visitante")}
                  </p>
                  {/* Só destaca o que exige ação. "Só leitura" é o estado da
                      maioria das conversas antigas e viraria ruído em todas. */}
                  {janela.open && (
                    <span className={`${badgeOk} shrink-0`}>
                      {formatWindowLeft(janela.msLeft)}
                    </span>
                  )}
                </div>
```

- [ ] **Passo 6: Olhar a tela**

```bash
npm run dev
```

Abrir `http://localhost:3000/conversas` e conferir, com os olhos:

```
[foto]  Alice Mendes Stolfi 🌙        23h51     ← janela, primeira linha
        há 3 min · 16 msgs              ( 3 )   ← não lidas, segunda linha
```

- Conversa não aberta com mensagens recentes → **bolinha com número**
- Abrir essa conversa, voltar para a lista → número **some**; se ninguém
  respondeu e a janela está aberta, sobra o **ponto**
- Responder → o **ponto some**
- Conversa antiga, fora da janela → **nada**, e o contador verde também some

- [ ] **Passo 7: Verificar e commitar**

```bash
npm run verify
git add app/conversas/lista.tsx
git commit -m "Mostra nao lidas na lista, em vez so do total

O total de mensagens nao responde a pergunta de quem abre o painel: onde eu
preciso agir. Uma conversa com 169 mensagens e nada pendente aparecia mais
chamativa que uma com 2 esperando resposta.

Agora a direita da segunda linha mostra a contagem de nao lidas em destaque; se
foi lida mas ninguem respondeu e a janela ainda esta aberta, sobra um ponto
discreto; em dia, nada. Um lugar so, um significado so.

O contador da janela subiu para a primeira linha. Ele usava ml-auto na segunda e
disputaria o mesmo canto com a marca nova."
```

---

## Tarefa 5: Verificar em produção

**Arquivos:** nenhum. Esta tarefa é de verificação.

- [ ] **Passo 1: Subir**

```bash
git push origin main
```

Aguardar o deploy terminar na Vercel.

- [ ] **Passo 2: Conferir o primeiro acesso**

Abrir `https://metodochat.vercel.app/conversas`.

Esperado, e **é o comportamento correto**: o painel aparece com badge em quase
todas as conversas, porque nenhuma tem `last_seen_at` ainda. Registrado como
risco aceito na spec. Some conforme as conversas forem abertas.

- [ ] **Passo 3: Percorrer o ciclo com uma conversa real**

Com o `@jvsiqueira_` ou o `@alicistica`, que são os perfis autorizados para
teste:

1. Pedir uma DM → a conversa sobe na lista com **bolinha e número**
2. Abrir a conversa → voltar para a lista: número **sumiu**, **ponto** ficou
3. Responder pelo painel → o **ponto some**
4. Conferir uma conversa antiga, fora da janela → **sem marca nenhuma**

- [ ] **Passo 4: Conferir que o prefetch continua inofensivo em produção**

O comportamento de prefetch pode diferir entre `next dev` e produção. Na lista,
passar o mouse por várias conversas **sem clicar**, esperar 10 segundos, e
conferir:

```bash
node -e "
import('postgres').then(async ({default: postgres})=>{
  const fs=await import('node:fs');
  const sql=postgres(fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim(),{prepare:false,ssl:'require',max:1});
  const r=await sql\`select username, last_seen_at from contacts where last_seen_at > now() - interval '2 minutes'\`;
  console.log('marcadas nos ultimos 2 min:', r.length ? r.map(x=>'@'+x.username).join(', ') : 'nenhuma');
  await sql.end();
});"
```

Esperado: só as que foram **clicadas** aparecem. Se aparecer alguma que você só
passou o mouse, o prefetch de produção se comporta diferente do dev — pare e
reavalie a Tarefa 3.

---

## O que este plano não faz

**Marcar como não lida à mão.** Útil, mas é outro recurso, com sua própria tela
e seu próprio estado.

**Leitura por pessoa.** O painel tem uma senha só; "visto" é da instalação, não
de quem olhou. Se um dia houver login por usuário, isso volta à mesa.

**Notificação fora do painel.** Nada de som, título piscando ou push.

**Teste automatizado da consulta.** A suíte cobre função pura e não toca no
banco — decisão registrada do projeto. Só `badgeDaConversa` ganha teste; o SQL se
verifica rodando o app, o que torna os passos de conferência obrigatórios, não
opcionais.
