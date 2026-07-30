"use client";
import { useState } from "react";

// A imagem do anexo, com plano B.
//
// Para ig_post, share e image, o `url` do payload é o ARQUIVO em si, servido
// pelo CDN da Meta (lookaside.fbsbx.com). Confirmado: content-type image/jpeg.
//
// Mas é URL assinada. Ela funciona por dias, não para sempre, e um dia vai
// expirar — e o `share` pode vir com vídeo em vez de foto. Nos dois casos o
// carregamento falha, e a bolha não pode ficar com o ícone de imagem quebrada:
// o onError esconde a imagem e quem chama mostra só o rótulo.
export default function AnexoImagem({ url, alt }: { url: string; alt: string }) {
  const [quebrou, setQuebrou] = useState(false);
  if (quebrou) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setQuebrou(true)}
      className="mb-1.5 max-h-56 w-full rounded-lg object-cover"
    />
  );
}
