import { ensureSchema } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import { listConversations } from "@/lib/conversations";
import { card, muted, pageTitle } from "../ui";
import Lista from "./lista";
import { ColunaLista, ColunaConversa } from "./painel";
import Atualizador from "./atualizador";

export const dynamic = "force-dynamic";

// A lista mora no LAYOUT, não na página, e essa é a mudança inteira.
//
// Layout do App Router não re-renderiza ao navegar entre rotas irmãs. Com a
// lista aqui, trocar de conversa não a desmonta: a rolagem fica onde estava e só
// a coluna da direita muda. Era isso que obrigava a voltar de tela toda vez.
//
// Quem mantém essa lista em dia é outra coisa: o `Atualizador` (abaixo) refaz
// a rota a cada 30s com a aba visível, e `marcarVisto` dispara
// `revalidatePath("/conversas", "layout")` assim que a conversa é aberta — daí
// o segundo argumento "layout", já que é este arquivo, e não a página, quem
// desenha a lista. As duas coisas juntas é que fazem o badge sumir sem F5.
export default async function ConversasLayout({ children }: { children: React.ReactNode }) {
  await ensureSchema();
  const account = await getSelectedAccount();
  const conversas = account ? await listConversations(account.ig_user_id) : [];

  return (
    <div className="space-y-4">
      {/* Mantém lista e conversa em dia sem F5; só com a aba visível. */}
      <Atualizador />
      <header>
        <h1 className={pageTitle}>Conversas</h1>
        <p className={`mt-1 text-sm ${muted}`}>
          Responder só é possível dentro de 24h desde a última mensagem da pessoa — regra da Meta.
        </p>
      </header>

      {/* Altura fixa para cada coluna rolar por conta própria, em vez de a
          página inteira crescer e levar as duas junto. */}
      <div className={`flex h-[calc(100vh-13rem)] overflow-hidden ${card}`}>
        <ColunaLista>
          <Lista conversas={conversas} semConta={!account} />
        </ColunaLista>
        <ColunaConversa>{children}</ColunaConversa>
      </div>
    </div>
  );
}
