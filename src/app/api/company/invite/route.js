import { NextResponse } from 'next/server';
import { getCurrentUserContext, normalizeUsername } from '@/lib/admin/company';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { canManageTeam } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';

export async function POST(request) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return NextResponse.json({ ok: false }, { status: 428 });
  if (!canManageTeam(context.user)) return NextResponse.json({ ok: false }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const username = normalizeUsername(body.username);
  if (!username) return NextResponse.json({ ok: false, message: 'Укажите никнейм' }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  const [target] = await sql`
    SELECT id, name, username
    FROM users
    WHERE lower(username) = ${username}
    LIMIT 1
  `;
  if (!target) return NextResponse.json({ ok: false, message: 'Пользователь с таким никнеймом не найден' }, { status: 404 });

  const [member] = await sql`
    SELECT status
    FROM company_members
    WHERE company_id = ${context.companyId}
      AND user_id = ${target.id}
    LIMIT 1
  `;
  if (member?.status === 'active') {
    return NextResponse.json({ ok: false, message: 'Пользователь уже в компании' }, { status: 409 });
  }

  const [invite] = await sql`
    INSERT INTO company_join_requests (company_id, user_id, status, message)
    VALUES (${context.companyId}, ${target.id}, 'invited', ${`Приглашение от ${context.user.name || context.user.username}`})
    ON CONFLICT (company_id, user_id)
    DO UPDATE SET status = 'invited', message = EXCLUDED.message, updated_at = NOW()
    RETURNING id, company_id, user_id, status, message, created_at, updated_at
  `;

  await logActivity({
    userId: context.user.id,
    companyId: context.companyId,
    action: 'company_invite_sent',
    entityType: 'user',
    entityId: target.id,
    message: `${context.user.name || context.user.username} пригласил @${target.username} в компанию`,
  });

  return NextResponse.json({ ok: true, invite });
}
