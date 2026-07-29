import "server-only";
import { PERIODS, type EventFilters } from "./event-filters";

// COMO o filtro vira SQL. Fica separado de event-filters.ts porque a barra é
// componente de cliente: as listas de valores válidos ela precisa, o esquema do
// banco não.
//
// Nada vindo do navegador é concatenado — todo valor entra como $n. O que chega
// aqui já passou pela lista branca de parseFilters().

// A busca por @perfil olha o username que vem do join com contatos, então a
// listagem e a contagem precisam do mesmo FROM. Se divergirem, o número na tela
// discorda da lista e ninguém confia no filtro.
export const EVENTS_FROM = `
  from events e
  left join contacts cf
    on cf.account_id = e.account_id and cf.ig_id = e.payload->'from'->>'id'
  left join contacts cs
    on cs.account_id = e.account_id and cs.ig_id = e.payload->'sender'->>'id'`;

export type Where = { sql: string; params: unknown[] };

// % e _ são curingas do LIKE. Sem escapar, quem busca "100%" recebe a lista
// inteira e acha que o filtro está quebrado.
function toSearchPattern(termo: string): string {
  return `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function buildWhere(accountId: string, f: EventFilters): Where {
  // Os parênteses do primeiro termo importam: sem eles `A or B and C` seria
  // lido como `A or (B and C)` e vazaria evento de outra conta assim que
  // qualquer filtro entrasse.
  const partes = ["(e.account_id = $1 or e.account_id is null)"];
  const params: unknown[] = [accountId];
  const ref = () => `$${params.length}`;

  if (f.type) {
    params.push(f.type);
    partes.push(`e.type = ${ref()}`);
  }

  if (f.post) {
    params.push(f.post);
    partes.push(`e.payload->'media'->>'id' = ${ref()}`);
  }

  const days = PERIODS.find((p) => p.key === f.period)?.days ?? null;
  if (days !== null) {
    params.push(days);
    partes.push(`e.created_at >= now() - make_interval(days => ${ref()}::int)`);
  }

  if (f.q) {
    params.push(toSearchPattern(f.q));
    const t = ref();
    // Texto do comentário, texto da DM, @ que veio no evento e os dois
    // usernames dos contatos. Campo ausente vira null e o `or` cuida disso.
    partes.push(
      `(e.payload->>'text' ilike ${t}
        or e.payload->'message'->>'text' ilike ${t}
        or e.payload->'from'->>'username' ilike ${t}
        or cf.username ilike ${t}
        or cs.username ilike ${t})`
    );
  }

  return { sql: partes.join("\n    and "), params };
}

// Posts que têm interação registrada, do mais recente para o mais antigo. É
// esta lista que alimenta o seletor: assim toda opção oferecida produz
// resultado. Não recebe os outros filtros de propósito — senão escolher um post
// esconderia os demais e não daria para trocar.
export function postsComEventos(accountId: string, limite: number): Where {
  return {
    sql: `select e.payload->'media'->>'id' as id, count(*)::int as total
          from events e
          where (e.account_id = $1 or e.account_id is null)
            and e.payload->'media'->>'id' is not null
          group by 1
          order by max(e.created_at) desc
          limit ${limite}`,
    params: [accountId],
  };
}
