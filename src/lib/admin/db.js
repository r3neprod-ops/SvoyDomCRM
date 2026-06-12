import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

let sql;
let initialized = false;
let initializing = null;

function cleanEnvValue(value) {
  return String(value || '').trim().replace(/^['"]+|['"]+$/g, '');
}

function encodeUrlPart(value) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

export function normalizeDatabaseUrl(value) {
  const cleaned = cleanEnvValue(value);
  const match = cleaned.match(/^(postgres(?:ql)?:\/\/)(.+)$/i);
  if (!match) return cleaned;

  const [, protocol, rest] = match;
  const pathIndex = rest.indexOf('/');
  const authority = pathIndex >= 0 ? rest.slice(0, pathIndex) : rest;
  const path = pathIndex >= 0 ? rest.slice(pathIndex) : '';
  const atIndex = authority.lastIndexOf('@');
  if (atIndex < 0) return cleaned;

  const credentials = authority.slice(0, atIndex);
  const host = authority.slice(atIndex + 1);
  const colonIndex = credentials.indexOf(':');
  if (colonIndex < 0) return cleaned;

  const username = credentials.slice(0, colonIndex);
  const password = credentials.slice(colonIndex + 1);
  return `${protocol}${encodeUrlPart(username)}:${encodeUrlPart(password)}@${host}${path}`;
}

export function getSslOptions(dbUrl) {
  try {
    const sslMode = new URL(dbUrl).searchParams.get('sslmode')?.toLowerCase();
    if (!sslMode || sslMode === 'disable' || sslMode === 'allow') return false;
  } catch {
    if (!dbUrl.includes('sslmode=')) return false;
  }

  return { rejectUnauthorized: false };
}

async function dropLeadAssignmentTriggers(sql) {
  let triggers = [];
  try {
    triggers = await sql`
      SELECT
        t.tgname,
        pg_get_triggerdef(t.oid) AS trigger_def,
        COALESCE(p.prosrc, '') AS function_body
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = 'leads'::regclass
        AND NOT t.tgisinternal
    `;
  } catch (error) {
    console.warn('[db] Could not inspect lead triggers:', error.message);
    return;
  }

  for (const trigger of triggers) {
    if (trigger.tgname === 'svoydom_guard_lead_assignment') continue;

    const source = `${trigger.trigger_def}\n${trigger.function_body}`.toLowerCase();
    const touchesAssignment =
      source.includes('assigned_to') ||
      source.includes('leads_count') ||
      source.includes('last_assigned_at');

    if (!touchesAssignment) continue;

    await sql`DROP TRIGGER IF EXISTS ${sql(trigger.tgname)} ON leads`;
    console.warn(`[db] Dropped lead assignment trigger: ${trigger.tgname}`);
  }
}

async function installLeadAssignmentGuard(sql) {
  await sql`
    CREATE OR REPLACE FUNCTION svoydom_guard_lead_assignment()
    RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        NEW.assigned_to := NULL;
        IF NEW.status = 'in_progress' THEN
          NEW.status := 'new';
        END IF;
        RETURN NEW;
      END IF;

      IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
         AND current_setting('app.manual_lead_assignment', true) IS DISTINCT FROM 'on' THEN
        NEW.assigned_to := OLD.assigned_to;
        IF OLD.assigned_to IS NULL AND NEW.status = 'in_progress' THEN
          NEW.status := 'new';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  await sql`DROP TRIGGER IF EXISTS svoydom_guard_lead_assignment ON leads`;
  await sql`
    CREATE TRIGGER svoydom_guard_lead_assignment
    BEFORE INSERT OR UPDATE OF assigned_to ON leads
    FOR EACH ROW
    EXECUTE FUNCTION svoydom_guard_lead_assignment()
  `;
}

async function clearAutoAssignedNewLeads(sql) {
  const rows = await sql`
    UPDATE leads l
    SET assigned_to = NULL
    WHERE l.status = 'new'
      AND l.assigned_to IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM lead_events le
        WHERE le.lead_id = l.id
          AND le.type = 'assigned'
      )
    RETURNING l.id
  `;

  if (rows.length) {
    console.warn(`[db] Cleared auto-assigned new leads: ${rows.map((row) => row.id).join(', ')}`);
  }
}

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  if (!sql) {
    const dbUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
    sql = postgres(dbUrl, {
      ssl: getSslOptions(dbUrl),
      max: 10,
      idle_timeout: 20,
      connect_timeout: 20,
    });
  }
  return sql;
}

export async function ensureSchema() {
  if (initialized) return;
  if (!initializing) {
    initializing = ensureSchemaInner().finally(() => {
      initializing = null;
    });
  }
  return initializing;
}

async function ensureSchemaInner() {
  if (initialized) return;
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'manager', 'marketer', 'agent', 'tech', 'employee')),
      name TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      public_id TEXT UNIQUE NOT NULL,
      lead_token TEXT UNIQUE NOT NULL,
      description TEXT,
      website_url TEXT,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS company_members (
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'agent',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(company_id, user_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS company_members_user_id_idx ON company_members (user_id, status)`;

  await sql`
    CREATE TABLE IF NOT EXISTS company_join_requests (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, user_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS company_join_requests_company_idx ON company_join_requests (company_id, status, created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name TEXT,
      phone TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      assigned_to INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      endpoint TEXT UNIQUE NOT NULL,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      text TEXT,
      media_url TEXT,
      media_type TEXT NOT NULL DEFAULT 'text' CHECK(media_type IN ('text', 'image', 'video_note', 'audio_note', 'file')),
      media_mime TEXT,
      media_size INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (
        (text IS NOT NULL AND length(trim(text)) > 0)
        OR (media_url IS NOT NULL AND length(trim(media_url)) > 0)
      )
    )
  `;
  await sql`ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_media_type_check`;
  await sql`
    ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_media_type_check
    CHECK(media_type IN ('text', 'image', 'video_note', 'audio_note', 'file'))
  `;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_user_id_idx ON chat_messages (user_id)`;

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS status_text TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_storage_key TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_company_id INTEGER`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email)) WHERE email IS NOT NULL AND email <> ''`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_idx ON users (phone_e164) WHERE phone_e164 IS NOT NULL AND phone_e164 <> ''`;
  await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`;
  await sql`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK(role IN ('owner', 'admin', 'manager', 'marketer', 'agent', 'tech', 'employee'))
  `;
  await sql`UPDATE users SET role = 'agent' WHERE role = 'employee'`;
  await sql`UPDATE users SET role = 'owner' WHERE username = 'admin' AND role = 'admin'`;
  await sql`ALTER TABLE leads ALTER COLUMN assigned_to DROP DEFAULT`;
  await sql`ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'new'`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS callback_at TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS callback_note TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_result TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_at TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
  await sql`CREATE INDEX IF NOT EXISTS leads_callback_at_idx ON leads (callback_at) WHERE callback_at IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS leads_company_created_idx ON leads (company_id, created_at DESC)`;
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
  await sql`CREATE INDEX IF NOT EXISTS comments_company_lead_idx ON comments (company_id, lead_id, created_at DESC)`;
  await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_company_created_idx ON chat_messages (company_id, created_at DESC)`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS push_subscriptions_company_idx ON push_subscriptions (company_id)`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_agent TEXT`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS platform TEXT`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_status_code INTEGER`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_error TEXT`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
  await sql`
    UPDATE push_subscriptions
    SET subscription = (subscription #>> '{}')::jsonb
    WHERE jsonb_typeof(subscription) = 'string'
      AND (subscription #>> '{}') LIKE '{%'
  `;
  await sql`
    DELETE FROM push_subscriptions
    WHERE (subscription->>'endpoint') IS NULL
       OR (subscription->>'endpoint') = ''
       OR (subscription->'keys'->>'p256dh') IS NULL
       OR (subscription->'keys'->>'auth') IS NULL
  `;
  await sql`CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS user_auth_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, provider_account_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS user_auth_accounts_user_id_idx ON user_auth_accounts (user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS auth_sms_codes (
      id SERIAL PRIMARY KEY,
      phone_e164 TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS auth_sms_codes_phone_idx ON auth_sms_codes (phone_e164, created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx ON webauthn_credentials (user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      id SERIAL PRIMARY KEY,
      challenge TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS webauthn_challenges_lookup_idx ON webauthn_challenges (challenge, type, expires_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      message TEXT NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx ON activity_logs (user_id, created_at DESC)`;
  await sql`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS activity_logs_company_created_idx ON activity_logs (company_id, created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS chat_reads (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_read_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;

  // Direct chat tables (Task 3)
  await sql`
    CREATE TABLE IF NOT EXISTS direct_chats (
      id SERIAL PRIMARY KEY,
      user1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      user2_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user1_id, user2_id),
      CHECK(user1_id < user2_id)
    )
  `;
  await sql`ALTER TABLE direct_chats ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
  await sql`CREATE INDEX IF NOT EXISTS direct_chats_company_idx ON direct_chats (company_id)`;
  await sql`ALTER TABLE direct_chats DROP CONSTRAINT IF EXISTS direct_chats_user1_id_user2_id_key`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS direct_chats_company_pair_idx ON direct_chats (company_id, user1_id, user2_id)`;
  await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS direct_chat_id INTEGER REFERENCES direct_chats(id) ON DELETE CASCADE`;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_direct_chat_id_idx ON chat_messages (direct_chat_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS direct_chat_reads (
      direct_chat_id INTEGER REFERENCES direct_chats(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      last_read_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(direct_chat_id, user_id)
    )
  `;

  // Room tables (Task 4)
  await sql`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
  await sql`CREATE INDEX IF NOT EXISTS chat_rooms_company_idx ON chat_rooms (company_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS chat_room_members (
      room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(room_id, user_id)
    )
  `;
  await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE`;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_room_id_idx ON chat_messages (room_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS room_reads (
      room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      last_read_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(room_id, user_id)
    )
  `;

  // Real-time / reactions / reply features
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ`;
  await sql`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id         SERIAL PRIMARY KEY,
      message_id INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      emoji      TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(message_id, user_id, emoji)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS message_reactions_msg_idx ON message_reactions (message_id)`;
  await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id     INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_text   TEXT`;
  await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_author TEXT`;
  await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_name TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS lead_events (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE lead_events ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
  await sql`CREATE INDEX IF NOT EXISTS lead_events_company_idx ON lead_events (company_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS lead_events_lead_id_created_at_idx ON lead_events (lead_id, created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS push_debug_log (
      id               SERIAL PRIMARY KEY,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      stage            TEXT NOT NULL,
      lead_id          INTEGER,
      subscription_id  INTEGER,
      data             JSONB,
      error            TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS push_debug_log_created_at_idx ON push_debug_log (created_at DESC)`;

  await dropLeadAssignmentTriggers(sql);
  await clearAutoAssignedNewLeads(sql);
  await installLeadAssignmentGuard(sql);

  // NOTIFY trigger: fires on every INSERT into leads so the background listener
  // can send a push notification even when the insert comes from an external source.
  await sql`
    CREATE OR REPLACE FUNCTION svoydom_notify_new_lead()
    RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify(
        'new_lead',
        json_build_object(
          'lead_id', NEW.id,
          'name',    COALESCE(NEW.name, ''),
          'phone',   COALESCE(NEW.phone, '')
        )::text
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;
  await sql`
    DO $$
    BEGIN
      CREATE TRIGGER trg_svoydom_notify_new_lead
      AFTER INSERT ON leads
      FOR EACH ROW EXECUTE FUNCTION svoydom_notify_new_lead();
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    $$;
  `;

  // Ensure admin account always exists — but never overwrite an existing password.
  // This runs on every cold start; ON CONFLICT DO NOTHING guarantees idempotency.
  const [adminRow] = await sql`SELECT id FROM users WHERE username = 'admin' LIMIT 1`;
  if (!adminRow) {
    const hash = await bcrypt.hash('admin123', 10);
    await sql`
      INSERT INTO users (username, password_hash, role, name)
      VALUES ('admin', ${hash}, 'owner', 'Администратор')
      ON CONFLICT (username) DO NOTHING
    `;
    console.log('[db] Admin user created with default password admin123');
  }

  const [tenantMigration] = await sql`SELECT value FROM settings WHERE key = 'tenant_bootstrap_v1' LIMIT 1`;
  if (!tenantMigration) {
    const [owner] = await sql`
      SELECT id FROM users
      WHERE role = 'owner'
      ORDER BY CASE WHEN username = 'admin' THEN 0 ELSE 1 END, id
      LIMIT 1
    `;
    const [company] = await sql`
      INSERT INTO companies (name, public_id, lead_token, owner_id, description)
      VALUES ('24CRM', 'main', ${`crm_${randomUUID().replace(/-/g, '')}`}, ${owner?.id || null}, 'Основная компания')
      ON CONFLICT (public_id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;

    await sql`
      INSERT INTO company_members (company_id, user_id, role, status)
      SELECT ${company.id}, id, role, 'active'
      FROM users
      ON CONFLICT (company_id, user_id) DO NOTHING
    `;
    await sql`UPDATE users SET active_company_id = ${company.id}, profile_completed = true WHERE active_company_id IS NULL`;
    await sql`UPDATE leads SET company_id = ${company.id} WHERE company_id IS NULL`;
    await sql`
      UPDATE comments c
      SET company_id = COALESCE(l.company_id, ${company.id})
      FROM leads l
      WHERE c.lead_id = l.id AND c.company_id IS NULL
    `;
    await sql`UPDATE comments SET company_id = ${company.id} WHERE company_id IS NULL`;
    await sql`UPDATE chat_messages SET company_id = ${company.id} WHERE company_id IS NULL`;
    await sql`UPDATE direct_chats SET company_id = ${company.id} WHERE company_id IS NULL`;
    await sql`UPDATE chat_rooms SET company_id = ${company.id} WHERE company_id IS NULL`;
    await sql`
      UPDATE lead_events le
      SET company_id = COALESCE(l.company_id, ${company.id})
      FROM leads l
      WHERE le.lead_id = l.id AND le.company_id IS NULL
    `;
    await sql`UPDATE lead_events SET company_id = ${company.id} WHERE company_id IS NULL`;
    await sql`UPDATE activity_logs SET company_id = ${company.id} WHERE company_id IS NULL`;
    await sql`UPDATE push_subscriptions SET company_id = ${company.id} WHERE company_id IS NULL`;
    await sql`
      INSERT INTO settings (key, value)
      VALUES ('tenant_bootstrap_v1', ${new Date().toISOString()})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
    console.log(`[db] Tenant bootstrap complete for company #${company.id}`);
  }

  initialized = true;
}

export async function pushDebugLog(stage, { leadId = null, subscriptionId = null, data = null, error = null } = {}) {
  try {
    const s = getSql();
    const dataJson = data != null ? JSON.stringify(data) : null;
    await s`
      INSERT INTO push_debug_log (stage, lead_id, subscription_id, data, error)
      VALUES (
        ${stage},
        ${leadId ?? null},
        ${subscriptionId ?? null},
        ${dataJson}::jsonb,
        ${error ?? null}
      )
    `;
  } catch (e) {
    console.error('[pushDebugLog] INSERT failed:', e?.message);
  }
}
