import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { uploadChatMedia } from '@/lib/admin/s3';
import { sendPushToAll } from '@/lib/admin/push';

export const runtime = 'nodejs';

const IMAGE_LIMIT = 10 * 1024 * 1024;
const VIDEO_LIMIT = 50 * 1024 * 1024;
const AUDIO_LIMIT = 25 * 1024 * 1024;
const FILE_LIMIT = 25 * 1024 * 1024;

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

  const limits = {
    image: IMAGE_LIMIT,
    video_note: VIDEO_LIMIT,
    audio_note: AUDIO_LIMIT,
    file: FILE_LIMIT,
  };

  if (requestedType === 'image' && !file.type?.startsWith('image/')) {
    return { message: 'Загрузите изображение' };
  }
  if (requestedType === 'video_note' && !file.type?.startsWith('video/')) {
    return { message: 'Загрузите видеофайл' };
  }
  if (requestedType === 'audio_note' && !file.type?.startsWith('audio/')) {
    return { message: 'Загрузите аудиофайл' };
  }
  if (file.size > limits[requestedType]) {
    if (requestedType === 'image') return { message: 'Фото должно быть не больше 10 МБ' };
    if (requestedType === 'video_note') return { message: 'Видео должно быть не больше 50 МБ' };
    return { message: 'Файл должен быть не больше 25 МБ' };
  }

  return null;
}

function normalizeRequestedType(value) {
  if (value === 'video_note' || value === 'audio_note' || value === 'file') return value;
  return 'image';
}

function getPushBody(type) {
  if (type === 'video_note') return 'Видео-круг в общем чате';
  if (type === 'audio_note') return 'Голосовое сообщение в общем чате';
  if (type === 'file') return 'Файл в общем чате';
  return 'Фото в общем чате';
}

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  const requestedType = normalizeRequestedType(formData.get('type'));
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
    const contentType = file.type || 'application/octet-stream';
    const mediaUrl = await uploadChatMedia({ key, body: buffer, contentType });

    const sql = getSql();
    const [author] = await sql`
      SELECT name, username, role, avatar_url, status_text
      FROM users
      WHERE id = ${user.id}
    `;
    const [message] = await sql`
      INSERT INTO chat_messages (user_id, text, media_url, media_type, media_mime, media_size, media_name)
      VALUES (${user.id}, ${text}, ${mediaUrl}, ${requestedType}, ${contentType}, ${file.size}, ${file.name || null})
      RETURNING id, text, media_url, media_type, media_mime, media_size, media_name, created_at
    `;

    try {
      await sendPushToAll({
        title: `Новое сообщение от ${user.name || 'CRM'}`,
        body: getPushBody(requestedType),
        url: '/admin/dashboard',
        excludeUserId: user.id,
        tag: `svoydom-crm-chat-media-${message.id}`,
        type: 'chat_media',
      });
    } catch (pushError) {
      console.error('Chat media push notification error:', pushError);
    }

    return NextResponse.json({
      ok: true,
      message: {
        ...message,
        author_name: author?.name || user.name || 'Неизвестно',
        author_username: author?.username || user.username || '',
        author_role: author?.role || user.role || 'employee',
        author_avatar_url: author?.avatar_url || '',
        author_status_text: author?.status_text || '',
      },
    });
  } catch (error) {
    console.error('Chat upload error:', error);
    return NextResponse.json(
      { ok: false, message: error.message || 'Не удалось загрузить файл' },
      { status: 500 }
    );
  }
}
