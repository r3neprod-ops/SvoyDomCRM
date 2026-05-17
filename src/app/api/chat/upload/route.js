import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { uploadChatMedia } from '@/lib/admin/s3';
import { sendPushToAll } from '@/lib/admin/push';

export const runtime = 'nodejs';

const IMAGE_LIMIT = 10 * 1024 * 1024;
const VIDEO_LIMIT = 50 * 1024 * 1024;

function getExtension(file) {
  const fromName = file.name?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;

  const [, subtype] = file.type.split('/');
  return subtype?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
}

function validateUpload(file, requestedType) {
  if (!file) return { message: 'Файл обязателен' };
  if (typeof file.arrayBuffer !== 'function' || typeof file.type !== 'string') {
    return { message: 'Некорректный файл' };
  }

  const isVideoNote = requestedType === 'video_note';
  const allowedPrefix = isVideoNote ? 'video/' : 'image/';
  const limit = isVideoNote ? VIDEO_LIMIT : IMAGE_LIMIT;

  if (!file.type?.startsWith(allowedPrefix)) {
    return { message: isVideoNote ? 'Загрузите видеофайл' : 'Загрузите изображение' };
  }
  if (file.size > limit) {
    return { message: isVideoNote ? 'Видео должно быть не больше 50 МБ' : 'Фото должно быть не больше 10 МБ' };
  }

  return null;
}

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  const requestedType = formData.get('type') === 'video_note' ? 'video_note' : 'image';
  const text = formData.get('text')?.toString().trim() || null;

  const validationError = validateUpload(file, requestedType);
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError.message }, { status: 400 });
  }

  await ensureSchema();

  try {
    const extension = getExtension(file);
    const key = `chat/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const mediaUrl = await uploadChatMedia({ key, body: buffer, contentType: file.type });

    const sql = getSql();
    const [message] = await sql`
      INSERT INTO chat_messages (user_id, text, media_url, media_type, media_mime, media_size)
      VALUES (${user.id}, ${text}, ${mediaUrl}, ${requestedType}, ${file.type}, ${file.size})
      RETURNING id, text, media_url, media_type, media_mime, media_size, created_at
    `;

    sendPushToAll({
      title: `Новое сообщение от ${user.name || 'CRM'}`,
      body: requestedType === 'video_note' ? 'Видео-круг в общем чате' : 'Фото в общем чате',
      url: '/admin/dashboard',
      excludeUserId: user.id,
    }).catch((err) => console.error('Chat media push notification error:', err));

    return NextResponse.json({
      ok: true,
      message: { ...message, author_name: user.name || 'Неизвестно' },
    });
  } catch (error) {
    console.error('Chat upload error:', error);
    return NextResponse.json(
      { ok: false, message: error.message || 'Не удалось загрузить файл' },
      { status: 500 }
    );
  }
}
