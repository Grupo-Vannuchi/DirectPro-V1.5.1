# Migração do banco: Neon → Supabase

**Data:** 31/07/2026
**Estado:** aprovado, aguardando o projeto ser criado
**Base:** `3b0f52a`

---

## Por que migrar

O problema que abriu o assunto foi concreto: o painel devolvia `500` na primeira
visita depois de um período parado, porque o plano gratuito do Neon suspende a
computação e leva um tempo para acordar.

Duas hipóteses foram testadas e **as duas caíram**:

**Não é performance.** Medido de dentro da Vercel, na mesma região dos dois
bancos:

| | mediana |
|---|---|
| Neon, driver HTTP (hoje) | 9 ms |
| Neon, TCP reusado | 3 ms |
| **Supabase, TCP reusado** | **2 ms** |
| Neon, TCP conexão nova | 59 ms |
| **Supabase, TCP conexão nova** | **77 ms** |

Numa página que faz ~4 consultas, a diferença é de dezenas de milissegundos num
total de ~130 ms. Ninguém sente. A medição serviu para **tirar a velocidade da
mesa nos dois sentidos**: matou a objeção de que TCP frio inviabilizaria a troca
(estimei 450 ms de um notebook; são 77 ms de dentro da Vercel) e matou também o
argumento de que migrar deixaria o app mais rápido.

**Não é preço, sozinho.** São US$ 10/mês por projeto no plano Pro que a empresa
já paga, contra ~US$ 19/mês do Neon pago. Nove dólares de diferença não pagam o
trabalho nem o risco de uma migração.

**O que decide é a soma:** o Supabase é mais barato que a única alternativa que
resolve a suspensão, e ainda tira um fornecedor da mesa. Como bônus, abre o
Realtime, que substituiria o polling de 30 segundos da lista de conversas.

### Uma premissa errada que quase mudou a decisão

Cheguei a argumentar contra a migração alegando que, se cada cliente tivesse a
própria instalação, seriam US$ 10 por cliente. **Estava errado.** O sistema já é
multi-conta: existe a tabela `accounts`, o seletor na barra lateral, e tudo é
chaveado por `account_id` — houve até uma migração promovendo a chave primária
de `contacts` para `(account_id, ig_id)` justamente para isso.

Uma instalação atende N contas de N clientes. São US$ 10 no total.

**Fica um limite real, e ele não é de banco:** existe uma `ADMIN_PASSWORD` só, e
quem entra vê todas as contas. Funciona no modelo de agência, em que a N8X opera
o painel. Não funcionaria se o cliente entrasse no painel dele — isso exigiria
login por usuário e permissão por conta, trabalho no app.

---

## O que a migração encontra

Levantado no banco atual, não estimado:

| | |
|---|---|
| Volume | 246 linhas, 8,4 MB |
| Postgres | 17.10 |
| Extensões | **apenas `plpgsql`** |
| Pontos que chamam o banco | 73, todos pela função `sql()` de `lib/db.ts` |

Nada é específico do Neon. `gen_random_uuid()` é nativo do Postgres desde a 13;
`on conflict`, `make_interval`, `for update skip locked`, `jsonb_set` e
`to_jsonb` são padrão.

**Consequência:** o schema não precisa ser migrado. O `ensureSchema` o constrói
do zero na primeira requisição contra o banco novo, incluindo as migrações de
chave primária. Copiamos **só dados**.

---

## Decisões

**Driver: `postgres.js`.** O Supabase não tem driver HTTP; é Postgres por TCP com
o Supavisor na frente. `postgres.js` cobre as duas formas de chamada que o
projeto usa — template marcado e `query(texto, params)`, via `unsafe()` —, então
a interface de `sql()` não muda e os 73 pontos ficam intocados.

**Modo transação, porta 6543, com `prepare: false`.** A documentação do Supabase
descreve esse modo como o indicado para serverless: o cliente faz uma consulta e
devolve a conexão. O `prepare: false` não é opcional — o modo transação não
suporta *prepared statements*, e sem ele a falha aparece sob concorrência, não na
primeira requisição, que é o pior tipo de falha.

