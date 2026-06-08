import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { canViewAllLeads } from '@/lib/admin/roles';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

async function fetchLeadsData(user, status, companyId) {
  const sql = getSql();
  const viewAll = canViewAllLeads(user);

  const filters = [
    sql`l.company_id = ${companyId}`,
    !viewAll && sql`(l.assigned_to = ${user.id} OR l.assigned_to IS NULL)`,
    status === 'closed_won'
      ? sql`l.status IN ('closed_won', 'closed')`
      : status && sql`l.status = ${status}`,
  ].filter(Boolean);

  const leads = await sql`
    SELECT l.id, l.name, l.phone, l.message, l.status, l.assigned_to, l.created_at,
           l.callback_at, l.callback_note, l.last_call_result, l.last_call_at,
           u.name AS assigned_to_name,
           COUNT(c.id)::int AS comment_count,
           (SELECT text FROM comments WHERE lead_id = l.id AND company_id = ${companyId} ORDER BY created_at DESC LIMIT 1) AS last_comment_text
    FROM leads l
    LEFT JOIN users u ON l.assigned_to = u.id
    LEFT JOIN comments c ON c.lead_id = l.id AND c.company_id = ${companyId}
    ${filters.length ? sql`WHERE ${filters.reduce((a, b) => sql`${a} AND ${b}`)}` : sql``}
    GROUP BY l.id, u.name
    ORDER BY l.created_at DESC
  `;

  const employees = viewAll
    ? await sql`
        SELECT u.id, u.name, u.username, u.role, u.is_active,
               COUNT(l.id) FILTER (WHERE l.status IN ('new', 'in_progress', 'meeting', 'documents', 'deal'))::int AS active_leads_count
        FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        LEFT JOIN leads l ON l.assigned_to = u.id AND l.company_id = ${companyId}
        WHERE cm.company_id = ${companyId}
          AND cm.status = 'active'
          AND cm.role <> 'owner'
        GROUP BY u.id, cm.role
        ORDER BY
          CASE cm.role
            WHEN 'admin' THEN 1
            WHEN 'manager' THEN 2
            WHEN 'agent' THEN 3
            WHEN 'employee' THEN 4
            WHEN 'marketer' THEN 5
            WHEN 'tech' THEN 6
            ELSE 9
          END,
          u.id
      `
    : [];

  return { leads, employees };
}

export async function GET(request) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';

  await ensureSchema();

  const { leads, employees } = await fetchLeadsData(context.user, status, context.companyId);

  return NextResponse.json({ ok: true, leads, employees });
}
