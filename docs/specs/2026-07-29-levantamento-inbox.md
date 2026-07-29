# Levantamento: inbox de conversas do Instagram

**Data:** 29/07/2026
**Estado:** levantamento, nada decidido
**Pergunta:** dá para ter o chat completo do Instagram dentro do MetodoChat?

---

## Resposta curta

Dá, com quatro limites da Meta que definem o produto — e um deles decide a
arquitetura antes de qualquer linha de código.

O sistema já está mais perto do que parece: o motor de envio, a fila com trava,
o controle de taxa e o recebimento por webhook já existem. Falta listar
conversas, tratar anexos, registrar o que a conta envia pelo celular e a
interface.

---

## O que já existe

### Código

| Já pronto | Onde |
|---|---|
| Enviar texto, botão de link e resposta rápida | `lib/ig.ts` · `sendMessage` |
| Reagir a mensagem | `lib/ig.ts` · `sendReaction` |
| Responder comentário | `lib/ig.ts` · `replyToComment` |
| Receber mensagem, story e comentário | `app/api/webhook` |
| Fila com trava atômica e deduplicação | `lib/queue-drain.ts` |
| Limite de ~1,6 envios/s e ~190/h por conta | `lib/queue-drain.ts` |
| Janela de 24h controlada por contato | `lib/queue-drain.ts` · `windowOpen` |

### Dados já guardados

Medido no banco de produção em 29/07/2026:

```
38  comment          20 mensagens recebidas, de 9 pessoas distintas
15  message           6 delas JÁ trazem anexo no payload
 3  story_reply       4 saídas registradas na fila
 2  quick_reply       0 ecos
```

**Isto é melhor do que eu supunha ao responder de primeira.** O `logEvent` grava
o **evento inteiro** como JSON, não só o texto — então anexos, respostas a story
e metadados já estão no banco, mesmo sem o código nomear esses campos.

Ou seja: metade do histórico já vem sendo acumulada desde que o app entrou no
ar, de graça.

---

## O buraco que precisa ser tapado hoje

**Nada do que a conta responde pelo celular é registrado.**

O webhook recebe essas mensagens marcadas com `is_echo`, e o motor as descarta
na entrada, antes de gravar:

```ts
if (msg.is_echo) return; // lib/engine.ts
```

A conta tem **zero** ecos gravados. Faz sentido para automação — o robô não deve
reagir à própria mensagem —, mas para um inbox significa que **metade da
conversa não existe**. O cliente responde pelo Instagram do celular e o painel
nunca fica sabendo.

Consertar é mover o descarte para depois do `logEvent`: gravar e então parar,
em vez de parar antes de gravar. Mudança de duas linhas.

**Esta é a única coisa que eu faria antes de qualquer decisão sobre o inbox.**
Cada dia sem isso é um dia de histórico pela metade que não volta.

---

## Os quatro limites da Meta

**1 · A API devolve só as 20 mensagens mais recentes de cada conversa.**
Não existe "puxar o histórico". Consultar mensagem mais antiga que as 20 últimas
devolve erro.

*Consequência arquitetural:* a única fonte de histórico é o que você mesmo
gravar conforme chega. O histórico começa no dia em que ligar isso e **nunca é
retroativo**. Construir a interface antes de acumular é a ordem errada.

**2 · Janela de 24 horas.** Fora dela não se manda mensagem livre. A tag
**HUMAN_AGENT** estende para **7 dias** — feita exatamente para atendente humano
—, mas é permissão separada, pedida em Permissions and Features e sujeita a
revisão da Meta. Sem ela, o inbox só responde quem falou nas últimas 24h.

**3 · Conversas em "Solicitações" sem atividade há 30 dias somem da API.**

**4 · Tamanhos.** Texto até 1.000 bytes. Imagem 8MB (PNG, JPEG), até 10 por
mensagem. Áudio, vídeo e PDF até 25MB.

### O que dá e o que não dá enviar

| Dá | Não dá |
|---|---|
| Texto e links | Chamada de voz ou vídeo |
| Até 10 imagens ou GIFs | Nota de voz nativa (áudio como arquivo, sim) |
| Áudio, vídeo, PDF | Apagar mensagem já enviada |
| Sticker de coração, reações emoji | |
| Compartilhar post próprio | |

---

## O que falta construir

Em ordem de dependência, não de tamanho.

**A · Registrar o eco** — 2 linhas. Destrava tudo o mais, e o valor cresce com o
tempo de espera.

**B · Modelar a conversa** — hoje as mensagens estão espalhadas: recebidas em
`events`, enviadas pela automação em `queue`, e as do celular em lugar nenhum.
Um inbox precisa de uma visão única, ordenada por conversa. Duas saídas: uma
tabela `messages` alimentada pelo webhook, ou uma view que costure as duas
existentes. A tabela é mais simples de consultar e mais fácil de indexar.

**C · Ler anexos** — o dado já está gravado; falta o tipo em `MessagingEvent`
nomear `attachments` e a interface saber exibir imagem, áudio e arquivo.

**D · Enviar anexo** — `OutgoingMessage` hoje só aceita texto e botão de link.
Falta o formato de mídia e o envio do arquivo.

**E · Listar conversas** — endpoints novos em `lib/ig.ts`, ou montar a lista a
partir do próprio banco. Vindo do banco não depende do limite das 20 e não gasta
cota da Meta.

**F · A interface** — a maior parte do trabalho, e a única que não dá para
reaproveitar de nada existente.

**G · HUMAN_AGENT** — pedido à Meta, com prazo que não depende de nós.

---

## Decisões que precisam ser suas

1. **Inbox de verdade ou visualização?** Só ver as conversas é bem mais barato
   que responder por dentro, e já resolve boa parte do "quero acompanhar".

2. **Vale pedir a HUMAN_AGENT?** Sem ela, o inbox responde apenas quem falou nas
   últimas 24h. Com ela, 7 dias — mas passa por revisão da Meta.

3. **Anexos entram na primeira versão?** Texto resolve a maioria dos
   atendimentos e custa uma fração do trabalho.

---

## Riscos

**É outro produto, não outra tela.** Hoje o sistema é automação: ninguém precisa
estar olhando. Um inbox pressupõe alguém atendendo, e traz junto notificação,
atribuição de conversa, marcação de lida e "quem respondeu o quê".

**Política da Meta.** Envio automatizado e envio manual por atendente são
tratados de forma diferente. Vale ler a política antes de investir.

**O histórico nunca será completo.** Mesmo fazendo tudo certo, conversa anterior
ao dia em que isso ligar não volta. O cliente vai abrir o inbox e ver menos do
que vê no celular dele. Isso precisa estar claro na venda, não na reclamação.

---

## Recomendação

Fazer **A** agora — as duas linhas do eco — independentemente de decidir o
inbox. É barato, não muda nada visível e o custo de adiar cresce todo dia.

O resto só depois das três decisões acima.

---

## Fontes

- [Conversations API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/conversations-api)
- [Messaging API e janela de 24h](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [Human Agent](https://developers.facebook.com/docs/features-reference/human-agent)
- [Política do Messenger Platform e IG Messaging API](https://developers.facebook.com/docs/messenger-platform/policy/policy-overview/)
