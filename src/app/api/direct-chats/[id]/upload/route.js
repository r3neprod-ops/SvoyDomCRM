import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { uploadChatMedia } from '@/lib/admin/s3';
import { sendPushToUser } from '@/lib/admin/push';

export const runtime = 'nodejs';

const IMAGE_LIMIT = 10 * 1024 * 1024;
const VIDEO_LIMIT = 50 * 1024 * 1024;
const AUDIO_LIMIT = 25 * 1024 * 1024;
const FILE_LIMIT  = 25 * 1024 * 1024;

function getExtension(file) {
  const fromName = file.name?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const [, subtype] = file.type.split('/');
  return subtype?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
}

function validateUpload(file, requestedType) {
  if (!file) return { message: 'Файл обязателен' };
  if (typeof file.arrayBuffer !== 'function' || typeof file.type !== 'string') return { message: 'Некорректный файл' };
  const limits = { image: IMAGE_LIMIT, video_note: VIDEO_LIMIT, audio_note: AUDIO_LIMIT, file: FILE_LIMIT };
  if (requestedType === 'image'      && !file.type?.startsWith('image/')) return { message: 'Загрузите изображение' };
  if (requestedType === 'video_note' && !file.type?.startsWith('video/')) return { message: 'Загрузите видеофайл' };
  if (requestedType === 'audio_note' && !file.type?.startsWith('audio/')) return { message: 'Загрузите аудиофайл' };
  if (file.size > limits[requestedType]) {
    if (requestedType === 'image') return { message: 'Фото не больше 10 МБ' };
    if (requestedType === 'video_note') return { message: 'Видео не больше 50 МБ' };
    return { message: 'Файл не больше 25 МБ' };
  }
  return null;
}

function normalizeType(v) {
  if (v === 'video_note' || v === 'audio_note' || v === 'file') return v;
  return 'image';
}

export async function POST(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const chatId = Number(params.id);
  if (!chatId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const [access] = await sql`
    SELECT id FROM direct_chats
    WHERE id = ${chatId} AND (user1_id = ${user.id} OR user2_id = ${user.id})
  `;
  if (!access) return NextResponse.json({ ok: false }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file');
  const requestedType = normalizeType(formData.get('type'));
  const text = formData.get('text')?.toString().trim() || null;

  const validationError = validateUpload(file, requestedType);
  if (validationError) return NextResponse.json({ ok: false, message: validationError.message }, { status: 400 });

  try {
    const extension = getExtension(file);
    const key = `dm/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'application/octet-stream';
    const mediaUrl = await uploadChatMedia({ key, body: buffer, contentType });

    const [author] = await sql`SELECT name, username, role, avatar_url, status_text FROM users WHERE id = ${user.id}`;
    const [message] = await sql`
      INSERT INTO chat_messages (user_id, direct_chat_id, text, media_url, media_type, media_mime, media_size, media_name)
      VALUES (${user.id}, ${chatId}, ${text}, ${mediaUrl}, ${requestedType}, ${contentType}, ${file.size}, ${file.name || null})
      RETURNING id, text, media_url, media_type, media_mime, media_size, media_name, created_at
    `;

    const [chatRow] = await sql`SELECT user1_id, user2_id FROM direct_chats WHERE id = ${chatId}`;
    const otherId = chatRow.user1_id === user.id ? chatRow.user2_id : chatRow.user1_id;
    const pushBody = requestedType === 'video_note' ? 'Видео-круг в личных сообщениях'
      : requestedType === 'audio_note' ? 'Голосовое в личных сообщениях'
      : requestedType === 'file' ? 'Файл в личных сообщениях'
      : 'Фото в личных сообщениях';
    try {
      await sendPushToUser({
        userId: otherId,
        title: `Личное от ${user.name}`,
        body: pushBody,
        url: '/admin/dashboard',
        tag: `svoydom-crm-dm-media-${message.id}`,
        type: 'direct_chat_media',
      });
    } catch (pushError) {
      console.error('Direct chat media push notification error:', pushError);
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
    console.error('DM upload error:', error);
    return NextResponse.json({ ok: false, message: error.message || 'Ошибка загрузки' }, { status: 500 });
  }
}
