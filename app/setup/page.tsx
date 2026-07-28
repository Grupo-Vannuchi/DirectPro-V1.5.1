import { headers } from "next/headers";
import { getConfig, isMetaConfigured, listAccounts, sql } from "@/lib/db";
import { qstashEnabled } from "@/lib/qstash";
import {
  saveMetaCredentials,
  reassinarWebhooks,
  testarWebhook,
} from "./actions";
import { canonicalAppUrl, isEphemeralUrl } from "@/lib/app-url";
import { Suspense } from "react";
import SubscriptionStatus, { SubscriptionStatusSkeleton } from "./subscription-status";
import { getSubscribedFields } from "@/lib/ig";
import CopyField from "./copy-field";
import SubmitButton from "./submit-button";
import { IconAlert } from "../icons";
import Avatar from "../avatar";
import { fmtDate } from "@/lib/format";
import { card, input, muted, btnPrimary, alertError, alertOk, link } from "../ui";

export const dynamic = "force-dynamic";

function Step({
  number,
  title,
  done,
  subtitle,
  obrigatorio,
  ondeFica,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  // O que esta etapa entrega, em uma linha — evita que o usuário tenha que
  // deduzir o objetivo a partir das instruções.
  subtitle?: string;
  obrigatorio?: boolean;
  // Onde exatamente no painel da Meta esta etapa acontece.
  ondeFica?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`p-5 ${card}`}>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            done
              ? "bg-emerald-500 text-white"
              : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
          }`}
        >
          {done ? "✓" : number}
        </span>
        <span className="min-w-0">{title}</span>
        {done ? (
          <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            concluído
          </span>
        ) : obrigatorio ? (
          <span className="ml-auto shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            obrigatório
          </span>
        ) : null}
      </h2>
      {subtitle && <p className={`ml-8 mt-1 text-xs ${muted}`}>{subtitle}</p>}
      {ondeFica && (
        <p className="ml-8 mt-1 text-xs text-zinc-500">
          <b>Onde:</b> {ondeFica}
        </p>
      )}
      <div className="mt-3 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">{children}</div>
    </section>
  );
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; salvo?: string }>;
}) {
  const sp = await searchParams;
  const config = await getConfig();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origemAtual = host ? `${proto}://${host}` : "";
  const appUrl = canonicalAppUrl(config.app_url, origemAtual);
  // Acessar o painel por uma URL de deployment da Vercel é a causa mais comum
  // de "não foi possível validar a URL de callback": essas URLs exigem login e
  // mudam a cada deploy.
  const urlInstavel = isEphemeralUrl(appUrl) || isEphemeralUrl(origemAtual);

  const metaOk = isMetaConfigured(config);
  const accounts = await listAccounts();
  const connected = accounts.length > 0;
  const eventRows = (await sql()`select count(*)::int as n from events`) as { n: number }[];
  const hasEvents = (eventRows[0]?.n ?? 0) > 0;

  const inputCls = input;

  // Progresso real: cada marco só fica verde quando de fato aconteceu.
  const marcos = [metaOk, connected, hasEvents];
  const concluidos = marcos.filter(Boolean).length;
  const pct = Math.round((concluidos / marcos.length) * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Configuração</h1>
        <p className={`mt-1 text-sm ${muted}`}>
          Siga as etapas na ordem. Cada uma diz o que fazer, onde fazer e como conferir se deu
          certo antes de seguir para a próxima.
        </p>
        {/* Barra de progresso: mostra o quanto falta e evita a sensação de
            processo interminável, que é o que gera abandono. */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className={muted}>
              {concluidos === marcos.length
                ? "Configuração concluída"
                : `Etapa ${concluidos + 1} de ${marcos.length} marcos`}
            </span>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {sp.erro && <div className={alertError}>{sp.erro}</div>}
      {sp.salvo && (
        <div className={alertOk}>
          {sp.salvo === "1" ? "Credenciais salvas! Continue no passo 3." : sp.salvo}
        </div>
      )}

      {urlInstavel && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <IconAlert className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          <b>Atenção: você está usando um endereço temporário da Vercel</b> (<code>{appUrl}</code>).
          Esse tipo de URL muda a cada deploy e normalmente exige login, então a Meta não consegue
          validar o webhook e os eventos param de chegar. Abra o painel pelo{" "}
          <b>domínio de produção</b> do projeto (ou defina a variável de ambiente{" "}
          <code>APP_URL</code> com ele) antes de configurar.
        </div>
      )}

      <Step
        number={1}
        title="Criar o app na Meta"
        done={metaOk}
        obrigatorio
        subtitle="Cria o aplicativo que fará a ponte entre o Instagram e este sistema."
        ondeFica="developers.facebook.com → Meus apps → Criar app"
      >
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Acesse{" "}
            <a
              href="https://developers.facebook.com/apps/creation/"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 underline dark:text-indigo-400"
            >
              developers.facebook.com/apps/creation
            </a>{" "}
            (entre com sua conta do Facebook).
          </li>
          <li>
            Crie um app do tipo <b>Empresa</b> (Business). Dê qualquer nome, ex.:{" "}
            <i>Minha Automação</i>.
          </li>
          <li>
            Na tela de produtos, adicione <b>Instagram</b> e escolha{" "}
            <b>&quot;Configuração da API com login do Instagram&quot;</b>.
          </li>
          <li>
            No menu lateral: <b>Instagram → Configuração da API com login do Instagram</b>. Aí
            estão o <b>ID do app do Instagram</b> e a <b>chave secreta do app do Instagram</b> —
            copie os dois para o passo 2.
          </li>
        </ol>
      </Step>

      <Step
        number={2}
        title="Colar as credenciais aqui"
        done={metaOk}
        obrigatorio
        subtitle="Conecta este sistema ao app que você acabou de criar."
        ondeFica="No app da Meta: Instagram → Configuração da API com login do Instagram"
      >
        <form action={saveMetaCredentials} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              ID do app do Instagram
            </label>
            <input
              name="instagram_app_id"
              defaultValue={config.instagram_app_id ?? ""}
              required
              className={inputCls}
              placeholder="1234567890123456"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Chave secreta do app do Instagram
            </label>
            <input
              name="instagram_app_secret"
              type="password"
              defaultValue={config.instagram_app_secret ?? ""}
              required
              className={inputCls}
              placeholder="••••••••••••••••"
            />
          </div>
          <SubmitButton className={btnPrimary} pendingLabel="Salvando…">
            Salvar credenciais
          </SubmitButton>
        </form>
      </Step>

      <Step
        number={3}
        title="Autorizar o endereço de retorno (OAuth)"
        done={connected}
        obrigatorio
        subtitle="Sem isto, o botão de conectar dá erro de “Invalid redirect_uri”."
        ondeFica="Instagram → Configuração da API → Configurações do login da empresa → URIs de redirecionamento do OAuth"
      >
        <p>
          Cole o endereço abaixo <b>exatamente como está</b> e salve. Ele precisa bater caractere
          por caractere — sem barra no final, sem <code>www</code> a mais.
        </p>
        <CopyField label="URI de redirecionamento OAuth" value={`${appUrl}/api/oauth/callback`} />
        <p className={`text-xs ${muted}`}>
          Se você acessa este painel por mais de um endereço, cadastre todos eles na Meta — o que
          vale é o endereço pelo qual você clica em “Conectar”.
        </p>
      </Step>

      <Step
        number={4}
        title="Configurar e validar o webhook"
        done={hasEvents}
        obrigatorio
        subtitle="É o que faz os comentários e DMs chegarem até aqui em tempo real."
        ondeFica="Instagram → Configuração da API → Configurar webhooks"
      >
        <p>
          <b>Teste primeiro, salve depois.</b> O botão abaixo faz a mesma chamada que a Meta faz —
          se ele passar, o “Verificar e salvar” da Meta também passa. Se falhar, ele diz o motivo
          exato, em vez do erro genérico da Meta.
        </p>
        <div className="space-y-2">
          <CopyField label="URL de callback" value={`${appUrl}/api/webhook`} />
          <CopyField label="Token de verificação" value={config.webhook_verify_token ?? ""} />
          <form action={testarWebhook}>
            <SubmitButton
              className={btnPrimary}
              etapas={[
                "Chamando sua URL pública…",
                "Conferindo o token de verificação…",
                "Quase lá…",
              ]}
            >
              1. Testar esta URL
            </SubmitButton>
          </form>
          <p className={`text-xs ${muted}`}>
            Deu certo? Então <b>2.</b> cole os dois campos acima na Meta e clique em{" "}
            <b>Verificar e salvar</b>. Depois <b>3.</b> assine os campos <b>comments</b> e{" "}
            <b>messages</b> em <b>Gerenciar</b>.
          </p>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-zinc-500">Depois de salvar na Meta</summary>
          <div className="mt-2 space-y-2">
            <p>
              Depois de salvar o webhook, clique em <b>Gerenciar</b> e assine os campos{" "}
              <b>comments</b> e <b>messages</b>.
            </p>
          </div>
        </details>
      </Step>

      <Step
        number={5}
        title="Publicar o app e liberar sua conta"
        done={hasEvents}
        obrigatorio
        subtitle="A Meta só entrega eventos para apps publicados e contas autorizadas."
        ondeFica="Configurações do app → Básico  ·  Funções do app → Testadores"
      >
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <IconAlert className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          Este é o passo que mais gente esquece — e sem ele o webhook fica configurado, mas{" "}
          <b>nenhum evento chega</b>.
        </p>
        <p className="font-medium text-zinc-800 dark:text-zinc-200">
          a. Cadastre as duas URLs abaixo em <b>Configurações do app → Básico</b> (a Meta exige
          para publicar):
        </p>
        <CopyField label="URL da Política de Privacidade" value={`${appUrl}/privacidade`} />
        <CopyField label="URL de Exclusão de Dados" value={`${appUrl}/exclusao-de-dados`} />
        <p className="font-medium text-zinc-800 dark:text-zinc-200">
          b. Coloque o app <b>Ao vivo</b> (chave no topo do painel da Meta).
        </p>
        <p className="font-medium text-zinc-800 dark:text-zinc-200">
          c. Adicione sua conta como <b>Testador do Instagram</b> em <b>Funções do app</b>.
        </p>
        <p className="font-medium text-zinc-800 dark:text-zinc-200">
          d. Aceite o convite <b>pelo navegador, no computador</b>:
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>
            Abra{" "}
            <a
              href="https://www.instagram.com/accounts/manage_access/"
              target="_blank"
              rel="noreferrer"
              className={link}
            >
              instagram.com/accounts/manage_access
            </a>{" "}
            e entre com a conta que você adicionou como testadora.
          </li>
          <li>
            Vá em <b>Apps e sites</b> → aba <b>Convites de testador</b>.
          </li>
          <li>
            Clique em <b>Aceitar</b> no convite do seu app.
          </li>
        </ol>
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <IconAlert className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          O convite <b>não aparece no aplicativo do Instagram no celular</b> — só na versão web. Se
          você procurou no app e não achou, é por isso: faça pelo navegador, no computador.
        </p>
        <p className={`text-xs ${muted}`}>
          Como conferir: no painel da Meta, a conta precisa aparecer com a chave{" "}
          <b>Assinatura do webhook</b> ligada (verde). Se estiver “Desativado”, os eventos daquela
          conta não são enviados.
        </p>
      </Step>

      <Step
        number={6}
        title="Conectar seu Instagram"
        done={connected}
        obrigatorio
        subtitle="Autoriza a conta e gera o token que este sistema usa para responder."
      >
        {connected ? (
          <>
            <p>
              {accounts.length === 1
                ? "Conta conectada ✓ — os webhooks foram assinados automaticamente."
                : `${accounts.length} contas conectadas ✓ — cada uma tem suas próprias automações e contatos.`}
            </p>
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li
                  key={a.ig_user_id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <Avatar
                    src={a.profile_picture_url}
                    name={a.username ?? "?"}
                    className="h-9 w-9"
                    textClassName="text-xs"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      @{a.username ?? a.ig_user_id}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      ID:{" "}
                      <code className="select-all font-mono text-zinc-600 dark:text-zinc-300">
                        {a.ig_user_id}
                      </code>
                    </p>
                    <p className="text-xs text-zinc-500">
                      Token válido até {fmtDate(a.token_expires_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>
            Sua conta precisa ser <b>Profissional</b> (Comercial ou Criador). Clique para
            autorizar:
          </p>
        )}
        <a
          href="/api/oauth/login"
          className={`inline-block rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            metaOk
              ? "bg-indigo-500 text-white hover:bg-indigo-600"
              : "pointer-events-none bg-zinc-300 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
          }`}
        >
          {connected ? "Conectar outra conta" : "Conectar Instagram"}
        </a>
        {!metaOk && <p className="text-xs text-zinc-500">Complete os passos 1 e 2 antes.</p>}
        {connected && (
          <p className={`text-xs ${muted}`}>
            Cada conta extra precisa ser adicionada como <b>Testador do Instagram</b> no seu app
            da Meta e aceitar o convite <b>pelo navegador, no computador</b> (etapa 5) antes de
            autorizar aqui.
          </p>
        )}
      </Step>

      <Step
        number={7}
        title="Testar de ponta a ponta"
        done={hasEvents}
        obrigatorio
        subtitle="Confirma que o evento chega e que a automação responde."
      >
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Crie uma automação em <b>Automações</b> com uma palavra-chave.
          </li>
          <li>Publique um post (ou use um existente).</li>
          <li>
            Comente a palavra-chave <b>usando OUTRA conta</b> — a Meta nem sempre envia webhook de
            comentário da própria conta para si mesma.
          </li>
          <li>
            Confira em <b>Eventos</b>: o evento aparece e a DM sai em segundos.
          </li>
        </ol>
        {hasEvents ? (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Já recebemos eventos da Meta ✓ — a integração está funcionando.
          </p>
        ) : (
          <p className={`text-xs ${muted}`}>
            Nenhum evento recebido ainda. Se você já testou e nada apareceu, veja a revisão abaixo:
            ela mostra o motivo mais provável.
          </p>
        )}
      </Step>

      <Step
        number={8}
        title="Revisar e confirmar"
        done={metaOk && connected && hasEvents}
        subtitle="Resumo de tudo que foi configurado e o que ainda falta."
      >
        <ul className="space-y-2">
          {[
            {
              ok: metaOk,
              label: "Credenciais da Meta salvas",
              falta: "Volte à etapa 2 e cole o App ID e a chave secreta.",
            },
            {
              ok: connected,
              label: `Instagram conectado${accounts.length ? ` (${accounts.length} conta${accounts.length > 1 ? "s" : ""})` : ""}`,
              falta: "Volte à etapa 6 e clique em conectar.",
            },
            {
              ok: hasEvents,
              label: "Eventos chegando da Meta",
              falta:
                "Confira as etapas 4 e 5 (webhook validado, app publicado e conta como testadora).",
            },
          ].map((item) => (
            <li key={item.label} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                  item.ok ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"
                }`}
              >
                {item.ok ? "✓" : "!"}
              </span>
              <span>
                {item.label}
                {!item.ok && <span className={`block text-xs ${muted}`}>{item.falta}</span>}
              </span>
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Permissões usadas por este app
          </p>
          <ul className={`list-disc space-y-0.5 pl-5 text-xs ${muted}`}>
            <li>
              <code>instagram_business_basic</code> — perfil, posts e stories
            </li>
            <li>
              <code>instagram_business_manage_messages</code> — enviar as DMs
            </li>
            <li>
              <code>instagram_business_manage_comments</code> — ler e responder comentários
            </li>
          </ul>
          <p className={`mt-2 text-xs ${muted}`}>
            Só isso. Se a Meta pedir para revisar permissões, aprove apenas estas três.
          </p>
        </div>

        {metaOk && connected && hasEvents && (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Configuração concluída ✓ Suas automações já estão no ar.
          </p>
        )}
      </Step>

      {connected && (
        <section className={`p-5 ${card}`}>
          <h3 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Diagnóstico das contas
          </h3>
          <p className={`mb-3 text-xs ${muted}`}>
            Cada conta precisa estar assinando <b>comments</b> e <b>messages</b>. Se alguma
            estiver fora, nada chega no painel — e o botão abaixo religa sem reconectar.
          </p>
          <Suspense fallback={<SubscriptionStatusSkeleton />}>
            <SubscriptionStatus />
          </Suspense>
        </section>
      )}

      <section className={`p-5 text-xs ${card} ${muted}`}>
        <h3 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Status técnico
        </h3>
        <ul className="space-y-1">
          <li>Banco de dados: conectado ✓ (tabelas criadas automaticamente)</li>
          <li>
            QStash (lembretes na hora certa):{" "}
            {qstashEnabled() ? (
              "ativo ✓"
            ) : (
              <>
                não configurado — os lembretes podem atrasar. Para ativar: painel da Vercel →{" "}
                <b>Storage/Marketplace → Upstash QStash</b> (grátis, 1 clique) e faça redeploy.
              </>
            )}
          </li>
          <li>URL pública: {appUrl || "—"}</li>
        </ul>
      </section>
    </div>
  );
}
