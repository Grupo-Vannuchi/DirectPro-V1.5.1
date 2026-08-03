# Migração Neon → Supabase: plano de implementação

> **Para quem for executar:** as etapas usam `- [ ]` para acompanhamento. Cada
> tarefa termina em algo verificável por conta própria.

**Objetivo:** trocar o banco do Neon (plano gratuito, que suspende) para um
projeto Supabase Pro em `sa-east-1`, sem perder dado e sem janela em que evento
da Meta se perca.

**Arquitetura:** em duas fases separadas no tempo. A Fase A troca só o **driver**
(HTTP → TCP), continuando a apontar para o Neon. A Fase B copia os dados e vira
a `DATABASE_URL`. Separadas assim, quando algo quebrar sabe-se qual das duas
mudanças foi a causa — juntas, o diagnóstico fica ambíguo.

**Decisões e justificativas:** [docs/specs/2026-07-31-migracao-neon-supabase.md](../specs/2026-07-31-migracao-neon-supabase.md)

**Ferramentas:** `postgres.js` 3.x, Postgres 17, Supavisor em modo transação
(porta 6543), Vercel em `gru1`.

---

## Restrições globais

- **`prepare: false` é obrigatório** em toda conexão. O Supavisor em modo
  transação e o pooler do Neon não suportam *prepared statements*. Sem isso a
  falha aparece sob concorrência, não na primeira requisição.
- **A interface de `sql()` não muda.** Os 73 pontos de chamada — 59 na forma
  `sql().query(texto, params)`, 5 na forma `sql()\`template\`` e 9 como
  `s.query(...)` dentro de `ensureSchema` — ficam intocados.
- **O Neon é somente-leitura durante toda a migração.** Nenhuma etapa escreve ou
  apaga nada nele. É isso que torna a volta atrás barata.
- **Identificadores em inglês, comentários em português**, como no resto do
  projeto.
- **`npm run verify` verde** (lint, typecheck, 141 testes, build) antes de todo
  commit.

## Pré-requisitos que dependem da N8X

- **Tarefa 4** precisa da string de conexão do projeto Supabase **gratuito** (o
  criado para a medição), em `.env.local` como `SUPABASE_TESTE_URL`.
- **Tarefa 5** precisa do projeto **Pro** criado em `sa-east-1` e da sua string
  de *transaction pooler* (porta 6543).

As Tarefas 1 a 3 não dependem de nada disso e podem começar já.

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/comparar-drivers.mjs` | **criar** — diagnóstico: mostra que tipo JS cada driver devolve por coluna |
| `lib/db.ts` | **modificar** (linhas 1-39) — troca `neon()` por `postgres.js`, mantendo a interface |
| `scripts/migrar-banco.mjs` | **criar** — copia as 8 tabelas de um Postgres para outro, re-executável |
| `docs/specs/2026-07-31-migracao-neon-supabase.md` | **modificar** — registrar o resultado no fim |

---

## Tarefa 1: Descobrir as diferenças de tipo entre os drivers

O risco principal nomeado na spec é conversão de tipo: `timestamptz`, `bigint` e
`numeric` podem voltar como `Date` num driver e `string` no outro. Esta tarefa
troca "descobrir na verificação manual" por "descobrir por script, agora".

Não muda o app. Só lê.

**Arquivos:**
- Criar: `scripts/comparar-drivers.mjs`

**Interfaces:**
- Consome: `DATABASE_URL` do `.env.local` (o Neon atual)
- Produz: uma tabela de divergências que orienta a Tarefa 2

- [ ] **Passo 1: Instalar o driver**

```bash
npm install postgres
```

- [ ] **Passo 2: Escrever o script de comparação**

Criar `scripts/comparar-drivers.mjs`:

```js
// Roda as MESMAS consultas pelos dois drivers e compara o tipo JS de cada
// coluna. Existe porque trocar de driver muda como o Postgres é traduzido para
// JavaScript, e nenhum dos 141 testes pega isso — a suíte cobre função pura de
// propósito e não toca no banco.
//
// Somente leitura. Não escreve nada em lugar nenhum.
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

