import { revalidateTag } from 'next/cache';
import { addLead } from '@/lib/admin/store';
import { sendPushToAll } from '@/lib/admin/push';
import { pushDebugLog, getSql } from '@/lib/admin/db';

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

function buildLeadPushBody(payload) {
  const name = payload?.name || '—';
  const answers = payload?.answers ?? {};
  const parts = [];
  const apartment = answers.apartmentType ? mappedAnswer(answers.apartmentType, APARTMENT_TYPE_LABELS) : null;
  const budget = answers.budgetPreset ? mappedAnswer(answers.budgetPreset, BUDGET_LABELS) : null;
  if (apartment) parts.push(apartment);
  if (budget) parts.push(`бюджет ${budget}`);
  return parts.length > 0 ? `${name} — ${parts.join(', ')}` : name;
}

function buildReadableLeadPushBody(payload) {
  const answers = asRecord(payload?.answers);
  const name = payload?.name || answers.name || 'Новый клиент';
  const apartmentMap = {
    studio: 'Студия',
    '1room': '1-комнатная',
    '2rooms': '2-комнатная',
    '3rooms': '3-комнатная',
    '4plus': '4+ комнат',
    choosing: 'Еще выбираю',
  };
  const budgetMap = {
    '5_to_7': '5-7 млн',
    '7_to_10': '7-10 млн',
    '10_plus': '10+ млн',
  };
  const parts = [];
  if (answers.apartmentType) parts.push(apartmentMap[answers.apartmentType] || humanizeFallback(answers.apartmentType));
  if (answers.budgetPreset) parts.push(`бюджет ${budgetMap[answers.budgetPreset] || humanizeFallback(answers.budgetPreset)}`);
  if (payload?.phone) parts.push(`тел. ${payload.phone}`);
  if (answers.telegram) parts.push(`Telegram: ${answers.telegram}`);
  return parts.length ? `${name}: ${parts.join(', ')}` : name;
}

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

