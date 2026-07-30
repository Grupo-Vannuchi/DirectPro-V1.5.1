import "server-only";
import { sql } from "./db";

// De onde vem uma conversa.
//
// Não existe tabela de mensagens. As recebidas estão em `events` desde que o
// app subiu (o webhook grava o evento inteiro); as enviadas saem pela `queue` e
// voltam como eco, também em `events`. Costurar as duas fontes aproveita todo o
// histórico já acumulado, sem migração e sem backfill.
//
// A dedução pelo `mid` existe porque uma mensagem enviada pelo sistema aparece
// NAS DUAS fontes: na fila, porque nós a enfileiramos, e no eco, porque a Meta
// nos devolve o que foi enviado.

// Em que pé está o envio, do ponto de vista de quem olha a conversa.
//
// Traduz os cinco status da fila para os três que interessam na tela. O
// atendente não precisa saber a diferença entre 'pending' e 'sending', nem entre
// 'failed' e 'skipped' — precisa saber se saiu, se está saindo ou se não vai
// sair.
export type MessageDelivery = "sent" | "sending" | "failed";

export type InboxMessage = {
  mid: string | null;
  direction: "in" | "out";
  text: string;
  at: Date;
  delivery: MessageDelivery;
};

export function mergeMessages(
  fromEvents: InboxMessage[],
  fromQueue: InboxMessage[]
): InboxMessage[] {
  const jaVistos = new Set(fromEvents.map((m) => m.mid).filter((m): m is string => Boolean(m)));
  const daFila = fromQueue.filter((m) => !m.mid || !jaVistos.has(m.mid));
  return [...fromEvents, ...daFila].sort((a, b) => a.at.getTime() - b.at.getTime());
}

const TIPOS_RECEBIDOS = ["message", "story_reply", "quick_reply"];

// Lista de conversas: uma linha por pessoa, ordenada pela última troca.
export async function listConversations(accountId: string, limite = 50) {
  return (await sql().query(
    `with trocas as (
       select e.payload->'sender'->>'id' as cid, e.created_at as at
       from events e
       where e.account_id = $1 and e.type = any($2::text[])
       union all
       select e.payload->'recipient'->>'id', e.created_at
       from events e
       where e.account_id = $1 and e.type = 'message_sent'
     )
     select t.cid as ig_id,
            max(t.at) as last_at,
            count(*)::int as total,
            c.username, c.name, c.profile_pic, c.last_reply_at
     from trocas t
     left join contacts c on c.account_id = $1 and c.ig_id = t.cid
     where t.cid is not null
     group by t.cid, c.username, c.name, c.profile_pic, c.last_reply_at
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
  }[];
}

// Mensagens de UMA conversa, já fundidas e em ordem.
export async function conversationMessages(
  accountId: string,
  contactIgId: string,
  limite = 200
): Promise<InboxMessage[]> {
  // O driver do Neon devolve linha sem tipo. Este é o formato cru das duas
  // consultas abaixo — a conversão vai no resultado já resolvido, que é o
  // idioma usado no resto do projeto.
  type LinhaCrua = {
    direction: "in" | "out";
    at: string | Date;
    mid: string | null;
    text: string;
    delivery: MessageDelivery;
  };

  const [doEvents, daFila] = (await Promise.all([
    sql().query(
      `select case when e.type = 'message_sent' then 'out' else 'in' end as direction,
              e.created_at as at,
              e.payload->'message'->>'mid' as mid,
              coalesce(e.payload->'message'->>'text', '') as text,
              -- Evento é fato consumado: chegou ou saiu, não há meio caminho.
              'sent' as delivery
       from events e
       where e.account_id = $1
         and (
           (e.type = any($3::text[]) and e.payload->'sender'->>'id' = $2)
           or (e.type = 'message_sent' and e.payload->'recipient'->>'id' = $2)
         )
       order by e.created_at desc
       limit $4`,
      [accountId, contactIgId, TIPOS_RECEBIDOS, limite]
    ),
    sql().query(
      `select 'out' as direction,
              coalesce(q.sent_at, q.created_at) as at,
              q.message_id as mid,
              coalesce(q.payload->>'text', '') as text,
              case q.status
                when 'sent' then 'sent'
                when 'failed' then 'failed'
                when 'skipped' then 'failed'
                else 'sending'
              end as delivery
       from queue q
       -- SEM filtro de status, de propósito. Antes só entrava 'sent', e por isso
       -- uma resposta recém-enviada ficava invisível: ela nasce 'pending' e a
       -- drenagem acontece depois da resposta da ação. O atendente clicava em
       -- Enviar, a conversa não mudava, e ele clicava de novo — mandando duas.
       -- Item que falhou ou foi descartado também precisa aparecer: some em
       -- silêncio é pior do que aparecer marcado.
       where q.account_id = $1 and q.contact_ig_id = $2
         -- Só DM de verdade. 'comment_reply' é resposta PÚBLICA no comentário e
         -- 'story_reaction' é reação sem texto: os dois têm contact_ig_id e
         -- entrariam na conversa privada como mensagem que nunca existiu.
         -- Nenhum dos dois recebe message_id, então ficariam com mid nulo e
         -- jamais seriam deduplicados.
         --
         -- KIND NOVO DE DM PRECISA ENTRAR AQUI. A lista de kinds válidos é a
         -- constraint queue_kind_check, em lib/db.ts. Esquecer de acrescentar
         -- aqui faz a mensagem sumir da conversa em silêncio: sem erro, sem
         -- log, sem teste vermelho. A lista é positiva de propósito — o defeito
         -- que motivou este filtro nasceu justamente de deixar entrar por
         -- omissão, e sumir é mais fácil de perceber do que poluir.
         and q.kind in (
           'private_reply','dm_welcome','dm_link','dm_reminder',
           'dm_follow_gate','dm_email_ask','dm_manual'
         )
       order by coalesce(q.sent_at, q.created_at) desc
       limit $3`,
      [accountId, contactIgId, limite]
    ),
  ])) as [LinhaCrua[], LinhaCrua[]];

  const paraInbox = (linhas: LinhaCrua[]): InboxMessage[] =>
    linhas.map((l) => ({ ...l, at: new Date(l.at) }));

  return mergeMessages(paraInbox(doEvents), paraInbox(daFila));
}
