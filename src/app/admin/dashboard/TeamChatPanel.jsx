'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const SWIPE_CANCEL_PX = 80;
const MAX_AUDIO_MS    = 120_000;
const MAX_VIDEO_MS    = 30_000;
const POLL_MS         = 4_000;
const WAVE_BARS       = 36;

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '';
  const d   = new Date(iso);
  const now = new Date();
  const td  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yd  = new Date(+td - 864e5);
  const md  = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (+md === +td) return 'Сегодня';
  if (+md === +yd) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function fmtSecs(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function fmtSize(b) {
  const n = Number(b) || 0;
  if (n < 1024)    return `${n} Б`;
  if (n < 1048576) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1048576).toFixed(1)} МБ`;
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function pickMime(kind) {
  if (typeof MediaRecorder === 'undefined') return '';
  const list = kind === 'audio'
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return list.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function pseudoWave(seed, n = WAVE_BARS) {
  let s = ((seed || 1) * 2654435761) >>> 0;
  return Array.from({ length: n }, () => {
    s = ((s * 1664525 + 1013904223) | 0) >>> 0;
    return 0.18 + 0.82 * ((s & 0xffff) / 65535);
  });
}

function getMention(value, cursor) {
  const before = value.slice(0, cursor);
  const m = before.match(/(^|\s)@([a-zA-Z0-9_]*)$/);
  return m ? { start: before.length - m[2].length - 1, query: m[2].toLowerCase() } : null;
}

function newDay(msgs, i) {
  if (i === 0) return true;
  return new Date(msgs[i - 1].created_at).toDateString() !== new Date(msgs[i].created_at).toDateString();
}

function sameGroup(msgs, i) {
  if (i === 0) return false;
  const p = msgs[i - 1], c = msgs[i];
  return p.user_id === c.user_id && new Date(c.created_at) - new Date(p.created_at) < 5 * 60_000;
}

const PALETTE = ['#E91E63','#9C27B0','#673AB7','#3F51B5','#2196F3','#00BCD4','#009688','#4CAF50','#FF9800','#FF5722'];
const nameCol = (uid) => PALETTE[(uid ?? 0) % PALETTE.length];

function rRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
  ctx.fill();
}

/* ─── Icons ─────────────────────────────────────────────────────────────────── */
const Ic = ({ children, cls = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

const IconSend  = () => <Ic><path d="m4 12 16-8-4 16-3.5-6.5L4 12Z"/><path d="m12.5 13.5 3.5-9.5"/></Ic>;
const IconMic   = () => <Ic><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/></Ic>;
const IconVideo = () => <Ic><rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 5-3v10l-5-3"/></Ic>;
const IconClip  = () => <Ic><path d="M21 11.5 12.2 20.3a6 6 0 0 1-8.5-8.5l9.1-9.1a4 4 0 0 1 5.7 5.7l-9.1 9.1a2 2 0 0 1-2.8-2.8l8.4-8.4"/></Ic>;
const IconPlay  = () => <Ic><polygon points="5 3 19 12 5 21 5 3"/></Ic>;
const IconPause = () => <Ic><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></Ic>;
const IconFile  = () => <Ic><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></Ic>;
const IconChevL = () => <Ic><polyline points="15 18 9 12 15 6"/></Ic>;

const DoubleCheck = ({ blue }) => (
  <svg width="20" height="12" viewBox="0 0 20 12" fill="none"
    stroke={blue ? '#4FC3F7' : 'currentColor'}
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="1 7 4 10 11 3"/>
    <polyline points="8 7 11 10 18 3"/>
  </svg>
);

/* ─── AudioPlayer ────────────────────────────────────────────────────────────── */
function AudioPlayer({ src, msgId, own }) {
  const aRef  = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [spd, setSpd] = useState(1);
  const bars = useMemo(() => pseudoWave(msgId), [msgId]);

  useEffect(() => {
    const a = aRef.current;
    if (!a) return;
    const onEnd  = () => setPlaying(false);
    const onTime = () => setCur(a.currentTime);
    const onMeta = () => { if (isFinite(a.duration)) setDur(a.duration); };
    a.addEventListener('ended',           onEnd);
    a.addEventListener('timeupdate',      onTime);
    a.addEventListener('loadedmetadata',  onMeta);
    a.addEventListener('durationchange',  onMeta);
    return () => {
      a.removeEventListener('ended',           onEnd);
      a.removeEventListener('timeupdate',      onTime);
      a.removeEventListener('loadedmetadata',  onMeta);
      a.removeEventListener('durationchange',  onMeta);
    };
  }, []);

  const toggle = () => {
    const a = aRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(console.error); setPlaying(true); }
  };

  const seek = (e) => {
    const a = aRef.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  };

  const cycleSpd = () => {
    const n = spd === 1 ? 1.5 : spd === 1.5 ? 2 : 1;
    setSpd(n);
    if (aRef.current) aRef.current.playbackRate = n;
  };

  const prog     = dur > 0 ? cur / dur : 0;
  const label    = dur > 0 ? fmtSecs(playing ? cur : dur) : '0:00';
  const actCol   = own ? 'rgba(255,255,255,0.88)' : '#2196F3';
  const inactCol = own ? 'rgba(255,255,255,0.3)'  : '#c8dce8';
  const btnCls   = own
    ? 'bg-white/20 hover:bg-white/35 text-white'
    : 'bg-[#2196F3] hover:bg-[#1E88E5] text-white';

  return (
    <div className="flex items-center gap-2.5" style={{ minWidth: 200, maxWidth: 280 }}>
      <audio ref={aRef} src={src} preload="metadata" />

      <button onClick={toggle}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${btnCls}`}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Waveform bars / scrubber */}
        <div className="flex h-9 cursor-pointer items-center gap-[2px]" onClick={seek}>
          {bars.map((h, i) => (
            <div key={i} className="rounded-full"
              style={{ width: 3, height: `${Math.round(h * 90)}%`,
                background: i / WAVE_BARS < prog ? actCol : inactCol }} />
          ))}
        </div>

        <div className={`flex items-center justify-between text-[11px] font-medium ${own ? 'text-white/70' : 'text-slate-500'}`}>
          <span className="tabular-nums">{label}</span>
          <button onClick={cycleSpd} className="rounded px-1 font-semibold hover:opacity-80">{spd}×</button>
        </div>
      </div>
    </div>
  );
}

