import { ensureSchema } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import { listConversations } from "@/lib/conversations";
import { card, muted, pageTitle } from "../ui";
import Lista from "./lista";
import { ColunaLista, ColunaConversa } from "./painel";

export const dynamic = "force-dynamic";

// A lista mora no LAYOUT, não na página, e essa é a mudança inteira.
//
// Layout do App Router não re-renderiza ao navegar entre rotas irmãs. Com a
// lista aqui, trocar de conversa não a desmonta: a rolagem fica onde estava e só
// a coluna da direita muda. Era isso que obrigava a voltar de tela toda vez.
//
// O preço é o outro lado da mesma moeda: a lista NÃO se atualiza sozinha. Depois
// de enviar uma mensagem, o horário dela continua o de antes até um
// recarregamento. Decisão consciente da v1 — atualizar sozinha custaria uma
// consulta por atendente a cada poucos segundos.
export default async function ConversasLayout({ children }: { children: React.ReactNode }) {
  await ensureSchema();
  const account = await getSelectedAccount();
  const conversas = account ? await listConversations(account.ig_user_id) : [];

  return (
    <div className="space-y-4">
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
