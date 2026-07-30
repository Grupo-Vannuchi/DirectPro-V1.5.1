"use client";
import { useEffect, useRef } from "react";

// Abre a conversa na mensagem mais recente, como qualquer aplicativo de chat.
//
// Sem isto, uma conversa de 14 mensagens abre no topo e a pessoa precisa rolar
// até o fim toda vez para ver o que acabou de chegar.
//
// É efeito legítimo: mexe no DOM, não em estado. Quem chama passa uma `key` que
// muda por conversa, então trocar de conversa remonta e rola de novo.
export default function RolarParaFim() {
  const marca = useRef<HTMLDivElement>(null);
  useEffect(() => {
    marca.current?.scrollIntoView({ block: "end" });
  }, []);
  return <div ref={marca} aria-hidden="true" />;
}
