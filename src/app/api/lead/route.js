import { revalidateTag } from 'next/cache';
import { addLead } from '@/lib/admin/store';
import { sendPushToAll } from '@/lib/admin/push';

const DEDUPE_WINDOW_MS = 30 * 1000;
const recentLeadStore = new Map();

function getAllowedOrigins() {
  return (process.env.ALLOWED_LEAD_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function getCors(request) {
  const origin = request.headers.get('origin');
  const headers = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (!origin) return { allowed: true, headers: {} };

  const normalizedOrigin = origin.replace(/\/+$/, '');
  if (getAllowedOrigins().includes(normalizedOrigin)) {
    return {
      allowed: true,
      headers: {
        ...headers,
        'Access-Control-Allow-Origin': origin,
      },
    };
  }

  return { allowed: false, headers };
}

function jsonWithCors(request, body, init = {}) {
  const cors = getCors(request);
  return Response.json(body, {
    ...init,
    headers: {
      ...cors.headers,
      ...(init.headers || {}),
    },
  });
}

const APARTMENT_TYPE_LABELS = {
  studio: 'Студия',
  '1room': '1-комнатная',
  '2rooms': '2-комнатная',
  '3rooms': '3-комнатная',
  '4plus': '4+ комнат',
  choosing: 'Ещё выбираю',
};

const BUDGET_LABELS = {
  '5_to_7': '5–7 млн',
  '7_to_10': '7–10 млн',
  '10_plus': '10+ млн',
};

const PRIORITY_LABELS = {
  price: 'Цена и выгодные условия',
  location: 'Локация / транспорт',
  quality: 'Новый дом и качество строительства',
  infrastructure: 'Инфраструктура (школы/сад/магазины)',
  layout: 'Планировка и метраж',
  investment: 'Для инвестиций (рост цены / аренда)',
};

const PURCHASE_METHOD_LABELS = {
  cash: 'Наличные',
  mortgage: 'Ипотека',
  need_consultation: 'Ещё не решил(а), нужна консультация',
};

const DOWN_PAYMENT_LABELS = {
  only_maternal: 'Только маткапитал',
  maternal_plus_own: 'Маткапитал + свои средства',
  only_own: 'Только свои средства (наличные)',
  need_advice: 'Пока не знаю / нужна консультация',
};

function humanizeFallback(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.replaceAll('_', ' ');
}

function formatRubles(amount) {
  if (amount == null) return null;
  const digits = String(amount).replace(/\D/g, '');
  if (!digits) return null;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
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
      TITLE: `[от Мента] Заявка: ${payload.name || '—'} ${payload.phone || '—'}`,
      NAME: `${payload.name || ''} (от Мента)`,
      PHONE: [{ VALUE: payload.phone || '', VALUE_TYPE: 'WORK' }],
      COMMENTS: [
        '🟢 Источник: сайт (от Мента)',
        answers.consultationFromBudget && '⚠️ Запрос на консультацию: бюджет не соответствует желаемому метражу',
        answers.apartmentType && `Тип квартиры: ${mappedAnswer(answers.apartmentType, APARTMENT_TYPE_LABELS)}`,
        answers.budgetPreset && `Бюджет: ${mappedAnswer(answers.budgetPreset, BUDGET_LABELS)}`,
        answers.priority && `Приоритет: ${mappedAnswer(answers.priority, PRIORITY_LABELS)}`,
        answers.purchaseMethod && `Способ покупки: ${mappedAnswer(answers.purchaseMethod, PURCHASE_METHOD_LABELS)}`,
        answers.cashAmount && `Сумма наличными: ${formatRubles(answers.cashAmount)}`,
        answers.downPaymentType && `Первоначальный взнос: ${mappedAnswer(answers.downPaymentType, DOWN_PAYMENT_LABELS)}`,
        answers.ownFundsAmount && `Собственные средства на взнос: ${formatRubles(answers.ownFundsAmount)}`,
        answers.telegram && `Telegram: ${answers.telegram}`,
        payload.pageUrl && `Страница: ${payload.pageUrl}`,
      ]
        .filter(Boolean)
        .join('\n'),
      SOURCE_ID: 'WEB',
      SOURCE_DESCRIPTION: 'Лид с сайта (от Мента)',
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

export async function OPTIONS(request) {
  const cors = getCors(request);
  return new Response(null, {
    status: cors.allowed ? 204 : 403,
    headers: cors.headers,
  });
}

export async function POST(request) {
  const startTime = Date.now();
  console.log('[Lead] Request received at:', new Date().toISOString());
  const cors = getCors(request);

  if (!cors.allowed) {
    return jsonWithCors(
      request,
      { ok: false, code: 'FORBIDDEN_ORIGIN', message: 'Источник заявки не разрешён.' },
      { status: 403 }
    );
  }

  try {
    const payload = await request.json();

    if (!payload || typeof payload !== 'object') {
      return jsonWithCors(request, { ok: false, code: 'BAD_REQUEST', message: 'Пустой запрос.' }, { status: 400 });
    }

    if (payload.company && String(payload.company).trim()) {
      return jsonWithCors(request, { ok: true });
    }

    console.log('[Lead] Step: validation');
    const phoneValidation = validatePhone(payload.phone);
    if (!phoneValidation.ok) {
      return jsonWithCors(request, phoneValidation.body, { status: phoneValidation.status });
    }

    if (payload.privacyConsent !== true) {
      return jsonWithCors(
        request,
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
      return jsonWithCors(request, { ok: true, deduped: true });
    }

    console.log('[Lead] Step: db');
    let leadId = null;
    try {
      const lead = await addLead(safePayload);
      leadId = lead.id;
      revalidateTag('leads');
      sendPushToAll({
        title: 'Новый лид!',
        body: `Имя: ${safePayload.name || '—'}, Телефон: ${safePayload.phone || '—'}`,
        url: '/admin/dashboard',
      }).catch((err) => console.error('Push notification error:', err));
    } catch (dbError) {
      console.error('Lead DB save error:', dbError);
      return jsonWithCors(
        request,
        { ok: false, code: 'DB_ERROR', message: 'Не удалось сохранить заявку. Попробуйте ещё раз.' },
        { status: 500 }
      );
    }

    console.log('[Lead] Step: bitrix');
    await sendToBitrix24(safePayload);

    console.log('[Lead] Completed in', Date.now() - startTime, 'ms');
    return jsonWithCors(request, { success: true, leadId });
  } catch (error) {
    console.error('Lead API error:', error);
    return jsonWithCors(
      request,
      {
        ok: false,
        code: 'SERVER_ERROR',
        message: 'Не удалось отправить. Попробуйте ещё раз.',
      },
      { status: 500 }
    );
  }
}
