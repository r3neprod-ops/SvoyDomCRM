import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { roleLabel } from '@/lib/admin/roles';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  const users = await sql`
    SELECT id, username, role, name, avatar_url, status_text
    FROM users
    WHERE COALESCE(is_active, true) = true
    ORDER BY
      CASE role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'agent' THEN 3
        WHEN 'marketer' THEN 4
        WHEN 'tech' THEN 5
        ELSE 9
      END,
      name ASC
  `;

  return NextResponse.json({
    ok: true,
    users: users.map((item) => ({
      id: item.id,
      username: item.username,
      role: item.role,
      role_label: roleLabel(item.role),
      name: item.name,
      avatar_url: item.avatar_url || '',
      status_text: item.status_text || '',
    })),
  });
}
