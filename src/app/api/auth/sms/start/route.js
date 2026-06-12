import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { hashSmsCode, makeSmsCode, maskPhone, normalizePhoneE164, sendSmsCode } from '@/lib/admin/phoneAuth';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const phone = normalizePhoneE164(body.phone);
    if (!phone) {
      return NextResponse.json({ ok: false, message: 'Укажите корректный номер телефона' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getSql();
    const [recent] = await sql`
      SELECT id
      FROM auth_sms_codes
      WHERE phone_e164 = ${phone}
        AND created_at > NOW() - INTERVAL '60 seconds'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (recent) {
      return NextResponse.json({ ok: false, message: 'Код уже отправлен. Попробуйте еще раз через минуту.' }, { status: 429 });
    }

    const code = makeSmsCode();
    const delivery = await sendSmsCode({ phoneE164: phone, code });
    if (!delivery.ok) {
      const message = delivery.code === 'sms_not_configured'
        ? 'Вход по SMS почти готов: на сервере нужно подключить SMS-провайдера.'
        : 'Не удалось отправить SMS. Попробуйте еще раз или войдите по email.';
      return NextResponse.json({ ok: false, code: delivery.code, message }, { status: 503 });
    }

    const codeHash = await hashSmsCode(code);
    await sql`
      INSERT INTO auth_sms_codes (phone_e164, code_hash, expires_at)
      VALUES (${phone}, ${codeHash}, NOW() + INTERVAL '5 minutes')
    `;

    return NextResponse.json({ ok: true, phone: maskPhone(phone), ttl: 300 });
  } catch (error) {
    console.error('[SMS auth start] failed:', error);
    return NextResponse.json({ ok: false, message: 'Ошибка сервера' }, { status: 500 });
  }
}
