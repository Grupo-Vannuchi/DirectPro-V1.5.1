// Exercita contra um banco de verdade os caminhos que os 141 testes não cobrem.
//
// A suíte cobre função pura de propósito e não toca no banco. Isso deixa um vão
// exatamente onde a migração dói: conversão de tipo na ida e na volta. Um bug
// dessa família passa por lint, typecheck, build e testes sem acender nada, e
// só aparece semanas depois como dado gravado errado.
//
// Uso:  node scripts/verificar-banco.mjs [url]
//       sem argumento, usa a DATABASE_URL do .env.local
//
// Escreve TUDO dentro de uma transação que termina em rollback. Nada persiste —
// pode rodar contra produção.
import postgres from "postgres";
import { readFileSync } from "node:fs";

// Cada fornecedor inventa o seu parâmetro de URL: channel_binding no Neon,
// pgbouncer no Prisma. O postgres.js não conhece nenhum e os repassa ao servidor
// como opção de conexão, que os recusa. Espelha o limparUrl de lib/db.ts.
function limparUrl(url) {
  const u = new URL(url);
  for (const p of ["channel_binding", "pgbouncer"]) u.searchParams.delete(p);
  return u.toString();
}

const url =
  process.argv[2] ?? readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

const sql = postgres(limparUrl(url), { prepare: false, ssl: "require", max: 1 });

let falhas = 0;
const checar = (nome, ok, detalhe = "") => {
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok  " : "FALHA"} ${nome.padEnd(34)} ${detalhe}`);
};

// Sai pelo erro para reverter: é o jeito do postgres.js desfazer a transação.
class Reverter extends Error {}

console.log(`banco: ${new URL(url).host}\n`);

try {
  await sql.begin(async (tx) => {
    // ---- jsonb, o que quebrou na migração -------------------------------
    //
    // O driver HTTP só aceitava texto, então o app pré-serializava. O driver por
    // TCP tipa o parâmetro como json sozinho: a string pré-serializada virava
    // ESCALAR json, o insert passava, e a leitura devolvia nulo depois.
    console.log("jsonb — ida e volta por forma");
    for (const [nome, valor] of Object.entries({
      objeto: { text: "olá {name}", aninhado: { a: [1, 2] } },
      array: [{ id: 1 }, { id: 2 }],
      string: "texto solto",
      número: 42,
      vazio: {},
    })) {
      const [r] = await tx.unsafe(
        `insert into events (account_id, type, payload) values ($1, $2, $3) returning payload`,
        ["_verificacao", "_verificacao", valor]
      );
      checar(nome, JSON.stringify(r.payload) === JSON.stringify(valor), JSON.stringify(r.payload).slice(0, 44));
    }

    // ---- text[], usado pelas automações ---------------------------------
    console.log("\ntext[] e tipos escalares");
    const [auto] = await tx.unsafe(
      `insert into automations (name, triggers, keywords, public_replies, welcome_text, reminder_delay_minutes)
       values ($1, $2, $3, $4, $5, $6)
       returning id, triggers, keywords, public_replies, reminder_delay_minutes, active, created_at`,
      ["_verificacao", ["comment", "dm"], ["preço", "quero"], ["te chamei 📩"], "oi", 90]
    );
    checar("triggers volta como Array", Array.isArray(auto.triggers), JSON.stringify(auto.triggers));
    checar("acento preservado", auto.keywords?.[0] === "preço", JSON.stringify(auto.keywords));
    checar("emoji preservado", auto.public_replies?.[0]?.includes("📩"), JSON.stringify(auto.public_replies));
    checar("int volta como number", typeof auto.reminder_delay_minutes === "number", `${auto.reminder_delay_minutes}`);
    checar("boolean volta como boolean", typeof auto.active === "boolean", `${auto.active}`);
    checar("timestamptz volta como Date", auto.created_at instanceof Date, String(auto.created_at).slice(0, 24));

    // ---- fila: o atraso é contado pelo relógio do BANCO ------------------
    console.log("\nfila");
    const [item] = await tx.unsafe(
      `insert into queue (account_id, kind, contact_ig_id, automation_id, payload, dedupe_key, not_before)
       values ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7::int))
       returning id, payload, not_before, created_at, attempts`,
      ["_verificacao", "dm_welcome", "0", auto.id, { text: "olá {name}" }, `_verificacao-${auto.id}`, 120]
    );
    const atraso = Math.round((item.not_before - item.created_at) / 1000);
    checar("make_interval aplica o atraso", atraso >= 118 && atraso <= 122, `${atraso}s (esperado 120)`);

    // O dreno grava aqui o texto que de fato saiu. Sobre escalar json isto é
    // erro duro — é o sintoma mais barulhento do bug de serialização.
    const [gravado] = await tx.unsafe(
      `update queue set payload = jsonb_set(payload, '{sent_text}', to_jsonb($2::text))
       where id = $1 returning payload`,
      [item.id, "olá João"]
    );
    checar("jsonb_set grava o texto entregue", gravado.payload?.sent_text === "olá João", JSON.stringify(gravado.payload).slice(0, 44));

    // Sem skip locked, dois drenos simultâneos entregariam a mesma mensagem duas
    // vezes. É a garantia de que ninguém recebe DM repetida.
    const travadas = await tx.unsafe(
      `select id from queue where status = 'pending' order by not_before limit 1 for update skip locked`
    );
    checar("for update skip locked", Array.isArray(travadas), `${travadas.length} linha(s)`);

    // ---- on conflict, a base da deduplicação ----------------------------
    const repetido = await tx.unsafe(
      `insert into queue (account_id, kind, payload, dedupe_key)
       values ($1, $2, $3, $4) on conflict (dedupe_key) do nothing returning id`,
      ["_verificacao", "dm_welcome", {}, `_verificacao-${auto.id}`]
    );
    checar("on conflict do nothing dedupa", repetido.length === 0, `${repetido.length} inserida(s), esperado 0`);

    throw new Reverter();
  });
} catch (e) {
  if (!(e instanceof Reverter)) {
    console.error(`\nERRO: ${e.message}`);
    await sql.end();
    process.exit(1);
  }
}

// O rollback é parte do contrato deste script: se sobrar linha, ele mesmo mente.
const [r] = await sql`select count(*)::int as n from events where type = '_verificacao'`;
checar("\nrollback não deixou resíduo", r.n === 0, `${r.n} linha(s) sobraram`);

await sql.end();
console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
process.exit(falhas ? 1 : 0);
