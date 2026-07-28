// ============================================================
// Variáveis personalizadas nas mensagens ({{first_name}} etc.)
//
// Ponto único de definição: para acrescentar uma variável nova, basta somar um
// item em VARIABLES. Nada nos fluxos existentes precisa mudar, porque a
// substituição acontece no momento do envio (lib/engine.ts → processItem), que
// é por onde TODA mensagem passa — DM de boas-vindas, link, lembrete, resposta
// pública, pedido de follow, pedido de e-mail e o que vier depois.
//
// Sintaxe aceita:
//   {{first_name}}            → valor da variável
//   {{first_name|amigo}}      → valor, ou "amigo" se estiver vazio
// O espaçamento interno é tolerado: {{ first_name }} funciona igual.
// ============================================================

// Dados da pessoa que interagiu. Campos opcionais porque o Instagram nem
// sempre entrega tudo (perfis sem nome público, por exemplo).
export type VariableContext = {
  username?: string | null;
  name?: string | null;
  email?: string | null;
};

export type VariableDef = {
  key: string;
  label: string;
  description: string;
  // Exemplo mostrado no seletor do editor.
  sample: string;
  resolve: (ctx: VariableContext) => string;
};

function firstName(ctx: VariableContext): string {
  const full = (ctx.name ?? "").trim();
  if (full) return full.split(/\s+/)[0] ?? "";
  // Sem nome público, o @ é o melhor substituto — melhor que texto vazio.
  return (ctx.username ?? "").trim();
}

export const VARIABLES: VariableDef[] = [
  {
    key: "first_name",
    label: "Primeiro nome",
    description: "Primeiro nome de quem interagiu. Se não houver, usa o @.",
    sample: "Ana",
    resolve: firstName,
  },
  {
    key: "full_name",
    label: "Nome completo",
    description: "Nome completo do perfil. Se não houver, usa o @.",
    sample: "Ana Souza",
    resolve: (ctx) => (ctx.name ?? "").trim() || (ctx.username ?? "").trim(),
  },
  {
    key: "username",
    label: "Username (@)",
    description: "O @ do perfil, sem a arroba.",
    sample: "ana.souza",
    resolve: (ctx) => (ctx.username ?? "").trim(),
  },
  {
    key: "email",
    label: "E-mail",
    description: "E-mail coletado pela automação, quando houver.",
    sample: "ana@email.com",
    resolve: (ctx) => (ctx.email ?? "").trim(),
  },
];

const BY_KEY = new Map(VARIABLES.map((v) => [v.key, v]));

// {{ chave | fallback }} — a chave aceita letras, números e _
const TOKEN = /\{\{\s*([a-z0-9_]+)\s*(?:\|([^}]*))?\}\}/gi;

// Substitui as variáveis pelo valor real. Uma variável desconhecida é removida
// (em vez de vazar "{{xyz}}" para o cliente final, que pareceria defeito).
export function renderVariables(text: string, ctx: VariableContext): string {
  if (!text || !text.includes("{{")) return text;
  return text.replace(TOKEN, (_full, rawKey: string, fallback?: string) => {
    const def = BY_KEY.get(rawKey.toLowerCase());
    const valor = def ? def.resolve(ctx).trim() : "";
    return valor || (fallback ?? "").trim();
  });
}

// Pré-visualização no editor: mostra os exemplos, para o usuário ver como a
// mensagem fica sem precisar disparar a automação.
export function previewVariables(text: string): string {
  if (!text || !text.includes("{{")) return text;
  return text.replace(TOKEN, (_full, rawKey: string, fallback?: string) => {
    const def = BY_KEY.get(rawKey.toLowerCase());
    return def ? def.sample : (fallback ?? "").trim();
  });
}

// Regex própria: TOKEN é global e .test() guarda lastIndex entre chamadas,
// o que faria esta função alternar entre true e false para o mesmo texto.
export function hasVariables(text: string): boolean {
  return Boolean(text) && /\{\{\s*[a-z0-9_]+\s*(\|[^}]*)?\}\}/i.test(text);
}
