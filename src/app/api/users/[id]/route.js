import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';

export async function DELETE(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ ok: false }, { status: 403 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  if (id === user.id) {
    return NextResponse.json({ ok: false, message: 'Нельзя удалить себя' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  const [target] = await sql`SELECT role FROM users WHERE id = ${id}`;
  if (!target) return NextResponse.json({ ok: false, message: 'Пользователь не найден' }, { status: 404 });
  if (target.role === 'admin') {
    return NextResponse.json({ ok: false, message: 'Нельзя удалить администратора' }, { status: 400 });
  }

  const [result] = await sql.begin(async (tx) => {
    const reassignedLeads = await tx`
      UPDATE leads
      SET
        assigned_to = NULL,
        status = CASE WHEN status = 'in_progress' THEN 'new' ELSE status END
      WHERE assigned_to = ${id}
      RETURNING id
    `;
    await tx`UPDATE comments SET user_id = NULL WHERE user_id = ${id}`;
    await tx`UPDATE lead_events SET user_id = NULL WHERE user_id = ${id}`;
    await tx`UPDATE chat_messages SET user_id = NULL WHERE user_id = ${id}`;
    await tx`UPDATE chat_rooms SET created_by = NULL WHERE created_by = ${id}`;
    await tx`DELETE FROM push_subscriptions WHERE user_id = ${id}`;
    await tx`DELETE FROM message_reactions WHERE user_id = ${id}`;
    await tx`DELETE FROM users WHERE id = ${id}`;
    return [{ reassigned_leads: reassignedLeads.length }];
  });

  revalidateTag('leads');
  return NextResponse.json({ ok: true, ...result });
}

export async function PATCH(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ ok: false }, { status: 403 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const body = await request.json();
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ ok: false, message: 'Имя обязательно' }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE users SET name = ${name} WHERE id = ${id} AND role = 'employee'`;
  return NextResponse.json({ ok: true });
}
