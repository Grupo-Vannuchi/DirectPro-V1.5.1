import "server-only";
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

// Banco Postgres (Neon, provisionado pela Vercel). Acesso só no servidor —
// a única credencial é a DATABASE_URL, que nunca chega ao navegador.
type Sql = ReturnType<typeof neon>;

let _sql: Sql | null = null;

// Aceita o banco com QUALQUER prefixo de variável (DATABASE_URL, STORAGE_URL,
// POSTGRES_URL...): o comprador não precisa acertar o "Custom Prefix" na Vercel.
function findDatabaseUrl(): string | undefined {
  const direct =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.NEON_DATABASE_URL;
  if (direct) return direct;
  const candidates = Object.entries(process.env)
    .filter(
      ([k, v]) =>
        typeof v === "string" &&
        /^postgres(ql)?:\/\//.test(v) &&
        !/UNPOOLED|NON_?POOLING|NO_SSL/i.test(k)
    )
    .sort(([a], [b]) => a.localeCompare(b));
  return candidates[0]?.[1];
}

export function sql(): Sql {
  if (!_sql) {
    const url = findDatabaseUrl();
    if (!url) {
      throw new Error(
        "Banco não encontrado. Na Vercel: Storage > Create Database > Neon, conecte ao projeto e faça um Redeploy."
      );
    }
    _sql = neon(url);
  }
  return _sql;
}

// ---------- Tipos ----------

// config guarda o que é da INSTÂNCIA (app da Meta, verify token, URL pública).
// Os campos de conta (ig_user_id, token…) são legados: hoje cada conta conectada
// vive na tabela `accounts`. Mantidos aqui só para a migração dos bancos antigos.
export type Config = {
  id: number;
  ig_user_id: string | null;
  username: string | null;
  name: string | null;
  profile_picture_url: string | null;
  access_token: string | null;
  token_expires_at: Date | null;
  connected_at: Date | null;
  instagram_app_id: string | null;
  instagram_app_secret: string | null;
  // Credenciais do APP principal (Configurações → Básico), diferentes das do
  // login do Instagram. Usadas para configurar o webhook via API.
  meta_app_id: string | null;
  meta_app_secret: string | null;
  webhook_verify_token: string | null;
  app_url: string | null;
};

// Uma conta de Instagram conectada. Várias podem coexistir na mesma instalação.
export type Account = {
  ig_user_id: string;
  username: string | null;
  name: string | null;
  profile_picture_url: string | null;
  access_token: string;
  token_expires_at: Date | null;
  connected_at: Date | null;
  created_at: Date;
};

export type Automation = {
  id: string;
  account_id: string;
  name: string;
  active: boolean;
  triggers: string[];
  keywords: string[];
  match_type: "contains" | "exact" | "any";
  media_id: string | null;
  media_thumbnail_url: string | null;
  media_caption: string | null;
  story_id: string | null;
  story_thumbnail_url: string | null;
  public_replies: string[];
  welcome_text: string;
  quick_reply_label: string;
  link_text: string;
  link_button_label: string;
  link_url: string;
  reminder_text: string;
  reminder_delay_minutes: number;
  // etapas opcionais
  require_follow: boolean;
  follow_text: string;
  follow_button_label: string;
  ask_email: boolean;
  email_text: string;
  story_reaction: string; // emoji; vazio = não reage
  created_at: Date;
};

export type Followup = {
  id: string;
  automation_id: string;
  position: number;
  kind: "link" | "reminder";
  text: string;
  button_label: string | null;
  url: string | null;
  delay_minutes: number;
};

export type Contact = {
  account_id: string;
  ig_id: string;
  username: string | null;
  name: string | null;
  profile_pic: string | null;
  email: string | null;
  awaiting: string | null;
  follow_attempts: number;
  first_contact_at: Date;
  last_reply_at: Date | null;
  last_automation_id: string | null;
};

