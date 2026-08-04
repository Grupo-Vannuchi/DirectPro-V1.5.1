"use client";
import { useEffect } from "react";
import { marcarVisto } from "./marcar-visto";

// Avisa o servidor que esta conversa foi aberta.
//
// Roda em efeito, ou seja, só depois de a página existir de verdade no
// navegador. É essa a diferença que importa: o prefetch renderiza no servidor,
// mas não monta componente nenhum no cliente.
//
// `quantidade` entra nas dependências para regravar quando chega mensagem com a
// conversa aberta. Sem isso, o que chegasse enquanto a pessoa lê contaria como
// não lido assim que ela saísse.
export default function Visto({
  contactIgId,
  quantidade,
}: {
  contactIgId: string;
  quantidade: number;
}) {
  useEffect(() => {
    // Falha aqui não merece tela de erro: o pior caso é a conversa continuar
    // marcada como não lida, e a próxima abertura resolve.
    void marcarVisto(contactIgId).catch(() => {});
  }, [contactIgId, quantidade]);

  return null;
}
