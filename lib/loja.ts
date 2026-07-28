import "server-only";

// ============================================================
// Catálogo da loja
//
// Este painel roda instalado na conta de cada cliente. Se o catálogo fosse
// fixo no código, todo produto novo só apareceria para quem atualizasse a
// instalação — ou seja, quase ninguém. Por isso o catálogo é buscado de uma
// URL pública, com o catálogo local como reserva.
//
// Fluxo:
//   1. tenta baixar o JSON remoto (revalidado de hora em hora)
//   2. se falhar, ou vier vazio/inválido, usa CATALOGO_LOCAL
// Assim a loja nunca fica quebrada, mesmo sem internet ou com o JSON fora do ar.
//
// Para publicar um produto novo, basta editar o JSON hospedado — nenhum
// cliente precisa atualizar nada.
// ============================================================

export type Produto = {
  id: string;
  nome: string;
  chamada: string;
  descricao: string;
  imagem: string;
  preco: string; // ex.: "39,90"
  precoDe?: string; // preço de referência riscado (opcional)
  periodo: string; // ex.: "por 1 ano de acesso"
  checkout: string;
  selo?: string;
  destaque?: boolean;
  indisponivel?: boolean;
  recursos: string[];
};

const URL_CATALOGO =
  process.env.LOJA_CATALOGO_URL || "https://mkt.creativearena.com.br/loja.json";

// Reserva: o que aparece se o catálogo remoto não responder.
const CATALOGO_LOCAL: Produto[] = [
  {
    id: "canva-pro",
    nome: "Canva Pro",
    chamada: "1 ano de recursos premium",
    descricao:
      "Todos os recursos premium liberados na sua própria conta — você continua com seus projetos, suas pastas e seu histórico.",
    imagem: "https://mkt.creativearena.com.br/002.png",
    preco: "39,90",
    periodo: "por 1 ano de acesso",
    checkout: "https://pay.cakto.com.br/6PsxxH9",
    selo: "Mais procurado",
    destaque: true,
    recursos: [
      "🤖 IA integrada",
      "✂️ Removedor de fundo",
      "📏 Redimensionamento automático",
      "🎯 Kit de Marca",
      "📅 Agendamento de posts",
      "☁️ Mais armazenamento",
      "👥 Colaboração em equipe",
    ],
  },
];

// Confere o mínimo para um item ser exibível. Um JSON malformado não pode
// derrubar a página inteira — os itens inválidos são simplesmente ignorados.
function valido(p: unknown): p is Produto {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.nome === "string" &&
    typeof o.preco === "string" &&
    typeof o.checkout === "string" &&
    Array.isArray(o.recursos)
  );
}

export async function carregarCatalogo(): Promise<Produto[]> {
  try {
    const res = await fetch(URL_CATALOGO, {
      // atualiza de hora em hora sem precisar de deploy
      next: { revalidate: 3600 },
    });
    if (!res.ok) return CATALOGO_LOCAL;
    const json = (await res.json()) as unknown;
    const lista = Array.isArray(json)
      ? json
      : ((json as { produtos?: unknown }).produtos ?? []);
    if (!Array.isArray(lista)) return CATALOGO_LOCAL;
    const produtos = lista.filter(valido);
    return produtos.length ? produtos : CATALOGO_LOCAL;
  } catch {
    // sem rede, JSON inválido ou host fora: a loja continua funcionando
    return CATALOGO_LOCAL;
  }
}
