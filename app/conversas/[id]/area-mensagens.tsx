"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// A área que rola, e as regras de quando ela desce sozinha.
//
// Substitui o rolar-para-fim.tsx, que só rolava na montagem. Isso bastava
// enquanto a tela só mudava com F5; depois que ela passou a se atualizar
// sozinha, a mensagem nova entrava e a rolagem ficava para trás.
//
// A regra ingênua — "rolar sempre que a lista mudar" — é pior que o problema:
// com o atualizador rodando a cada 30s, quem estivesse lendo o histórico seria
// arrancado do lugar toda vez que chegasse mensagem. Então:
//
//   você enviou                       rola sempre
//   chegou e você estava no fim       rola
//   chegou e você lia o histórico     NÃO rola, e avisa que chegou
//
// O aviso importa: sem ele, "não rolar" vira "você não fica sabendo".

// Margem para considerar que a pessoa está "no fim". Não pode ser zero: rolagem
// por toque e zoom do navegador deixam sobras de alguns pixels.
const MARGEM_FIM_PX = 150;

// O formulário de resposta é IRMÃO desta área — os dois são renderizados por um
// componente de servidor, então não há estado React entre eles. Um evento de
// janela é o caminho mais curto para "acabei de enviar, me leve para o fim",
// sem criar um contexto inteiro para carregar um único sinal.
export const EVENTO_ENVIOU = "metodochat:enviou";

export default function AreaMensagens({
  quantidade,
  children,
}: {
  quantidade: number;
  children: React.ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  // Guardado em ref, não em estado: precisa refletir onde a pessoa estava ANTES
  // de a mensagem nova entrar, e ref não dispara renderização a cada pixel.
  const estavaNoFim = useRef(true);
  // Começa em -1, não em `quantidade`: se nascesse igual, o efeito que rola ao
  // mudar a contagem sairia fora na montagem e a conversa abriria no topo — que
  // é o que o rolar-para-fim.tsx fazia e não pode se perder.
  const vistas = useRef(-1);
  const [novas, setNovas] = useState(0);

  const irAoFim = useCallback((suave = false) => {
    const el = caixa.current;
    if (!el) return;
    const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: suave && !semMovimento ? "smooth" : "auto" });
    estavaNoFim.current = true;
    vistas.current = quantidade;
    setNovas(0);
  }, [quantidade]);

  // Acompanha a posição continuamente. É esta leitura que o efeito abaixo
  // consulta — medir no momento em que a lista cresce já seria tarde.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const aoRolar = () => {
      const noFim = el.scrollHeight - el.scrollTop - el.clientHeight <= MARGEM_FIM_PX;
      estavaNoFim.current = noFim;
      if (noFim) {
        vistas.current = quantidade;
        setNovas(0);
      }
    };
    el.addEventListener("scroll", aoRolar, { passive: true });
    return () => el.removeEventListener("scroll", aoRolar);
  }, [quantidade]);

  // Chegou mensagem: desce ou avisa, conforme onde a pessoa estava.
  useEffect(() => {
    if (quantidade === vistas.current) return;
    if (estavaNoFim.current) {
      irAoFim();
    } else {
      setNovas(Math.max(0, quantidade - vistas.current));
    }
  }, [quantidade, irAoFim]);

  // "Eu enviei": desce sempre, mesmo que estivesse lendo o histórico.
  useEffect(() => {
    const aoEnviar = () => irAoFim(true);
    window.addEventListener(EVENTO_ENVIOU, aoEnviar);
    return () => window.removeEventListener(EVENTO_ENVIOU, aoEnviar);
  }, [irAoFim]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={caixa} className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
        {children}
      </div>

      {novas > 0 && (
        <button
          type="button"
          onClick={() => irAoFim(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30"
        >
          {novas === 1 ? "1 mensagem nova" : `${novas} mensagens novas`} ↓
        </button>
      )}
    </div>
  );
}