// postgres.js não entende channel_binding; o Neon aceita a URL sem ele.
const urlTcp = url.replace(/[?&]channel_binding=[^&]*/, "");

const viaHttp = neon(url);
const viaTcp = postgres(urlTcp, { prepare: false, ssl: "require", max: 1 });

// Uma consulta por tabela, cobrindo as colunas de tipo arriscado.
const CONSULTAS = {
  config: "select id, connected_at, token_expires_at, updated_at from config limit 1",
  accounts: "select ig_user_id, token_expires_at, connected_at, created_at from accounts limit 1",
  automations:
    "select id, active, triggers, keywords, reminder_delay_minutes, created_at from automations limit 1",
  followups: "select id, position, delay_minutes from followups limit 1",
  contacts: "select ig_id, follow_attempts, first_contact_at, last_reply_at from contacts limit 1",
  queue:
    "select id, attempts, payload, not_before, claimed_at, sent_at, created_at from queue limit 1",
  events: "select id, payload, created_at from events limit 1",
  contagem: "select count(*)::int as n from events",
};

const tipo = (v) =>
  v === null ? "null" : v instanceof Date ? "Date" : Array.isArray(v) ? "Array" : typeof v;

let divergencias = 0;

for (const [nome, sqlTexto] of Object.entries(CONSULTAS)) {
  const [a] = await viaHttp.query(sqlTexto);
  const [b] = await viaTcp.unsafe(sqlTexto);
  if (!a || !b) {
    console.log(`${nome}: sem linha, pulando`);
    continue;
  }
  for (const coluna of Object.keys(a)) {
    const ta = tipo(a[coluna]);
    const tb = tipo(b[coluna]);
    if (ta !== tb) {
      divergencias++;
      console.log(`DIVERGE  ${nome}.${coluna.padEnd(22)} http=${ta.padEnd(8)} tcp=${tb}`);
      console.log(`         http: ${JSON.stringify(a[coluna])?.slice(0, 60)}`);
      console.log(`         tcp : ${JSON.stringify(b[coluna])?.slice(0, 60)}`);
    }
  }
}

await viaTcp.end({ timeout: 5 });
console.log(divergencias === 0 ? "\nNenhuma divergência." : `\n${divergencias} divergência(s).`);
process.exit(divergencias === 0 ? 0 : 1);
```

- [ ] **Passo 3: Rodar e registrar o resultado**

```bash
node scripts/comparar-drivers.mjs
```

Duas saídas possíveis, e as duas são úteis:

- **"Nenhuma divergência"** → a Tarefa 2 é uma troca limpa
- **Lista de divergências** → cada linha aponta um lugar do app a ajustar. Anote
  todas antes de seguir; elas viram passos da Tarefa 2.

- [ ] **Passo 4: Verificar e commitar**

```bash
npm run verify
git add package.json package-lock.json scripts/comparar-drivers.mjs
git commit -m "Compara o que cada driver devolve, coluna por coluna

Trocar o driver do banco muda como o Postgres e traduzido para JavaScript:
timestamptz, bigint e numeric podem voltar como Date num e string no outro.
Nenhum dos 141 testes pega isso, porque a suite cobre funcao pura de proposito
e nao toca no banco.

Este script roda as mesmas consultas pelos dois drivers e compara o tipo JS de
cada coluna. Somente leitura. Serve para a troca de driver comecar sabendo o
que vai quebrar, em vez de descobrir na verificacao manual depois do deploy."
```

---

## Tarefa 2: Trocar o driver, ainda apontando para o Neon

O app passa a falar TCP em vez de HTTP, **contra o mesmo banco de sempre**. Nada
de dado muda. Se algo quebrar aqui, a causa é o driver — e voltar é reverter um
commit.

**Arquivos:**
- Modificar: `lib/db.ts` linhas 1-39

**Interfaces:**
- Consome: as divergências encontradas na Tarefa 1
- Produz: `sql()` com a mesma interface — `sql()\`template\`` e
  `sql().query(texto, params)` — sobre `postgres.js`

- [ ] **Passo 1: Substituir o topo de `lib/db.ts`**

