# Auditoria e refatoração do DirectPro

**Data:** 28/07/2026
**Estado:** aprovado, em execução
**Base:** commit `a94d6c1`

---

## Por que este documento existe

A refatoração toca dezenas de arquivos e vai exigir dezenas de decisões de
nomeação e recorte. Registrar as decisões antes evita que a discordância
apareça depois de 40 arquivos mexidos, quando desfazer custa caro.

Ele não descreve o sistema — o código faz isso. Descreve **o que muda, o que não
pode mudar, e por quê**.

---

## O contrato: o que não pode mudar

O critério de sucesso é comportamental, não estético. Ao final, tudo abaixo
precisa funcionar exatamente como funciona hoje:

- Conectar conta do Instagram via OAuth, com renovação automática do token
- Receber comentário, resposta de story e DM pelo webhook, com verificação de
  assinatura HMAC
- Casar palavra-chave e disparar a automação correspondente
- Resposta privada ao comentário (a que fura a janela de 24h), resposta pública,
  DM de boas-vindas, DM com link, lembrete com atraso
- Portão de seguidor e coleta de e-mail
- Fila com trava atômica, deduplicação e limites de taxa
- Painel: automações, contatos, eventos com filtros, configuração guiada
- Multi-conta
- Cron diário e QStash opcional

**Nenhuma dessas capacidades pode regredir.** Onde não houver teste que prove
isso, a mudança é conservadora por padrão.

---

## Achados da auditoria

Auditados ~7.900 linhas em `app/`, `lib/`, `proxy.ts`.

### O que já estava certo

`strict: true` ligado; zero `any`, `@ts-ignore`, `console.log` ou `TODO`; todo
SQL parametrizado; migrações idempotentes com guarda por passo. Decisões
deliberadas e bem justificadas: `FOR UPDATE SKIP LOCKED` na fila, assinatura
conferida contra as três chaves possíveis da Meta, portão de seguidor que falha
aberto para não travar a base quando a Meta não informa o campo.

**O diagnóstico inicial de "AI slop" está incorreto.** O que entrega geração
automática é outra coisa: densidade uniforme de comentário, arquivos que fazem
coisa demais, dois idiomas nos identificadores e ausência total de teste.

### Segurança

| # | Achado | Local |
|---|---|---|
| S1 | Login sem limite de tentativas. `ADMIN_PASSWORD` é senha, chave HMAC da sessão e chave do state do OAuth ao mesmo tempo | `app/entrar/actions.ts`, `lib/auth.ts:15,28` |
| S2 | Comparação de senha retorna cedo quando o tamanho difere, vazando o comprimento por tempo de resposta | `lib/auth.ts:31-34` |
| S3 | Sessão sem prazo e sem revogação — HMAC de string fixa | `lib/auth.ts:15` |
| S4 | Um evento gravado no banco por POST com assinatura inválida: canal de escrita aberto à internet | `app/api/webhook/route.ts:135` |
| S5 | `/api/queue/tick` aceita chamada sem assinatura quando o QStash não está configurado; consome cota de envio da Meta | `app/api/queue/tick/route.ts:14` |

### Correção

| # | Achado | Local |
|---|---|---|
| C1 | Migração da PK de `contacts` empaca com 2+ contas e linhas órfãs; `on conflict (account_id, ig_id)` passa a estourar | `lib/db.ts:302,329-353` |
| C2 | Quatro `as never` desligam a verificação de tipo nas respostas da Meta | `lib/ig.ts:105,193`, `app/api/webhook/route.ts:165,169` |
| C3 | Erro de lint pré-existente: `setState` dentro de `useEffect` | `app/setup/submit-button.tsx:31` |
| C4 | `safeEqual` duplicado — duas implementações da mesma comparação de segurança | `lib/auth.ts:20-23`, `app/api/webhook/route.ts:10-14` |

### Estrutura

| # | Achado | Números |
|---|---|---|
| E1 | Comentário em densidade uniforme, mesma voz em todo o projeto | — |
| E2 | Arquivos que fazem coisa demais | `form.tsx` 1.018 linhas / 11 componentes; `engine.ts` 741; `setup/page.tsx` 561 |
| E3 | Dois idiomas nos identificadores, no mesmo arquivo | `handleCommentEvent` × `portaoDeFollow` |
| E4 | Zero testes no projeto inteiro | — |

### Terceiros

| # | Achado | Local |
|---|---|---|
| T1 | A loja busca catálogo em domínio de terceiro a cada hora, com checkout e imagens do autor anterior. Toda venda no painel do cliente vai para ele, e ele controla remotamente o que aparece | `lib/loja.ts:36-39` |
| T2 | Contato de suporte da loja aponta para perfil do autor anterior | `app/loja/page.tsx:147` |

---

## Decisões

**Idioma.** Identificadores em inglês, comentários e textos de tela em
português. É o que já é maioria no código, então é o caminho de menor
reescrita. Inclui corrigir o que foi introduzido em português nas mudanças
recentes: `resolvePosts`, `temFiltro`, `paraBusca`, `buildWhere`.

