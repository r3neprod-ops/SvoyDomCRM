import { NextResponse } from 'next/server';
import { getCurrentUserContext, setAuthCookie } from '@/lib/admin/company';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { logActivity } from '@/lib/admin/activityLog';

function cleanText(value, limit = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export async function POST(request, { params }) {
  const context = await getCurrentUserContext();
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!context.user.profile_completed) {
    return NextResponse.json({ ok: false, message: 'Сначала заполните профиль и никнейм' }, { status: 428 });
  }

  const companyId = Number(params.id);
  if (!companyId) return NextResponse.json({ ok: false }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const message = cleanText(body.message);

  await ensureSchema();
  const sql = getSql();
  const [company] = await sql`SELECT id, name FROM companies WHERE id = ${companyId} LIMIT 1`;
  if (!company) return NextResponse.json({ ok: false, message: 'Компания не найдена' }, { status: 404 });

  const [member] = await sql`
    SELECT status
    FROM company_members
    WHERE company_id = ${companyId}
      AND user_id = ${context.user.id}
    LIMIT 1
  `;
  if (member?.status === 'active') {
    await sql`UPDATE users SET active_company_id = ${companyId} WHERE id = ${context.user.id}`;
    const response = NextResponse.json({ ok: true, alreadyMember: true });
    await setAuthCookie(response, context.user.id);
    return response;
  }

  const [invite] = await sql`
    SELECT id
    FROM company_join_requests
    WHERE company_id = ${companyId}
      AND user_id = ${context.user.id}
      AND status = 'invited'
    LIMIT 1
  `;
  if (invite) {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO company_members (company_id, user_id, role, status)
        VALUES (${companyId}, ${context.user.id}, 'agent', 'active')
        ON CONFLICT (company_id, user_id)
        DO UPDATE SET status = 'active', updated_at = NOW()
      `;
      await tx`
        UPDATE company_join_requests
        SET status = 'approved', updated_at = NOW()
        WHERE id = ${invite.id}
      `;
      await tx`UPDATE users SET active_company_id = ${companyId} WHERE id = ${context.user.id}`;
    });
    const response = NextResponse.json({ ok: true, joined: true });
    await setAuthCookie(response, context.user.id);
    return response;
  }

  const [requestRow] = await sql`
    INSERT INTO company_join_requests (company_id, user_id, status, message)
    VALUES (${companyId}, ${context.user.id}, 'pending', ${message || null})
    ON CONFLICT (company_id, user_id)
    DO UPDATE SET status = 'pending', message = EXCLUDED.message, updated_at = NOW()
    RETURNING id, company_id, user_id, status, message, created_at, updated_at
  `;

  await logActivity({
    userId: context.user.id,
    companyId,
    action: 'company_join_requested',
    entityType: 'company',
    entityId: companyId,
    message: `${context.user.name || context.user.username} запросил доступ в компанию ${company.name}`,
  });

  return NextResponse.json({ ok: true, request: requestRow });
}
