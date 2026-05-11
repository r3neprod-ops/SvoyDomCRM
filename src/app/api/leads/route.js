import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';

const fetchLeadsData = unstable_cache(
  async (userId, userRole, status) => {
    const sql = getSql();

    const filters = [
      userRole === 'employee' && sql`l.assigned_to = ${userId}`,
      status && sql`l.status = ${status}`,
    ].filter(Boolean);

    const leads = await sql`
      SELECT l.id, l.name, l.phone, l.message, l.status, l.assigned_to, l.created_at,
             u.name AS assigned_to_name,
             COUNT(c.id)::int AS comment_count,
             (SELECT text FROM comments WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) AS last_comment_text
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN comments c ON c.lead_id = l.id
      ${filters.length ? sql`WHERE ${filters.reduce((a, b) => sql`${a} AND ${b}`)}` : sql``}
      GROUP BY l.id, u.name
      ORDER BY l.created_at DESC
    `;

    const employees = userRole === 'admin'
      ? await sql`
          SELECT u.id, u.name, u.username, u.is_active, u.leads_count,
                 COUNT(l.id) FILTER (WHERE l.status IN ('new', 'in_progress'))::int AS active_leads_count
          FROM users u
          LEFT JOIN leads l ON l.assigned_to = u.id
          WHERE u.role = 'employee'
          GROUP BY u.id
          ORDER BY u.id
        `
      : [];

    return { leads, employees };
  },
  ['leads-data'],
  { revalidate: 30, tags: ['leads'] }
);

export async function GET(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';

  await ensureSchema();

  const { leads, employees } = await fetchLeadsData(
    user.role === 'employee' ? user.id : 0,
    user.role,
    status
  );

  return NextResponse.json({ ok: true, leads, employees });
}