Trocar as linhas 1 a 39 (do `import "server-only"` até o fecho de
`export function sql()`) por:

```ts
import "server-only";
import postgres from "postgres";
import { randomBytes } from "node:crypto";

// Banco Postgres. Acesso só no servidor — a única credencial é a DATABASE_URL,
// que nunca chega ao navegador.
//
// O driver fala TCP com um pooler na frente (Supavisor no Supabase, PgBouncer no
// Neon). Os dois rodam em MODO TRANSAÇÃO, que não suporta prepared statements —
// daí o `prepare: false`. Sem ele o app não quebra na primeira requisição, e sim
// sob concorrência, que é o tipo de falha mais caro de diagnosticar.

// A interface é a mesma de antes: template marcado para consulta fixa, e
// .query(texto, params) para consulta montada. Os 73 pontos de chamada não
// sabem qual driver está por baixo.
type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  query: (text: string, params?: unknown[]) => Promise<unknown[]>;
};

let _sql: Sql | null = null;

// Aceita o banco com QUALQUER prefixo de variável (DATABASE_URL, STORAGE_URL,
// POSTGRES_URL...): o comprador não precisa acertar o "Custom Prefix" na Vercel.
function findDatabaseUrl(): string | undefined {
  const direct =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.NEON_DATABASE_URL;
  if (direct) return direct;
  const candidates = Object.entries(process.env)
    .filter(
      ([k, v]) =>
        typeof v === "string" &&
        /^postgres(ql)?:\/\//.test(v) &&
        !/UNPOOLED|NON_?POOLING|NO_SSL/i.test(k)
    )
    .sort(([a], [b]) => a.localeCompare(b));
  return candidates[0]?.[1];
}

export function sql(): Sql {
  if (!_sql) {
    const url = findDatabaseUrl();
    if (!url) {
      throw new Error(
        "Banco não encontrado. Configure a DATABASE_URL do projeto na Vercel e faça um Redeploy."
      );
    }
    // O Neon inclui channel_binding na URL; o postgres.js não entende esse
    // parâmetro e recusa a conexão. Remover é seguro: o sslmode continua lá.
    const cliente = postgres(url.replace(/[?&]channel_binding=[^&]*/, ""), {
      prepare: false,
      ssl: "require",
      // Baixo de propósito: em serverless cada instância vive pouco e atende
      // poucas requisições ao mesmo tempo. Pool grande aqui vira conexão
      // ociosa segurando vaga no pooler, que é compartilhado.
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    const fn = ((strings: TemplateStringsArray, ...values: unknown[]) =>
      cliente(strings, ...values)) as Sql;
    fn.query = (text: string, params?: unknown[]) => cliente.unsafe(text, params ?? []);
    _sql = fn;
  }
  return _sql;
}
```

- [ ] **Passo 2: Rodar o typecheck e corrigir o que aparecer**

```bash
npm run typecheck
```

Esperado: pode falhar em conversões `as T[]`. O retorno é `Promise<unknown[]>`,
e conversão de `unknown[]` para `T[]` é permitida — se algum ponto reclamar, é
porque estava tipado de outra forma. Corrija o ponto, **não** afrouxe o tipo do
adaptador.

- [ ] **Passo 3: Aplicar as correções da Tarefa 1**

Se a Tarefa 1 apontou divergências, ajuste cada ponto agora. Exemplo: se
`created_at` passou a vir como `string` onde o código esperava `Date`, envolva
em `new Date(...)` no ponto de leitura.

Se não houve divergência, pule.

- [ ] **Passo 4: Verificar tudo**

```bash
npm run verify
```

Esperado: lint sem saída, typecheck sem saída, 141 testes passando, build
compilando.

- [ ] **Passo 5: Exercitar o app local contra o Neon, pelo driver novo**

```bash
npm run dev
```

Abrir e conferir que carregam **sem erro**, uma a uma:

```
/                Painel
/conversas       lista e uma conversa
/contatos
/eventos         com filtro de período e busca
/automacoes      abrir uma automação existente
/setup
```

Cada uma lê tabelas diferentes. É aqui que divergência de tipo aparece.

