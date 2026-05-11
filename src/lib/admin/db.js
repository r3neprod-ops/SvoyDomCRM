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

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS leads_count INTEGER DEFAULT 0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMP`;

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;
  await sql`INSERT INTO settings (key, value) VALUES ('auto_assign', 'true') ON CONFLICT (key) DO NOTHING`;

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
  if (count === 0) {
    await sql`
      INSERT INTO users (username, password_hash, role, name) VALUES
      ('admin',     ${bcrypt.hashSync('admin123', 10)}, 'admin',    'Администратор'),
      ('employee1', ${bcrypt.hashSync('emp123',   10)}, 'employee', 'Сотрудник 1'),
      ('employee2', ${bcrypt.hashSync('emp456',   10)}, 'employee', 'Сотрудник 2')
    `;
  }

  initialized = true;
}