/* ─── VideoNote player ───────────────────────────────────────────────────────── */
function VideoNote({ src }) {
  const vRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [prog,    setProg]    = useState(0);
  const S = 200, R = S / 2 - 5, CIRC = 2 * Math.PI * R;

  useEffect(() => {
    const v = vRef.current;
    if (!v) return;
    const onTime = () => setProg(v.duration > 0 ? v.currentTime / v.duration : 0);
    const onEnd  = () => { setPlaying(false); setProg(0); };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended',      onEnd);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('ended',      onEnd);
    };
  }, []);

  const toggle = () => {
    const v = vRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { v.play().catch(console.error); setPlaying(true); }
  };

  return (
    <div className="relative cursor-pointer select-none" style={{ width: S, height: S }} onClick={toggle}>
      <video ref={vRef} src={src} playsInline className="rounded-full object-cover"
        style={{ width: S, height: S }} />

      {/* Ring progress */}
      <svg className="pointer-events-none absolute inset-0" width={S} height={S}
        style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={S/2} cy={S/2} r={R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4"/>
        <circle cx={S/2} cy={S/2} r={R} fill="none" stroke="white" strokeWidth="4"
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - prog)} strokeLinecap="round"/>
      </svg>

      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/25">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80 text-slate-800">
            <IconPlay />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Live waveform canvas (during recording) ───────────────────────────────── */
function LiveWave({ analyserRef: aRef }) {
  const cvRef = useRef(null);
  const rafRef = useRef(null);
  const W = 140, H = 40, N = 30;

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const bw  = (W / N) - 1;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, W, H);
      const a = aRef.current;
      if (a) {
        const data = new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(data);
        const step = Math.floor(data.length / N);
        for (let i = 0; i < N; i++) {
          const v = data[i * step] / 255;
          const h = Math.max(3, v * H);
          ctx.fillStyle = `rgba(33,150,243,${0.35 + v * 0.65})`;
          rRect(ctx, i * (bw + 1), (H - h) / 2, bw, h, 2);
        }
      } else {
        const t = Date.now() / 500;
        for (let i = 0; i < N; i++) {
          const h = 3 + 7 * Math.abs(Math.sin(t + i * 0.4));
          ctx.fillStyle = 'rgba(33,150,243,0.4)';
          rRect(ctx, i * (bw + 1), (H - h) / 2, bw, h, 2);
        }
      }
    };
    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, [aRef]);

  return <canvas ref={cvRef} width={W} height={H} className="block" />;
}

