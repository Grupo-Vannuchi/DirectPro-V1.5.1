"use client";
import { useActionState } from "react";
import { sendReply } from "./actions";
import { input, btnPrimary, muted } from "../../ui";

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

  if (!open) {
    return (
      <p className={`rounded-xl border border-dashed border-zinc-300 p-4 text-center text-sm ${muted} dark:border-zinc-700`}>
        {closedReason}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="contact" value={contactIgId} />
      <div className="flex items-end gap-2">
        <input
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
