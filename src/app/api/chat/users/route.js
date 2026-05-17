import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

function roleLabel(role) {
  return role === 'admin' ? 'Админ' : 'Сотрудник';
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  const users = await sql`
    SELECT id, username, role, name, avatar_url, status_text
    FROM users
    WHERE COALESCE(is_active, true) = true
    ORDER BY (role = 'admin') DESC, name ASC
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
