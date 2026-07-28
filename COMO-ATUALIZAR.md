# Como atualizar e publicar mudanças

Guia rápido para levar uma alteração até os installs na Vercel. Vale para este
repo (`many`) e para o `webhook-router`.

## Como funciona (resumo)
Cada projeto na Vercel está conectado a este repositório, com **Production
Branch = `main`**. Regra de ouro:

> **Todo push na `main` dispara uma deploy automática** nos projetos conectados.

Então "atualizar" = colocar o código novo na `main`. Nunca commite direto na
`main` em produção sem revisar — trabalhe numa branch e depois traga para a
`main`.

---

## Caminho A — Pelo site do GitHub (sem terminal) ⭐ mais fácil
1. Abra o repositório no GitHub → aba **Pull requests** → **New pull request**.
2. Em cima: **base: `main`** ← **compare: `sua-branch`**.
3. Revise os commits e arquivos que vão entrar (é aqui que você "confere o
   estado").
4. **Create pull request** → **Merge pull request** → **Confirm merge**.
5. O merge atualiza a `main` e **dispara a deploy** nos installs conectados.

Se aparecer *"This branch has conflicts"*, a `main` andou e bateu de frente com
a branch. Dá para resolver ali mesmo no GitHub, ou pelo terminal (Caminho B).

---

## Caminho B — Git no terminal
```bash
# 1. Atualiza as referências do remoto (não mexe nos seus arquivos)
git fetch origin

# 2. CONFIRA O ESTADO antes de mergear:
git log --oneline origin/main..sua-branch    # o que a branch tem a mais (vai entrar)
git log --oneline sua-branch..origin/main    # divergência: idealmente VAZIO

# 3. Vai para a main e atualiza
git checkout main
git pull origin main

# 4. Traz a branch para a main
git merge sua-branch

# 5. Envia — isto dispara a deploy
git push origin main
```

Como ler o passo 2:
- Segundo comando **vazio** → é um **fast-forward** limpo, sem conflito.
- Segundo comando **com commits** → a `main` tem coisa que a branch não tem. O
  `git merge` cria um commit de merge e **pode dar conflito**. Se der: o git
  lista os arquivos, você edita, `git add` neles, `git commit` para concluir e
  então `git push`.

Confirme que subiu:
```bash
git log --oneline -3 origin/main   # seu commit deve estar no topo
```

---

## Disparar uma deploy manualmente (sem commit novo)
Útil para **aplicar env vars novas** (env var só entra numa deploy nova) ou
reprocessar.

**Redeploy (mais simples):**
1. Projeto na Vercel → aba **Deployments**.
2. Na deploy de produção → **⋯** → **Redeploy**.
3. Desmarque **"Use existing Build Cache"** se quiser build limpo → **Redeploy**.

**Deploy Hook (URL reutilizável):**
1. Projeto → **Settings → Git → Deploy Hooks** → criar com a branch `main`.
2. Guarde a URL. Para disparar: `curl -X POST "<URL_DO_HOOK>"`.
   (Redeploy repete o mesmo commit; o Deploy Hook pega o último commit da `main`.)

---

## Variáveis de ambiente (lembrete)
As env vars ficam salvas em **Settings → Environment Variables** de cada projeto
e **não se perdem** em redeploy. Ao mudar uma, faça uma **deploy nova** para ela
entrar.

Integração com o roteador central de webhooks:
- **Roteador (`webhook-router`):** `REGISTER_TOKEN`
- **Cada install (`many`):**
  - `WEBHOOK_ROUTER_URL` = URL do roteador (ex.: `https://webhookrouter-e1ght.vercel.app`)
  - `WEBHOOK_ROUTER_TOKEN` = o mesmo valor do `REGISTER_TOKEN`

Sem essas variáveis, o auto-cadastro de rotas fica desligado (no-op) — o app
continua funcionando normalmente, só não registra as contas no roteador.

Para contas que já estavam conectadas antes de ligar o roteador: entre no
`/setup` de cada install e clique **"reassinar webhooks"** uma vez.
