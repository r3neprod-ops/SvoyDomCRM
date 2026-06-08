import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { createChatStream } from '@/lib/admin/chatStream';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();

  await ensureSchema();
  const sql = getSql();
  const { searchParams } = new URL(request.url);

  return createChatStream({
    request,
    initialAfter: searchParams.get('after'),
    getMaxId: async () => {
      const [{ max_id: maxId = 0 } = {}] = await sql`
        SELECT COALESCE(MAX(id), 0)::int AS max_id
        FROM chat_messages
        WHERE company_id = ${context.companyId}
          AND direct_chat_id IS NULL
          AND room_id IS NULL
      `;
      return maxId;
    },
  });
}
