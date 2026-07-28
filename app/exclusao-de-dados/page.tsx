import { getConfig } from "@/lib/db";

export const metadata = { title: "Exclusão de Dados" };
export const dynamic = "force-dynamic";

export default async function ExclusaoDeDadosPage() {
  const config = await getConfig().catch(() => null);
  const owner = config?.username ? `@${config.username}` : "a conta de Instagram conectada a esta instância";

  return (
    <article className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Exclusão de Dados</h1>
      <p>
        Este aplicativo armazena apenas o identificador público do Instagram, o nome de usuário e o
        texto de comentários/mensagens de quem interage com a conta conectada.
      </p>
      <p>
        Para solicitar a exclusão de todos os seus dados, envie uma mensagem direta no Instagram
        para {owner} pedindo a exclusão dos seus dados.
      </p>
      <p>
        A exclusão é feita em até 7 dias e remove todos os registros associados ao seu usuário do
        banco de dados desta instância.
      </p>
    </article>
  );
}
