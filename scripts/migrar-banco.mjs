// Copia os dados de um Postgres para outro.
//
// NÃO cria schema: quem faz isso é o ensureSchema do app, na primeira requisição
// contra o banco novo. Isso é possível porque o projeto não usa extensão nenhuma
// além de plpgsql e todo o SQL é padrão — foi verificado, não suposto.
//
// Uso:  node scripts/migrar-banco.mjs "<url-de-destino>"
//       a origem é a DATABASE_URL do .env.local
//
// A origem é aberta SOMENTE PARA LEITURA: nada é escrito ou apagado nela. É isso
// que torna a volta atrás barata — basta reapontar a variável de ambiente.
//
// Re-executável: usa `on conflict do nothing`. Se parar no meio, rode de novo.
import postgres from "postgres";
import { readFileSync } from "node:fs";

function limparUrl(url) {
  const u = new URL(url);
  for (const p of ["channel_binding", "pgbouncer"]) u.searchParams.delete(p);
  return u.toString();
}

const destinoUrl = process.argv[2];
if (!destinoUrl) {
  console.error('uso: node scripts/migrar-banco.mjs "<url-de-destino>"');
  process.exit(1);
}

const origemUrl = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

// Copiar um banco para ele mesmo apagaria a diferença entre origem e destino e
// tornaria a conferência final sem sentido — ela passaria sempre.
if (new URL(origemUrl).host === new URL(destinoUrl).host) {
  console.error("origem e destino são o mesmo servidor. Abortado.");
  process.exit(1);
}

const opcoes = { prepare: false, ssl: "require", max: 1 };
const origem = postgres(limparUrl(origemUrl), opcoes);
const destino = postgres(limparUrl(destinoUrl), opcoes);

// A ordem é a das chaves estrangeiras, lida do banco e não suposta: followups,
// contacts e queue apontam para automations. Inverter quebra a restrição.
//
// login_attempts fica de fora de propósito. São tentativas de senha erradas por
// IP, apagadas sozinhas em 1 dia, e é a ÚNICA tabela sem chave única — copiá-la
// duplicaria linhas a cada nova execução do script. Não migrar zera um contador
// de freio; nada além disso.
// A cópia SOBRESCREVE por padrão, e isso não é detalhe: este script roda pelo
// menos duas vezes — no ensaio e na virada —, e entre uma e outra o app continua
// funcionando e ALTERANDO linhas.
//
// Levantado no código, não suposto: contacts recebe 6 updates, queue 2,
// automations 2, accounts 1, config 1. Com `do nothing`, a segunda execução
// preservaria a versão velha de todas elas. O caso mais caro é
// contacts.last_reply_at, que é o que decide a janela de 24 horas — congelado,
// o painel recusaria respostas que a Meta ainda aceita, ou o contrário.
//
// `config` merece nota à parte: o ensureSchema JÁ insere uma linha id=1 com um
// webhook_verify_token novo em folha ao construir o schema. Sem sobrescrever, o
// app subiria com um token que a Meta não conhece e o webhook pararia de
// entregar sem nenhum erro aparecer — e a contagem de linhas não pega, porque
// config tem 1 linha dos dois lados. Daí a conferência de conteúdo no fim.
//
// `events` é a única exceção: zero updates no código inteiro, só insert. Pular
// as 558 regravações a cada execução é de graça.
const TABELAS = [
  { nome: "config", chave: ["id"] },
  { nome: "accounts", chave: ["ig_user_id"] },
  { nome: "automations", chave: ["id"] },
  { nome: "followups", chave: ["id"] },
  { nome: "contacts", chave: ["account_id", "ig_id"] },
  { nome: "queue", chave: ["id"] },
  { nome: "events", chave: ["id"], apenasInsere: true },
];

console.log(`origem : ${new URL(origemUrl).host}`);
console.log(`destino: ${new URL(destinoUrl).host}\n`);

// TRAVA CONTRA RODAR DEPOIS DA VIRADA.
//
// A cópia sobrescreve, o que é certo ANTES da virada e desastroso DEPOIS: com o
// app já apontando para o destino, rodar isto de novo substituiria os dados
// novos pelos do banco antigo, que a essa altura está parado. E não haveria
// desfazer — o `on conflict do update` não guarda o que passou por cima.
//
// events só cresce, então o evento mais recente de cada lado diz quem está
// vivo. Destino à frente da origem só acontece se ele já for o banco de
// produção.
{
  const [[o], [d]] = await Promise.all([
    origem.unsafe(`select max(created_at) as t from events`),
    destino.unsafe(`select max(created_at) as t from events`),
  ]);
  if (o.t && d.t && d.t > o.t) {
    const atraso = Math.round((d.t - o.t) / 1000);
    console.error(
      `ABORTADO: o destino tem evento ${atraso}s mais NOVO que a origem.\n` +
        `Isso significa que o destino já é o banco em produção. Copiar agora\n` +
        `sobrescreveria dado novo com dado velho, sem volta.`
    );
    await Promise.all([origem.end({ timeout: 5 }), destino.end({ timeout: 5 })]);
    process.exit(1);
  }
}

