import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/engine";
import { verifyQstashSignature, qstashEnabled } from "@/lib/qstash";
import { safeEqualSecret } from "@/lib/crypto";

export const maxDuration = 60;

// Chamado pelo QStash na hora marcada (lembretes, novas tentativas).
//
// Drenar é idempotente — a trava atômica impede envio em dobro —, mas não é
// gratuito: cada drenagem gasta chamadas contra a Meta, e a cota de envio é
// limitada. Sem porteiro, quem martelasse este endereço consumiria a cota do
// dono do painel sem precisar mandar mensagem nenhuma.
//
// Com QStash configurado, a assinatura dele é o porteiro. Sem QStash, ninguém
// legítimo chama esta rota — o webhook e o cron diário drenam por conta
// própria —, então só o CRON_SECRET abre.
export async function POST(req: NextRequest) {
  const body = await req.text();

  if (qstashEnabled()) {
    const ok = await verifyQstashSignature(req.headers.get("upstash-signature"), body);
    if (!ok) return new NextResponse("invalid signature", { status: 401 });
  } else {
    const secret = process.env.CRON_SECRET;
    const autorizacao = req.headers.get("authorization") ?? "";
    if (!secret || !safeEqualSecret(autorizacao, `Bearer ${secret}`)) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }

  const result = await drainQueue();
  return NextResponse.json(result);
}