- [ ] **Passo 6: Commitar**

```bash
git add lib/db.ts
git commit -m "Troca o driver do banco de HTTP para Postgres por TCP

Primeira das duas fases da migracao. So o driver muda: o banco continua sendo o
Neon de sempre, e nenhum dado se move.

Separar assim tem um motivo. O risco principal da migracao e conversao de tipo
entre drivers, que nao tem relacao nenhuma com Supabase. Trocando o driver
primeiro, contra o banco conhecido, um problema de tipo aparece agora — e volta
com um revert de commit, em vez de aparecer no dia da virada misturado com
problema de conexao ou de dado.

prepare: false porque os poolers dos dois lados rodam em modo transacao e nao
suportam prepared statements. O pool e pequeno (max 3) porque em serverless cada
instancia vive pouco, e pool grande vira conexao ociosa segurando vaga num
recurso compartilhado.

A interface de sql() nao mudou: os 73 pontos de chamada nao foram tocados."
```

---

## Tarefa 3: Verificar a Fase A em produção

O código local passou. Falta o ambiente onde os relógios, a região e a
concorrência são outros.

**Arquivos:** nenhum. Esta tarefa é de verificação.

- [ ] **Passo 1: Subir**

```bash
git push origin main
```

Aguardar o deploy terminar na Vercel.

- [ ] **Passo 2: Percorrer os cinco caminhos**

Em produção, na ordem:

1. Abrir Painel, Conversas, Contatos, Atividade, Automações — todas carregam
2. Pedir ao `@jvsiqueira_` uma DM → aparece em Conversas
3. Responder pelo painel → o balão vira horário e a mensagem chega no celular
4. Criar e salvar uma automação de teste → conferir que persistiu; apagar depois
5. Chamar o cron:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-APP.vercel.app/api/cron/daily
```

Esperado: JSON com `accounts`, `refreshed`, `profiles`, `sent`, `skipped`,
`failed`. Sem erro.

Os passos 4 e 5 são os que ninguém lembra de testar: escrita com `jsonb` e array
de texto, e renovação de token. São exatamente onde tipo diferente morde.

- [ ] **Passo 3: Decidir**

- **Tudo passou** → a Fase A está fechada. Siga para a Tarefa 4.
- **Algo falhou** → `git revert` do commit da Tarefa 2, push, e volte à Tarefa 1
  com o sintoma em mãos. **Não siga para a Fase B com a Fase A instável.**

---

## Tarefa 4: Ensaiar a migração no projeto gratuito

Escrever o script de cópia e rodá-lo contra um banco **descartável**. Se o
`ensureSchema` não construir o schema do zero, ou se a ordem das tabelas violar
uma chave estrangeira, é aqui que se descobre — e não no dia da virada.

**Pré-requisito:** `SUPABASE_TESTE_URL` no `.env.local`, com a string do
*transaction pooler* do projeto gratuito.

**Arquivos:**
- Criar: `scripts/migrar-banco.mjs`

**Interfaces:**
- Consome: `DATABASE_URL` (origem) e uma URL de destino passada por argumento
- Produz: o mesmo script usado na Tarefa 5, já ensaiado

- [ ] **Passo 1: Escrever o script**

Criar `scripts/migrar-banco.mjs`:

```js
// Copia os dados de um Postgres para outro. NÃO cria schema: quem faz isso é o
// ensureSchema do app, na primeira requisição contra o banco novo.
//
// Uso:  node scripts/migrar-banco.mjs "<url-de-destino>"
//
// Re-executável: usa `on conflict do nothing`. Se parar no meio, rode de novo.
// A origem é aberta somente para leitura — nada é escrito ou apagado nela.
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const destinoUrl = process.argv[2];
if (!destinoUrl) {
  console.error('uso: node scripts/migrar-banco.mjs "<url-de-destino>"');
  process.exit(1);
}

const origemUrl = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const origem = neon(origemUrl);
const destino = postgres(destinoUrl.replace(/[?&]channel_binding=[^&]*/, ""), {
  prepare: false,
  ssl: "require",
  max: 1,
});

