"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

// Botão de envio com estado de carregamento.
//
// Por que existe: as ações desta página fazem chamadas de rede (testar a URL
// pública, falar com a Meta). Sem retorno visual, o usuário clica, nada muda
// por alguns segundos e ele clica de novo — ou conclui que quebrou. O botão
// desabilita, gira e conta o que está acontecendo.
//
// As mensagens em `etapas` trocam a cada 2,5s. Elas descrevem o que a ação
// realmente faz (não é barra de progresso falsa) e servem para a espera não
// parecer travamento.
export default function SubmitButton({
  children,
  pendingLabel = "Processando…",
  etapas,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  etapas?: string[];
  className?: string;
}) {
  const { pending } = useFormStatus();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!pending || !etapas?.length) {
      setI(0);
      return;
    }
    const t = setInterval(() => {
      // para na última mensagem em vez de ficar em loop, que pareceria bug
      setI((v) => (v + 1 < etapas.length ? v + 1 : v));
    }, 2500);
    return () => clearInterval(t);
  }, [pending, etapas]);

  const rotulo = pending ? (etapas?.length ? etapas[i] : pendingLabel) : null;

  return (
    <span className="inline-flex flex-col gap-1.5">
      <button type="submit" disabled={pending} className={className} aria-busy={pending}>
        {pending && (
          <svg
            className="h-4 w-4 shrink-0 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="3"
              className="opacity-25"
            />
            <path
              d="M21 12a9 9 0 0 0-9-9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        )}
        {pending ? rotulo : children}
      </button>

      {/* aviso de paciência: só aparece quando já está esperando */}
      {pending && (
        <span
          className="text-[11px] text-zinc-500 dark:text-zinc-500"
          role="status"
          aria-live="polite"
        >
          Isso pode levar alguns segundos.
        </span>
      )}
    </span>
  );
}
