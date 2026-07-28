import type { ReactNode } from "react";

// Grifa o termo buscado dentro do texto, para ficar claro POR QUE aquela linha
// entrou no resultado. Trabalha em pedaços de string — nenhum HTML cru é
// montado, então o que a pessoa digitou nunca vira marcação.
export default function Realce({ texto, termo }: { texto: string; termo: string | null }) {
  const alvo = termo?.trim().toLowerCase();
  if (!alvo) return <>{texto}</>;

  const baixo = texto.toLowerCase();
  const partes: ReactNode[] = [];
  let cursor = 0;

  for (let achou = baixo.indexOf(alvo); achou !== -1; achou = baixo.indexOf(alvo, cursor)) {
    if (achou > cursor) partes.push(texto.slice(cursor, achou));
    partes.push(
      <mark
        key={achou}
        className="rounded-sm bg-indigo-500/30 px-0.5 text-inherit dark:bg-indigo-500/35"
      >
        {texto.slice(achou, achou + alvo.length)}
      </mark>
    );
    cursor = achou + alvo.length;
  }

  if (cursor < texto.length) partes.push(texto.slice(cursor));
  return <>{partes}</>;
}
