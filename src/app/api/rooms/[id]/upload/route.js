import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { uploadChatMedia } from '@/lib/admin/s3';
import { sendPushToUsers } from '@/lib/admin/push';

export const runtime = 'nodejs';

const LIMITS = { image: 10 * 1024 * 1024, video_note: 50 * 1024 * 1024, audio_note: 25 * 1024 * 1024, file: 25 * 1024 * 1024 };
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf', 'text/plain', 'text/csv', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/x-zip-compressed',
]);

function getExtension(file) {
  const fromName = file.name?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const [, subtype] = file.type.split('/');
  return subtype?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
}

function validate(file, type) {
  if (!file) return 'Файл обязателен';
  if (type === 'image'      && !file.type?.startsWith('image/')) return 'Загрузите изображение';
  if (type === 'video_note' && !file.type?.startsWith('video/')) return 'Загрузите видеофайл';
  if (type === 'audio_note' && !file.type?.startsWith('audio/')) return 'Загрузите аудиофайл';
  if (type === 'file' && file.type && !ALLOWED_FILE_TYPES.has(file.type)) return 'Поддерживаются PDF, TXT, CSV, DOCX, XLSX и ZIP';
  if (file.size > LIMITS[type]) return `Файл превышает лимит`;
  return null;
}

function normalizeType(v) {
  return ['video_note', 'audio_note', 'file'].includes(v) ? v : 'image';
}

export async function POST(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const roomId = Number(params.id);
  if (!roomId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const [access] = await sql`
    SELECT role FROM chat_room_members WHERE room_id = ${roomId} AND user_id = ${user.id}
  `;
  if (!access) return NextResponse.json({ ok: false }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file');
  const requestedType = normalizeType(formData.get('type'));
  const text = formData.get('text')?.toString().trim() || null;

  const err = validate(file, requestedType);
  if (err) return NextResponse.json({ ok: false, message: err }, { status: 400 });

  try {
    const ext = getExtension(file);
    const key = `rooms/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'application/octet-stream';
    const mediaUrl = await uploadChatMedia({ key, body: buffer, contentType });

    const [author] = await sql`SELECT name, username, role, avatar_url, status_text FROM users WHERE id = ${user.id}`;
    const [message] = await sql`
      INSERT INTO chat_messages (user_id, room_id, text, media_url, media_type, media_mime, media_size)
      VALUES (${user.id}, ${roomId}, ${text}, ${mediaUrl}, ${requestedType}, ${contentType}, ${file.size})
      RETURNING id, text, media_url, media_type, media_mime, media_size, created_at
    `;

    const [room] = await sql`SELECT name FROM chat_rooms WHERE id = ${roomId}`;
    const members = await sql`SELECT user_id FROM chat_room_members WHERE room_id = ${roomId} AND user_id <> ${user.id}`;
    const memberIds = members.map((m) => m.user_id);
    if (memberIds.length > 0) {
      const pushBody = requestedType === 'video_note' ? 'Видео-круг в канале'
        : requestedType === 'audio_note' ? 'Голосовое в канале'
        : requestedType === 'file' ? 'Файл в канале'
        : 'Фото в канале';
      sendPushToUsers({
        userIds: memberIds,
        title: `${room?.name || 'Канал'}: ${user.name}`,
        body: pushBody,
        url: '/admin/dashboard',
      }).catch(console.error);
    }

    return NextResponse.json({
      ok: true,
      message: {
        ...message,
        author_name: author?.name || user.name,
        author_username: author?.username || user.username,
        author_role: author?.role || user.role,
        author_avatar_url: author?.avatar_url || '',
        author_status_text: author?.status_text || '',
      },
    });
  } catch (error) {
    console.error('Room upload error:', error);
    return NextResponse.json({ ok: false, message: error.message || 'Ошибка загрузки' }, { status: 500 });
  }
}
