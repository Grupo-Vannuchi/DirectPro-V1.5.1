"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Mantém a tela em dia sem recarregar a página.
//
// Existe por causa de duas coisas que a v1 deixou em aberto:
//
//   1. A lista mora no layout, e layout não é refeito em navegação pelo lado do
//      cliente. Mensagem nova não aparecia até um F5.
//   2. O envio roda em after(), DEPOIS da resposta da ação. O balão ficava em
//      "enviando…" mesmo com a mensagem já entregue.
//
// router.refresh() refaz o payload do servidor — layout e página — sem perder
// rolagem, foco nem o que estiver digitado no campo de resposta.
//
// Só roda com a aba VISÍVEL. Aba em segundo plano não consulta nada, que era a
// objeção de custo: uma aba esquecida aberta a noite toda não gera consulta
// nenhuma. E ao voltar para a aba, atualiza na hora — que é justamente quando
// alguém quer ver o que chegou.

const INTERVALO_MS = 30_000;

export default function Atualizador() {
  const router = useRouter();

  useEffect(() => {
    const atualizarSeVisivel = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    const timer = setInterval(atualizarSeVisivel, INTERVALO_MS);
    document.addEventListener("visibilitychange", atualizarSeVisivel);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", atualizarSeVisivel);
    };
  }, [router]);

  return null;
}
