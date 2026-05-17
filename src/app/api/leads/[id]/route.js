import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';

export async function PATCH(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  const [lead] = await sql`SELECT * FROM leads WHERE id = ${id}`;
  if (!lead) return NextResponse.json({ ok: false, message: 'Лид не найден' }, { status: 404 });

  const body = await request.json();
  const updates = {};
  let isClaiming = false;

  if (user.role === 'admin') {
    if (body.status !== undefined) updates.status = body.status;
    if (body.assigned_to !== undefined) {
      updates.assigned_to = body.assigned_to === null || body.assigned_to === ''
        ? null
        : Number(body.assigned_to);
    }
  } else {
    if (body.assigned_to !== undefined) {
      if (Number(body.assigned_to) !== user.id) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }
      if (lead.assigned_to !== null) {
        return NextResponse.json({ ok: false, message: 'Лид уже назначен' }, { status: 409 });
      }
      updates.assigned_to = user.id;
      updates.status = 'in_progress';
      isClaiming = true;
    }

    if (body.status !== undefined) {
      if (lead.assigned_to !== user.id) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }
      updates.status = body.status;
    }
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ ok: false, message: 'Нет данных для обновления' }, { status: 400 });
  }

  if (isClaiming) {
    const [updated] = await sql`
      UPDATE leads SET ${sql(updates)}
      WHERE id = ${id} AND assigned_to IS NULL
      RETURNING id
    `;
    if (!updated) {
      return NextResponse.json({ ok: false, message: 'Лид уже назначен' }, { status: 409 });
    }
    await sql`
      UPDATE users SET
        leads_count = leads_count + 1,
        last_assigned_at = NOW()
      WHERE id = ${user.id}
    `;
  } else {
    await sql`UPDATE leads SET ${sql(updates)} WHERE id = ${id}`;
  }
  revalidateTag('leads');

  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ ok: false }, { status: 403 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM leads WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
