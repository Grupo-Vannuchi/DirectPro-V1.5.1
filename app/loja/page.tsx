import { carregarCatalogo, type Produto } from "@/lib/loja";
import {
  card,
  cardHover,
  muted,
  pageTitle,
  pageSubtitle,
  btnPrimary,
  badgeAccent,
  badgeNeutral,
  emptyWrap,
} from "../ui";
import { IconStore } from "../icons";

export const dynamic = "force-dynamic";

function CardProduto({ p }: { p: Produto }) {
  return (
    <div
      className={`${card} ${p.indisponivel ? "opacity-70" : cardHover} flex h-full flex-col overflow-hidden ${
        p.destaque && !p.indisponivel ? "ring-1 ring-indigo-500/30" : ""
      }`}
    >
      {/* imagem */}
      <div className="relative flex items-center justify-center border-b border-zinc-200/70 bg-zinc-50/70 p-5 dark:border-zinc-800/70 dark:bg-zinc-950/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.imagem}
          alt={p.nome}
          className="max-h-40 w-auto rounded-xl object-contain"
          loading="lazy"
          decoding="async"
        />
        {(p.selo || p.indisponivel) && (
          <span className={`absolute right-3 top-3 ${p.indisponivel ? badgeNeutral : badgeAccent}`}>
            {p.indisponivel ? "Em breve" : p.selo}
          </span>
        )}
      </div>

      {/* conteúdo */}
      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-50">
          {p.nome}
        </h2>
        <p className="mt-0.5 text-[13px] font-medium text-indigo-600 dark:text-indigo-400">
          {p.chamada}
        </p>
        <p className={`mt-2.5 text-[13px] leading-relaxed ${muted}`}>{p.descricao}</p>

        {p.recursos.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {p.recursos.map((r) => (
              <li
                key={r}
                className="flex items-start gap-2 text-[13px] text-zinc-700 dark:text-zinc-300"
              >
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                {r}
              </li>
            ))}
          </ul>
        )}

        {/* preço e ação colados na base, para os cards alinharem */}
        <div className="mt-auto pt-6">
          <div className="flex items-end gap-1.5">
            {p.precoDe && (
              <span className="mb-1 text-[13px] text-zinc-400 line-through">R$ {p.precoDe}</span>
            )}
            <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">R$</span>
            <span className="text-[32px] font-bold leading-none tracking-[-0.02em] text-zinc-900 dark:text-zinc-50">
              {p.preco}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            {p.periodo}
          </p>

          {p.indisponivel ? (
            <div
              className={`mt-4 w-full rounded-xl border border-dashed border-zinc-300 py-2.5 text-center text-[13px] font-medium ${muted} dark:border-zinc-700`}
            >
              Em breve
            </div>
          ) : (
            <a
              href={p.checkout}
              target="_blank"
              rel="noreferrer noopener"
              className={`${btnPrimary} mt-4 w-full`}
            >
              Quero o {p.nome}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function LojaPage() {
  const produtos = await carregarCatalogo();

  return (
    <div className="space-y-6">
      <header>
        <h1 className={pageTitle}>Loja</h1>
        <p className={pageSubtitle}>
          Ferramentas selecionadas para quem usa o DirectPro, com preço de cliente.
        </p>
      </header>

      {produtos.length === 0 ? (
        <div className={emptyWrap}>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
            <IconStore className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Nenhum produto disponível
            </p>
            <p className={`mx-auto mt-1 max-w-sm text-xs ${muted}`}>
              Novidades aparecem aqui primeiro. Volte em breve.
            </p>
          </div>
        </div>
      ) : (
        <div
          className={`grid items-stretch gap-4 ${
            produtos.length === 1
              ? "max-w-sm"
              : produtos.length === 2
                ? "sm:grid-cols-2"
                : "sm:grid-cols-2 xl:grid-cols-3"
          }`}
        >
          {produtos.map((p) => (
            <CardProduto key={p.id} p={p} />
          ))}
        </div>
      )}

      <p className={`text-xs ${muted}`}>
        Sentiu falta de alguma ferramenta? Me chame no{" "}
        <a
          href="https://instagram.com/oricardotenorio_"
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
        >
          @oricardotenorio_
        </a>{" "}
        — o que mais pedirem, eu trago para a loja.
      </p>
    </div>
  );
}
