import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();

  const chats = await sql`
    SELECT
      dc.id,
      dc.created_at,
      CASE WHEN dc.user1_id = ${user.id} THEN dc.user2_id ELSE dc.user1_id END AS other_user_id,
      u.name        AS other_name,
      u.username    AS other_username,
      u.role        AS other_role,
      u.avatar_url  AS other_avatar_url,
      u.status_text AS other_status_text,
      (
        SELECT COUNT(*)::int
        FROM chat_messages cm
        LEFT JOIN direct_chat_reads dr
          ON dr.direct_chat_id = cm.direct_chat_id AND dr.user_id = ${user.id}
        WHERE cm.direct_chat_id = dc.id
          AND cm.user_id <> ${user.id}
          AND cm.id > COALESCE(dr.last_read_message_id, 0)
      ) AS unread_count,
      (
        SELECT cm2.text
        FROM chat_messages cm2
        WHERE cm2.direct_chat_id = dc.id
        ORDER BY cm2.created_at DESC LIMIT 1
      ) AS last_message_text,
      (
        SELECT cm2.created_at
        FROM chat_messages cm2
        WHERE cm2.direct_chat_id = dc.id
        ORDER BY cm2.created_at DESC LIMIT 1
      ) AS last_message_at
    FROM direct_chats dc
    JOIN users u ON u.id = CASE WHEN dc.user1_id = ${user.id} THEN dc.user2_id ELSE dc.user1_id END
    WHERE dc.user1_id = ${user.id} OR dc.user2_id = ${user.id}
    ORDER BY last_message_at DESC NULLS LAST
  `;

  return NextResponse.json({ ok: true, chats });
}

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const otherId = Number(body.other_user_id);
  if (!otherId || otherId === user.id) {
    return NextResponse.json({ ok: false, message: 'Неверный пользователь' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  const [other] = await sql`SELECT id FROM users WHERE id = ${otherId} LIMIT 1`;
  if (!other) return NextResponse.json({ ok: false, message: 'Пользователь не найден' }, { status: 404 });

  const u1 = Math.min(user.id, otherId);
  const u2 = Math.max(user.id, otherId);

  const [chat] = await sql`
    INSERT INTO direct_chats (user1_id, user2_id)
    VALUES (${u1}, ${u2})
    ON CONFLICT (user1_id, user2_id) DO UPDATE SET created_at = direct_chats.created_at
    RETURNING id, user1_id, user2_id, created_at
  `;

  return NextResponse.json({ ok: true, chat });
}
