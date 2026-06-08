import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

export async function POST(request, { params }) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;

  const roomId = Number(params.id);
  if (!roomId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const [callerRow] = await sql`
    SELECT crm.role
    FROM chat_room_members crm
    JOIN chat_rooms cr ON cr.id = crm.room_id
    WHERE crm.room_id = ${roomId}
      AND crm.user_id = ${user.id}
      AND cr.company_id = ${companyId}
  `;
  if (callerRow?.role !== 'admin') {
    return NextResponse.json({ ok: false, message: 'Нет прав' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const userIds = Array.isArray(body.user_ids)
    ? body.user_ids.map(Number).filter((id) => id && id !== user.id)
    : [];

  if (!userIds.length) {
    return NextResponse.json({ ok: false, message: 'Укажите пользователей' }, { status: 400 });
  }

  const validUsers = await sql`
    SELECT u.id
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ${companyId}
      AND cm.user_id = ANY(${userIds})
      AND cm.status = 'active'
      AND COALESCE(u.is_active, true) = true
  `;
  for (const u of validUsers) {
    await sql`
      INSERT INTO chat_room_members (room_id, user_id, role)
      VALUES (${roomId}, ${u.id}, 'member')
      ON CONFLICT DO NOTHING
    `;
  }

  return NextResponse.json({ ok: true, added: validUsers.length });
}
