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

// Anexo recebido. A v1 não ENVIA mídia, mas recebe o tempo todo — gente
// compartilha reel na DM o tempo inteiro. O payload já traz tipo e link; sem
// isto a conversa mostrava só "(sem texto)" e o atendente não fazia ideia do que
// a pessoa tinha mandado.
// `title` é a legenda do reel ou do post compartilhado — a Meta manda em
// ig_reel e ig_post, e é o mais perto de uma prévia que dá para chegar. Ela NÃO
// manda miniatura em tipo nenhum, então a imagem do cartão não existe: pegá-la
// exigiria a permissão oembed_read, que passa por revisão da Meta.
export type InboxAttachment = { type: string; url: string | null; title: string | null };

export type InboxMessage = {
  mid: string | null;
  direction: "in" | "out";
  text: string;
  at: Date;
  delivery: MessageDelivery;
  attachment: InboxAttachment | null;
};

// Como cada tipo de anexo se apresenta. O que a Meta manda hoje em DM do
// Instagram; tipo desconhecido cai no rótulo genérico em vez de sumir.
const ANEXOS: Record<string, string> = {
  ig_reel: "🎬 Reel",
  ig_post: "🖼️ Post",
  share: "🔗 Publicação",
  image: "📷 Foto",
  video: "🎥 Vídeo",
  audio: "🎤 Áudio",
  file: "📎 Arquivo",
  story_mention: "📖 Menção no story",
  location: "📍 Localização",
  // A API diz "não suportado", mas o arquivo VEM: testando a URL desses casos,
  // voltou video/mp4. É a Meta não sabendo classificar, não a Meta se recusando
  // a entregar — então o rótulo diz que há mídia, e o link abre.
  unsupported_type: "🎞️ Mídia",
};

export function attachmentLabel(type: string): string {
  return ANEXOS[type] ?? "📎 Anexo";
}

// Para quais tipos a `url` é o ARQUIVO, e não uma página.
//
// Confirmado contra o CDN da Meta: ig_post e share devolvem image/jpeg. ig_reel
// é o único que devolve permalink do instagram.com, sem mídia direta —
// justamente o tipo mais comum, então a maioria dos cartões segue sem imagem.
//
// unsupported_type fica de fora de propósito: veio vídeo de 11 MB, e carregar
// isso dentro da lista de mensagens seria hostil com quem está no celular.
const COM_IMAGEM = new Set(["ig_post", "share", "image"]);

export function attachmentHasImage(type: string): boolean {
  return COM_IMAGEM.has(type);
}

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
    attachment_type: string | null;
    attachment_url: string | null;
    attachment_title: string | null;
  };

  const [doEvents, daFila] = (await Promise.all([
    sql().query(
      `select case when e.type = 'message_sent' then 'out' else 'in' end as direction,
              e.created_at as at,
              e.payload->'message'->>'mid' as mid,
              coalesce(e.payload->'message'->>'text', '') as text,
              -- Evento é fato consumado: chegou ou saiu, não há meio caminho.
              'sent' as delivery,
              -- Só o primeiro anexo. A Meta manda um array, mas na prática vem
              -- um por mensagem; mostrar "📎 Anexo" para o primeiro é melhor do
              -- que a bolha vazia que aparecia antes.
              e.payload->'message'->'attachments'->0->>'type' as attachment_type,
              e.payload->'message'->'attachments'->0->'payload'->>'url' as attachment_url,
              e.payload->'message'->'attachments'->0->'payload'->>'title' as attachment_title
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
              -- 'sent_text' é o texto COM as variáveis resolvidas, gravado no
              -- envio. 'text' é o template. Mensagem anterior a este registro só
              -- tem o template, e aí é ele mesmo — melhor mostrar "ola {name}"
              -- do que uma bolha vazia.
              coalesce(q.payload->>'sent_text', q.payload->>'text', '') as text,
              case q.status
                when 'sent' then 'sent'
                when 'failed' then 'failed'
                when 'skipped' then 'failed'
                else 'sending'
              end as delivery,
              -- A v1 não envia mídia, então o que sai nunca tem anexo.
              null as attachment_type,
              null as attachment_url,
              null as attachment_title
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
    linhas.map(({ attachment_type, attachment_url, attachment_title, ...l }) => ({
      ...l,
      at: new Date(l.at),
      attachment: attachment_type
        ? { type: attachment_type, url: attachment_url, title: attachment_title }
        : null,
    }));

  return mergeMessages(paraInbox(doEvents), paraInbox(daFila));
}