export type QueueItem = {
  id: string;
  account_id: string | null;
  kind:
    | "private_reply"
    | "comment_reply"
    | "dm_welcome"
    | "dm_link"
    | "dm_reminder"
    | "dm_follow_gate"
    | "dm_email_ask"
    | "story_reaction";
  contact_ig_id: string | null;
  automation_id: string | null;
  comment_id: string | null;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  status: string;
  attempts: number;
  not_before: Date;
  claimed_at: Date | null;
  sent_at: Date | null;
  error: string | null;
  created_at: Date;
};

// ---------- Schema automático ----------
// Criado na primeira requisição: quem clona o projeto nunca roda SQL.

const DDL = [
  `create table if not exists config (
    id int primary key default 1 check (id = 1),
    ig_user_id text,
    username text,
    name text,
    profile_picture_url text,
    access_token text,
    token_expires_at timestamptz,
    connected_at timestamptz,
    instagram_app_id text,
    instagram_app_secret text,
    meta_app_id text,
    meta_app_secret text,
    webhook_verify_token text,
    app_url text,
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists automations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    active boolean not null default true,
    triggers text[] not null default '{comment}',
    keywords text[] not null default '{}',
    match_type text not null default 'contains' check (match_type in ('contains','exact','any')),
    media_id text,
    media_thumbnail_url text,
    media_caption text,
    public_replies text[] not null default '{}',
    welcome_text text not null default '',
    quick_reply_label text not null default 'Quero o link! 🔗',
    link_text text not null default '',
    link_button_label text not null default 'Abrir link',
    link_url text not null default '',
    reminder_text text not null default '',
    reminder_delay_minutes int not null default 60,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists followups (
    id uuid primary key default gen_random_uuid(),
    automation_id uuid not null references automations(id) on delete cascade,
    position int not null,
    kind text not null check (kind in ('link','reminder')),
    text text not null default '',
    button_label text,
    url text,
    delay_minutes int not null default 0
  )`,
  `create index if not exists followups_automation_idx on followups(automation_id, position)`,
  `create table if not exists contacts (
    ig_id text primary key,
    username text,
    first_contact_at timestamptz not null default now(),
    last_reply_at timestamptz,
    last_automation_id uuid references automations(id) on delete set null
  )`,
  `create table if not exists queue (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('private_reply','comment_reply','dm_welcome','dm_link','dm_reminder')),
    contact_ig_id text,
    automation_id uuid references automations(id) on delete cascade,
    comment_id text,
    payload jsonb not null default '{}',
    dedupe_key text unique,
    status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
    attempts int not null default 0,
    not_before timestamptz not null default now(),
    claimed_at timestamptz,
    sent_at timestamptz,
    error text,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists queue_pending_idx on queue(status, not_before)`,
  `create table if not exists events (
    id uuid primary key default gen_random_uuid(),
    type text not null,
    payload jsonb not null default '{}',
    created_at timestamptz not null default now()
  )`,
  `create index if not exists events_created_idx on events(created_at desc)`,
  // Uma linha por conta de Instagram conectada (multi-conta)
  `create table if not exists accounts (
    ig_user_id text primary key,
    username text,
    name text,
    profile_picture_url text,
    access_token text not null,
    token_expires_at timestamptz,
    connected_at timestamptz,
    created_at timestamptz not null default now()
  )`,
  // Migrações leves para bancos criados antes destas colunas
  `alter table automations add column if not exists story_id text`,
  `alter table automations add column if not exists story_thumbnail_url text`,
  `alter table contacts add column if not exists name text`,
  `alter table contacts add column if not exists profile_pic text`,
  // Vínculo com a conta dona (multi-conta)
  `alter table automations add column if not exists account_id text`,
  `alter table contacts add column if not exists account_id text`,
  `alter table queue add column if not exists account_id text`,
  `alter table events add column if not exists account_id text`,
  // Etapas opcionais do fluxo: pedir follow, pedir e-mail, reagir ao story
  `alter table automations add column if not exists require_follow boolean not null default false`,
  `alter table automations add column if not exists follow_text text not null default ''`,
  `alter table automations add column if not exists follow_button_label text not null default 'Já sigo! ✅'`,
  `alter table automations add column if not exists ask_email boolean not null default false`,
  `alter table automations add column if not exists email_text text not null default ''`,
  `alter table automations add column if not exists story_reaction text not null default ''`,
  `alter table contacts add column if not exists email text`,
  // o que estamos esperando dessa pessoa na próxima mensagem ('follow' | 'email')
  `alter table contacts add column if not exists awaiting text`,
  // quantas vezes já pedimos que ela siga (evita virar spam)
  `alter table contacts add column if not exists follow_attempts int not null default 0`,
  `create index if not exists automations_account_idx on automations(account_id)`,
  `create index if not exists queue_account_idx on queue(account_id, status)`,
  `create index if not exists events_account_idx on events(account_id, created_at desc)`,
  // Freio de força bruta no login: uma linha por tentativa errada, por IP.
  `create table if not exists login_attempts (
    ip text not null,
    attempted_at timestamptz not null default now()
  )`,
  `create index if not exists login_attempts_idx on login_attempts(ip, attempted_at desc)`,
  // Filtro "de qual post veio" em /eventos: sem este índice de expressão, cada
  // filtragem varre a tabela inteira.
  `create index if not exists events_media_idx on events ((payload->'media'->>'id'))`,
];

