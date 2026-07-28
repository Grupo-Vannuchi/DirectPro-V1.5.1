import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/engine";
import { verifyQstashSignature, qstashEnabled } from "@/lib/qstash";

export const maxDuration = 60;

// Chamado pelo QStash na hora marcada (lembretes, novas tentativas).
// Drenar é idempotente e inofensivo: a trava atômica impede envio em dobro
// e os limites de taxa valem sempre — por isso, sem QStash configurado,
// aceitamos o toque sem assinatura.
export async function POST(req: NextRequest) {
  const body = await req.text();
  if (qstashEnabled()) {
    const ok = await verifyQstashSignature(req.headers.get("upstash-signature"), body);
    if (!ok) return new NextResponse("invalid signature", { status: 401 });
  }
  const result = await drainQueue();
  return NextResponse.json(result);
}
