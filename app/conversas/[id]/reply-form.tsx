"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { sendReply } from "./actions";
import { EVENTO_ENVIOU } from "./area-mensagens";
import { input, btnPrimary, muted } from "../../ui";

// Quem cuida de trocar "enviando…" pelo horário é o AguardaEnvio, não este
// formulário. Aqui havia um router.refresh() 1,5s depois do envio, e ele perdia
// a corrida: a entrega leva ~2s. O AguardaEnvio pergunta até assentar, em vez de
// apostar num número.

// Depois de quanto tempo em "Enviando…" admitir que algo travou.
//
// A ação normal responde em ~300 ms, medido em produção. Oito segundos é folga
// grande o bastante para não acusar lentidão à toa.
//
// Isso existe porque houve o caso real: o botão ficou em "Enviando…" para
// sempre, o campo não limpou — e a mensagem TINHA sido enviada, o que só se
// descobriu recarregando a página. A causa mais provável é defasagem de
// implantação: a aba estava aberta desde antes de um deploy, então o JavaScript
// do navegador era de uma versão e o servidor já era de outra, e a resposta da
// ação não teve como ser aplicada.
//
// A correção de raiz é o Skew Protection da Vercel. Isto aqui é a segunda
// camada: não conserta a causa, mas troca "travado para sempre, sem explicação"
// por uma instrução que resolve. Vale para qualquer motivo de a ação não voltar
// — queda de rede ou estouro de tempo da função inclusive.
const AVISAR_TRAVOU_MS = 8000;

export default function ReplyForm({
  contactIgId,
  open,
  closedReason,
}: {
  contactIgId: string;
  open: boolean;
  closedReason: string;
}) {
  const [state, action, pending] = useActionState(sendReply, undefined);
  const campo = useRef<HTMLInputElement>(null);
  const [travou, setTravou] = useState(false);

  // Enquanto estiver enviando, conta o tempo. O aviso é apagado na LIMPEZA, e
  // não no corpo do efeito: zerar estado no corpo dispara renderização em
  // cascata, e o lint recusa — com razão.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setTravou(true), AVISAR_TRAVOU_MS);
    return () => {
      clearTimeout(t);
      setTravou(false);
    };
  }, [pending]);

  useEffect(() => {
    // `undefined` é o estado inicial; `{}` é envio aceito. Erro já aparece na
    // tela e não precisa de conferência.
    if (!state || state.error) return;

    // O formulário não se limpa sozinho, porque a ação não recria o componente.
    if (campo.current) campo.current.value = "";

    // Avisa a área de mensagens para descer até o fim. Quem envia tem que ver o
    // que enviou, mesmo que estivesse lendo o histórico no momento.
    window.dispatchEvent(new Event(EVENTO_ENVIOU));
  }, [state]);

  if (!open) {
    return <p className={`text-center text-xs ${muted}`}>{closedReason}</p>;
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="contact" value={contactIgId} />
      <div className="flex items-end gap-2">
        <input
          ref={campo}
          name="text"
          required
          maxLength={1000}
          autoComplete="off"
          placeholder="Escreva sua resposta…"
          className={`flex-1 ${input}`}
        />
        <button disabled={pending} className={btnPrimary}>
          {pending ? "Enviando…" : "Enviar"}
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {pending && travou && (
        // Diz que a mensagem PODE ter saído, porque foi exatamente o que
        // aconteceu no caso real. Prometer que não saiu levaria a pessoa a
        // mandar de novo e o contato receberia duas vezes.
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Está demorando mais que o normal. A mensagem pode já ter sido enviada — recarregue a
          página (F5) para ver como ficou, em vez de mandar de novo.
        </p>
      )}
    </form>
  );
}
