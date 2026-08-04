# Não lidas na lista de conversas

**Data:** 04/08/2026
**Estado:** aprovado
**Base:** `e91d352`

---

## O problema

A lista mostra o total de mensagens da conversa — "16 msgs". Esse número não
responde a pergunta que quem abre o painel tem: **onde eu preciso agir?** Uma
conversa com 169 mensagens e nada pendente aparece mais chamativa que uma com 2
mensagens esperando resposta.

## O que decide o desenho

O sistema **não tem nenhuma noção de leitura** hoje. Não há coluna, evento nem
registro de quando alguém olhou uma conversa. Tudo aqui é construído do zero, e
por isso a primeira pergunta foi o que significa "não lida" — não como desenhar
o badge.

Duas definições possíveis, e elas se comportam de forma diferente:

| | some quando | precisa de estado novo |
|---|---|---|
| Aguardando resposta | alguém responde | não |
| Não vista | alguém abre | sim |

**Adotadas as duas**, cada uma com seu sinal. Uma responde "o que eu ainda não
li", a outra "quem ainda não foi atendido" — e as duas juntas é que dizem o que
fazer.

### O número que mudou a decisão

A marca de "ninguém respondeu" foi medida contra os dados reais antes de virar
código:

| | |
|---|---|
| Conversas | 34 |
| Última mensagem foi da pessoa | **32 (94%)** |
| Dessas, ainda dentro da janela de 24h | **8 (24%)** |

Marcar as 32 acenderia quase o painel inteiro — e 24 delas estão fora da janela,
onde a Meta recusa o envio. Marcá-las seria pedir uma ação impossível.

**A marca fica restrita à janela de 24h.** Ela deixa de ser um histórico de
arrependimentos e vira uma lista do que dá para fazer agora. Some sozinha quando
a janela fecha, sem ninguém precisar limpar nada.

---

## Decisões

**A leitura mora em `contacts`.** Uma coluna `last_seen_at`, acrescentada pelo
`ensureSchema` com `add column if not exists`, como todas as outras migrações
leves. A chave da tabela já é `(account_id, ig_id)`, que é exatamente o escopo de
"esta conversa desta conta".

**Quem grava é uma Server Action chamada pelo cliente, não a renderização.**

Esta é a decisão menos óbvia e a que mais importa. A lista usa `<Link>`, e o
Next faz prefetch — que **renderiza a página no servidor**. Observado no log de
rede durante outro teste, sem nenhuma conversa ter sido aberta:

```
/conversas/1223936289521204?_rsc=...  200
/conversas/1740843114109531?_rsc=...  200
/conversas/936023662823814?_rsc=...   200
```

Gravar "visto" durante a renderização marcaria como lida toda conversa que
passasse perto do mouse. O sintoma seria "às vezes as não lidas somem sozinhas" —
o tipo de defeito que ninguém consegue reproduzir.

A ação também regrava quando chega mensagem com a conversa **aberta**. Sem isso,
o que chegou enquanto a pessoa lia contaria como não lido ao sair.

**Resposta automática conta como resposta.** Do ponto de vista de quem escreveu,
foi respondida. Se não contasse, toda conversa atendida por automação ficaria
marcada para sempre. Hoje muda pouco — 4 dos 22 envios foram automáticos — mas
muda conforme o uso crescer.

**Um único lugar na linha.** A segunda linha tem a direita livre; o contador da
janela ocupa a primeira. As duas marcas dividem esse espaço e significam a mesma
coisa: *tem algo aqui que precisa de você*.

As duas condições são verdadeiras ao mesmo tempo com frequência — mensagem que
chegou e não foi respondida é as duas coisas. **O número tem precedência**, por
carregar mais informação:

```
não lidas > 0            →  ( 3 )
senão, sem resposta      →   ·
senão                    →  nada
```

```
[foto]  Alice Mendes Stolfi 🌙          23h51      janela (já existe)
        há 3 min · 16 msgs                ( 3 )    não lidas

  depois de abrir, sem responder
        há 3 min · 16 msgs                  ·      sem resposta

  depois de responder
        há 3 min · 16 msgs
```

---

## Como cada conta é feita

| | |
|---|---|
| Não lidas | recebidas com `created_at > last_seen_at` |
| Sem resposta | última recebida > última enviada **e** janela aberta |

Sem `last_seen_at` (contato que nunca foi aberto), toda mensagem recebida conta
como não lida — que é o comportamento certo para quem chegou agora.

## O risco

**Contagem inflada em instalação antiga.** Contatos sem `last_seen_at` mostrarão
todas as mensagens como não lidas na primeira vez. É correto por definição, mas
aparece como um painel cheio de badges no primeiro acesso depois do deploy.
Aceito: some sozinho conforme as conversas forem abertas, e o alternativo seria
semear `last_seen_at = now()` para todo mundo, escondendo mensagens que de fato
não foram lidas.

## Fora de escopo

**Leitura por pessoa.** O painel tem uma senha só; "visto" é da instalação, não
de quem olhou. Se um dia houver login por usuário, isso volta à mesa.

**Marcar como não lida à mão.** Útil, mas é outro recurso, com sua própria tela e
seu próprio estado.

**Notificação fora do painel.** Nada de som, título piscando ou push.
