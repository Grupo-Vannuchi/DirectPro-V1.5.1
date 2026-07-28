import "server-only";
import { Client, Receiver } from "@upstash/qstash";

// QStash (Upstash, via marketplace da Vercel) acorda o app na hora certa
// para enviar lembretes e tentar de novo após falhas. É OPCIONAL:
// sem ele, a fila é drenada quando chega webhook e no cron diário.

export function qstashEnabled(): boolean {
  return Boolean(process.env.QSTASH_TOKEN);
}

// Agenda uma chamada a /api/queue/tick daqui a `delaySeconds`.
export async function scheduleTick(appUrl: string, delaySeconds: number): Promise<void> {
  if (!qstashEnabled() || !appUrl) return;
  try {
    const client = new Client({ token: process.env.QSTASH_TOKEN! });
    await client.publishJSON({
      url: `${appUrl}/api/queue/tick`,
      body: { reason: "scheduled" },
      delay: Math.max(0, Math.ceil(delaySeconds)),
    });
  } catch {
    // sem pânico: o cron diário e os webhooks seguintes drenam a fila
  }
}

export async function verifyQstashSignature(
  signature: string | null,
  body: string
): Promise<boolean> {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !signature) return false;
  try {
    const receiver = new Receiver({
      currentSigningKey: current,
      nextSigningKey: next ?? current,
    });
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}