// A ordem é a das dependências: followups e queue apontam para automations;
// contacts.last_automation_id também. Inverter isso quebra a chave estrangeira.
const TABELAS = [
  "config",
  "accounts",
  "automations",
  "followups",
  "contacts",
  "queue",
  "events",
  "login_attempts",
];

// A coluna de conflito de cada tabela. Sem isso, rodar duas vezes duplicaria.
const CONFLITO = {
  config: "(id)",
  accounts: "(ig_user_id)",
  automations: "(id)",
  followups: "(id)",
  contacts: "(account_id, ig_id)",
  queue: "(id)",
  events: "(id)",
  login_attempts: "", // sem chave única; hoje tem 0 linhas
};

// `config` é a ÚNICA que sobrescreve, e o motivo é sutil: o ensureSchema já
// insere uma linha id=1 com um webhook_verify_token novo em folha ao construir o
// schema. Com `do nothing`, a config REAL — credenciais da Meta, app_url, o
// verify token que está cadastrado lá — seria silenciosamente descartada, e o
// app subiria com um token que a Meta não conhece. O webhook pararia de entregar
// sem erro nenhum aparecer.
const SOBRESCREVE = new Set(["config"]);

for (const tabela of TABELAS) {
  const linhas = await origem.query(`select * from ${tabela}`);
  if (!linhas.length) {
    console.log(`${tabela.padEnd(16)} 0 linhas, nada a copiar`);
    continue;
  }

  const colunas = Object.keys(linhas[0]);
  let conflito = "";
  if (CONFLITO[tabela] && SOBRESCREVE.has(tabela)) {
    const sets = colunas.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`);
    conflito = `on conflict ${CONFLITO[tabela]} do update set ${sets.join(", ")}`;
  } else if (CONFLITO[tabela]) {
    conflito = `on conflict ${CONFLITO[tabela]} do nothing`;
  }

  let inseridas = 0;
  for (const linha of linhas) {
    const valores = colunas.map((c) => linha[c]);
    const marcadores = colunas.map((_, i) => `$${i + 1}`).join(", ");
    // jsonb precisa ir como texto; o driver não infere o tipo de um objeto JS.
    const preparados = valores.map((v) =>
      v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)
        ? JSON.stringify(v)
        : v
    );
    const r = await destino.unsafe(
      `insert into ${tabela} (${colunas.join(", ")}) values (${marcadores}) ${conflito}`,
      preparados
    );
    inseridas += r.count ?? 0;
  }
  console.log(`${tabela.padEnd(16)} ${linhas.length} lidas, ${inseridas} inseridas`);
}

// A conferência é o produto real deste script.
console.log("\nconferencia:");
let divergiu = false;
for (const tabela of TABELAS) {
  const [a] = await origem.query(`select count(*)::int as n from ${tabela}`);
  const [b] = await destino.unsafe(`select count(*)::int as n from ${tabela}`);
  const ok = a.n === b.n;
  if (!ok) divergiu = true;
  console.log(`  ${tabela.padEnd(16)} origem=${String(a.n).padStart(4)} destino=${String(b.n).padStart(4)}  ${ok ? "ok" : "DIVERGE"}`);
}

await destino.end({ timeout: 5 });
console.log(divergiu ? "\nDIVERGENCIA — nao vire o banco." : "\nTodas as tabelas conferem.");
process.exit(divergiu ? 1 : 0);
```

- [ ] **Passo 2: Deixar o `ensureSchema` construir o schema no banco de teste**

Apontar o app local para o projeto gratuito e abrir uma página, o que dispara o
`ensureSchema`:

```bash
# no .env.local, comente a DATABASE_URL do Neon e ponha a de teste no lugar,
# ou rode com a variável na frente do comando:
DATABASE_URL="<SUPABASE_TESTE_URL>" npm run dev
```

Abrir `http://localhost:3000/entrar`. Esperado: a tela de senha carrega sem
erro — o que significa que as 8 tabelas e as migrações rodaram.

Conferir:

```bash
node -e "
import('postgres').then(async ({default: postgres}) => {
  const sql = postgres(process.argv[1], { prepare: false, ssl: 'require', max: 1 });
  const t = await sql\`select tablename from pg_tables where schemaname='public' order by 1\`;
  console.log(t.map(x => x.tablename).join(', '));
  await sql.end();
});
" "<SUPABASE_TESTE_URL>"
```

Esperado: `accounts, automations, config, contacts, events, followups,
login_attempts, queue`.

- [ ] **Passo 3: Rodar a cópia no ensaio**

```bash
node scripts/migrar-banco.mjs "<SUPABASE_TESTE_URL>"
```

Esperado: 8 linhas de conferência, todas `ok`, e "Todas as tabelas conferem".

Se alguma divergir, o script diz qual. Corrija e rode de novo — ele é
re-executável.

- [ ] **Passo 4: Conferir que a `config` foi sobrescrita, e não ignorada**

Este é o ponto mais fácil de errar em silêncio. O `ensureSchema` cria uma linha
`config` com um `webhook_verify_token` novo; a cópia precisa **substituí-la** pela
real. Se não substituir, o app sobe com um token que a Meta não conhece e o
webhook para de entregar sem nenhum erro aparecer.

```bash
node -e "
Promise.all([import('postgres'), import('@neondatabase/serverless'), import('node:fs')])
 .then(async ([{default: postgres}, {neon}, fs]) => {
  const u = fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim();
  const [a] = await neon(u)\`select webhook_verify_token, instagram_app_id, app_url from config where id=1\`;
  const d = postgres(process.argv[1], { prepare: false, ssl: 'require', max: 1 });
  const [b] = await d\`select webhook_verify_token, instagram_app_id, app_url from config where id=1\`;
  const ok = a.webhook_verify_token === b.webhook_verify_token
          && a.instagram_app_id === b.instagram_app_id
          && a.app_url === b.app_url;
  console.log(ok ? 'config OK — copiada' : 'config DIVERGE — a copia nao sobrescreveu');
  if (!ok) console.log({ origem: a, destino: b });
  await d.end();
  process.exit(ok ? 0 : 1);
});
" "<SUPABASE_TESTE_URL>"
```

Esperado: `config OK — copiada`.

- [ ] **Passo 5: Usar o app contra o banco de teste**

Com o `DATABASE_URL` ainda apontando para o de teste, abrir Painel, Conversas,
Contatos, Atividade e Automações. Os dados copiados devem aparecer.

Devolver o `.env.local` para a `DATABASE_URL` do Neon ao terminar.

- [ ] **Passo 6: Commitar**

```bash
npm run verify
git add scripts/migrar-banco.mjs
git commit -m "Script de copia de dados entre bancos, ja ensaiado

Copia as 8 tabelas de um Postgres para outro, na ordem das dependencias, e
termina conferindo a contagem dos dois lados — que e o produto real dele.

Nao cria schema: quem faz isso e o ensureSchema do app na primeira requisicao.
Isso e possivel porque o projeto nao usa extensao nenhuma alem de plpgsql, e
todo o SQL e padrao.

Re-executavel por on conflict do nothing. A origem e aberta somente para
leitura.

Ensaiado contra um projeto Supabase descartavel antes de existir qualquer plano
de virar producao: se o ensureSchema nao construisse o schema do zero, ou se a
ordem das tabelas violasse uma chave estrangeira, teria falhado ali."
```

---

## Tarefa 5: Virar para o Supabase Pro

**Pré-requisito:** projeto Pro criado em `sa-east-1`, e a string do *transaction
pooler* (porta 6543) em mãos.

**Arquivos:** nenhum. Esta tarefa é operacional.

- [ ] **Passo 1: Drenar a fila até zerar**

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-APP.vercel.app/api/queue/tick
```

Repetir até `{"sent":0,"skipped":0,"failed":0}`. Depois confirmar:

```bash
node -e "
import('@neondatabase/serverless').then(async ({neon}) => {
  const fs = await import('node:fs');
  const u = fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)\$/m)[1].trim();
  const [r] = await neon(u)\`select count(*)::int as n from queue where status in ('pending','sending')\`;
  console.log('pendentes:', r.n);
});
"
```

Esperado: `pendentes: 0`.

Isso evita o caso em que um item é copiado, drenado nos **dois** bancos, e a
pessoa recebe a mesma mensagem duas vezes.

- [ ] **Passo 2: Deixar o `ensureSchema` construir o schema no Pro**

```bash
DATABASE_URL="<URL-DO-PRO>" npm run dev
```

Abrir `http://localhost:3000/entrar`. A tela carregando significa schema criado.

- [ ] **Passo 3: Copiar**

```bash
node scripts/migrar-banco.mjs "<URL-DO-PRO>"
```

Esperado: "Todas as tabelas conferem". **Se divergir, pare aqui** — não vire.

- [ ] **Passo 4: Conferir a `config`, com o mesmo comando do ensaio**

A contagem das tabelas **não pega este caso**: a `config` teria 1 linha nos dois
lados de qualquer jeito — só que a do destino seria a criada pelo `ensureSchema`,
com um `webhook_verify_token` novo e sem as credenciais da Meta. Contagem igual,
conteúdo errado, webhook morto sem erro nenhum.

Rodar o mesmo comando do Passo 4 da Tarefa 4, trocando a URL pela do Pro.

Esperado: `config OK — copiada`. **Se divergir, pare aqui** — não vire.

- [ ] **Passo 5: Virar (N8X executa)**

Na Vercel: **Settings → Environment Variables → `DATABASE_URL` → Production →
Edit** → colar a URL do Pro → **Save** → **Redeploy**.

Este passo é da N8X porque é o único que muda produção de verdade e o único que
não se desfaz por comando — depende do painel.

Durante o redeploy o app fica alguns minutos fora. **Nenhum evento se perde:** o
webhook devolve `503` quando o banco está indisponível, e a Meta reenvia por até
~36 horas.

- [ ] **Passo 6: Verificar, com a mesma lista da Tarefa 3**

1. Painel, Conversas, Contatos, Atividade, Automações carregam
2. DM do `@jvsiqueira_` chega
3. Resposta pelo painel sai e é entregue
4. Criar, salvar e apagar uma automação de teste
5. Cron responde sem erro

- [ ] **Passo 7: Se algo falhar**

Voltar a `DATABASE_URL` para a do Neon na Vercel e redeployar. O Neon está
intocado — o script só leu dele. Nenhum dado se perde, e o que tiver entrado no
Supabase depois da virada volta pela reentrega da Meta.

---

## Tarefa 6: Fechar

- [ ] **Passo 1: Aguardar 7 dias com o Neon ligado**

Prazo para o cron diário das 9h e os lembretes de 60 minutos rodarem pelo menos
uma vez. Um teste de 20 minutos não exercita nenhum dos dois.

- [ ] **Passo 2: Registrar o resultado na spec**

Acrescentar ao fim de `docs/specs/2026-07-31-migracao-neon-supabase.md` uma
seção "Resultado" com: data da virada, divergências encontradas na Tarefa 1, o
que quebrou (se algo quebrou) e a data de desligamento do Neon.

- [ ] **Passo 3: Desligar o Neon e limpar**

- Apagar o projeto Neon
- Apagar o projeto Supabase **gratuito** usado nos ensaios
- Remover `SUPABASE_TESTE_URL` do `.env.local`

- [ ] **Passo 4: Commitar**

```bash
git add docs/specs/2026-07-31-migracao-neon-supabase.md
git commit -m "Registra o resultado da migracao para o Supabase"
```

---

## O que este plano não faz

**Realtime.** Fica disponível depois da migração e resolveria o polling de 30
segundos da lista de conversas. É trabalho próprio, com planejamento próprio.

**Teste de integração com banco.** A ausência dele é o que torna a verificação
manual obrigatória aqui. Continua sendo decisão consciente — mas esta migração é
o argumento mais forte até agora a favor de um dia ter.

**Ajuste de pool sob carga.** `max: 3` é escolha conservadora, não medida. Se
aparecer erro intermitente de conexão sob pico de webhook, é o primeiro número a
revisitar.
