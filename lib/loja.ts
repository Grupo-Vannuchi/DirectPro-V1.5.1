// Produtos da N8X exibidos em /loja.
//
// Antes isto era um catálogo de LOJA: cada item tinha preço, período, lista de
// recursos e link de checkout, e a lista vinha de um JSON hospedado por
// terceiro, rebaixado de hora em hora. Aquele arranjo existia para o autor
// anterior publicar produto em todas as instalações sem ninguém atualizar nada
// — ou seja, ele decidia remotamente o que aparecia no painel do cliente, e o
// pagamento ia para o checkout dele.
//
// Foi removido por inteiro: a busca remota, a validação do JSON e a variável
// LOJA_CATALOGO_URL. O que sobrou são links para os produtos da própria casa.
// Acrescentar um produto é acrescentar um item nesta lista.

export type Produto = {
  id: string;
  nome: string;
  // Uma linha sobre o produto. Opcional: sem ela o card mostra só o nome e o
  // botão, o que é melhor do que texto inventado.
  descricao?: string;
  url: string;
};

export const PRODUTOS: Produto[] = [
  {
    id: "n8x-marketing",
    nome: "N8X Marketing",
    url: "https://n8xmarketing.com.br",
  },
  {
    id: "metodo-ia",
    nome: "Metodo IA",
    url: "https://metodotia.com",
  },
];
