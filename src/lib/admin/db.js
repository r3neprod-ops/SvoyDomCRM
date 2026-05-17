import postgres from 'postgres';
import bcrypt from 'bcryptjs';

let sql;
let initialized = false;

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
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS leads_count INTEGER DEFAULT 0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMP`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS status_text TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_storage_key TEXT`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`;
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

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
  if (count === 0) {
    await sql`
      INSERT INTO users (username, password_hash, role, name) VALUES
      ('admin',     ${bcrypt.hashSync('admin123', 10)}, 'admin',    'Администратор'),
      ('employee1', ${bcrypt.hashSync('emp123',   10)}, 'employee', 'Сотрудник 1'),
      ('employee2', ${bcrypt.hashSync('emp456',   10)}, 'employee', 'Сотрудник 2')
      ON CONFLICT (username) DO NOTHING
    `;
  }

  initialized = true;
}
