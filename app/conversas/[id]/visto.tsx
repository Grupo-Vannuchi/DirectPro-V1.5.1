"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { marcarVisto } from "./marcar-visto";

// A trava mora no MÓDULO, não no componente, e essa distinção é a correção.
//
// Um `useRef` zera quando o componente remonta — e remontar é exatamente o que
// se suspeita que o refresh provocava. A trava seria reiniciada a cada volta do
// laço e não travaria nada. Estado de módulo sobrevive a remontagem, então a
// conversa é marcada no máximo uma vez por aba, aconteça o que acontecer com a
// árvore do React.
//
// Cresce com o número de conversas abertas na aba: dezenas de strings curtas.
// Some quando a página é recarregada, o que é o comportamento certo — aí é uma
// sessão nova de verdade.
const jaMarcadas = new Set<string>();

// Avisa o servidor que esta conversa foi aberta, e pede a lista de novo para o
// badge sumir.
//
// Roda em efeito, ou seja, só depois de a página existir de verdade no
// navegador. É essa a diferença que importa: o prefetch do <Link> renderiza no
// servidor, mas não monta componente nenhum no cliente — então passar o mouse
// pela lista não marca nada como lido.
//
// ---------------------------------------------------------------------------
// A TRAVA ABAIXO NÃO É PARANOIA. ELA EXISTE PORQUE ISSO JÁ DERRUBOU PRODUÇÃO.
// ---------------------------------------------------------------------------
//
// A primeira versão chamava `marcarVisto().then(() => router.refresh())` e
// confiava nas dependências do efeito para rodar uma vez. Não rodou uma vez: em
// produção, abrir conversa COM não lidas entrava em cadeia — gravar mudava a
// tela, a tela remontava, o efeito disparava de novo. Cada ciclo custa uma
// Server Action mais uma renderização inteira da rota; com o pool do banco em
// `max: 3`, as conexões esgotaram e a requisição ficou pendurada até a Vercel
// devolver 504.
//
// Só acontecia com não lidas, porque só nesse caso o refresh muda algo na tela.
// Conversa já vista ou apenas sem resposta não mudava nada, não remontava, e
// parecia funcionar — o que fez o defeito passar por toda a verificação.
//
// A trava (`jaMarcadas`, acima) torna a cadeia impossível por construção, em vez
// de depender de eu acertar o raciocínio sobre identidade de dependência de
// efeito — que foi exatamente onde eu errei.
export default function Visto({
  contactIgId,
  ultimaMensagemEm,
}: {
  contactIgId: string;
  ultimaMensagemEm: number;
}) {
  const router = useRouter();

  useEffect(() => {
    // A chave inclui a última mensagem para que mensagem nova chegando com a
    // conversa aberta seja marcada como vista também — sem isso, o que chegasse
    // enquanto a pessoa lê contaria como não lido ao sair.
    const chave = `${contactIgId}:${ultimaMensagemEm}`;
    if (jaMarcadas.has(chave)) return;
    jaMarcadas.add(chave);

    // Falha na gravação não merece tela de erro: o pior caso é a conversa
    // continuar marcada como não lida, e a próxima abertura resolve. Por isso o
    // refresh só acontece quando a gravação deu certo.
    void marcarVisto(contactIgId)
      .then(() => router.refresh())
      .catch(() => {});
  }, [contactIgId, ultimaMensagemEm, router]);

  return null;
}
