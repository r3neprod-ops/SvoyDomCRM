'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function formatChatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function roleLabel(role) {
  return role === 'admin' ? 'Админ' : 'Сотрудник';
}

function formatFileSize(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function pickRecorderMimeType(kind) {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = kind === 'audio_note'
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function inferUploadType(file) {
  if (file.type?.startsWith('image/')) return 'image';
  return 'file';
}

function getMentionState(value, cursor) {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([a-zA-Z0-9_]*)$/);
  if (!match) return null;
  return {
    start: beforeCursor.length - match[2].length - 1,
    query: match[2].toLowerCase(),
  };
}

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function PaperclipIcon() {
  return <Icon><path d="M21 11.5 12.2 20.3a6 6 0 0 1-8.5-8.5l9.1-9.1a4 4 0 0 1 5.7 5.7l-9.1 9.1a2 2 0 0 1-2.8-2.8l8.4-8.4" /></Icon>;
}

function SendIcon() {
  return <Icon><path d="m4 12 16-8-4 16-3.5-6.5L4 12Z" /><path d="m12.5 13.5 3.5-9.5" /></Icon>;
}

function VideoIcon() {
  return <Icon><rect x="3" y="6" width="12" height="12" rx="3" /><path d="m15 10 5-3v10l-5-3" /></Icon>;
}

function MicIcon() {
  return <Icon><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M19 11a7 7 0 0 1-14 0" /><path d="M12 18v3" /></Icon>;
}

function StopIcon() {
  return <Icon><rect x="7" y="7" width="10" height="10" rx="2" /></Icon>;
}

function FileIcon() {
  return <Icon><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></Icon>;
}

export default function TeamChatPanel({ user, onUnreadChange }) {
  const [messages, setMessages] = useState([]);
  const [chatUsers, setChatUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recordingType, setRecordingType] = useState('');
  const [error, setError] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const listEndRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const stopTimerRef = useRef(null);

  const fetchMessages = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/chat/messages');
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setMessages(data.messages);
        onUnreadChange?.(data.unread_count || 0);
        const latestMessageId = data.messages.at(-1)?.id;
        if (latestMessageId) {
          await fetch('/api/chat/read', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ last_read_message_id: latestMessageId }),
          });
          onUnreadChange?.(0);
        }
        setError('');
      }
    } catch (err) {
      console.error('Chat fetch error:', err);
      setError('Не удалось загрузить чат');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(() => fetchMessages({ silent: true }), 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    fetch('/api/chat/users')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok) setChatUsers(data.users || []);
      })
      .catch((err) => console.error('Chat users fetch error:', err));
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => {
    clearTimeout(stopTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const filteredMentionUsers = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    return chatUsers
      .filter((item) => {
        if (!query) return true;
        return item.username?.toLowerCase().includes(query) || item.name?.toLowerCase().includes(query);
      })
      .slice(0, 6);
  }, [chatUsers, mentionQuery]);

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, message]);
    setError('');
  };

  const closeMention = () => {
    setMentionOpen(false);
    setMentionQuery('');
    setMentionIndex(0);
  };

  const refreshMention = (value, cursor) => {
    const mention = getMentionState(value, cursor);
    if (!mention || chatUsers.length === 0) {
      closeMention();
      return;
    }
    setMentionOpen(true);
    setMentionQuery(mention.query);
    setMentionStart(mention.start);
    setMentionIndex(0);
  };

  const sendText = async () => {
    const value = text.trim();
    if (!value || sending) return;

    setSending(true);
    closeMention();
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || 'Не удалось отправить сообщение');
        return;
      }
      appendMessage(data.message);
      setText('');
    } catch (err) {
      console.error('Chat send error:', err);
      setError('Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  };

  const uploadMedia = async (file, type = inferUploadType(file)) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const res = await fetch('/api/chat/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || 'Не удалось загрузить файл');
        return;
      }
      appendMessage(data.message);
    } catch (err) {
      console.error('Chat upload error:', err);
      setError('Не удалось загрузить файл');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const uploadFiles = async (files) => {
    const list = Array.from(files || []);
    for (const file of list) {
      await uploadMedia(file, inferUploadType(file));
    }
  };

  const handleFileChange = (event) => {
    uploadFiles(event.target.files);
  };

  const handlePaste = (event) => {
    const files = event.clipboardData?.files;
    if (!files?.length) return;
    event.preventDefault();
    uploadFiles(files);
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  const startRecording = async (type) => {
    if (recordingType) {
      stopRecording();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      alert('Запись не поддерживается этим браузером.');
      return;
    }

    const isAudio = type === 'audio_note';
    try {
      const stream = await navigator.mediaDevices.getUserMedia(isAudio ? { audio: true } : { video: true, audio: true });
      const mimeType = pickRecorderMimeType(type);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        setRecordingType('');
        clearTimeout(stopTimerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const fallbackType = isAudio ? 'audio/webm' : 'video/webm';
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || fallbackType });
        if (blob.size === 0) return;

        const extension = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('mpeg') ? 'mp3' : 'webm';
        const file = new File([blob], `${isAudio ? 'voice' : 'video-note'}-${Date.now()}.${extension}`, { type: blob.type });
        await uploadMedia(file, type);
      };

      recorder.start();
      setRecordingType(type);
      stopTimerRef.current = setTimeout(() => stopRecording(), isAudio ? 120000 : 30000);
    } catch (err) {
      console.error('Recording error:', err);
      alert(isAudio ? 'Не удалось получить доступ к микрофону.' : 'Не удалось получить доступ к камере и микрофону.');
    }
  };

  const selectMention = (mentionUser) => {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const nextText = `${text.slice(0, mentionStart)}@${mentionUser.username} ${text.slice(cursor)}`;
    const nextCursor = mentionStart + mentionUser.username.length + 2;
    setText(nextText);
    closeMention();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleTextChange = (event) => {
    const value = event.target.value;
    setText(value);
    refreshMention(value, event.target.selectionStart ?? value.length);
  };

  const handleKeyDown = (event) => {
    if (mentionOpen && filteredMentionUsers.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionIndex((index) => (index + 1) % filteredMentionUsers.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionIndex((index) => (index - 1 + filteredMentionUsers.length) % filteredMentionUsers.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        selectMention(filteredMentionUsers[mentionIndex] || filteredMentionUsers[0]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMention();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendText();
    }
  };

  const renderAuthor = (message) => (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-slate-50 px-2.5 py-2">
      {message.author_avatar_url ? (
        <img
          src={message.author_avatar_url}
          alt=""
          className="h-9 w-9 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {getInitials(message.author_name)}
        </div>
      )}
      <div className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-800">{message.author_name}</span>
        <span className="block truncate text-[11px] font-medium text-slate-500">
          {roleLabel(message.author_role)} {message.author_username ? `@${message.author_username}` : ''}
        </span>
      </div>
    </div>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-semibold">Общий чат</h2>
        <p className="mt-1 text-sm text-slate-500">
          Сообщения видят все пользователи CRM. Вы вошли как {user.name}.
        </p>
      </div>

      <div className="flex h-[62vh] min-h-[520px] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">Загрузка чата...</p>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">В чате пока нет сообщений.</p>
          ) : (
            messages.map((message) => (
              <article key={message.id} className="rounded-3xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  {renderAuthor(message)}
                  <time className="pt-2 text-xs text-slate-400">{formatChatTime(message.created_at)}</time>
                </div>

                {message.text && (
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{message.text}</p>
                )}

                {message.media_type === 'image' && message.media_url && (
                  <a href={message.media_url} target="_blank" rel="noreferrer" className="mt-3 block">
                    <img
                      src={message.media_url}
                      alt="Фото из чата"
                      className="max-h-96 rounded-2xl border border-slate-100 object-contain"
                    />
                  </a>
                )}

                {message.media_type === 'video_note' && message.media_url && (
                  <div className="mt-3">
                    <video
                      src={message.media_url}
                      controls
                      playsInline
                      className="h-56 w-56 rounded-full border border-slate-200 bg-black object-cover"
                    />
                  </div>
                )}

                {message.media_type === 'audio_note' && message.media_url && (
                  <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <audio src={message.media_url} controls className="w-full" />
                  </div>
                )}

                {message.media_type === 'file' && message.media_url && (
                  <a
                    href={message.media_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex max-w-md items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-700 transition hover:border-slate-200 hover:bg-slate-100"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
                      <FileIcon />
                    </span>
                    <span>
                      <span className="block font-medium">Открыть файл</span>
                      <span className="text-xs text-slate-400">{message.media_mime || 'Файл'} · {formatFileSize(message.media_size)}</span>
                    </span>
                  </a>
                )}
              </article>
            ))
          )}
          <div ref={listEndRef} />
        </div>

        <div className="border-t border-slate-100 px-4 py-4">
          {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="relative">
            {mentionOpen && filteredMentionUsers.length > 0 && (
              <div className="absolute bottom-full left-12 z-10 mb-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  кого пнуть?
                </div>
                {filteredMentionUsers.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectMention(item);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                      index === mentionIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    {item.avatar_url ? (
                      <img src={item.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                        {getInitials(item.name)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{item.name}</span>
                      <span className="block truncate text-xs text-slate-400">{item.role_label} @{item.username}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-2 shadow-inner">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-600 shadow-sm transition hover:bg-slate-900 hover:text-white disabled:opacity-40"
                aria-label="Прикрепить файл"
                title="Прикрепить файл"
              >
                <PaperclipIcon />
              </button>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onClick={(event) => refreshMention(event.currentTarget.value, event.currentTarget.selectionStart ?? text.length)}
                placeholder="Написать сообщение..."
                rows={2}
                className="min-h-[48px] flex-1 resize-none bg-transparent px-1 py-2 text-sm focus:outline-none"
              />
              <div className="mb-1 flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => startRecording('video_note')}
                  disabled={uploading || recordingType === 'audio_note'}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm transition disabled:opacity-40 ${
                    recordingType === 'video_note'
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'bg-white text-slate-600 hover:bg-slate-900 hover:text-white'
                  }`}
                  aria-label={recordingType === 'video_note' ? 'Остановить видео-круг' : 'Записать видео-круг'}
                  title={recordingType === 'video_note' ? 'Остановить видео-круг' : 'Видео-круг'}
                >
                  {recordingType === 'video_note' ? <StopIcon /> : <VideoIcon />}
                </button>
                <button
                  type="button"
                  onClick={() => startRecording('audio_note')}
                  disabled={uploading || recordingType === 'video_note'}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm transition disabled:opacity-40 ${
                    recordingType === 'audio_note'
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'bg-white text-slate-600 hover:bg-slate-900 hover:text-white'
                  }`}
                  aria-label={recordingType === 'audio_note' ? 'Остановить голосовое' : 'Записать голосовое'}
                  title={recordingType === 'audio_note' ? 'Остановить голосовое' : 'Голосовое'}
                >
                  {recordingType === 'audio_note' ? <StopIcon /> : <MicIcon />}
                </button>
                <button
                  type="button"
                  onClick={sendText}
                  disabled={!text.trim() || sending}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-40"
                  aria-label="Отправить"
                  title="Отправить"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="mt-2 text-xs text-slate-400">
            Enter - отправить, Shift+Enter - новая строка. @ - позвать коллегу. Файлы можно вставлять из буфера.
          </p>
        </div>
      </div>
    </section>
  );
}
