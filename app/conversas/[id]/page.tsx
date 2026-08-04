import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureSchema, sql } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import {
  conversationMessages,
  attachmentLabel,
  attachmentHasImage,
  type InboxAttachment,
} from "@/lib/conversations";
import { windowState, formatWindowLeft } from "@/lib/inbox-window";
import { fmtDate } from "@/lib/format";
import { muted, badgeOk, badgeNeutral } from "../../ui";
import Avatar from "../../avatar";
import ReplyForm from "./reply-form";
import AreaMensagens from "./area-mensagens";
import AnexoImagem from "./anexo-imagem";
import Visto from "./visto";

export const dynamic = "force-dynamic";

// Prévia do que a pessoa compartilhou na DM.
//
// O que a Meta entrega, verificado contra o CDN dela:
//
//   ig_post, share  a `url` É a imagem (image/jpeg) → miniatura de verdade
//   ig_reel         só permalink do instagram.com   → sem imagem
//   unsupported     a `url` é vídeo de vários MB    → só link, não carrega
//
// ig_reel é o tipo mais comum, então a maioria dos cartões continua sendo
// rótulo + legenda + link. Para ele, a miniatura exigiria a permissão
// oembed_read, que passa por revisão da Meta.
function CartaoAnexo({ anexo }: { anexo: InboxAttachment }) {
  const rotulo = attachmentLabel(anexo.type);
  const legenda = anexo.title?.replace(/\s+/g, " ").trim();
  const temImagem = Boolean(anexo.url) && attachmentHasImage(anexo.type);

  const corpo = (
    <>
      {temImagem && <AnexoImagem url={anexo.url!} alt={rotulo} />}
      <span className="block text-[11px] font-semibold uppercase tracking-[0.03em] opacity-80">
        {rotulo}
      </span>
      {legenda && (
        // Duas linhas: a legenda de reel costuma ser um texto inteiro, e o
        // cartão não pode virar a mensagem.
        //
        // SEM `block` aqui: line-clamp define o próprio display (-webkit-box), e
        // as duas classes brigam pela mesma propriedade. Com `block` junto, o
        // corte não acontece e a legenda inteira vaza.
        <span className="mt-1 line-clamp-2 text-xs leading-snug opacity-95">{legenda}</span>
      )}
      {anexo.url && (
        <span className="mt-1.5 block truncate text-[11px] underline underline-offset-2 opacity-75">
          {/* A URL do CDN da Meta não diz nada a ninguém — é
              "lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=…&signature=…".
              Só vale mostrar o endereço quando ele é permalink do Instagram. */}
          {anexo.url.includes("instagram.com")
            ? `${anexo.url.replace(/^https?:\/\/(www\.)?/, "")} ↗`
            : "abrir ↗"}
        </span>
      )}
    </>
  );

  const caixa = "mb-1.5 block max-w-[16rem] rounded-xl border border-current/25 px-2.5 py-2";
  return anexo.url ? (
    <a
      href={anexo.url}
      target="_blank"
      rel="noreferrer noopener"
      className={`${caixa} transition-opacity hover:opacity-80`}
    >
      {corpo}
    </a>
  ) : (
    <span className={caixa}>{corpo}</span>
  );
}

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,32}$/.test(id)) notFound();

  await ensureSchema();
  const account = await getSelectedAccount();
  if (!account) notFound();

  // As duas consultas em paralelo. O `as` vai no resultado já resolvido, que é
  // o padrão do resto do projeto — converter a Promise confunde o TypeScript.
  const [linhasContato, mensagens] = await Promise.all([
    sql().query(
      `select username, name, profile_pic, last_reply_at
       from contacts where account_id = $1 and ig_id = $2`,
      [account.ig_user_id, id]
    ),
    conversationMessages(account.ig_user_id, id),
  ]);

  const contato = (
    linhasContato as {
      username: string | null;
      name: string | null;
      profile_pic: string | null;
      last_reply_at: Date | null;
    }[]
  )[0];
  const janela = windowState(contato?.last_reply_at ?? null);
  // Nome como título e @ embaixo, como o Instagram faz. O @ só aparece quando há
  // nome — senão ele já É o título e repetiria.
  const arroba = contato?.username ? `@${contato.username}` : null;
  const quem = contato?.name?.trim() || arroba || "Visitante";
  const subtitulo = contato?.name?.trim() ? arroba : null;

  return (
    <>
      <Visto contactIgId={id} quantidade={mensagens.length} />

      {/* Cabeçalho parado no topo da coluna */}
      <div className="flex items-center gap-3 border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
        {/* No desktop a lista está do lado; este atalho só serve no celular. */}
        <Link
          href="/conversas"
          aria-label="Voltar para a lista"
          className={`-ml-1 rounded-lg px-2 py-1 text-sm lg:hidden ${muted}`}
        >
          ←
        </Link>
        <Avatar
          src={contato?.profile_pic ?? null}
          name={quem}
          className="h-9 w-9"
          textClassName="text-sm"
        />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{quem}</p>
          {subtitulo && <p className={`truncate text-xs ${muted}`}>{subtitulo}</p>}
        </div>
        <span className={janela.open ? badgeOk : badgeNeutral}>
          {janela.open ? `responde por ${formatWindowLeft(janela.msLeft)}` : "só leitura"}
        </span>
      </div>

      {/* Só as mensagens rolam. A key remonta ao trocar de conversa, o que zera
          rolagem e aviso de mensagem nova junto. */}
      <AreaMensagens key={id} quantidade={mensagens.length}>
        {!mensagens.length && (
          <p className={`m-auto text-sm ${muted}`}>Nenhuma mensagem nesta conversa.</p>
        )}
        {mensagens.map((m, i) => {
          const falhou = m.delivery === "failed";
          const saindo = m.delivery === "sending";
          return (
            <div
              key={`${m.mid ?? "sem-id"}-${i}`}
              className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                m.direction === "in"
                  ? "self-start bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  : falhou
                    ? "self-end border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
                    : `self-end bg-indigo-500 text-white ${saindo ? "opacity-60" : ""}`
              }`}
            >
              {m.attachment && <CartaoAnexo anexo={m.attachment} />}
              {/* Sem texto E sem anexo é o caso raro que sobra: aí sim não há o
                  que mostrar. Com anexo, o rótulo acima já diz o que chegou. */}
              {m.text || (!m.attachment && <span className="italic opacity-70">(sem texto)</span>)}
              <span
                className={`mt-1 block text-[10px] ${
                  m.direction === "in" || falhou ? "text-zinc-500" : "text-indigo-100"
                }`}
              >
                {/* Enquanto não saiu, a hora ainda é a de criação e não diz nada
                    útil — o que importa é que está a caminho. */}
                {saindo ? "enviando…" : falhou ? "não enviada" : fmtDate(m.at)}
              </span>
            </div>
          );
        })}
      </AreaMensagens>

      {/* Formulário parado no rodapé da coluna */}
      <div className="border-t border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
        <ReplyForm
          contactIgId={id}
          open={janela.open}
          closedReason="A janela de 24h fechou. Você pode ler, mas só é possível responder quem falou há menos de 24 horas — é regra da Meta, não do painel."
        />
      </div>
    </>
  );
}
