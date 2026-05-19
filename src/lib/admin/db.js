import postgres from 'postgres';
import bcrypt from 'bcryptjs';

let sql;
let initialized = false;

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
    const dbUrl = process.env.DATABASE_URL;
    sql = postgres(dbUrl, {
      ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
      max: 10,
      idle_timeout: 20,
    });
  }
  return sql;
}

export async function ensureSchema() {
  if (initialized) return;
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
      name TEXT NOT NULL
    )
  `;

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
  await sql`ALTER TABLE leads ALTER COLUMN assigned_to DROP DEFAULT`;
  await sql`ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'new'`;
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
  await sql`CREATE INDEX IF NOT EXISTS lead_events_lead_id_created_at_idx ON lead_events (lead_id, created_at DESC)`;
  await dropLeadAssignmentTriggers(sql);
  await clearAutoAssignedNewLeads(sql);
  await installLeadAssignmentGuard(sql);

  // Ensure admin account always exists — but never overwrite an existing password.
  // This runs on every cold start; ON CONFLICT DO NOTHING guarantees idempotency.
  const [adminRow] = await sql`SELECT id FROM users WHERE username = 'admin' LIMIT 1`;
  if (!adminRow) {
    const hash = await bcrypt.hash('admin123', 10);
    await sql`
      INSERT INTO users (username, password_hash, role, name)
      VALUES ('admin', ${hash}, 'admin', 'Администратор')
      ON CONFLICT (username) DO NOTHING
    `;
    console.log('[db] Admin user created with default password admin123');
  }

  initialized = true;
}
