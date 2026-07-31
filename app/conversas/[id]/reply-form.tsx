"use client";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendReply } from "./actions";
import { EVENTO_ENVIOU } from "./area-mensagens";
import { input, btnPrimary, muted } from "../../ui";

// Quanto esperar antes de conferir se a mensagem saiu.
//
// O envio roda em after(), ou seja, DEPOIS da resposta desta ação. Quando a tela
// é montada, o item ainda está 'pending' e o balão diz "enviando…" — verdade
// naquele instante, mentira um segundo depois.
//
// Este atraso dá tempo do dreno terminar e então pede a tela de novo. Se deu
// certo, o balão vira o horário; se a Meta recusou, vira "não enviada" em
// vermelho. Nos dois casos o atendente vê o que aconteceu de verdade.
//
// O Atualizador periódico da lista roda a cada 30s, o que aqui seria uma
// eternidade olhando para "enviando…".
const CONFERIR_APOS_MS = 1500;

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
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // `undefined` é o estado inicial; `{}` é envio aceito. Erro já aparece na
    // tela e não precisa de conferência.
    if (!state || state.error) return;

    // O formulário não se limpa sozinho, porque a ação não recria o componente.
    if (campo.current) campo.current.value = "";

    // Avisa a área de mensagens para descer até o fim. Quem envia tem que ver o
    // que enviou, mesmo que estivesse lendo o histórico no momento.
    window.dispatchEvent(new Event(EVENTO_ENVIOU));

    const t = setTimeout(() => router.refresh(), CONFERIR_APOS_MS);
    return () => clearTimeout(t);
  }, [state, router]);

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
    </form>
  );
}