for (const { nome: tabela, chave, apenasInsere } of TABELAS) {
  const linhas = await origem.unsafe(`select * from ${tabela}`);
  if (!linhas.length) {
    console.log(`${tabela.padEnd(14)} 0 linhas na origem, nada a copiar`);
    continue;
  }

  const colunas = Object.keys(linhas[0]);
  const alvo = `(${chave.join(", ")})`;
  // As colunas da chave ficam de fora do `set`: são justamente as que casaram.
  const atualizaveis = colunas.filter((c) => !chave.includes(c));
  const clausula =
    apenasInsere || !atualizaveis.length
      ? `on conflict ${alvo} do nothing`
      : `on conflict ${alvo} do update set ${atualizaveis.map((c) => `${c} = excluded.${c}`).join(", ")}`;

  const marcadores = colunas.map((_, i) => `$${i + 1}`).join(", ");
  let inseridas = 0;

  for (const linha of linhas) {
    // Os valores vão CRUS. Nada de JSON.stringify aqui: o driver tipa o
    // parâmetro pela coluna de destino, e uma string pré-serializada seria
    // gravada como ESCALAR json — o texto {"a":1} em vez do objeto {a:1}.
    //
    // A contagem de linhas continuaria batendo. O que quebraria, silenciosamente,
    // é toda leitura por operador jsonb: payload->'sender'->>'id' devolve nulo em
    // escalar, e é disso que o inbox e os filtros de /eventos dependem.
    const r = await destino.unsafe(
      `insert into ${tabela} (${colunas.join(", ")}) values (${marcadores}) ${clausula}`,
      colunas.map((c) => linha[c])
    );
    inseridas += r.count ?? 0;
  }
  console.log(`${tabela.padEnd(14)} ${String(linhas.length).padStart(4)} lidas, ${String(inseridas).padStart(4)} gravadas${apenasInsere ? " (so insere)" : ""}`);
}

// ---- Conferência: é o produto real deste script ------------------------
let divergiu = false;

// Destino com MAIS linhas que a origem também é divergência, e é o sinal de
// linha apagada no Neon depois de uma execução anterior — a cópia não apaga
// nada, então só a contagem denuncia.
console.log("\ncontagem por tabela:");
for (const { nome: tabela } of TABELAS) {
  const [[a], [b]] = await Promise.all([
    origem.unsafe(`select count(*)::int as n from ${tabela}`),
    destino.unsafe(`select count(*)::int as n from ${tabela}`),
  ]);
  const ok = a.n === b.n;
  if (!ok) divergiu = true;
  console.log(`  ${tabela.padEnd(14)} origem=${String(a.n).padStart(4)}  destino=${String(b.n).padStart(4)}  ${ok ? "ok" : "DIVERGE"}`);
}

// A config precisa de conferência PRÓPRIA porque a contagem não a cobre: ela
// teria 1 linha dos dois lados mesmo se a cópia tivesse sido descartada.
console.log("\nconteúdo da config (a contagem não pega isto):");
const CAMPOS = ["webhook_verify_token", "instagram_app_id", "meta_app_id", "app_url"];
const [[ca], [cb]] = await Promise.all([
  origem.unsafe(`select ${CAMPOS.join(", ")} from config where id = 1`),
  destino.unsafe(`select ${CAMPOS.join(", ")} from config where id = 1`),
]);
for (const campo of CAMPOS) {
  const ok = (ca?.[campo] ?? null) === (cb?.[campo] ?? null);
  if (!ok) divergiu = true;
  // O valor não é impresso: são credenciais. O que importa é se bate.
  console.log(`  ${campo.padEnd(22)} ${ok ? "ok" : "DIVERGE — a copia nao sobrescreveu"}`);
}

// Os payloads precisam ser NAVEGÁVEIS por operador jsonb do lado do destino. Se
// tivessem sido gravados como escalar, tudo isto viria zerado — e nem a contagem
// de linhas nem a conferência da config acusariam.
//
// Sem filtrar por tipo de evento de propósito: nome de tipo muda com o tempo, e
// uma conferência que depende de um nome errado passa em silêncio sem ter
// verificado nada. Aqui, zero em TUDO com linhas presentes é o sinal.
console.log("\njsonb navegável no destino (zero em tudo = payload virou escalar):");
const [nav] = await destino.unsafe(
  `select count(*)::int as total,
          count(payload->'from'->>'id')::int as autor_comentario,
          count(payload->'sender'->>'id')::int as autor_mensagem,
          count(payload->'media'->>'id')::int as post_de_origem
   from events`
);
const navegaveis = nav.autor_comentario + nav.autor_mensagem + nav.post_de_origem;
console.log(`  ${nav.total} eventos — from.id=${nav.autor_comentario}, sender.id=${nav.autor_mensagem}, media.id=${nav.post_de_origem}`);
if (nav.total > 0 && navegaveis === 0) {
  divergiu = true;
  console.log("  ESCALAR — os payloads foram corrompidos na cópia");
} else if (nav.total > 0) {
  console.log("  ok");
}

await Promise.all([origem.end({ timeout: 5 }), destino.end({ timeout: 5 })]);
console.log(divergiu ? "\nDIVERGENCIA — nao vire o banco." : "\nTudo confere.");
process.exit(divergiu ? 1 : 0);
