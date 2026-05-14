import { revalidateTag } from 'next/cache';
import { addLead } from '@/lib/admin/store';
import { sendPushToAll } from '@/lib/admin/push';
import { autoAssignLead } from '@/lib/admin/autoAssign';
import { getSql } from '@/lib/admin/db';

const DEDUPE_WINDOW_MS = 30 * 1000;
const recentLeadStore = new Map();

const PROPERTY_TYPE_LABELS = {
  apartment: 'Новостройка (квартира)',
  apartment_newbuild: 'Новостройка (квартира)',
  house: 'Частный дом',
  land_house: 'Участок + дом',
  'land+house': 'Участок + дом',
  plot_house: 'Участок + дом',
  consultation: 'Нужна консультация',
};

const APARTMENT_TYPE_LABELS = {
  studio_20_30: 'Студия (20–30 м²)',
  '1k_40_55': '1-комнатная (40–55 м²)',
  '2k_55_65': '2-комнатная (55–65 м²)',
  '3k_65_plus': '3+ комнат (65+ м²)',
  dont_know: 'Пока не знаю',
};

const DOWN_PAYMENT_LABELS = {
  matcap: 'Маткапитал',
  own: 'Свои средства',
  matcap_plus_own: 'Маткапитал + свои средства',
};

function humanizeFallback(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.replaceAll('_', ' ');
}

function formatBudget(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const mapped = {
    '4_6': '4–6 млн ₽',
    '6_8': '6–8 млн ₽',
    '8_10': '8–10 млн ₽',
    '10_plus': '10+ млн ₽',
    custom: 'Свой вариант',
  };

  if (mapped[raw]) return mapped[raw];

  const normalized = raw.replace(',', '.');
  if (/^\d+(?:\.\d+)?_\d+(?:\.\d+)?$/.test(normalized)) {
    const [from, to] = normalized.split('_');
    return `${from}–${to} млн ₽`;
  }
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return `${normalized} млн ₽`;
  }

  return humanizeFallback(raw);
}

function mappedAnswer(value, map) {
  if (value === null || value === undefined || value === '') return '';
  const normalized = String(value).trim();
  return map[normalized] || humanizeFallback(normalized);
}

function makeDedupKey(phoneDigits, answers) {
  const normalizedAnswers = Object.keys(answers || {})
    .sort()
    .reduce((acc, key) => {
      const value = answers[key];
      if (value === null || value === undefined || value === '') return acc;
      acc[key] = String(value);
      return acc;
    }, {});

  return `${phoneDigits}|${JSON.stringify(normalizedAnswers)}`;
}

function isDuplicateLead(key) {
  const now = Date.now();

  for (const [storedKey, expiresAt] of recentLeadStore.entries()) {
    if (expiresAt <= now) recentLeadStore.delete(storedKey);
  }

  const expiresAt = recentLeadStore.get(key);
  if (expiresAt && expiresAt > now) return true;

  recentLeadStore.set(key, now + DEDUPE_WINDOW_MS);
  return false;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function validatePhone(rawPhone) {
  const phone = String(rawPhone ?? '').trim();
  if (!phone) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: 'MISSING_PHONE',
        message: 'Укажите номер телефона (можно с +7).',
      },
    };
  }

  if (/\p{L}/u.test(phone)) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: 'INVALID_PHONE',
        message: 'Некорректный номер. Используйте цифры, +, пробелы, скобки или дефисы.',
      },
    };
  }

  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: 'INVALID_PHONE',
        message: 'Номер слишком короткий. Пример: +7 999 000-00-00',
      },
    };
  }

  return { ok: true, phone, phoneDigits };
}

