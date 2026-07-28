import { skeleton } from "../ui";

// Esqueleto com o mesmo desenho da lista real (barra de filtros + linhas), para
// o conteúdo não "pular" quando os dados chegam.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className={`${skeleton} h-7 w-44`} />
        <div className={`${skeleton} h-4 w-56`} />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className={`${skeleton} h-11 flex-1`} />
        <div className={`${skeleton} h-11 w-56`} />
      </div>
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${skeleton} h-[76px]`} />
        ))}
      </div>
    </div>
  );
}
