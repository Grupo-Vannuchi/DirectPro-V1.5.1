// Roda as MESMAS consultas pelos dois drivers e compara o tipo JS de cada
// coluna. Existe porque trocar de driver muda como o Postgres é traduzido para
// JavaScript — timestamptz, bigint e numeric podem voltar como Date num e
// string no outro — e nenhum dos 141 testes pega isso: a suíte cobre função
// pura de propósito e não toca no banco.
//
// Uso:  node scripts/comparar-drivers.mjs
//
// SOMENTE LEITURA. Não escreve nem apaga nada em lugar nenhum.
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
import { readFileSync } from "node:fs";

// Cada driver/ORM inventa o seu parâmetro de URL: o Neon manda channel_binding,
// o Prisma manda pgbouncer. O postgres.js não conhece nenhum dos dois e repassa
// como opção de conexão, que o servidor recusa.
//
// Removido via URL, e não por regex: tirando o PRIMEIRO parâmetro, o regex
// deixaria um "&" órfão logo depois do "?" e quebraria o resto da string.
const PARAMS_DE_OUTROS = ["channel_binding", "pgbouncer"];

function limparUrl(url) {
  const u = new URL(url);
  for (const p of PARAMS_DE_OUTROS) u.searchParams.delete(p);
  return u.toString();
}

const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

const viaHttp = neon(url);
const viaTcp = postgres(limparUrl(url), { prepare: false, ssl: "require", max: 1 });

// `select *` em vez de uma lista de colunas escolhida a dedo: a divergência que
// interessa é justamente a que ninguém previu. Listar colunas seria testar só as
// que eu já suspeitava.
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

// count(*) volta como bigint, o caso clássico de "string num driver, número no
// outro". O ::int do app já contorna isso; aqui o objetivo é ver o cru também.
const EXTRAS = {
  "count cru": "select count(*) as n from events",
  "count ::int": "select count(*)::int as n from events",
};

// Divergência imprime o valor para dar contexto — mas não em coluna de segredo.
const SEGREDO = /token|secret|password/i;

const tipo = (v) =>
  v === null
    ? "null"
    : v instanceof Date
      ? "Date"
      : Array.isArray(v)
        ? "Array"
        : Buffer.isBuffer(v)
          ? "Buffer"
          : typeof v;

const mostrar = (coluna, v) =>
  SEGREDO.test(coluna) ? "(oculto)" : (JSON.stringify(v) ?? "undefined").slice(0, 60);

let divergencias = 0;
let vazias = 0;

const consultas = [
  ...TABELAS.map((t) => [t, `select * from ${t} limit 1`]),
  ...Object.entries(EXTRAS),
];

for (const [nome, sqlTexto] of consultas) {
  const [a] = await viaHttp.query(sqlTexto);
  const [b] = await viaTcp.unsafe(sqlTexto);

  if (!a || !b) {
    vazias++;
    console.log(`${nome.padEnd(16)} sem linha — nada a comparar`);
    continue;
  }

  const colunas = Object.keys(a);
  const diferentes = colunas.filter((c) => tipo(a[c]) !== tipo(b[c]));

  if (!diferentes.length) {
    console.log(`${nome.padEnd(16)} ${String(colunas.length).padStart(2)} colunas, iguais`);
    continue;
  }

  console.log(`${nome.padEnd(16)} ${String(colunas.length).padStart(2)} colunas, ${diferentes.length} DIVERGEM`);
  for (const c of diferentes) {
    divergencias++;
    console.log(`   ${c.padEnd(24)} http=${tipo(a[c]).padEnd(8)} tcp=${tipo(b[c])}`);
    console.log(`   ${" ".repeat(24)} http: ${mostrar(c, a[c])}`);
    console.log(`   ${" ".repeat(24)} tcp : ${mostrar(c, b[c])}`);
  }
}

await viaTcp.end({ timeout: 5 });

console.log("");
if (vazias) {
  // Tabela vazia não prova nada: o tipo só aparece quando há linha. Dizer isso
  // em voz alta evita ler "nenhuma divergência" como cobertura total.
  console.log(`Atenção: ${vazias} consulta(s) sem linha — essas não foram verificadas.`);
}
console.log(divergencias === 0 ? "Nenhuma divergência de tipo." : `${divergencias} divergência(s) de tipo.`);
process.exit(divergencias === 0 ? 0 : 1);
