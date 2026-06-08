import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { roleLabel } from '@/lib/admin/roles';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

export async function GET() {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();

  await ensureSchema();
  const sql = getSql();
  const users = await sql`
    SELECT u.id, u.username, cm.role, u.name, u.avatar_url, u.status_text
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ${context.companyId}
      AND cm.status = 'active'
      AND COALESCE(u.is_active, true) = true
    ORDER BY
      CASE cm.role
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
