import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

export async function DELETE(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const roomId = Number(params.id);
  const targetUserId = Number(params.userId);
  if (!roomId || !targetUserId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const [callerRow] = await sql`
    SELECT role FROM chat_room_members WHERE room_id = ${roomId} AND user_id = ${user.id}
  `;
  if (!callerRow) return NextResponse.json({ ok: false }, { status: 403 });

  const isSelf   = targetUserId === user.id;
  const isAdmin  = callerRow.role === 'admin';

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ ok: false, message: 'Нет прав' }, { status: 403 });
  }

  // Prevent last admin from leaving if there are other members
  if (isSelf && isAdmin) {
    const [{ admin_count = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS admin_count FROM chat_room_members
      WHERE room_id = ${roomId} AND role = 'admin'
    `;
    const [{ member_count = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS member_count FROM chat_room_members WHERE room_id = ${roomId}
    `;
    if (admin_count <= 1 && member_count > 1) {
      return NextResponse.json({
        ok: false,
        message: 'Назначьте другого администратора перед выходом из канала',
      }, { status: 400 });
    }
  }

  await sql`DELETE FROM chat_room_members WHERE room_id = ${roomId} AND user_id = ${targetUserId}`;
  return NextResponse.json({ ok: true });
}
