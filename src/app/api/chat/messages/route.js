import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

function mapMessage(message) {
  return {
    ...message,
    author_name: message.author_name || 'Неизвестно',
  };
}

export async function GET(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 200);

  await ensureSchema();
  const sql = getSql();

  const messages = await sql`
    SELECT *
    FROM (
      SELECT cm.id, cm.text, cm.media_url, cm.media_type, cm.media_mime, cm.media_size,
             cm.created_at, u.name AS author_name
      FROM chat_messages cm
      LEFT JOIN users u ON u.id = cm.user_id
      ORDER BY cm.created_at DESC
      LIMIT ${limit}
    ) latest
    ORDER BY created_at ASC
  `;

  return NextResponse.json({ ok: true, messages: messages.map(mapMessage) });
}

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: false, message: 'Текст сообщения обязателен' }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ ok: false, message: 'Сообщение слишком длинное' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  const [message] = await sql`
    INSERT INTO chat_messages (user_id, text, media_type)
    VALUES (${user.id}, ${text}, 'text')
    RETURNING id, text, media_url, media_type, media_mime, media_size, created_at
  `;

  return NextResponse.json({ ok: true, message: mapMessage({ ...message, author_name: user.name }) });
}
