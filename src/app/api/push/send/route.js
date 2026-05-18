import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { sendPushToAll } from '@/lib/admin/push';

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ ok: false }, { status: 403 });

  const { title, body } = await request.json().catch(() => ({}));
  if (!title) return NextResponse.json({ ok: false, message: 'title required' }, { status: 400 });

  console.log(`[Push/send] Triggered by admin user ${user.id}, title="${title}"`);
  await sendPushToAll({ title, body });
  return NextResponse.json({ ok: true });
}
