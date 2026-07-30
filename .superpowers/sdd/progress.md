# Inbox v1 — progresso

Plano: docs/plans/2026-07-29-inbox-v1.md
Branch: inbox-v1
Base: 995938b

Tarefa 1: completa (commit c4de5e4, revisão limpa)
  - 112 testes. windowState/formatWindowLeft extraídos; windowOpen delega.
  - Revisor confirmou equivalência algébrica com a regra anterior, inclusive
    para last_reply_at nulo.
  - Menores (idioma de variáveis locais): resolvidos corrigindo a RESTRIÇÃO do
    plano, que estava mais rígida que a convenção documentada do projeto.
    Nenhuma mudança de código necessária.
Tarefa 2: completa (commit b430fa8, revisão limpa)
  - message_id na queue; sendMessage devolve SendResult; 6 pontos de retorno de
    processItem convertidos e conferidos um a um pelo revisor.
  - ⚠️ do revisor (DDL não exercitada contra Postgres real) RESOLVIDA: o mesmo
    construto `alter table ... add column if not exists` já aparece 20x no
    array DDL e roda em produção a cada boot. Não é sintaxe nova.
  - Menores: camelCase/snake_case na fronteira (padrão já vigente no projeto).
Tarefa 3: completa (commits f5bb8f8..HEAD, revisão limpa após 2 correções)
  - 119 testes. mergeMessages + listConversations + conversationMessages.
  - CORREÇÃO 1 (a0f2867): dupla conversão de tipo trocada pelo idioma do projeto.
  - CORREÇÃO 2 (e6b7226): IMPORTANTE. Meu SQL do plano não filtrava kind, e
    deixaria comment_reply (resposta pública) e story_reaction (sem texto)
    entrarem na conversa privada, com mid nulo e nunca deduplicados.
    Verificado contra o banco de produção: 0 linhas afetadas hoje, defeito era
    latente. As consultas reais rodam e devolvem 9 conversas corretas.
  - Menores para a revisão final: limite aplicado por fonte antes da fusão
    (pode devolver até 2x o limite); listConversations só enxerga enviada
    depois que o eco volta.
Tarefa 4: completa (commit 320eefa, revisão limpa)
  - 123 testes. kind dm_manual na constraint e no tipo, conferidos iguais.
  - Revisor confirmou lendo queue-drain.ts que dm_manual cai no ramo certo:
    exige janela aberta, recipient {id}, message {text}.
  - MENORES para a revisão final triar:
    (m1) dedupe_key usa Date.now() em ms; duas chamadas no mesmo milissegundo
         colidiriam e a segunda seria descartada em silêncio. Irrelevante para
         humano digitando, relevante se algum dia for chamada por código.
    (m2) tests/manual-reply-key.test.ts ficou separado de tests/dedupe.test.ts,
         contrariando o comentário do próprio lib/dedupe.ts, que aponta um
         arquivo único como guarda de todos os formatos de chave.
Tarefa 5: completa (commit 7102143, revisão limpa)
  - Lista de conversas + item "Conversas" no menu. Sem teste (é UI).
  - Revisor rastreou last_reply_at até engine.ts e queue-drain.ts: o selo de
    janela usa a MESMA função que decide o envio real. Não é decorativo.
  - MENORES para a revisão final: Avatar sem textClassName (convenção do
    projeto é sempre declarar); selo sem shrink-0 pode espremer em tela estreita.
