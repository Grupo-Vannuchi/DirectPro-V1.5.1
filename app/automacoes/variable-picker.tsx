"use client";
import { useRef, useState } from "react";
import { VARIABLES, previewVariables } from "@/lib/variables";
import { input, label as labelCls, hint as hintCls, muted } from "../ui";

// Campo de mensagem com suporte a variáveis.
//
// Três coisas que ele resolve de uma vez:
// 1. Inserir a variável no ponto do cursor (e não no fim do texto), para o
//    usuário não ter que recortar e colar.
// 2. Mostrar como a mensagem FICA, com valores de exemplo — sem isso o usuário
//    só descobre o resultado disparando a automação de verdade.
// 3. Documentar as variáveis ali mesmo, para ninguém precisar decorar código.
export default function MessageField({
  name,
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  hint,
  required,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [aberto, setAberto] = useState(false);

  function inserir(chave: string) {
    const token = `{{${chave}}}`;
    const el = ref.current;
    if (!el) {
      onChange(value + token);
      return;
    }
    const ini = el.selectionStart ?? value.length;
    const fim = el.selectionEnd ?? ini;
    onChange(value.slice(0, ini) + token + value.slice(fim));
    // devolve o cursor logo depois da variável inserida
    requestAnimationFrame(() => {
      el.focus();
      const pos = ini + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const temVariavel = value.includes("{{");

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className={`${labelCls} mb-0`}>{label}</label>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="rounded-lg border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-expanded={aberto}
        >
          {"{ }"} Variáveis
        </button>
      </div>

      <textarea
        ref={ref}
        name={name}
        rows={rows}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={input}
      />

      {aberto && (
        <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
          <p className={`mb-2 text-[11px] ${muted}`}>
            Clique para inserir no ponto do cursor. Se o perfil não tiver o dado, a variável some —
            use <code>{"{{first_name|amigo}}"}</code> para definir um substituto.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => inserir(v.key)}
                title={v.description}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-500"
              >
                {v.label}
                <span className="ml-1 font-mono text-[10px] text-zinc-400">
                  {`{{${v.key}}}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {temVariavel && (
        <p className="mt-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
          <span className="font-semibold">Vai chegar assim: </span>
          {previewVariables(value) || "—"}
        </p>
      )}

      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}
