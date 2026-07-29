import "server-only";
import { sql, ensureSchema } from "./db";

// Freio de força bruta no login.
//
// A ADMIN_PASSWORD protege o painel inteiro e ainda deriva a chave da sessão e
// o state do OAuth. Sem freio, dá para chutar senha à vontade — e um único
// acerto entrega tudo.
//
// O contador mora no banco, não em memória: em serverless cada instância tem a
// sua, e um atacante que caia em instâncias diferentes nunca alcançaria o
// limite. Login é raro; uma consulta aqui não pesa.

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 8;

export const LOCKOUT_MESSAGE = `Muitas tentativas. Espere ${WINDOW_MINUTES} minutos e tente de novo.`;

// Falha ABERTA de propósito: se o banco estiver fora do ar, o freio não
// funciona, mas o login também não trava. Barrar aqui deixaria o dono do painel
// de fora justo quando ele mais precisa entrar — e a senha continua sendo
// exigida de qualquer forma.
export async function isLockedOut(ip: string): Promise<boolean> {
  try {
    await ensureSchema();
    const rows = (await sql().query(
      `select count(*)::int as total from login_attempts
       where ip = $1 and attempted_at > now() - make_interval(mins => $2::int)`,
      [ip, WINDOW_MINUTES]
    )) as { total: number }[];
    return (rows[0]?.total ?? 0) >= MAX_ATTEMPTS;
  } catch {
    return false;
  }
}

export async function recordFailure(ip: string): Promise<void> {
  try {
    await ensureSchema();
    await sql().query(`insert into login_attempts (ip) values ($1)`, [ip]);
    // limpeza oportunista: sem isto a tabela cresceria para sempre
    await sql().query(
      `delete from login_attempts where attempted_at < now() - interval '1 day'`
    );
  } catch {
    // sem banco não há freio; o acerto da senha continua obrigatório
  }
}

export async function clearAttempts(ip: string): Promise<void> {
  try {
    await sql().query(`delete from login_attempts where ip = $1`, [ip]);
  } catch {
    // as linhas expiram sozinhas pela janela de tempo
  }
}
