import Link from "next/link";
import { getSelectedAccount } from "@/lib/account";
import AutomationForm, { Account } from "../form";
import { pageTitle, pageSubtitle, muted } from "../../ui";

export const dynamic = "force-dynamic";

export default async function NovaAutomacaoPage() {
  // Conta selecionada abastece o cabeçalho da pré-visualização (@ e foto)
  let account: Account | null = null;
  try {
    const selected = await getSelectedAccount();
    if (selected) {
      account = { username: selected.username, avatar: selected.profile_picture_url };
    }
  } catch {
    // sem banco/conta ainda: a pré-visualização usa um placeholder
  }
  return (
    <div className="space-y-6">
      <header>
        <nav className={`mb-2 text-xs ${muted}`}>
          <Link href="/automacoes" className="transition-colors hover:text-indigo-600">
            Automações
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Nova</span>
        </nav>
        <h1 className={pageTitle}>Nova automação</h1>
        <p className={pageSubtitle}>
          Monte o fluxo de cima para baixo: o gatilho dispara e as ações acontecem em sequência. A
          pré-visualização ao lado mostra o resultado em tempo real.
        </p>
      </header>
      <AutomationForm automation={null} account={account} />
    </div>
  );
}
