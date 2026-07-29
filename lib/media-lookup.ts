import "server-only";
import { getMedia, getMediaById } from "./ig";

// Capa e link do post ficam SÓ aqui, buscados na hora de exibir — nunca no
// banco. As URLs de miniatura do CDN do Instagram expiram, então um link salvo
// vira imagem quebrada semanas depois.

// Uma listagem cobre os posts recentes, que é de onde vem quase todo
// comentário. O resto (post antigo) vira busca avulsa, com teto para uma lista
// cheia de posts diferentes não virar uma enxurrada de chamadas.
const RECENT_MEDIA_LIMIT = 40;
const MAX_INDIVIDUAL_LOOKUPS = 8;

export type PostRef = {
  id: string;
  permalink: string | null;
  thumb: string | null;
  caption: string | null;
};

type Json = Record<string, unknown>;

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function toPostRef(m: Json): PostRef | null {
  const id = texto(m.id);
  if (!id) return null;
  return {
    id,
    permalink: texto(m.permalink),
    // vídeo e reels só têm thumbnail_url; foto só tem media_url
    thumb: texto(m.thumbnail_url) ?? texto(m.media_url),
    caption: texto(m.caption),
  };
}

// Devolve o que conseguiu resolver. Nunca lança: se o Instagram estiver fora do
// ar ou o token vencido, volta um mapa vazio e quem chama mostra a lista sem as
// capas.
export async function resolvePosts(
  igUserId: string,
  token: string,
  mediaIds: string[]
): Promise<Map<string, PostRef>> {
  const mapa = new Map<string, PostRef>();
  const procurados = new Set(mediaIds.filter(Boolean));
  if (!procurados.size) return mapa;

  try {
    for (const m of await getMedia(igUserId, token, RECENT_MEDIA_LIMIT)) {
      const ref = toPostRef(m);
      if (ref && procurados.has(ref.id)) mapa.set(ref.id, ref);
    }
  } catch {
    // segue para as buscas avulsas: elas podem dar certo mesmo assim
  }

  const faltando = [...procurados].filter((id) => !mapa.has(id)).slice(0, MAX_INDIVIDUAL_LOOKUPS);
  if (faltando.length) {
    const buscas = await Promise.allSettled(faltando.map((id) => getMediaById(id, token)));
    for (const b of buscas) {
      if (b.status !== "fulfilled") continue;
      const ref = toPostRef(b.value);
      if (ref) mapa.set(ref.id, ref);
    }
  }

  return mapa;
}
