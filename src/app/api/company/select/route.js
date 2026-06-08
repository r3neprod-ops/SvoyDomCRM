import { NextResponse } from 'next/server';
import { getCurrentUserContext, setAuthCookie } from '@/lib/admin/company';
import { ensureSchema, getSql } from '@/lib/admin/db';

export async function POST(request) {
  const context = await getCurrentUserContext();
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const companyId = Number(body.company_id);
  if (!companyId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  const [membership] = await sql`
    SELECT company_id
    FROM company_members
    WHERE user_id = ${context.user.id}
      AND company_id = ${companyId}
      AND status = 'active'
    LIMIT 1
  `;
  if (!membership) return NextResponse.json({ ok: false }, { status: 403 });

  await sql`UPDATE users SET active_company_id = ${companyId} WHERE id = ${context.user.id}`;
  const response = NextResponse.json({ ok: true });
  await setAuthCookie(response, context.user.id);
  return response;
}
