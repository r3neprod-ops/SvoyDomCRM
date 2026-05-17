/**
 * Reset admin password in the current database.
 * Usage: node scripts/reset-admin-password.mjs [new_password]
 * Requires DATABASE_URL env var.
 */

import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const newPassword = process.argv[2] || 'admin123';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
});

const hash = await bcrypt.hash(newPassword, 10);

const [row] = await sql`
  UPDATE users
  SET password_hash = ${hash}
  WHERE username = 'admin'
  RETURNING id, username, role
`;

if (row) {
  console.log(`[OK] Password for "${row.username}" (id=${row.id}, role=${row.role}) has been reset.`);
  console.log(`     New password: ${newPassword}`);
} else {
  console.log('[WARN] User "admin" not found. Inserting...');
  const [created] = await sql`
    INSERT INTO users (username, password_hash, role, name)
    VALUES ('admin', ${hash}, 'admin', 'Администратор')
    ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id, username, role
  `;
  console.log(`[OK] Admin user created/updated: id=${created.id}`);
}

await sql.end();
