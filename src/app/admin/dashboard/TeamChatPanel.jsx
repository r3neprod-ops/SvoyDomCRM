'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export default function TeamChatPanel({ user, onUnreadChange }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');

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
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => {
    clearTimeout(stopTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, message]);
    setError('');
  };

  const sendText = async () => {
    const value = text.trim();
    if (!value || sending) return;

    setSending(true);
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

  const uploadMedia = async (file, type) => {
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

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (file) uploadMedia(file, 'image');
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      alert('Запись видео не поддерживается этим браузером.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        setRecording(false);
        clearTimeout(stopTimerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        if (blob.size === 0) return;

        const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `video-note-${Date.now()}.${extension}`, { type: blob.type });
        await uploadMedia(file, 'video_note');
      };

      recorder.start();
      setRecording(true);
      stopTimerRef.current = setTimeout(() => stopRecording(), 30000);
    } catch (err) {
      console.error('Video recording error:', err);
      alert('Не удалось получить доступ к камере и микрофону.');
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendText();
    }
  };

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
              <article key={message.id} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
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
                      {message.author_status_text && (
                        <span className="block truncate text-xs text-slate-400">{message.author_status_text}</span>
                      )}
                    </div>
                  </div>
                  <time className="text-xs text-slate-400">{formatChatTime(message.created_at)}</time>
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
              </article>
            ))
          )}
          <div ref={listEndRef} />
        </div>

        <div className="border-t border-slate-100 px-4 py-4">
          {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex flex-col gap-3 sm:flex-row">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Написать сообщение..."
              rows={2}
              className="min-h-[48px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <div className="flex flex-wrap gap-2 sm:flex-col">
              <button
                onClick={sendText}
                disabled={!text.trim() || sending}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-700 disabled:opacity-40"
              >
                {sending ? 'Отправка...' : 'Отправить'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
              >
                Фото
              </button>
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={uploading}
                className={`rounded-xl px-4 py-2 text-sm transition disabled:opacity-40 ${
                  recording
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {recording ? 'Стоп' : uploading ? 'Загрузка...' : 'Видео-круг'}
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <p className="mt-2 text-xs text-slate-400">
            Enter - отправить, Shift+Enter - новая строка. Видео-круг записывается до 30 секунд.
          </p>
        </div>
      </div>
    </section>
  );
}
