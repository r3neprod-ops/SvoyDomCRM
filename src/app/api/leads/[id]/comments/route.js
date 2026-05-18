import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { addLeadEvent } from '@/lib/admin/leadEvents';

export async function GET(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const leadId = Number(params.id);
  if (!leadId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  if (user.role === 'employee') {
    const [lead] = await sql`SELECT assigned_to FROM leads WHERE id = ${leadId}`;
    if (!lead || lead.assigned_to !== user.id) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  const comments = await sql`
    SELECT c.id, c.text, c.created_at, u.name AS author_name
    FROM comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.lead_id = ${leadId}
    ORDER BY c.created_at ASC
  `;
  const events = await sql`
    SELECT le.id, le.type, le.message, le.meta, le.created_at, u.name AS author_name
    FROM lead_events le
    LEFT JOIN users u ON u.id = le.user_id
    WHERE le.lead_id = ${leadId}
    ORDER BY le.created_at ASC
  `;
  return NextResponse.json({ ok: true, comments, events });
}

export async function POST(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const leadId = Number(params.id);
  if (!leadId) return NextResponse.json({ ok: false }, { status: 400 });

  const body = await request.json();
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ ok: false, message: 'Текст обязателен' }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const [lead] = await sql`SELECT assigned_to FROM leads WHERE id = ${leadId}`;
  if (!lead) return NextResponse.json({ ok: false, message: 'Лид не найден' }, { status: 404 });
  if (user.role === 'employee' && lead.assigned_to !== user.id) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const [comment] = await sql`
    INSERT INTO comments (lead_id, user_id, text)
    VALUES (${leadId}, ${user.id}, ${text})
    RETURNING id, text, created_at
  `;
  const [event] = await addLeadEvent(sql, {
    leadId,
    userId: user.id,
    type: 'comment_added',
    message: 'Добавлен комментарий',
  });

  return NextResponse.json({ ok: true, comment: { ...comment, author_name: user.name }, event });
}