type SqlClient = ReturnType<typeof sql>;

// Migração de instalação single-conta → multi-conta. Idempotente: roda em todo
// boot sem efeito quando já aplicada.
async function migrateAccounts(s: SqlClient): Promise<void> {
  // 1) Semeia a conta legada (que morava em config) na tabela accounts
  await s.query(
    `insert into accounts (ig_user_id, username, name, profile_picture_url,
                           access_token, token_expires_at, connected_at)
     select ig_user_id, username, name, profile_picture_url,
            access_token, token_expires_at, connected_at
     from config
     where id = 1 and ig_user_id is not null and access_token is not null
     on conflict (ig_user_id) do nothing`
  );

  // 2) Enquanto houver exatamente UMA conta, os registros órfãos (account_id
  //    nulo) são todos dela — atribui. Com 2+ contas o backfill já aconteceu.
  const accs = (await s.query(`select ig_user_id from accounts`)) as { ig_user_id: string }[];
  if (accs.length === 1) {
    const target = accs[0].ig_user_id;
    for (const t of ["automations", "queue", "events", "contacts"]) {
      await s.query(`update ${t} set account_id = $1 where account_id is null`, [target]);
    }
  }

  // 2b) A fila ganhou tipos novos (follow, e-mail, reação). A restrição
  //     antiga barraria esses valores, então é recriada.
  await s.query(`
    do $$
    begin
      if exists (
        select 1 from pg_constraint
        where conrelid = 'queue'::regclass and conname = 'queue_kind_check'
      ) then
        alter table queue drop constraint queue_kind_check;
      end if;
      alter table queue add constraint queue_kind_check check (kind in (
        'private_reply','comment_reply','dm_welcome','dm_link','dm_reminder',
        'dm_follow_gate','dm_email_ask','story_reaction'
      ));
    exception when duplicate_object then null;
    end $$;
  `);

  // 3) Promove a PK de contacts para (account_id, ig_id) — a mesma pessoa pode
  //    falar com duas contas conectadas. Cada passo tem sua própria guarda,
  //    então rodar de novo (ou parar no meio) nunca quebra.
  await s.query(`
    do $$
    begin
      -- derruba a PK antiga (só ig_id), agora que cada linha sabe a conta
      if exists (
           select 1 from pg_constraint
           where conrelid = 'contacts'::regclass and contype = 'p'
             and array_length(conkey, 1) = 1
         )
         and not exists (select 1 from contacts where account_id is null) then
        alter table contacts drop constraint contacts_pkey;
      end if;

      -- instala a PK composta quando a tabela está sem PK e sem nulos
      if not exists (
           select 1 from pg_constraint
           where conrelid = 'contacts'::regclass and contype = 'p'
         )
         and not exists (select 1 from contacts where account_id is null) then
        alter table contacts add primary key (account_id, ig_id);
      end if;
    end $$;
  `);
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const s = sql();
      for (const ddl of DDL) {
        await s.query(ddl);
      }
      // migração p/ instalações antigas: colunas do app principal (Básico)
      await s.query(`alter table config add column if not exists meta_app_id text`);
      await s.query(`alter table config add column if not exists meta_app_secret text`);
      // garante a linha única de config com um verify token já gerado
      await s.query(
        `insert into config (id, webhook_verify_token) values (1, $1)
         on conflict (id) do nothing`,
        [randomBytes(16).toString("hex")]
      );
      await migrateAccounts(s);
    })().catch((err) => {
      schemaReady = null; // deixa a próxima requisição tentar de novo
      throw err;
    });
  }
  return schemaReady;
}