export async function GET() {
  const probeKey = `_dbg_get_probe_${Date.now()}`;
  let dbOk = false;
  let dbError = null;
  let dbgRows = [];
  let recentLeads = [];
  let pushDebugRows = [];
  try {
    const s = getSql();
    await s`INSERT INTO settings (key, value) VALUES (${probeKey}, ${'get_probe'}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    dbOk = true;
    const rows = await s`SELECT key, value FROM settings WHERE key LIKE '_dbg_%' ORDER BY key DESC LIMIT 20`;
    dbgRows = rows.map((r) => ({ key: r.key, value: r.value }));
    const leads = await s`SELECT id, name, phone, created_at FROM leads ORDER BY id DESC LIMIT 10`;
    recentLeads = leads.map((r) => ({ id: r.id, name: r.name, phone: r.phone, created_at: r.created_at }));

    // Check if addLead() was called for recent leads (store.js writes _dbg_addlead_<id> inside tx)
    const addLeadDbgRows = await s`SELECT key, value FROM settings WHERE key LIKE '_dbg_addlead_%' ORDER BY key DESC LIMIT 10`;
    const addLeadDbgKeys = addLeadDbgRows.map((r) => r.key);

    // lead_events for the last 10 leads — source / meta tells where the lead came from
    const leadIds = leads.map((r) => r.id);
    const leadEvents = leadIds.length
      ? await s`SELECT lead_id, type, message, meta, created_at FROM lead_events WHERE lead_id = ANY(${leadIds}) ORDER BY lead_id DESC, id DESC`
      : [];

    const pdRows = await s`SELECT id, stage, lead_id, data, error, created_at FROM push_debug_log ORDER BY id DESC LIMIT 20`;
    pushDebugRows = pdRows.map((r) => ({ id: r.id, stage: r.stage, lead_id: r.lead_id, data: r.data, error: r.error, created_at: r.created_at }));
    return Response.json({ revision: 'dbg-20260521-listener', dbOk, dbError, probeKey, dbgRows, addLeadDbgKeys, recentLeads, leadEvents, pushDebugRows });
  } catch (e) {
    dbError = e?.message || String(e);
  }
  return Response.json({ revision: 'dbg-20260521-listener', dbOk, dbError, probeKey, dbgRows, recentLeads, pushDebugRows });
}

// Raw DB probe — writes to settings table (plain TEXT, no JSONB) to avoid any type issues
function _dblog(stage, data, leadId = null) {
  const s = getSql();
  const key = `_dbg_${stage}_${Date.now()}`;
  const val = JSON.stringify({ stage, leadId, data, ts: new Date().toISOString() });
  return s`INSERT INTO settings (key, value) VALUES (${key}, ${val}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}

export async function POST(request) {
  // === BARE INSERT — FIRST LINE, NO TRY/CATCH — throws if getSql() or DB fails ===
  await _dblog('lead:handler_entered', { url: request.url, method: request.method });

  // === OUTER TRY/CATCH WRAPS EVERYTHING BELOW ===
  try {
    const startTime = Date.now();
    console.log('[Lead] Request received at:', new Date().toISOString());
    const cors = getCors(request);

    if (!cors.allowed) {
      _dblog('lead:returning', { status: 403, reason: 'cors' }).catch(() => {});
      return jsonWithCors(
        request,
        { ok: false, code: 'FORBIDDEN_ORIGIN', message: 'Источник заявки не разрешён.' },
        { status: 403 }
      );
    }

    const payload = await request.json();

    if (!payload || typeof payload !== 'object') {
      _dblog('lead:returning', { status: 400, reason: 'bad_request' }).catch(() => {});
      return jsonWithCors(request, { ok: false, code: 'BAD_REQUEST', message: 'Пустой запрос.' }, { status: 400 });
    }

    if (payload.company && String(payload.company).trim()) {
      _dblog('lead:returning', { status: 200, reason: 'honeypot' }).catch(() => {});
      return jsonWithCors(request, { ok: true });
    }

    console.log('[Lead] Step: validation');
    const phoneValidation = validatePhone(payload.phone);
    if (!phoneValidation.ok) {
      _dblog('lead:returning', { status: phoneValidation.status, reason: 'phone_invalid' }).catch(() => {});
      return jsonWithCors(request, phoneValidation.body, { status: phoneValidation.status });
    }

    if (payload.privacyConsent !== true) {
      _dblog('lead:returning', { status: 400, reason: 'no_consent' }).catch(() => {});
      return jsonWithCors(
        request,
        { ok: false, code: 'MISSING_PRIVACY_CONSENT', message: 'Необходимо согласие на обработку персональных данных.' },
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
      _dblog('lead:returning', { status: 200, reason: 'dedup' }).catch(() => {});
      return jsonWithCors(request, { ok: true, deduped: true });
    }

    console.log('[Lead] Step: db');
    let leadId = null;
    try {
      const lead = await addLead(safePayload);
      leadId = lead.id;
      revalidateTag('leads');
      await _dblog('lead:after_addlead', null, leadId);

      const pushBody = buildReadableLeadPushBody(safePayload);
      console.log('[Lead] triggering push for lead', leadId);
      try {
        await sendPushToAll({
          title: 'Новый лид!',
          body: pushBody,
          url: '/admin/dashboard',
          tag: `svoydom-crm-lead-${leadId}`,
          type: 'lead',
        });
      } catch (pushError) {
        console.error('Lead push notification error:', pushError);
        _dblog('lead:push_error', { error: pushError?.message, stack: String(pushError?.stack || '').slice(0, 500) }, leadId).catch(() => {});
      }
    } catch (dbError) {
      console.error('Lead DB save error:', dbError);
      _dblog('lead:returning', { status: 500, reason: 'db_error', error: dbError?.message }, leadId).catch(() => {});
      return jsonWithCors(
        request,
        { ok: false, code: 'DB_ERROR', message: 'Не удалось сохранить заявку. Попробуйте ещё раз.' },
        { status: 500 }
      );
    }

    console.log('[Lead] Step: bitrix');
    await sendToBitrix24(safePayload);

    console.log('[Lead] Completed in', Date.now() - startTime, 'ms');
    _dblog('lead:returning', { status: 200, reason: 'success', leadId }).catch(() => {});
    return jsonWithCors(request, { success: true, leadId });

  } catch (err) {
    // === TOP-LEVEL CATCH — captures anything not caught below ===
    _dblog('lead:top_catch', { error: err?.message, stack: String(err?.stack || '').slice(0, 1000) }).catch(() => {});
    console.error('Lead API error:', err);
    return jsonWithCors(
      request,
      { ok: false, code: 'SERVER_ERROR', message: 'Не удалось отправить. Попробуйте ещё раз.' },
      { status: 500 }
    );
  }
}