async function sendToBitrix24(payload) {
  const webhookUrl = process.env.BITRIX24_WEBHOOK_URL;
  console.log('[Bitrix] URL configured:', !!webhookUrl);
  if (!webhookUrl) return;

  const finalUrl = webhookUrl.replace(/\/+$/, '') + '/crm.lead.add.json';
  console.log('[Bitrix] Final URL:', finalUrl);

  const answers = asRecord(payload.answers);
  const bitrixPayload = {
    fields: {
      TITLE: `Заявка: ${payload.name || '—'} ${payload.phone || '—'}`,
      NAME: payload.name || '',
      PHONE: [{ VALUE: payload.phone || '', VALUE_TYPE: 'WORK' }],
      COMMENTS: [
        answers.propertyType && `Тип объекта: ${mappedAnswer(answers.propertyType, PROPERTY_TYPE_LABELS)}`,
        answers.apartmentType && `Вариант квартиры: ${mappedAnswer(answers.apartmentType, APARTMENT_TYPE_LABELS)}`,
        (answers.budgetPreset || answers.budgetCustom) &&
          `Бюджет: ${formatBudget(answers.budgetPreset) || humanizeFallback(answers.budgetCustom)}`,
        answers.downPaymentType && `Взнос: ${mappedAnswer(answers.downPaymentType, DOWN_PAYMENT_LABELS)}`,
        payload.pageUrl && `Страница: ${payload.pageUrl}`,
      ]
        .filter(Boolean)
        .join('\n'),
      SOURCE_ID: 'WEB',
    },
    params: { REGISTER_SONET_EVENT: 'Y' },
  };

  console.log('[Bitrix] Payload:', JSON.stringify(bitrixPayload));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bitrixPayload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    console.log('[Bitrix] Status:', response.status);
    console.log('[Bitrix] Response:', await response.text());
  } catch (error) {
    console.error('[Bitrix] Error:', error.message);
  }
}

export async function POST(request) {
  const startTime = Date.now();
  console.log('[Lead] Request received at:', new Date().toISOString());

  try {
    const payload = await request.json();

    if (!payload || typeof payload !== 'object') {
      return Response.json({ ok: false, code: 'BAD_REQUEST', message: 'Пустой запрос.' }, { status: 400 });
    }

    if (payload.company && String(payload.company).trim()) {
      return Response.json({ ok: true });
    }

    console.log('[Lead] Step: validation');
    const phoneValidation = validatePhone(payload.phone);
    if (!phoneValidation.ok) {
      return Response.json(phoneValidation.body, { status: phoneValidation.status });
    }

    if (payload.privacyConsent !== true) {
      return Response.json(
        {
          ok: false,
          code: 'MISSING_PRIVACY_CONSENT',
          message: 'Необходимо согласие на обработку персональных данных.',
        },
        { status: 400 }
      );
    }

    const safePayload = {
      ...payload,
      phone: phoneValidation.phone,
      privacyConsent: payload.privacyConsent === true,
      answers: asRecord(payload.answers),
    };

    console.log('[Lead] Step: dedup');
    const dedupeKey = makeDedupKey(phoneValidation.phoneDigits, safePayload.answers);
    if (isDuplicateLead(dedupeKey)) {
      console.log('[Lead] Duplicate detected, skipping bitrix:', dedupeKey);
      return Response.json({ ok: true, deduped: true });
    }

    console.log('[Lead] Step: db');
    let leadId = null;
    try {
      const lead = await addLead(safePayload);
      leadId = lead.id;
      try {
        const sql = getSql();
        const [setting] = await sql`SELECT value FROM settings WHERE key = 'auto_assign'`;
        if (setting?.value === 'true') {
          await autoAssignLead(leadId);
        }
      } catch (assignErr) {
        console.error('Auto-assign error:', assignErr);
      }
      revalidateTag('leads');
      sendPushToAll({
        title: 'Новый лид!',
        body: `Имя: ${safePayload.name || '—'}, Телефон: ${safePayload.phone || '—'}`,
      }).catch((err) => console.error('Push notification error:', err));
    } catch (dbError) {
      console.error('Lead DB save error:', dbError);
      return Response.json(
        { ok: false, code: 'DB_ERROR', message: 'Не удалось сохранить заявку. Попробуйте ещё раз.' },
        { status: 500 }
      );
    }

    console.log('[Lead] Step: bitrix');
    await sendToBitrix24(safePayload);

    console.log('[Lead] Completed in', Date.now() - startTime, 'ms');
    return Response.json({ success: true, leadId });
  } catch (error) {
    console.error('Lead API error:', error);
    return Response.json(
      {
        ok: false,
        code: 'SERVER_ERROR',
        message: 'Не удалось отправить. Попробуйте ещё раз.',
      },
      { status: 500 }
    );
  }
}