**Documentação.** Um documento de decisão (este) mais o plano de implementação.
O `specification-architect` foi considerado e descartado: cinco documentos com
rastreabilidade requisito-a-implementação servem para arquitetar sistema novo.
Aqui os requisitos já estão implementados e funcionando; um `requirements.md`
seria transcrição redundante do código, e o `validation.md` de um refactor cujo
critério é "nada muda" é a suíte de testes da Fase 2, não um documento.

**Sessão.** O cookie passa a carregar validade — `v1.<expira_em>.<hmac>` — e a
verificação confere assinatura **e** prazo. Descartada a alternativa de guardar
segredo de sessão no banco: permitiria revogar sem trocar a senha, mas
obrigaria o `proxy.ts` a consultar o banco em toda requisição do painel.
Revogação continua sendo "troque a senha", documentado.

**Freio no login.** Tabela `login_attempts` por IP com janela de tempo. Estado
em memória não serve em serverless — cada instância tem a sua. Login é raro, uma
consulta ao banco ali não pesa.

**Validação das respostas da Meta.** Verificadores de tipo escritos à mão, sem
adicionar Zod. O projeto tem 4 dependências de produção e essa magreza é uma
qualidade; não vale gastá-la para validar quatro respostas.

**Migração travada (C1).** As linhas órfãs de `contacts` são anteriores ao
multi-conta, portanto pertencem à conta conectada primeiro. Atribuição
determinística por `connected_at`, em vez de apagar ou chutar.

**Loja (T1, T2).** Aponta para a N8X. O catálogo de reserva embutido é
**removido** e a URL padrão deixa de existir: sem `LOJA_CATALOGO_URL`
configurada, a loja não aparece. Isso interrompe o encaminhamento de vendas
hoje, sem depender de a N8X já ter hospedado o próprio catálogo. Enquanto a
reserva existir, derrubar o domínio de terceiro não basta — o checkout dele
continua embutido no código.

---

## Fases

Cada fase é commitável e verificável sozinha. Nenhuma depende da seguinte estar
pronta. A ordem não é estética: cada fase torna a próxima segura.

### Fase 0 — Base limpa ✅

- [x] Commitar os filtros de `/eventos` (`093fa65`)
- [x] Crédito para a N8X Marketing (`a94d6c1`)
- [ ] Loja: remover reserva embutida e URL padrão; contato da N8X

### Fase 1 — Segurança e correção

Zero feature nova. Um commit por correção.

S1 freio no login e separação do raio de alcance da senha · S2 comparar HMAC em
vez de string crua · S3 cookie com prazo · S4 no máximo um evento de assinatura
inválida a cada 10 minutos · S5 exigir `CRON_SECRET` no `/tick` sem QStash ·
C1 atribuição determinística das órfãs · C2 remover os `as never` · C3 corrigir
o lint · C4 unificar `safeEqual`.

### Fase 2 — Testes

Vitest, apenas sobre funções puras — onde mora quase todo o risco silencioso e
onde o custo de testar é próximo de zero:

`matches()` e `findMatch()` (regras de palavra-chave) · geração da chave de
deduplicação · `assinaturaConfere()` com vetores HMAC conhecidos ·
`parseFilters` e `buildWhere` (lista branca e escape de `%` e `_`) ·
`extractEmail`.

**Fora de escopo:** banco e chamadas à Meta. Exigiriam mocks e fixtures, com
muito mais trabalho e cobertura de risco menor.

### Fase 3 — Reorganização

Só depois da rede de proteção existir.

Quebrar `form.tsx`, `engine.ts` (separando *receber* de *enviar*) e
`setup/page.tsx` · unificar identificadores em inglês · passada nos comentários
com um critério só: **fica o que explica por quê, sai o que narra o quê**.

---

## Verificação

Por fase: `npm run lint` e `npm run build` limpos, e a partir da Fase 2
`npm test` verde. Ao final de cada fase, conferência manual do contrato acima
com o banco real conectado.

O erro de lint pré-existente (C3) é corrigido na Fase 1. A partir dali,
`npm run lint` vermelho passa a significar regressão de verdade — hoje ele
treina todo mundo a ignorar o lint.

---

## Explicitamente fora de escopo

**Otimização de performance.** Nenhum gargalo real foi encontrado que o volume
atual justifique. O `ilike` da busca em `/eventos` é o único ponto com teto
conhecido: acelerá-lo exige índice GIN de trigrama, que encareceria a escrita no
webhook — o único caminho onde latência é punida com reenvio pela Meta. O
gatilho para revisitar é a tabela `events` passar de ~100 mil linhas.

**Testes de banco e de integração com a Meta.**

**Qualquer mudança de comportamento visível ao usuário final** que não esteja
listada nas decisões acima.

---

## Pendências com a N8X

Necessários para fechar a Fase 0:

1. URL do `loja.json` hospedado (molde em `loja.example.json`)
2. Links de checkout dos produtos
3. Canal de suporte que substitui `@oricardotenorio_`

A Fase 0 fica aberta sem eles, mas o encaminhamento de vendas para terceiro é
interrompido de imediato — a loja apenas não exibe produtos até a configuração
chegar.
