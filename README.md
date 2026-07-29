# MetodoChat 💬

**Comentário vira DM.** Automatize o seu Instagram sem mensalidade: quando alguém comenta uma
palavra-chave num post ou reels (ou responde um story), a pessoa recebe uma DM automática com o
seu link. Sua própria central de DMs, rodando de graça, para sempre, na sua conta.

## Como funciona

1. Alguém comenta a palavra-chave (ex.: `quero`) no seu post.
2. O app responde no privado na hora (essa resposta **fura a janela de 24h** — é permitida 1 vez
   por comentário, em até 7 dias) e, se você quiser, também responde publicamente no comentário.
3. A pessoa toca no botão de resposta rápida → isso **abre a janela de 24h** da Meta.
4. O app manda a DM com o seu link (botão clicável) e, opcionalmente, um lembrete depois de X
   minutos.

Tudo pela **API oficial** do Instagram (nada de robô de navegador, que derruba conta). Também
funciona com resposta a story e DM recebida com palavra-chave.

## O que você precisa (tudo grátis)

| O quê | Para quê |
|---|---|
| Conta **GitHub** | guardar a sua cópia do código |
| Conta **Vercel** (entre com o GitHub) | hospedar o app + banco de dados |
| Conta **Meta for Developers** (conta do Facebook) | criar o app da API do Instagram |
| Instagram **Profissional** (Comercial ou Criador) | a API só funciona nesse tipo de conta |

> Sua conta é pessoal? Instagram → Configurações → Central de contas → Tipo de conta → **Mudar
> para conta profissional**. Leva 1 minuto e é reversível.

## Instalação (15 minutos, sem programar — siga junto com o vídeo)

### Parte 1 — Subir o código no seu GitHub

1. Crie sua conta em [github.com](https://github.com) (se ainda não tiver).
2. Acesse [github.com/new](https://github.com/new): nome `metodochat`, marque **Private** → **Create
   repository**.
3. Na página do repositório vazio, clique em **"uploading an existing file"**, **arraste todo o
   conteúdo descompactado do ZIP** (as pastas `app`, `lib`, `public` e os arquivos soltos) e
   clique em **Commit changes**.

### Parte 2 — Publicar na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new) e entre com o GitHub.
2. Em **Import Git Repository**, importe o `metodochat`.
3. Antes de concluir, abra **Environment Variables** e adicione `ADMIN_PASSWORD` = a senha que
   você quer para o seu painel. Clique em **Deploy**.
4. Depois do deploy: aba **Storage** → **Create Database** → **Neon** → plano Free → **Create**
   → **Connect** ao projeto (pode deixar tudo como está nas opções).
5. Aba **Deployments** → menu **⋯** do deploy mais recente → **Redeploy** (isso ativa o banco —
   as tabelas são criadas sozinhas).

### Parte 3 — Conectar o Instagram (assistente guiado)

Abra `https://SEU-APP.vercel.app`, entre com a sua senha e clique em **Configuração**. O
assistente mostra os 5 passos com botões de copiar — é a parte da Meta, a única manual:

1. Criar o app em
   [developers.facebook.com/apps/creation](https://developers.facebook.com/apps/creation/)
   (caso de uso **"Gerencie mensagens e conteúdo no Instagram"**).
2. Copiar o **ID do app do Instagram** e a **chave secreta** para o assistente.
3. Cadastrar na Meta as URLs que o assistente mostra (webhook + token de verificação + URI de
   redirecionamento OAuth) e assinar os campos **comments** e **messages**.
4. Adicionar sua conta como **Testador do Instagram** e aceitar o convite no celular.
5. Cadastrar as URLs de privacidade (o app já serve as páginas) em Configurações → Básico e
   colocar o app **Ao vivo** — ⚠️ em modo desenvolvimento o webhook não entrega eventos.
6. Clicar em **Conectar Instagram** no assistente e autorizar. Pronto.

### Parte 4 — Criar a primeira automação

**Automações → Nova automação**: palavra-chave, DM de boas-vindas, link e (opcional) lembrete.
Publique um post e **comente a palavra-chave com OUTRA conta** para testar. Acompanhe em
**Eventos**.

## Lembretes na hora certa (opcional, recomendado)

Para o lembrete "depois de 60 min" sair na hora exata, instale o **QStash** (grátis): painel da
Vercel → **Marketplace → Upstash QStash** → conecte ao projeto → Redeploy. Sem ele o app
continua funcionando — os envios imediatos saem na hora e os lembretes saem no próximo evento ou
no cron diário.

## Limites reais (para ninguém se frustrar)

- **Não dá** para exigir que a pessoa te siga antes de receber o link — a API não permite
  verificar seguidores. Dá só para pedir na mensagem.
- **Não dá** para saber se a pessoa clicou no link — por isso o lembrete é por tempo.
- **Disparo em massa para base fria é proibido** pela Meta e derruba a conta. Este app só
  responde a quem interagiu (comentário/story/DM) — e é por isso que ele é seguro.
- Limites de envio conservadores embutidos: ~1,6 mensagens/segundo e ~190/hora.
- O token da Meta dura 60 dias e **se renova sozinho** (cron diário).

## Arquitetura (para quem é técnico)

- **Next.js 16** (App Router, `proxy.ts`) na Vercel Hobby; painel em PT-BR protegido por senha.
- **Postgres (Neon)** via marketplace da Vercel; schema criado automaticamente no primeiro
  acesso (`lib/db.ts`). Fila com trava atômica (`FOR UPDATE SKIP LOCKED`) — nunca envia em dobro.
- **Motor orientado a eventos**: o webhook valida a assinatura HMAC, enfileira e drena a fila na
  mesma requisição (`after()`). **QStash** (opcional) acorda o app na hora dos lembretes. **Cron
  diário** renova o token e faz drenagem de segurança.
- Credenciais da Meta ficam no banco (via `/setup`) — nada de variável de ambiente depois do
  deploy.

## Licença

**Uso pessoal** — instale para as suas contas ou de clientes diretos, modifique à vontade.
**Proibido revender ou redistribuir o código.** Veja [LICENSE](LICENSE).
