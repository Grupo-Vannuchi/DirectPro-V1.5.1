"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { marcarVisto } from "./marcar-visto";

// Avisa o servidor que esta conversa foi aberta.
//
// Roda em efeito, ou seja, só depois de a página existir de verdade no
// navegador. É essa a diferença que importa: o prefetch renderiza no servidor,
// mas não monta componente nenhum no cliente.
//
// `ultimaMensagemEm` entra nas dependências para regravar quando chega
// mensagem com a conversa aberta. Sem isso, o que chegasse enquanto a pessoa
// lê contaria como não lido assim que ela saísse.
//
// Não é `quantidade` (total de mensagens) de propósito: `conversationMessages`
// tem `limite = 200`, e numa conversa que já passou disso o total satura e para
// de mudar — o efeito nunca mais redisparava. O horário da última mensagem
// sempre muda quando chega mensagem nova, esteja a conversa saturada ou não.
export default function Visto({
  contactIgId,
  ultimaMensagemEm,
}: {
  contactIgId: string;
  ultimaMensagemEm: number;
}) {
  const router = useRouter();

  useEffect(() => {
    // O refresh depois da gravação é o que faz o badge sumir da lista.
    //
    // Sem ele o recurso parece quebrado: medido, a gravação acontecia e a lista
    // continuava mostrando "26" indefinidamente. A causa é onde a lista mora —
    // no LAYOUT, para sobreviver à troca de conversa —, e layout não é refeito
    // em navegação pelo cliente.
    //
    // revalidatePath não resolve aqui: o layout é `force-dynamic`, então não há
    // cache de servidor para invalidar. Quem realmente refaz a árvore é o
    // router.refresh(), o mesmo que o Atualizador usa a cada 30s.
    //
    // Não entra em laço: o refresh não muda `contactIgId` nem
    // `ultimaMensagemEm`, então o efeito não redispara.
    //
    // Falha na gravação não merece tela de erro — o pior caso é a conversa
    // continuar marcada, e a próxima abertura resolve. Por isso o refresh só
    // acontece quando a gravação deu certo.
    void marcarVisto(contactIgId)
      .then(() => router.refresh())
      .catch(() => {});
  }, [contactIgId, ultimaMensagemEm, router]);

  return null;
}
