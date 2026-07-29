"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSelectedAccount } from "@/lib/account";
import { enqueueManualReply } from "@/lib/engine";
import { drainQueue } from "@/lib/queue-drain";
import { windowState } from "@/lib/inbox-window";
import { sql, ensureSchema } from "@/lib/db";

export async function sendReply(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  await ensureSchema();
  const account = await getSelectedAccount();
  if (!account) return { error: "Conecte uma conta do Instagram primeiro." };

  const contactIgId = String(formData.get("contact") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!/^\d{1,32}$/.test(contactIgId)) return { error: "Conversa inválida." };
  if (!text) return { error: "Escreva alguma coisa antes de enviar." };
  // Limite da Meta para o corpo da mensagem.
  if (text.length > 1000) return { error: "A mensagem passa de 1.000 caracteres." };

  // Confere a janela AQUI também, e não só na tela: entre carregar a página e
  // clicar em enviar podem ter passado horas.
  const rows = (await sql().query(
    `select last_reply_at from contacts where account_id = $1 and ig_id = $2`,
    [account.ig_user_id, contactIgId]
  )) as { last_reply_at: Date | null }[];
  if (!windowState(rows[0]?.last_reply_at ?? null).open) {
    return { error: "A janela de 24h fechou. Só é possível responder quem falou há menos de 24h." };
  }

  await enqueueManualReply(account.ig_user_id, contactIgId, text);

  // Enfileirar NÃO envia. O enqueue só agenda um toque do QStash para item com
  // atraso; uma resposta digitada agora não tem atraso nenhum. Sem esta
  // drenagem, a mensagem ficaria parada até o próximo evento do Instagram ou
  // até o cron diário das 9h — e a janela de 24h pode fechar antes disso, o que
  // faria o item ser descartado em silêncio DEPOIS de o atendente ver sucesso.
  //
  // Vai em after() pelo mesmo motivo do webhook: a resposta da ação não espera
  // o envio. A consequência é que a mensagem aparece na conversa na próxima
  // carga da página, não instantaneamente.
  after(async () => {
    try {
      await drainQueue();
    } catch {
      // a trava atômica garante que o próximo dreno recupera
    }
  });

  revalidatePath(`/conversas/${contactIgId}`);
  return {};
}