// ---------- Config ----------

export async function getConfig(): Promise<Config> {
  await ensureSchema();
  const rows = (await sql()`select * from config where id = 1`) as Config[];
  return rows[0];
}

const CONFIG_COLUMNS = new Set([
  "ig_user_id",
  "username",
  "name",
  "profile_picture_url",
  "access_token",
  "token_expires_at",
  "connected_at",
  "instagram_app_id",
  "instagram_app_secret",
  "meta_app_id",
  "meta_app_secret",
  "webhook_verify_token",
  "app_url",
]);

export async function updateConfig(fields: Partial<Config>): Promise<void> {
  await ensureSchema();
  const entries = Object.entries(fields).filter(([k]) => CONFIG_COLUMNS.has(k));
  if (!entries.length) return;
  const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(", ");
  await sql().query(
    `update config set ${sets}, updated_at = now() where id = 1`,
    entries.map(([, v]) => v)
  );
}

export function isMetaConfigured(c: Config): boolean {
  return Boolean(c.instagram_app_id && c.instagram_app_secret);
}

// ---------- Contas ----------

export async function listAccounts(): Promise<Account[]> {
  await ensureSchema();
  return (await sql()`select * from accounts order by created_at asc`) as Account[];
}

export async function getAccount(igUserId: string): Promise<Account | undefined> {
  await ensureSchema();
  const rows = (await sql().query(`select * from accounts where ig_user_id = $1`, [
    igUserId,
  ])) as Account[];
  return rows[0];
}

export async function upsertAccount(a: {
  ig_user_id: string;
  username: string | null;
  name: string | null;
  profile_picture_url: string | null;
  access_token: string;
  token_expires_at: Date | null;
}): Promise<void> {
  await ensureSchema();
  await sql().query(
    `insert into accounts (ig_user_id, username, name, profile_picture_url,
                           access_token, token_expires_at, connected_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (ig_user_id) do update set
       username = excluded.username,
       name = excluded.name,
       profile_picture_url = excluded.profile_picture_url,
       access_token = excluded.access_token,
       token_expires_at = excluded.token_expires_at`,
    [
      a.ig_user_id,
      a.username,
      a.name,
      a.profile_picture_url,
      a.access_token,
      a.token_expires_at?.toISOString() ?? null,
    ]
  );
}

export async function updateAccountToken(
  igUserId: string,
  accessToken: string,
  tokenExpiresAt: Date
): Promise<void> {
  await sql().query(
    `update accounts set access_token = $2, token_expires_at = $3 where ig_user_id = $1`,
    [igUserId, accessToken, tokenExpiresAt.toISOString()]
  );
}

// Desconecta uma conta e apaga tudo que era dela (automações em cascata levam
// followups; contatos, fila e eventos são removidos explicitamente).
export async function deleteAccount(igUserId: string): Promise<void> {
  await ensureSchema();
  for (const t of ["queue", "events", "contacts", "automations"]) {
    await sql().query(`delete from ${t} where account_id = $1`, [igUserId]);
  }
  await sql().query(`delete from accounts where ig_user_id = $1`, [igUserId]);
}