**Cópia por script Node**, não `pg_dump`. Nesse volume, o script é mais rápido de
escrever do que instalar e alinhar a versão das ferramentas no Windows — e
termina conferindo a contagem das 8 tabelas, que é o que de fato importa. O
script vai versionado: migração que não dá para reproduzir é migração que não dá
para conferir.

**Virada direta, com volta rápida.** Copiar, trocar a `DATABASE_URL`, redeployar.
O Neon fica **intocado** — o script só lê dele —, então voltar é trocar a
variável de novo.

**A fila é drenada até zerar antes da cópia.** Sem isso, um item pendente seria
copiado e poderia ser drenado nos **dois** bancos, e a pessoa receberia a mesma
mensagem duas vezes.

**O Neon fica de pé por 7 dias.** Prazo para o cron diário das 9h e os lembretes
de 60 minutos rodarem pelo menos uma vez — coisas que um teste de 20 minutos não
exercita.

---

## O risco principal

Não é latência, não é conexão: é **conversão de tipo**.

Drivers diferentes devolvem `timestamptz`, `bigint` e `numeric` de formas
diferentes — `Date` num, `string` no outro. Onde o código faz `new Date(x)` está
protegido; onde assume `Date`, quebra.

**Nenhum dos 141 testes pega isso**, porque a suíte cobre função pura de
propósito e não toca no banco. É por isso que a verificação abaixo exercita
caminhos, e não telas.

Risco secundário: **esgotamento de conexão**. O driver HTTP de hoje não tem esse
conceito; com TCP, cada instância da Vercel segura conexões no pooler. A
orientação do Supabase é manter o uso abaixo de 80% do disponível. Com o tráfego
atual há folga grande, mas o modo de falha aparece sob pico de webhook como erro
intermitente — não como lentidão.

---

## Procedimento

| # | Passo | Quem |
|---|---|---|
| 1 | Criar o projeto Pro em `sa-east-1` e passar a string do pooler (6543) | N8X |
| 2 | Trocar o driver em `lib/db.ts`, mantendo a interface | eu |
| 3 | Drenar a fila até zerar e confirmar `0 pendentes` | eu |
| 4 | Rodar o script e conferir a contagem das 8 tabelas | eu |
| 5 | **Trocar a `DATABASE_URL` na Vercel (Production) e redeployar** | **N8X** |
| 6 | Verificar os caminhos abaixo | os dois |
| 7 | Desligar o Neon após 7 dias | N8X |

O passo 5 é da N8X porque é o único que muda produção de verdade e o único que
eu não consigo desfazer sozinho — depende do painel da Vercel. A mão que aperta
deve ser a que tem acesso para desapertar.

### Janela de troca

Entre o passo 5 e o fim do redeploy o app fica alguns minutos fora. **Nenhum
evento se perde:** o webhook devolve `503` quando o banco está indisponível, e a
Meta reenvia por até ~36 horas. Isso é o que permite fazer a troca em horário
comercial em vez de madrugada.

### Verificação

Não basta o painel abrir. Cada item exercita um caminho diferente:

| O quê | Por quê |
|---|---|
| Abrir Painel, Conversas, Contatos, Atividade, Automações | leitura em todas as tabelas — onde erro de tipo aparece |
| Receber uma DM do `@jvsiqueira_` | webhook grava |
| Responder pelo painel | fila enfileira, drena e entrega |
| Criar e salvar uma automação | escrita com `jsonb` e array de texto |
| Chamar o cron manualmente | renovação de token e drenagem de segurança |

Os dois últimos são os que ninguém lembra de testar, e são exatamente onde tipo
diferente morde.

---

## Fora de escopo

**Realtime.** Fica disponível depois da migração e resolveria o polling de 30
segundos da lista de conversas, mas é trabalho próprio, com seu próprio
planejamento.

**Login por usuário e permissão por conta.** Necessário se um dia o cliente for
entrar no painel dele. Não tem relação com a troca de banco.

**Testes de integração com banco.** A ausência deles é o que torna a verificação
manual obrigatória aqui. Continua sendo uma decisão consciente.
