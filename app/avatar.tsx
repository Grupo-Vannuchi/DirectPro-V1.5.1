"use client";
import { useState } from "react";
import { initial } from "@/lib/initials";

// Foto de perfil com fallback para a inicial — as URLs do CDN do Instagram
// expiram depois de um tempo, então a imagem pode falhar mesmo salva no banco.
export default function Avatar({
  src,
  name,
  className = "h-10 w-10",
  textClassName = "text-sm",
}: {
  src: string | null;
  name: string;
  className?: string;
  textClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={`${className} shrink-0 rounded-full border border-zinc-200 object-cover dark:border-zinc-700`}
      />
    );
  }
  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 font-bold text-white ${textClassName}`}
    >
      {initial(name)}
    </span>
  );
}