/* ─── Message bubble ─────────────────────────────────────────────────────────── */
function Bubble({ msg, own, readUpTo, showAv, showName, isLast }) {
  const isRead = own && msg.id <= readUpTo;
  const t      = fmtTime(msg.created_at);
  const tailCls = isLast ? (own ? 'rounded-br-[4px]' : 'rounded-bl-[4px]') : '';
  const isVid   = msg.media_type === 'video_note';

  const meta = (
    <span className={`inline-flex shrink-0 items-center gap-0.5 ${isVid ? 'rounded-full bg-black/30 px-1.5 py-0.5' : ''}`}>
      <span className={`text-[10px] leading-none tabular-nums ${
        isVid ? 'text-white' : own ? 'text-emerald-800/60' : 'text-slate-400'
      }`}>{t}</span>
      {own && (
        <span className={isVid ? 'text-white/80' : 'text-emerald-700/70'}>
          <DoubleCheck blue={isRead} />
        </span>
      )}
    </span>
  );

  return (
    <div className={`flex items-end gap-1.5 ${own ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className="w-8 shrink-0">
        {!own && showAv && (
          msg.author_avatar_url
            ? <img src={msg.author_avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            : <div className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${nameCol(msg.user_id)}, ${nameCol(msg.user_id + 2)})` }}>
                {initials(msg.author_name)}
              </div>
        )}
      </div>

      {/* Content column */}
      <div className={`flex max-w-[72%] flex-col ${own ? 'items-end' : 'items-start'}`}>
        {!own && showName && (
          <span className="mb-0.5 ml-1 text-[11px] font-semibold" style={{ color: nameCol(msg.user_id) }}>
            {msg.author_name}
          </span>
        )}

        {/* Bubble shell */}
        <div className={`relative shadow-[0_1px_2px_rgba(0,0,0,0.13)] ${tailCls} ${
          isVid ? '' : `rounded-2xl px-3 py-2 ${own ? 'bg-[#effdde]' : 'bg-white'}`
        }`}>

          {/* Text */}
          {msg.media_type === 'text' && msg.text && (
            <div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">{msg.text}</p>
              <div className="mt-0.5 flex justify-end">{meta}</div>
            </div>
          )}

          {/* Image */}
          {msg.media_type === 'image' && msg.media_url && (
            <div>
              <a href={msg.media_url} target="_blank" rel="noreferrer"
                className="block -mx-3 -mt-2 overflow-hidden rounded-2xl">
                <img src={msg.media_url} alt="Фото" className="w-full object-cover" style={{ maxHeight: 320 }} />
              </a>
              {msg.text && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{msg.text}</p>}
              <div className="mt-0.5 flex justify-end">{meta}</div>
            </div>
          )}

          {/* Audio note */}
          {msg.media_type === 'audio_note' && msg.media_url && (
            <div>
              <AudioPlayer src={msg.media_url} msgId={msg.id} own={own} />
              <div className="mt-0.5 flex justify-end">{meta}</div>
            </div>
          )}

          {/* Video note (круглое) */}
          {isVid && msg.media_url && (
            <div className="relative">
              <VideoNote src={msg.media_url} />
              <div className="absolute bottom-2 right-2">{meta}</div>
            </div>
          )}

          {/* File */}
          {msg.media_type === 'file' && msg.media_url && (
            <div>
              <a href={msg.media_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2.5 rounded-xl transition hover:opacity-80" style={{ minWidth: 200 }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ background: own ? '#45a849' : '#2196F3' }}>
                  <IconFile />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">Открыть файл</span>
                  <span className="text-[11px] text-slate-500">{msg.media_mime || 'Файл'} · {fmtSize(msg.media_size)}</span>
                </span>
              </a>
              <div className="mt-0.5 flex justify-end">{meta}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Date separator ─────────────────────────────────────────────────────────── */
function DateSep({ iso }) {
  return (
    <div className="flex items-center justify-center py-3">
      <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-medium text-white shadow backdrop-blur-sm">
        {fmtDate(iso)}
      </span>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────────── */
export default function TeamChatPanel({ user, onUnreadChange }) {
  const [messages,  setMessages]  = useState([]);
  const [chatUsers, setChatUsers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [readUpTo,  setReadUpTo]  = useState(0);
  const [text,      setText]      = useState('');
  const [sending,   setSending]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState('');
  const [newMsgBadge, setNewMsgBadge] = useState(false);

  // Recording
  const [recMode,  setRecMode]  = useState('audio'); // 'audio' | 'video'
  const [isRec,    setIsRec]    = useState(false);
  const [recSecs,  setRecSecs]  = useState(0);
  const [swipeOff, setSwipeOff] = useState(0);

  // Mention
  const [mentOpen,  setMentOpen]  = useState(false);
  const [mentQuery, setMentQuery] = useState('');
  const [mentStart, setMentStart] = useState(0);
  const [mentIdx,   setMentIdx]   = useState(0);

  const taRef       = useRef(null);
  const fileRef     = useRef(null);
  const endRef      = useRef(null);
  const listRef     = useRef(null);
  const atBottomRef = useRef(true);
  const lastMsgIdRef = useRef(0);
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const streamRef   = useRef(null);
  const analyserRef = useRef(null);
  const acRef       = useRef(null);
  const stopTmRef   = useRef(null);
  const recTmRef    = useRef(null);
  const cancelRef   = useRef(false);
  const pStartXRef  = useRef(0);
  const vidPrevRef  = useRef(null);

  /* ── Scroll helpers ─────────────────────────────────────────────────────── */
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    endRef.current?.scrollIntoView({ behavior });
    atBottomRef.current = true;
    setNewMsgBadge(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (atBottomRef.current) setNewMsgBadge(false);
  }, []);

  /* ── Fetch ───────────────────────────────────────────────────────────────── */
  const fetchMessages = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/chat/messages');
      if (res.status === 401) { window.location.href = '/admin/login'; return; }
      const data = await res.json();
      if (data.ok) {
        setMessages(data.messages);
        setReadUpTo(data.read_by_others_up_to || 0);
        onUnreadChange?.(data.unread_count || 0);
        const lid = data.messages.at(-1)?.id;
        if (lid) {
          fetch('/api/chat/read', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ last_read_message_id: lid }),
          }).catch(console.error);
          onUnreadChange?.(0);
        }
        setError('');
      }
    } catch {
      if (!silent) setError('Не удалось загрузить чат');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    fetchMessages();
    const id = setInterval(() => fetchMessages({ silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [fetchMessages]);

  useEffect(() => {
    fetch('/api/chat/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setChatUsers(d.users || []); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const lastId = messages.at(-1)?.id ?? 0;
    if (lastId === lastMsgIdRef.current) return;
    const isOwn = messages.at(-1)?.user_id === user?.id;
    if (atBottomRef.current || isOwn) {
      scrollToBottom(lastMsgIdRef.current === 0 ? 'instant' : 'smooth');
    } else {
      setNewMsgBadge(true);
    }
    lastMsgIdRef.current = lastId;
  }, [messages, scrollToBottom, user?.id]);

  useEffect(() => () => {
    clearTimeout(stopTmRef.current);
    clearInterval(recTmRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    acRef.current?.close();
  }, []);

  /* ── Mention ─────────────────────────────────────────────────────────────── */
  const mentUsers = useMemo(() => {
    const q = mentQuery.trim().toLowerCase();
    return chatUsers
      .filter((u) => !q || u.username?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [chatUsers, mentQuery]);

  const closeMent = () => { setMentOpen(false); setMentQuery(''); setMentIdx(0); };

  const refreshMent = (val, cur) => {
    const m = getMention(val, cur);
    if (!m || !chatUsers.length) { closeMent(); return; }
    setMentOpen(true); setMentQuery(m.query); setMentStart(m.start); setMentIdx(0);
  };

  const pickMent = (u) => {
    const cur  = taRef.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, mentStart)}@${u.username} ${text.slice(cur)}`;
    setText(next); closeMent();
    requestAnimationFrame(() => {
      const pos = mentStart + u.username.length + 2;
      taRef.current?.focus();
      taRef.current?.setSelectionRange(pos, pos);
    });
  };

  /* ── Send / Upload ───────────────────────────────────────────────────────── */
  const append = (msg) => {
    atBottomRef.current = true;
    setMessages((p) => [...p, msg]);
  };

  const sendText = async () => {
    const v = text.trim();
    if (!v || sending) return;
    setSending(true); closeMent();
    try {
      const res  = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: v }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.message || 'Ошибка отправки'); return; }
      append(data.message); setText('');
      if (taRef.current) { taRef.current.style.height = '36px'; }
    } catch { setError('Ошибка отправки'); }
    finally { setSending(false); }
  };

  const uploadMedia = async (file, type) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('type', type);
      const res  = await fetch('/api/chat/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.ok) { setError(data.message || 'Ошибка загрузки'); return; }
      append(data.message);
    } catch { setError('Ошибка загрузки'); }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onFiles = (files) => {
    for (const f of Array.from(files || []))
      uploadMedia(f, f.type?.startsWith('image/') ? 'image' : 'file');
  };

  /* ── Recording ───────────────────────────────────────────────────────────── */
  const stopRec = (cancel = false) => {
    clearTimeout(stopTmRef.current);
    clearInterval(recTmRef.current);
    cancelRef.current = cancel;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    } else {
      // Edge case: MediaRecorder not yet active
      setIsRec(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (vidPrevRef.current) vidPrevRef.current.srcObject = null;
      acRef.current?.close(); acRef.current = null; analyserRef.current = null;
    }
    setSwipeOff(0);
  };

  const startRec = async () => {
    if (isRec) return;
    const isAudio = recMode === 'audio';
    const type    = isAudio ? 'audio_note' : 'video_note';
    try {
      const constraints = isAudio
        ? { audio: true }
        : { video: { facingMode: 'user', width: 300, height: 300 }, audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const mime   = pickMime(recMode);
      const rec    = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

      if (isAudio) {
        try {
          const ac  = new AudioContext();
          acRef.current = ac;
          const src = ac.createMediaStreamSource(stream);
          const an  = ac.createAnalyser();
          an.fftSize = 256;
          src.connect(an);
          analyserRef.current = an;
        } catch { /* AudioContext not critical */ }
      }

      if (!isAudio && vidPrevRef.current) {
        vidPrevRef.current.srcObject = stream;
        vidPrevRef.current.play().catch(console.error);
      }

      streamRef.current   = stream;
      recorderRef.current = rec;
      chunksRef.current   = [];

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      rec.onstop = async () => {
        setIsRec(false);
        stream.getTracks().forEach((t) => t.stop());
        if (vidPrevRef.current) vidPrevRef.current.srcObject = null;
        acRef.current?.close(); acRef.current = null; analyserRef.current = null;

        if (cancelRef.current) { cancelRef.current = false; return; }

        const fallback = isAudio ? 'audio/webm' : 'video/webm';
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || fallback });
        if (blob.size === 0) return;

        const ext  = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File(
          [blob],
          `${isAudio ? 'voice' : 'vidnote'}-${Date.now()}.${ext}`,
          { type: blob.type }
        );
        await uploadMedia(file, type);
      };

      rec.start();
      setIsRec(true); setRecSecs(0);
      recTmRef.current  = setInterval(() => setRecSecs((s) => s + 1), 1000);
      stopTmRef.current = setTimeout(() => stopRec(false), isAudio ? MAX_AUDIO_MS : MAX_VIDEO_MS);
    } catch {
      alert(isAudio ? 'Нет доступа к микрофону.' : 'Нет доступа к камере/микрофону.');
    }
  };

  // Pointer events for hold-to-record + swipe-to-cancel
  const onPtrDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pStartXRef.current = e.clientX;
    setSwipeOff(0);
    startRec();
  };
  const onPtrMove = (e) => {
    if (!isRec) return;
    setSwipeOff(Math.min(0, e.clientX - pStartXRef.current));
  };
  const onPtrUp = (e) => {
    if (!isRec) return;
    stopRec(e.clientX - pStartXRef.current < -SWIPE_CANCEL_PX);
  };

  /* ── Text input ──────────────────────────────────────────────────────────── */
  const onTAChange = (e) => {
    setText(e.target.value);
    refreshMent(e.target.value, e.target.selectionStart ?? e.target.value.length);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  };

  const onTAKey = (e) => {
    if (mentOpen && mentUsers.length > 0) {
      if (e.key === 'ArrowDown')              { e.preventDefault(); setMentIdx((i) => (i + 1) % mentUsers.length); return; }
      if (e.key === 'ArrowUp')                { e.preventDefault(); setMentIdx((i) => (i - 1 + mentUsers.length) % mentUsers.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMent(mentUsers[mentIdx] || mentUsers[0]); return; }
      if (e.key === 'Escape')                 { e.preventDefault(); closeMent(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  };

  const isCancelZone = swipeOff < -SWIPE_CANCEL_PX;
  const hasText      = text.trim().length > 0;

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-[#f0f2f5] dark:bg-gray-900 dark:border-gray-700">

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/50 bg-white/90 dark:bg-gray-800/95 dark:border-gray-700 px-4 py-3 shadow-sm backdrop-blur-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow"
          style={{ background: 'linear-gradient(135deg, #2196F3, #00BCD4)' }}>
          CRM
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Общий чат</h2>
          <p className="text-[11px] text-slate-400">{chatUsers.length} участников · вы как {user.name}</p>
        </div>
      </div>

      <div className="flex h-[65vh] min-h-[520px] flex-col">
        {/* Messages area */}
        <div className="relative flex-1 overflow-hidden bg-[#f0f2f5] dark:bg-gray-900">
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto pb-2"
          >
            {loading ? (
              <div className="flex justify-center py-20">
                <span className="rounded-full bg-black/20 px-4 py-1.5 text-sm text-white backdrop-blur-sm">
                  Загрузка...
                </span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex justify-center py-20">
                <span className="rounded-full bg-black/20 px-4 py-1.5 text-sm text-white backdrop-blur-sm">
                  Нет сообщений
                </span>
              </div>
            ) : (
              messages.map((msg, i) => {
                const own         = msg.user_id === user.id;
                const first       = !sameGroup(messages, i);
                const isLastGroup = i === messages.length - 1 || !sameGroup(messages, i + 1);
                return (
                  <div key={msg.id}>
                    {newDay(messages, i) && <DateSep iso={msg.created_at} />}
                    <div className={`px-3 ${sameGroup(messages, i) ? 'mt-0.5' : 'mt-3'}`}>
                      <Bubble
                        msg={msg}
                        own={own}
                        readUpTo={readUpTo}
                        showAv={!own && isLastGroup}
                        showName={!own && first}
                        isLast={isLastGroup}
                      />
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>
          {newMsgBadge && (
            <button
              onClick={() => scrollToBottom('smooth')}
              className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#2196F3] px-4 py-1.5 text-sm font-medium text-white shadow-lg transition hover:bg-[#1976D2]"
            >
              ↓ Новые сообщения
            </button>
          )}
        </div>

        {/* Input area */}
        <div className="relative z-10 border-t border-white/40 bg-[#f0f4f7] dark:bg-gray-800 dark:border-gray-700 px-3 py-3">
          {error && (
            <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* Video preview (always mounted, shown only when recording video) */}
          <div className={`mb-3 flex justify-center ${isRec && recMode === 'video' ? '' : 'hidden'}`}>
            <div className="overflow-hidden rounded-full border-4 border-[#2196F3] shadow-xl"
              style={{ width: 120, height: 120 }}>
              <video ref={vidPrevRef} playsInline muted
                className="h-full w-full rounded-full object-cover" />
            </div>
          </div>

          {/* Mention dropdown */}
          {mentOpen && mentUsers.length > 0 && !isRec && (
            <div className="absolute bottom-full left-3 z-20 mb-1 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Упомянуть
              </div>
              {mentUsers.map((u, idx) => (
                <button key={u.id} type="button"
                  onMouseDown={(e) => { e.preventDefault(); pickMent(u); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                    idx === mentIdx ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}>
                  {u.avatar_url
                    ? <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">
                        {initials(u.name)}
                      </span>
                  }
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">@{u.username}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Recording bar */}
          {isRec ? (
            <div className={`flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors ${
              isCancelZone ? 'bg-red-50' : 'bg-white'
            }`}>
              {/* Cancel hint (moves with swipe) */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
                style={{
                  transform: `translateX(${swipeOff * 0.4}px)`,
                  opacity: isCancelZone ? 0.45 : 1,
                  transition: 'opacity 0.15s',
                }}>
                <span className={`transition-colors ${isCancelZone ? 'text-red-500' : 'text-slate-400'}`}>
                  <IconChevL />
                </span>
                <span className={`truncate text-sm transition-colors ${isCancelZone ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                  {isCancelZone ? 'Отпустите для отмены' : 'Свайп влево — отмена'}
                </span>
              </div>

              {/* Waveform + timer */}
              <div className="flex shrink-0 items-center gap-2">
                {recMode === 'audio' && <LiveWave analyserRef={analyserRef} />}
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="min-w-[36px] text-sm font-medium tabular-nums text-slate-700">
                  {fmtSecs(recSecs)}
                </span>
              </div>

              {/* Mic/video button (still the pointer-up target) */}
              <button
                onPointerMove={onPtrMove}
                onPointerUp={onPtrUp}
                onPointerCancel={() => stopRec(true)}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-md transition-all ${
                  isCancelZone
                    ? 'scale-90 bg-red-500 text-white'
                    : 'scale-125 bg-[#2196F3] text-white'
                }`}
                style={{ touchAction: 'none' }}>
                {recMode === 'audio' ? <IconMic /> : <IconVideo />}
              </button>
            </div>
          ) : (
            /* Normal input row */
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="mb-[3px] flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 disabled:opacity-40"
                aria-label="Прикрепить">
                <IconClip />
              </button>

              <textarea
                ref={taRef}
                value={text}
                onChange={onTAChange}
                onKeyDown={onTAKey}
                onPaste={(e) => {
                  const files = e.clipboardData?.files;
                  if (!files?.length) return;
                  e.preventDefault(); onFiles(files);
                }}
                onClick={(e) => refreshMent(e.currentTarget.value, e.currentTarget.selectionStart ?? text.length)}
                placeholder="Сообщение..."
                rows={1}
                style={{ minHeight: 36, maxHeight: 120, overflowY: 'auto' }}
                className="flex-1 resize-none rounded-2xl bg-white px-3.5 py-2 text-sm shadow-sm ring-1 ring-slate-200/80 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />

              <div className="mb-[3px] flex shrink-0 items-center gap-1">
                {/* Mode toggle (only when no text) */}
                {!hasText && (
                  <button type="button"
                    onClick={() => setRecMode((m) => m === 'audio' ? 'video' : 'audio')}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100"
                    title={recMode === 'audio' ? 'Режим видео-круга' : 'Режим голосового'}>
                    {recMode === 'audio' ? <IconVideo /> : <IconMic />}
                  </button>
                )}

                {/* Send button (when text) or Mic/Video hold button */}
                {hasText ? (
                  <button type="button" onClick={sendText} disabled={sending}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2196F3] text-white shadow-md transition hover:bg-[#1E88E5] disabled:opacity-40"
                    aria-label="Отправить">
                    <IconSend />
                  </button>
                ) : (
                  <button
                    disabled={uploading}
                    onPointerDown={onPtrDown}
                    onPointerMove={onPtrMove}
                    onPointerUp={onPtrUp}
                    onPointerCancel={() => stopRec(true)}
                    className="flex h-10 w-10 select-none items-center justify-center rounded-full bg-[#2196F3] text-white shadow-md transition hover:bg-[#1E88E5] disabled:opacity-40"
                    style={{ touchAction: 'none' }}
                    aria-label={recMode === 'audio' ? 'Зажать — голосовое' : 'Зажать — видео-круг'}
                    title={recMode === 'audio' ? 'Зажать и держать — записать голосовое' : 'Зажать и держать — снять видео-круг'}>
                    {recMode === 'audio' ? <IconMic /> : <IconVideo />}
                  </button>
                )}
              </div>
            </div>
          )}

          <input ref={fileRef} type="file" multiple className="hidden"
            onChange={(e) => onFiles(e.target.files)} />

          {!isRec && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Enter — отправить · Shift+Enter — новая строка · @ — упомянуть · зажать
              {recMode === 'audio' ? ' 🎤' : ' 🎥'} — записать
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
