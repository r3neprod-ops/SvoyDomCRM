import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

export function normalizePhoneE164(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  let normalized = digits;
  if (digits.length === 10) {
    normalized = `7${digits}`;
  } else if (digits.length === 11 && digits.startsWith('8')) {
    normalized = `7${digits.slice(1)}`;
  } else if (digits.length === 11 && digits.startsWith('7')) {
    normalized = digits;
  }

  if (normalized.length < 11 || normalized.length > 15) return null;
  return `+${normalized}`;
}

export function maskPhone(phoneE164) {
  const digits = String(phoneE164 || '').replace(/\D/g, '');
  if (digits.length < 6) return phoneE164 || '';
  return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} *** ** ${digits.slice(-2)}`;
}

export function makeSmsCode() {
  return String(randomInt(100000, 1000000));
}

export async function hashSmsCode(code) {
  return bcrypt.hash(String(code), 10);
}

export async function verifySmsCode(code, hash) {
  return bcrypt.compare(String(code), hash);
}

export async function sendSmsCode({ phoneE164, code }) {
  const phone = String(phoneE164 || '').replace(/^\+/, '');
  const text = `Код входа в CRM24: ${code}`;

  if (process.env.SMS_RU_API_ID) {
    const url = new URL('https://sms.ru/sms/send');
    url.searchParams.set('api_id', process.env.SMS_RU_API_ID);
    url.searchParams.set('to', phone);
    url.searchParams.set('msg', text);
    url.searchParams.set('json', '1');

    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === 'OK') return { ok: true, provider: 'sms_ru' };
    return { ok: false, provider: 'sms_ru', code: data.status_code || data.status || 'sms_send_failed' };
  }

  if (process.env.SMSC_LOGIN && process.env.SMSC_PASSWORD) {
    const url = new URL('https://smsc.ru/sys/send.php');
    url.searchParams.set('login', process.env.SMSC_LOGIN);
    url.searchParams.set('psw', process.env.SMSC_PASSWORD);
    url.searchParams.set('phones', phone);
    url.searchParams.set('mes', text);
    url.searchParams.set('fmt', '3');
    url.searchParams.set('charset', 'utf-8');

    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data.error) return { ok: true, provider: 'smsc' };
    return { ok: false, provider: 'smsc', code: data.error_code || data.error || 'sms_send_failed' };
  }

  return { ok: false, code: 'sms_not_configured' };
}
