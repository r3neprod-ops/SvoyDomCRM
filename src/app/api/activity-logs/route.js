import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { isOwner } from '@/lib/admin/roles';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isOwner(user)) return NextResponse.json({ ok: false }, { status: 403 });

  await ensureSchema();
  const sql = getSql();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(300, Math.max(20, Number(searchParams.get('limit') || 120)));

  const logs = await sql`
    SELECT
      al.id,
      al.action,
      al.entity_type,
      al.entity_id,
      al.message,
      al.meta,
      al.created_at,
      u.name AS user_name,
      u.username AS username,
      u.role AS user_role
    FROM activity_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json({ ok: true, logs });
}
