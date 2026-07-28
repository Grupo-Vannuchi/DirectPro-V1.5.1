import { card, muted } from "./ui";

// Peças visuais do painel, separadas da busca de dados: recebem tudo por
// props, o que deixa cada uma fácil de conferir isoladamente.

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  trend,
}: {
  icon: (p: { className?: string }) => React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  trend?: number;
}) {
  return (
    <div className={`p-4 ${card}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-medium ${muted}`}>{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-600" />
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums leading-none">{value}</p>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        {trend !== undefined && trend !== 0 && (
          <span
            className={
              trend > 0
                ? "font-medium text-emerald-600 dark:text-emerald-400"
                : "font-medium text-zinc-500"
            }
          >
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}
          </span>
        )}
        {hint && <span className="truncate text-zinc-500">{hint}</span>}
      </div>
    </div>
  );
}

export type Dia = { chave: string; rotulo: string; n: number };

export function SentChart({ dias }: { dias: Dia[] }) {
  const max = Math.max(...dias.map((d) => d.n), 0);
  return (
    <section className={`p-5 ${card}`}>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Mensagens por dia</h2>
        <span className={`text-xs ${muted}`}>últimos {dias.length} dias</span>
      </div>
      {max === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          Nenhuma mensagem enviada ainda nesse período.
        </p>
      ) : (
        <>
          <div className="flex h-28 items-end gap-1.5">
            {dias.map((d) => {
              const altura = d.n > 0 ? Math.max((d.n / max) * 100, 8) : 3;
              return (
                <div
                  key={d.chave}
                  title={`${d.n} ${d.n === 1 ? "mensagem" : "mensagens"} em ${d.chave.slice(8)}/${d.chave.slice(5, 7)}`}
                  className={`flex-1 rounded-t transition-colors ${
                    d.n > 0 ? "bg-indigo-500 hover:bg-indigo-400" : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                  style={{ height: `${altura}%` }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex gap-1.5">
            {dias.map((d, i) => (
              <span
                key={d.chave}
                className="flex-1 text-center text-[9px] tabular-nums text-zinc-400"
              >
                {i % 2 === 0 ? d.rotulo : ""}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
