"use server";
import { getSelectedAccount } from "@/lib/account";
import { sql } from "@/lib/db";

// Registra que esta conversa foi vista agora.
//
// É Server Action, chamada pelo CLIENTE, e isso não é preferência de estilo. A
// lista usa <Link>, e o prefetch do Next renderiza a página no servidor sem
// ninguém abrir nada — três conversas apareceram renderizadas no log de rede
// durante outro teste. Gravar isto na renderização marcaria como lida toda
// conversa que passasse perto do mouse, e o sintoma seria "às vezes as não
// lidas somem sozinhas": impossível de reproduzir sob demanda.
//
// SEM ensureSchema aqui, de propósito. Ele roda ~40 instruções DDL, e esta ação
// dispara a cada conversa aberta — era a parte mais cara de um ciclo que, num
// laço de refresh, esgotou o pool de conexões e devolveu 504 em produção.
//
// Não é atalho: para esta ação existir, a página da conversa já renderizou, e
// ela chama ensureSchema. Se o schema não existisse, não haveria tela para
// clicar. E o schema é estado do BANCO, não da instância — quem já foi criado
// continua criado, mesmo numa lambda que nunca rodou o ensureSchema.
export async function marcarVisto(contactIgId: string): Promise<void> {
  if (!/^\d{1,32}$/.test(contactIgId)) return;
  const account = await getSelectedAccount();
  if (!account) return;
  // `returning` é o que torna o resultado confiável: sem ele, o postgres.js
  // devolve um array SEMPRE vazio (o afetado vai só em `.count`, não em
  // `.length`) — testado direto contra o banco antes de escrever esta
  // condição. Com `returning ig_id`, `.length` reflete de verdade quantas
  // linhas o update tocou.
  const r = await sql().query(
    `update contacts set last_seen_at = now()
     where account_id = $1 and ig_id = $2
     returning ig_id`,
    [account.ig_user_id, contactIgId]
  );
  if (!Array.isArray(r) || r.length === 0) {
    // Sem linha em contacts, o badge dessa conversa nunca se apaga. Não é
    // erro fatal, mas precisa aparecer em algum lugar: sem isso o sintoma
    // seria uma conversa eternamente "não lida" e nenhuma pista do motivo.
    console.warn(
      `[marcarVisto] nenhuma linha em contacts para account_id=${account.ig_user_id} ig_id=${contactIgId}`
    );
  }

  // Quem faz o badge sumir da lista é o router.refresh() do lado do cliente,
  // em visto.tsx — não uma revalidação daqui.
  //
  // Isto já foi `revalidatePath("/conversas", "layout")` e NÃO funcionava:
  // medido contra build de produção, a gravação acontecia e a lista continuava
  // mostrando "26" indefinidamente. O motivo é que o layout de /conversas é
  // `force-dynamic`, então não existe cache de servidor para invalidar — o que
  // precisa ser refeito é a árvore que o navegador já tem na mão.
}
