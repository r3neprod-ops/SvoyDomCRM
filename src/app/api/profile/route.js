import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { uploadChatMedia } from '@/lib/admin/s3';

export const runtime = 'nodejs';

const AVATAR_LIMIT = 5 * 1024 * 1024;

function normalizeProfile(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    name: row.name,
    phone: row.phone || '',
    status_text: row.status_text || '',
    avatar_url: row.avatar_url || '',
  };
}

function validateText(value, limit) {
  const text = String(value ?? '').trim();
  return text.length > limit ? text.slice(0, limit) : text;
}

function getExtension(file) {
  const fromName = file.name?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;

  const [, subtype] = file.type.split('/');
  return subtype?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
}

async function getProfile(sql, userId) {
  const [profile] = await sql`
    SELECT id, username, role, name, phone, status_text, avatar_url
    FROM users
    WHERE id = ${userId}
  `;
  return profile;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  const profile = await getProfile(sql, user.id);
  if (!profile) return NextResponse.json({ ok: false }, { status: 404 });

  return NextResponse.json({ ok: true, profile: normalizeProfile(profile) });
}

export async function PATCH(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  const contentType = request.headers.get('content-type') || '';

  let phone = '';
  let statusText = '';
  let avatarUrl = null;
  let avatarStorageKey = null;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    phone = validateText(formData.get('phone'), 40);
    statusText = validateText(formData.get('status_text'), 160);
    const avatar = formData.get('avatar');

    if (avatar && typeof avatar.arrayBuffer === 'function' && avatar.size > 0) {
      if (!avatar.type?.startsWith('image/')) {
        return NextResponse.json({ ok: false, message: 'Загрузите изображение' }, { status: 400 });
      }
      if (avatar.size > AVATAR_LIMIT) {
        return NextResponse.json({ ok: false, message: 'Аватар должен быть не больше 5 МБ' }, { status: 400 });
      }

      const extension = getExtension(avatar);
      avatarStorageKey = `avatars/${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const buffer = Buffer.from(await avatar.arrayBuffer());
      avatarUrl = await uploadChatMedia({ key: avatarStorageKey, body: buffer, contentType: avatar.type });
    }
  } else {
    const body = await request.json().catch(() => ({}));
    phone = validateText(body.phone, 40);
    statusText = validateText(body.status_text, 160);
  }

  const [profile] = avatarUrl
    ? await sql`
        UPDATE users
        SET phone = ${phone}, status_text = ${statusText}, avatar_url = ${avatarUrl}, avatar_storage_key = ${avatarStorageKey}
        WHERE id = ${user.id}
        RETURNING id, username, role, name, phone, status_text, avatar_url
      `
    : await sql`
        UPDATE users
        SET phone = ${phone}, status_text = ${statusText}
        WHERE id = ${user.id}
        RETURNING id, username, role, name, phone, status_text, avatar_url
      `;

  return NextResponse.json({ ok: true, profile: normalizeProfile(profile) });
}
