import { PRODUTOS, type Produto } from "@/lib/produtos";
import { card, cardHover, muted, pageTitle, pageSubtitle, btnPrimary } from "../ui";

// Marca do produto sem depender de imagem hospedada em lugar nenhum: as
// iniciais sobre um gradiente. Nada de URL externa que possa sair do ar.
function Marca({ nome }: { nome: string }) {
  const iniciais = nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold tracking-tight text-white"
    >
      {iniciais}
    </span>
  );
}

function CardProduto({ p }: { p: Produto }) {
  return (
    <div className={`${card} ${cardHover} flex h-full flex-col p-5`}>
      <div className="flex items-center gap-3.5">
        <Marca nome={p.nome} />
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-50">
          {p.nome}
        </h2>
      </div>

      {p.descricao && (
        <p className={`mt-4 text-[13px] leading-relaxed ${muted}`}>{p.descricao}</p>
      )}

      {/* o botão fica colado na base, para os cards alinharem mesmo quando as
          descrições têm tamanhos diferentes */}
      <div className="mt-auto pt-6">
        <a
          href={p.url}
          target="_blank"
          rel="noreferrer noopener"
          className={`${btnPrimary} w-full`}
        >
          Conhecer
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
}

export default function LojaPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className={pageTitle}>Produtos</h1>
        <p className={pageSubtitle}>Outras soluções que podem ajudar o seu negócio.</p>
      </header>

      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PRODUTOS.map((p) => (
          <CardProduto key={p.id} p={p} />
        ))}
      </div>

      <p className={`text-xs ${muted}`}>
        Ficou com dúvida? Chame a gente no{" "}
        <a
          href="https://instagram.com/n8xmarketing"
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
        >
          @n8xmarketing
        </a>
        .
      </p>
    </div>
  );
}
