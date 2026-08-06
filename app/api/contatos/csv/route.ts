import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSelectedAccount } from "@/lib/account";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { diaDaChave } from "@/lib/dedupe";

// Exporta os contatos da conta selecionada. Separador ";" e BOM de UTF-8
// porque é assim que o Excel em português abre o arquivo com acento certo,
// sem passar pelo assistente de importação.
const SEP = ";";

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /["\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  if (!isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  await ensureSchema();
  const account = await getSelectedAccount();
  if (!account) {
    return NextResponse.json({ error: "Conecte o Instagram primeiro" }, { status: 400 });
  }

  // Só quem tem e-mail: o arquivo existe para ser importado numa ferramenta
  // de e-mail, e linha sem e-mail lá não serve para nada.
  const rows = (await sql().query(
    `select coalesce(nullif(c.name, ''), c.username) as nome, c.email
     from contacts c
     where c.account_id = $1 and c.email is not null
     order by c.first_contact_at desc`,
    [account.ig_user_id]
  )) as { nome: string | null; email: string }[];

  const linhas = [
    ["Nome", "E-mail"],
    ...rows.map((r) => [r.nome ?? "", r.email]),
  ];

  const csv = "﻿" + linhas.map((l) => l.map(cell).join(SEP)).join("\r\n");
  // Brasília, não UTC: exportar às 22h nomeava o arquivo com a data de amanhã.
  const hoje = diaDaChave(new Date());
  const nome = `emails-${account.username ?? account.ig_user_id}-${hoje}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
