// Tipos compartilhados pelas três peças da tela de automação: o formulário, o
// seletor de mídia e a pré-visualização em celular.

// O que a API /api/media devolve para cada post ou story.
export type Media = {
  id: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  permalink?: string;
};

// O post ou story já escolhido. Guarda a miniatura e a legenda junto do id
// porque o formulário salva os três — assim a automação continua mostrando a
// capa mesmo que a publicação saia do alcance da API depois.
export type Picked = { id: string; thumb: string; caption: string };

export type TriggerKind = "comment" | "story" | "dm";

// A conta conectada, só o que a pré-visualização precisa para parecer real.
export type Account = { username: string | null; avatar: string | null };
