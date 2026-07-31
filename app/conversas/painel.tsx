"use client";
import { usePathname } from "next/navigation";

// Quem decide o que aparece no celular.
//
// No desktop as duas colunas convivem. No celular não cabem, então mostra uma de
// cada vez: a lista em /conversas, a conversa em /conversas/<id>.
//
// Isso precisa do caminho atual, e um layout de servidor não tem acesso a ele —
// layout não recebe params da rota filha. O navegador sabe, e é só isso que este
// componente faz: ligar e desligar duas classes.

export function ColunaLista({ children }: { children: React.ReactNode }) {
  const naLista = usePathname() === "/conversas";
  return (
    <aside
      className={`w-full shrink-0 overflow-y-auto border-zinc-200/80 lg:block lg:w-[320px] lg:border-r dark:border-zinc-800 ${
        naLista ? "block" : "hidden"
      }`}
    >
      {children}
    </aside>
  );
}

export function ColunaConversa({ children }: { children: React.ReactNode }) {
  const naLista = usePathname() === "/conversas";
  return (
    <section className={`min-w-0 flex-1 flex-col lg:flex ${naLista ? "hidden" : "flex"}`}>
      {children}
    </section>
  );
}
