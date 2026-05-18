import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { sendPushToUser } from '@/lib/admin/push';

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  console.log(`[Push/test] Sending test push to user ${user.id}`);
  await sendPushToUser({
    userId: user.id,
    title: 'Тест уведомлений',
    body: 'Если вы это видите — push-уведомления работают!',
    url: '/admin/dashboard',
  });
  return NextResponse.json({ ok: true });
}
