import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { canManageTeam } from '@/lib/admin/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!canManageTeam(user)) return NextResponse.json({ ok: false }, { status: 403 });

  await ensureSchema();
  const sql = getSql();

  const defaults = await sql`
    SELECT column_name, column_default
    FROM information_schema.columns
    WHERE table_name = 'leads'
      AND column_name IN ('status', 'assigned_to')
    ORDER BY column_name
  `;

  const triggers = await sql`
    SELECT
      t.tgname AS name,
      pg_get_triggerdef(t.oid) AS definition,
      COALESCE(p.prosrc, '') AS function_body
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'leads'::regclass
      AND NOT t.tgisinternal
    ORDER BY t.tgname
  `;

  const suspiciousNewLeads = await sql`
    SELECT l.id, l.name, l.phone, l.status, l.assigned_to, u.name AS assigned_to_name, l.created_at
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    WHERE l.status = 'new'
      AND l.assigned_to IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM lead_events le
        WHERE le.lead_id = l.id
          AND le.type = 'assigned'
      )
    ORDER BY l.created_at DESC
    LIMIT 20
  `;

  const recentAssignmentEvents = await sql`
    SELECT le.id, le.lead_id, le.user_id, u.name AS user_name, le.message, le.meta, le.created_at
    FROM lead_events le
    LEFT JOIN users u ON u.id = le.user_id
    WHERE le.type = 'assigned'
    ORDER BY le.created_at DESC
    LIMIT 20
  `;

  return NextResponse.json({
    ok: true,
    defaults,
    triggers: triggers.map((trigger) => ({
      name: trigger.name,
      definition: trigger.definition,
      touchesAssignment: `${trigger.definition}\n${trigger.function_body}`.toLowerCase().includes('assigned_to'),
    })),
    suspiciousNewLeads,
    recentAssignmentEvents,
  });
}
