'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const SWIPE_CANCEL_PX = 80;
const MAX_AUDIO_MS    = 120_000;
const MAX_VIDEO_MS    = 30_000;
const POLL_MS         = 12_000;
const WAVE_BARS       = 36;

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const td = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yd = new Date(+td - 864e5);
  const md = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (+md === +td) return 'Сегодня';
  if (+md === +yd) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
function fmtSecs(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
function fmtSize(b) {
  const n = Number(b) || 0;
  if (n < 1024) return `${n} Б`;
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
function readerLabel(readers) {
  if (!readers?.length) return null;
  if (readers.length === 1) return `Прочитал ${readers[0].name}`;
  if (readers.length <= 3) return `Прочитали ${readers.map((r) => r.name).join(', ')}`;
  return `Прочитали ${readers[0].name} и ещё ${readers.length - 1}`;
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
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath(); ctx.fill();
}

/* ─── Icons ─────────────────────────────────────────────────────────────────── */
const Ic = ({ children, cls = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IconSend   = () => <Ic><path d="m4 12 16-8-4 16-3.5-6.5L4 12Z"/><path d="m12.5 13.5 3.5-9.5"/></Ic>;
const IconMic    = () => <Ic><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/></Ic>;
const IconVideo  = () => <Ic><rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 5-3v10l-5-3"/></Ic>;
const IconClip   = () => <Ic><path d="M21 11.5 12.2 20.3a6 6 0 0 1-8.5-8.5l9.1-9.1a4 4 0 0 1 5.7 5.7l-9.1 9.1a2 2 0 0 1-2.8-2.8l8.4-8.4"/></Ic>;
const IconPlay   = () => <Ic><polygon points="5 3 19 12 5 21 5 3"/></Ic>;
const IconPause  = () => <Ic><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></Ic>;
const IconFile   = () => <Ic><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></Ic>;
const IconPhoto  = () => <Ic><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/></Ic>;
const IconCamera = () => <Ic><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3z"/><circle cx="12" cy="13" r="3"/></Ic>;
const IconChevL  = () => <Ic><polyline points="15 18 9 12 15 6"/></Ic>;
const IconSettings = () => <Ic><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></Ic>;
const IconPlus   = () => <Ic cls="h-3.5 w-3.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Ic>;
const IconMenu   = () => <Ic><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></Ic>;
const IconX      = () => <Ic cls="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Ic>;

const SingleCheck = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="1 6 4 9 11 2"/>
  </svg>
);
const DoubleCheck = () => (
  <svg width="20" height="12" viewBox="0 0 20 12" fill="none"
    stroke="#4FC3F7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="1 7 4 10 11 3"/><polyline points="8 7 11 10 18 3"/>
  </svg>
);

/* ─── AudioPlayer ────────────────────────────────────────────────────────────── */
function AudioPlayer({ src, msgId, own }) {
  const aRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [spd, setSpd] = useState(1);
  const bars = useMemo(() => pseudoWave(msgId), [msgId]);

  useEffect(() => {
    const a = aRef.current; if (!a) return;
    const onEnd  = () => setPlaying(false);
    const onTime = () => setCur(a.currentTime);
    const onMeta = () => { if (isFinite(a.duration)) setDur(a.duration); };
    a.addEventListener('ended', onEnd); a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta); a.addEventListener('durationchange', onMeta);
    return () => {
      a.removeEventListener('ended', onEnd); a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta); a.removeEventListener('durationchange', onMeta);
    };
  }, []);

  const toggle = () => { const a = aRef.current; if (!a) return; if (playing) { a.pause(); setPlaying(false); } else { a.play().catch(console.error); setPlaying(true); } };
  const seek = (e) => { const a = aRef.current; if (!a || !dur) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; };
  const cycleSpd = () => { const n = spd === 1 ? 1.5 : spd === 1.5 ? 2 : 1; setSpd(n); if (aRef.current) aRef.current.playbackRate = n; };

  const prog = dur > 0 ? cur / dur : 0;
  const label = dur > 0 ? fmtSecs(playing ? cur : dur) : '0:00';
  const actCol = own ? '#3a9f43' : '#229ED9';
  const inactCol = own ? 'rgba(58,159,67,0.28)' : 'rgba(34,158,217,0.24)';
  const btnCls = own ? 'bg-[#45a849] hover:bg-[#3e9846] text-white' : 'bg-[#229ED9] hover:bg-[#168ac2] text-white';

  return (
    <div className="flex w-[248px] max-w-[62vw] items-center gap-2.5">
      <audio ref={aRef} src={src} preload="metadata" />
      <button onClick={toggle} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm transition ${btnCls}`} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex h-8 cursor-pointer items-center gap-[2px]" onClick={seek}>
          {bars.map((h, i) => (
            <div key={i} className="rounded-full transition-colors" style={{ width: 3, height: `${Math.round(5 + h * 25)}px`, background: i / WAVE_BARS < prog ? actCol : inactCol }} />
          ))}
        </div>
        <div className={`flex items-center justify-between text-[11px] font-medium ${own ? 'text-emerald-800/60' : 'text-slate-500'}`}>
          <span className="tabular-nums">{label}</span>
          <button onClick={cycleSpd} className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition ${own ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{spd}x</button>
        </div>
      </div>
    </div>
  );
}

/* ─── VideoNote ──────────────────────────────────────────────────────────────── */
function VideoNote({ src }) {
  const vRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState(0);
  const S = 188, R = S / 2 - 5, CIRC = 2 * Math.PI * R;

  useEffect(() => {
    const v = vRef.current; if (!v) return;
    const onTime = () => setProg(v.duration > 0 ? v.currentTime / v.duration : 0);
    const onEnd  = () => { setPlaying(false); setProg(0); };
    v.addEventListener('timeupdate', onTime); v.addEventListener('ended', onEnd);
    return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('ended', onEnd); };
  }, []);

  const toggle = () => { const v = vRef.current; if (!v) return; if (playing) { v.pause(); setPlaying(false); } else { v.play().catch(console.error); setPlaying(true); } };

  return (
    <div className="relative cursor-pointer select-none rounded-full shadow-[0_2px_10px_rgba(15,23,42,0.22)]" style={{ width: S, height: S }} onClick={toggle}>
      <video ref={vRef} src={src} playsInline className="rounded-full object-cover" style={{ width: S, height: S }} />
      <svg className="pointer-events-none absolute inset-0" width={S} height={S} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={S/2} cy={S/2} r={R} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="4"/>
        <circle cx={S/2} cy={S/2} r={R} fill="none" stroke="white" strokeWidth="4"
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - prog)} strokeLinecap="round"/>
      </svg>
      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/25">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/85 text-slate-800 shadow-lg"><IconPlay /></div>
        </div>
      )}
    </div>
  );
}

/* ─── LiveWave ───────────────────────────────────────────────────────────────── */
function LiveWave({ analyserRef: aRef }) {
  const cvRef = useRef(null), rafRef = useRef(null);
  const W = 140, H = 40, N = 30;
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'), bw = (W / N) - 1;
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, W, H);
      const a = aRef.current;
      if (a) {
        const data = new Uint8Array(a.frequencyBinCount); a.getByteFrequencyData(data);
        const step = Math.floor(data.length / N);
        for (let i = 0; i < N; i++) { const v = data[i * step] / 255, h = Math.max(3, v * H); ctx.fillStyle = `rgba(33,150,243,${0.35 + v * 0.65})`; rRect(ctx, i * (bw + 1), (H - h) / 2, bw, h, 2); }
      } else {
        const t = Date.now() / 500;
        for (let i = 0; i < N; i++) { const h = 3 + 7 * Math.abs(Math.sin(t + i * 0.4)); ctx.fillStyle = 'rgba(33,150,243,0.4)'; rRect(ctx, i * (bw + 1), (H - h) / 2, bw, h, 2); }
      }
    };
    tick(); return () => cancelAnimationFrame(rafRef.current);
  }, [aRef]);
  return <canvas ref={cvRef} width={W} height={H} className="block" />;
}

/* ─── Bubble ─────────────────────────────────────────────────────────────────── */
function Bubble({ msg, own, showAv, showName, isLast, isDm }) {
  const isRead = own && (msg.readers?.length ?? 0) > 0;
  const t = fmtTime(msg.created_at);
  const tailCls = isLast ? (own ? 'rounded-br-[4px]' : 'rounded-bl-[4px]') : '';
  const isVid = msg.media_type === 'video_note';

  const meta = (
    <span className={`inline-flex shrink-0 items-center gap-0.5 ${isVid ? 'rounded-full bg-black/30 px-1.5 py-0.5' : ''}`}>
      <span className={`text-[10px] leading-none tabular-nums ${isVid ? 'text-white' : own ? 'text-emerald-800/60' : 'text-slate-400'}`}>{t}</span>
      {own && <span className={isVid ? 'text-white/80' : 'text-emerald-700/70'}>{isRead ? <DoubleCheck /> : <SingleCheck />}</span>}
    </span>
  );

  return (
    <div className={`flex items-end gap-1.5 ${own ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="w-8 shrink-0">
        {!own && showAv && (msg.author_avatar_url
          ? <img src={msg.author_avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          : <div className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${nameCol(msg.user_id)}, ${nameCol(msg.user_id + 2)})` }}>
              {initials(msg.author_name)}
            </div>
        )}
      </div>
      <div className={`flex max-w-[72%] flex-col ${own ? 'items-end' : 'items-start'}`}>
        {!own && showName && (
          <span className="mb-0.5 ml-1 text-[11px] font-semibold" style={{ color: nameCol(msg.user_id) }}>{msg.author_name}</span>
        )}
        <div className={`relative shadow-[0_1px_2px_rgba(0,0,0,0.13)] ${tailCls} ${isVid ? '' : `rounded-2xl px-3 py-2 ${own ? 'bg-[#effdde]' : 'bg-white'}`}`}>
          {msg.media_type === 'text' && msg.text && (
            <div><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">{msg.text}</p><div className="mt-0.5 flex justify-end">{meta}</div></div>
          )}
          {msg.media_type === 'image' && msg.media_url && (
            <div>
              <a href={msg.media_url} target="_blank" rel="noreferrer" className="block -mx-3 -mt-2 overflow-hidden rounded-2xl">
                <img src={msg.media_url} alt="Фото" className="w-full object-cover" style={{ maxHeight: 320 }} />
              </a>
              {msg.text && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{msg.text}</p>}
              <div className="mt-0.5 flex justify-end">{meta}</div>
            </div>
          )}
          {msg.media_type === 'audio_note' && msg.media_url && (
            <div><AudioPlayer src={msg.media_url} msgId={msg.id} own={own} /><div className="mt-0.5 flex justify-end">{meta}</div></div>
          )}
          {isVid && msg.media_url && (
            <div className="relative"><VideoNote src={msg.media_url} /><div className="absolute bottom-2 right-2">{meta}</div></div>
          )}
          {msg.media_type === 'file' && msg.media_url && (
            <div>
              <a href={msg.media_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2.5 rounded-xl transition hover:opacity-80" style={{ minWidth: 200 }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: own ? '#45a849' : '#2196F3' }}><IconFile /></span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{msg.media_name || 'Открыть файл'}</span>
                  <span className="text-[11px] text-slate-500">{msg.media_mime || 'Файл'} · {fmtSize(msg.media_size)}</span>
                </span>
              </a>
              {msg.text && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{msg.text}</p>}
              <div className="mt-0.5 flex justify-end">{meta}</div>
            </div>
          )}
        </div>
        {own && !isDm && msg.readers?.length > 0 && (
          <p className="mt-0.5 pr-1 text-right text-[10px] text-slate-400 dark:text-slate-500">
            {readerLabel(msg.readers)}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── DateSep ────────────────────────────────────────────────────────────────── */
function DateSep({ iso }) {
  return (
    <div className="flex items-center justify-center py-3">
      <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-medium text-white shadow backdrop-blur-sm">{fmtDate(iso)}</span>
    </div>
  );
}

/* ─── UnreadBadge ────────────────────────────────────────────────────────────── */
function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span className="ml-1 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#2196F3] px-1.5 text-[11px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────────── */
export default function TeamChatPanel({
  user,
  chatUsers,
  activeDmId,
  dmOtherUser,
  activeRoomId,
  activeRoom,
  onOpenGeneral,
  onSetActiveRoom,
  onGeneralUnread,
  onDmSent,
  onRoomSent,
  onRoomListRefresh,
  onOpenMenu,
}) {
  /* ── Core state ─────────────────────────────────────────────────────────── */
  const [messages,   setMessages]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [text,       setText]       = useState('');
  const [sending,    setSending]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [error,      setError]      = useState('');
  const [newMsgBadge, setNewMsgBadge] = useState(false);

  /* ── Room management state ──────────────────────────────────────────────── */
  const [showManageRoom,   setShowManageRoom]   = useState(false);
  const [roomDetails,      setRoomDetails]      = useState(null);
  const [manageLoading,    setManageLoading]    = useState(false);
  const [addMemberUserId,  setAddMemberUserId]  = useState('');

  /* ── Recording ──────────────────────────────────────────────────────────── */
  const [recMode,  setRecMode]  = useState('audio');
  const [isRec,    setIsRec]    = useState(false);
  const [recSecs,  setRecSecs]  = useState(0);
  const [swipeOff, setSwipeOff] = useState(0);

  /* ── Mention ────────────────────────────────────────────────────────────── */
  const [mentOpen,  setMentOpen]  = useState(false);
  const [mentQuery, setMentQuery] = useState('');
  const [mentStart, setMentStart] = useState(0);
  const [mentIdx,   setMentIdx]   = useState(0);

  /* ── Refs ───────────────────────────────────────────────────────────────── */
  const taRef        = useRef(null);
  const fileRef      = useRef(null);
  const galleryRef   = useRef(null);
  const cameraRef    = useRef(null);
  const endRef       = useRef(null);
  const listRef      = useRef(null);
  const atBottomRef  = useRef(true);
  const lastMsgIdRef = useRef(0);
  const pendingFilesRef = useRef([]);
  const recorderRef  = useRef(null);
  const chunksRef    = useRef([]);
  const streamRef    = useRef(null);
  const analyserRef  = useRef(null);
  const acRef        = useRef(null);
  const stopTmRef    = useRef(null);
  const recTmRef     = useRef(null);
  const cancelRef    = useRef(false);
  const pStartXRef   = useRef(0);
  const vidPrevRef   = useRef(null);
  const manageNameRef = useRef(null);

  /* ── Scroll ─────────────────────────────────────────────────────────────── */
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    endRef.current?.scrollIntoView({ behavior });
    atBottomRef.current = true;
    setNewMsgBadge(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = listRef.current; if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (atBottomRef.current) setNewMsgBadge(false);
  }, []);

  /* ── Fetch messages (mode-aware) ────────────────────────────────────────── */
  const fetchMessages = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const url = activeDmId
        ? `/api/direct-chats/${activeDmId}/messages`
        : activeRoomId
        ? `/api/rooms/${activeRoomId}/messages`
        : '/api/chat/messages';
      const res = await fetch(url);
      if (res.status === 401) { window.location.href = '/admin/login'; return; }
      const data = await res.json();
      if (data.ok) {
        setMessages(data.messages);
        if (!activeDmId && !activeRoomId) onGeneralUnread?.(data.unread_count || 0);
        const lid = data.messages.at(-1)?.id;
        if (lid) {
          const readUrl = activeDmId
            ? `/api/direct-chats/${activeDmId}/read`
            : activeRoomId
            ? `/api/rooms/${activeRoomId}/read`
            : '/api/chat/read';
          fetch(readUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ last_read_message_id: lid }),
          }).catch(console.error);
          if (!activeDmId && !activeRoomId) onGeneralUnread?.(0);
        }
        setError('');
      }
    } catch {
      if (!silent) setError('Не удалось загрузить чат');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeDmId, activeRoomId, onGeneralUnread]);

  useEffect(() => {
    setMessages([]); setLoading(true); lastMsgIdRef.current = 0;
    atBottomRef.current = true; setNewMsgBadge(false);
    fetchMessages();
    const pollId = setInterval(() => fetchMessages({ silent: true }), POLL_MS);
    let source = null;
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      const streamUrl = activeDmId
        ? `/api/direct-chats/${activeDmId}/stream?after=${lastMsgIdRef.current || 0}`
        : activeRoomId
        ? `/api/rooms/${activeRoomId}/stream?after=${lastMsgIdRef.current || 0}`
        : `/api/chat/stream?after=${lastMsgIdRef.current || 0}`;
      source = new EventSource(streamUrl);
      source.addEventListener('changed', () => fetchMessages({ silent: true }));
      source.onerror = () => {
        source?.close();
        source = null;
      };
    }
    return () => {
      clearInterval(pollId);
      source?.close();
    };
  }, [fetchMessages, activeDmId, activeRoomId]);

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
    clearTimeout(stopTmRef.current); clearInterval(recTmRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    acRef.current?.close();
  }, []);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => () => {
    pendingFilesRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  /* ── Room management ────────────────────────────────────────────────────── */
  const openManageRoom = async () => {
    setManageLoading(true); setShowManageRoom(true); setAddMemberUserId('');
    try {
      const res = await fetch(`/api/rooms/${activeRoomId}`);
      const data = await res.json();
      if (data.ok) setRoomDetails(data.room);
    } catch {}
    finally { setManageLoading(false); }
  };

  const handleRenameRoom = async () => {
    const name = manageNameRef.current?.value?.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/rooms/${activeRoomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.ok) {
        onSetActiveRoom?.((r) => ({ ...r, name }));
        setRoomDetails((d) => ({ ...d, name }));
        onRoomListRefresh?.();
      }
    } catch {}
  };

  const handleRemoveMember = async (targetUserId) => {
    try {
      const res = await fetch(`/api/rooms/${activeRoomId}/members/${targetUserId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        if (targetUserId === user.id) {
          setShowManageRoom(false); onOpenGeneral?.(); onRoomListRefresh?.();
        } else {
          setRoomDetails((d) => ({ ...d, members: (d.members || []).filter((m) => m.user_id !== targetUserId) }));
          onSetActiveRoom?.((r) => ({ ...r, member_count: (r.member_count || 1) - 1 }));
          onRoomListRefresh?.();
        }
      } else if (data.message) {
        alert(data.message);
      }
    } catch {}
  };

  const handleAddMember = async () => {
    if (!addMemberUserId) return;
    try {
      const res = await fetch(`/api/rooms/${activeRoomId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: [Number(addMemberUserId)] }),
      });
      const data = await res.json();
      if (data.ok) {
        setAddMemberUserId('');
        const res2 = await fetch(`/api/rooms/${activeRoomId}`);
        const d2 = await res2.json();
        if (d2.ok) { setRoomDetails(d2.room); onSetActiveRoom?.((r) => ({ ...r, member_count: d2.room.member_count })); }
        onRoomListRefresh?.();
      }
    } catch {}
  };

  const handleDeleteRoom = async () => {
    if (!confirm(`Удалить канал "${activeRoom?.name}"? Это нельзя отменить.`)) return;
    try {
      const res = await fetch(`/api/rooms/${activeRoomId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { setShowManageRoom(false); onOpenGeneral?.(); onRoomListRefresh?.(); }
    } catch {}
  };

  /* ── Mention ─────────────────────────────────────────────────────────────── */
  const mentUsers = useMemo(() => {
    const q = mentQuery.trim().toLowerCase();
    return chatUsers.filter((u) => !q || u.username?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q)).slice(0, 6);
  }, [chatUsers, mentQuery]);

  const closeMent = () => { setMentOpen(false); setMentQuery(''); setMentIdx(0); };
  const refreshMent = (val, cur) => {
    const m = getMention(val, cur);
    if (!m || !chatUsers.length) { closeMent(); return; }
    setMentOpen(true); setMentQuery(m.query); setMentStart(m.start); setMentIdx(0);
  };
  const pickMent = (u) => {
    const cur = taRef.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, mentStart)}@${u.username} ${text.slice(cur)}`;
    setText(next); closeMent();
    requestAnimationFrame(() => {
      const pos = mentStart + u.username.length + 2;
      taRef.current?.focus(); taRef.current?.setSelectionRange(pos, pos);
    });
  };

  /* ── Send / Upload ───────────────────────────────────────────────────────── */
  const append = (msg) => { atBottomRef.current = true; setMessages((p) => [...p, msg]); };

  const sendText = async () => {
    const v = text.trim(); if (!v || sending) return;
    setSending(true); closeMent();
    const url = activeDmId ? `/api/direct-chats/${activeDmId}/messages`
      : activeRoomId ? `/api/rooms/${activeRoomId}/messages`
      : '/api/chat/messages';
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: v }) });
      const data = await res.json();
      if (!data.ok) { setError(data.message || 'Ошибка отправки'); return; }
      append(data.message); setText('');
      if (taRef.current) taRef.current.style.height = '36px';
      if (activeDmId) onDmSent?.();
      if (activeRoomId) onRoomSent?.();
    } catch { setError('Ошибка отправки'); }
    finally { setSending(false); }
  };

  const uploadMedia = async (file, type, caption = '') => {
    setUploading(true);
    const url = activeDmId ? `/api/direct-chats/${activeDmId}/upload`
      : activeRoomId ? `/api/rooms/${activeRoomId}/upload`
      : '/api/chat/upload';
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', type);
      if (caption) fd.append('text', caption);
      const res = await fetch(url, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.ok) { setError(data.message || 'Ошибка загрузки'); return false; }
      append(data.message);
      if (activeDmId) onDmSent?.();
      if (activeRoomId) onRoomSent?.();
      return true;
    } catch {
      setError('Ошибка загрузки');
      return false;
    }
    finally {
      setUploading(false);
      [fileRef, galleryRef, cameraRef].forEach((ref) => {
        if (ref.current) ref.current.value = '';
      });
    }
  };

  const onFiles = (files, forcedType = null) => {
    setAttachOpen(false);
    const next = Array.from(files || []).map((f) => {
      const type = forcedType || (f.type?.startsWith('image/') ? 'image' : 'file');
      return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file: f,
        type,
        name: f.name || (type === 'image' ? 'photo' : 'file'),
        size: f.size,
        previewUrl: type === 'image' ? URL.createObjectURL(f) : '',
      };
    });
    if (next.length) setPendingFiles((prev) => [...prev, ...next]);
    [fileRef, galleryRef, cameraRef].forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
  };

  const removePendingFile = (id) => {
    setPendingFiles((prev) => prev.filter((item) => {
      if (item.id !== id) return true;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return false;
    }));
  };

  const sendPendingFiles = async () => {
    if (uploading || pendingFiles.length === 0) return;
    const sentIds = new Set();
    const caption = text.trim();
    closeMent();
    for (let i = 0; i < pendingFiles.length; i += 1) {
      const item = pendingFiles[i];
      const ok = await uploadMedia(item.file, item.type, i === 0 ? caption : '');
      if (!ok) break;
      sentIds.add(item.id);
    }
    if (sentIds.size > 0) {
      setPendingFiles((prev) => prev.filter((item) => {
        if (!sentIds.has(item.id)) return true;
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        return false;
      }));
      if (sentIds.size === pendingFiles.length && caption) {
        setText('');
        if (taRef.current) taRef.current.style.height = '36px';
      }
    }
  };

  /* ── Recording ───────────────────────────────────────────────────────────── */
  const stopRec = (cancel = false) => {
    clearTimeout(stopTmRef.current); clearInterval(recTmRef.current);
    cancelRef.current = cancel;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    } else {
      setIsRec(false);
      streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
      if (vidPrevRef.current) vidPrevRef.current.srcObject = null;
      acRef.current?.close(); acRef.current = null; analyserRef.current = null;
    }
    setSwipeOff(0);
  };

  const startRec = async () => {
    if (isRec) return;
    const isAudio = recMode === 'audio', type = isAudio ? 'audio_note' : 'video_note';
    try {
      const constraints = isAudio ? { audio: true } : { video: { facingMode: 'user', width: 300, height: 300 }, audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const mime = pickMime(recMode);
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      if (isAudio) {
        try {
          const ac = new AudioContext(); acRef.current = ac;
          const src = ac.createMediaStreamSource(stream);
          const an = ac.createAnalyser(); an.fftSize = 256; src.connect(an); analyserRef.current = an;
        } catch {}
      }
      if (!isAudio && vidPrevRef.current) { vidPrevRef.current.srcObject = stream; vidPrevRef.current.play().catch(console.error); }
      streamRef.current = stream; recorderRef.current = rec; chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        setIsRec(false); stream.getTracks().forEach((t) => t.stop());
        if (vidPrevRef.current) vidPrevRef.current.srcObject = null;
        acRef.current?.close(); acRef.current = null; analyserRef.current = null;
        if (cancelRef.current) { cancelRef.current = false; return; }
        const fallback = isAudio ? 'audio/webm' : 'video/webm';
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || fallback });
        if (blob.size === 0) return;
        const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `${isAudio ? 'voice' : 'vidnote'}-${Date.now()}.${ext}`, { type: blob.type });
        await uploadMedia(file, type);
      };
      rec.start(); setIsRec(true); setRecSecs(0);
      recTmRef.current  = setInterval(() => setRecSecs((s) => s + 1), 1000);
      stopTmRef.current = setTimeout(() => stopRec(false), isAudio ? MAX_AUDIO_MS : MAX_VIDEO_MS);
    } catch { alert(isAudio ? 'Нет доступа к микрофону.' : 'Нет доступа к камере/микрофону.'); }
  };

  const onPtrDown = (e) => { e.currentTarget.setPointerCapture(e.pointerId); pStartXRef.current = e.clientX; setSwipeOff(0); startRec(); };
  const onPtrMove = (e) => { if (!isRec) return; setSwipeOff(Math.min(0, e.clientX - pStartXRef.current)); };
  const onPtrUp   = (e) => { if (!isRec) return; stopRec(e.clientX - pStartXRef.current < -SWIPE_CANCEL_PX); };

  /* ── Text input ──────────────────────────────────────────────────────────── */
  const onTAChange = (e) => {
    setText(e.target.value);
    refreshMent(e.target.value, e.target.selectionStart ?? e.target.value.length);
    const ta = e.target; ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  };
  const onTAKey = (e) => {
    if (mentOpen && mentUsers.length > 0) {
      if (e.key === 'ArrowDown')                { e.preventDefault(); setMentIdx((i) => (i + 1) % mentUsers.length); return; }
      if (e.key === 'ArrowUp')                  { e.preventDefault(); setMentIdx((i) => (i - 1 + mentUsers.length) % mentUsers.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMent(mentUsers[mentIdx] || mentUsers[0]); return; }
      if (e.key === 'Escape')                   { e.preventDefault(); closeMent(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  };

  const isCancelZone = swipeOff < -SWIPE_CANCEL_PX;
  const hasText      = text.trim().length > 0;
  const hasPendingFiles = pendingFiles.length > 0;

  /* ── Derived data ────────────────────────────────────────────────────────── */
  const nonMemberUsers = useMemo(() => {
    if (!roomDetails) return [];
    const memberSet = new Set((roomDetails.members || []).map((m) => m.user_id));
    return chatUsers.filter((u) => u.id !== user.id && !memberSet.has(u.id));
  }, [chatUsers, roomDetails, user.id]);

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <section className="fixed top-0 left-0 right-0 h-dvh z-20 flex flex-col overflow-hidden bg-[#f0f2f5] dark:bg-gray-900 md:left-72">

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/50 bg-white/90 px-3 py-3 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/95">
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-100 dark:hover:bg-gray-700 md:hidden"
            aria-label="Открыть меню"
          >
            <IconMenu />
          </button>

          {activeDmId ? (
            <>
              {dmOtherUser?.avatar_url
                ? <img src={dmOtherUser.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow"
                    style={{ background: `linear-gradient(135deg, ${nameCol(dmOtherUser?.id)}, ${nameCol((dmOtherUser?.id || 0) + 2)})` }}>
                    {initials(dmOtherUser?.name)}
                  </div>
              }
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{dmOtherUser?.name}</h2>
                <p className="text-[11px] text-slate-400">{dmOtherUser?.role === 'admin' ? 'Администратор' : 'Сотрудник'} · личный чат</p>
              </div>
            </>
          ) : activeRoomId ? (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow"
                style={{ background: `linear-gradient(135deg, ${nameCol(activeRoomId + 5)}, ${nameCol(activeRoomId + 8)})` }}>
                {(activeRoom?.name || '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{activeRoom?.name}</h2>
                <p className="text-[11px] text-slate-400">{activeRoom?.member_count || '?'} участников</p>
              </div>
              <button onClick={openManageRoom}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-700"
                title="Настройки канала">
                <IconSettings />
              </button>
            </>
          ) : (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow"
                style={{ background: 'linear-gradient(135deg, #2196F3, #00BCD4)' }}>CRM</div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Общий чат</h2>
                <p className="text-[11px] text-slate-400">{chatUsers.length} участников · вы как {user.name}</p>
              </div>
            </>
          )}
        </div>

        {/* Messages */}
        <div className="relative flex-1 overflow-hidden">
          <div ref={listRef} onScroll={handleScroll} className="h-full overflow-y-auto pb-2">
            {loading ? (
              <div className="flex justify-center py-20">
                <span className="rounded-full bg-black/20 px-4 py-1.5 text-sm text-white backdrop-blur-sm">Загрузка...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex justify-center py-20">
                <span className="rounded-full bg-black/20 px-4 py-1.5 text-sm text-white backdrop-blur-sm">
                  {activeDmId ? 'Начните переписку' : activeRoomId ? 'Нет сообщений в канале' : 'Нет сообщений'}
                </span>
              </div>
            ) : (
              messages.map((msg, i) => {
                const own = msg.user_id === user.id;
                const first = !sameGroup(messages, i);
                const isLastGroup = i === messages.length - 1 || !sameGroup(messages, i + 1);
                return (
                  <div key={msg.id}>
                    {newDay(messages, i) && <DateSep iso={msg.created_at} />}
                    <div className={`px-3 ${sameGroup(messages, i) ? 'mt-0.5' : 'mt-3'}`}>
                      <Bubble msg={msg} own={own}
                        showAv={!own && isLastGroup}
                        showName={!own && first && !activeDmId}
                        isLast={isLastGroup}
                        isDm={!!activeDmId} />
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>
          {newMsgBadge && (
            <button onClick={() => scrollToBottom('smooth')}
              className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#2196F3] px-4 py-1.5 text-sm font-medium text-white shadow-lg transition hover:bg-[#1976D2]">
              ↓ Новые сообщения
            </button>
          )}
        </div>

        {/* Input area */}
        <div className="relative z-10 shrink-0 border-t border-white/40 bg-[#f0f4f7] px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
          {error && <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className={`mb-3 flex justify-center ${isRec && recMode === 'video' ? '' : 'hidden'}`}>
            <div className="overflow-hidden rounded-full border-4 border-[#2196F3] shadow-xl" style={{ width: 120, height: 120 }}>
              <video ref={vidPrevRef} playsInline muted className="h-full w-full rounded-full object-cover" />
            </div>
          </div>

          {mentOpen && mentUsers.length > 0 && !isRec && (
            <div className="absolute bottom-full left-3 z-20 mb-1 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Упомянуть</div>
              {mentUsers.map((u, idx) => (
                <button key={u.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickMent(u); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${idx === mentIdx ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  {u.avatar_url
                    ? <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">{initials(u.name)}</span>
                  }
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">@{u.username}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {hasPendingFiles && !isRec && (
            <div className="mb-3 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm dark:border-gray-700 dark:bg-gray-900/95">
              {pendingFiles.map((item) => (
                <div key={item.id} className="relative flex w-40 shrink-0 items-center gap-2 rounded-xl bg-slate-50 p-2 dark:bg-gray-800">
                  {item.type === 'image' && item.previewUrl ? (
                    <img src={item.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><IconFile /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-700 dark:text-slate-100">{item.name}</span>
                    <span className="block text-[11px] text-slate-400">{fmtSize(item.size)}</span>
                  </span>
                  <button type="button" onClick={() => removePendingFile(item.id)}
                    className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-md transition hover:bg-red-500"
                    aria-label="Убрать файл">
                    <IconX />
                  </button>
                </div>
              ))}
            </div>
          )}

          {attachOpen && !isRec && (
            <div className="absolute bottom-[76px] left-3 z-30 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
              <button type="button" onClick={() => galleryRef.current?.click()}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-gray-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-600"><IconPhoto /></span>
                <span>
                  <span className="block font-medium">Фото из галереи</span>
                  <span className="block text-xs text-slate-400">На телефоне откроется галерея</span>
                </span>
              </button>
              <button type="button" onClick={() => cameraRef.current?.click()}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-gray-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><IconCamera /></span>
                <span>
                  <span className="block font-medium">Сделать фото</span>
                  <span className="block text-xs text-slate-400">Камера на мобильном</span>
                </span>
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-gray-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-600"><IconFile /></span>
                <span>
                  <span className="block font-medium">Файл</span>
                  <span className="block text-xs text-slate-400">PDF, DOCX, XLSX, ZIP</span>
                </span>
              </button>
            </div>
          )}

          {isRec ? (
            <div className={`flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors ${isCancelZone ? 'bg-red-50' : 'bg-white'}`}>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
                style={{ transform: `translateX(${swipeOff * 0.4}px)`, opacity: isCancelZone ? 0.45 : 1, transition: 'opacity 0.15s' }}>
                <span className={`transition-colors ${isCancelZone ? 'text-red-500' : 'text-slate-400'}`}><IconChevL /></span>
                <span className={`truncate text-sm transition-colors ${isCancelZone ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                  {isCancelZone ? 'Отпустите для отмены' : 'Свайп влево — отмена'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {recMode === 'audio' && <LiveWave analyserRef={analyserRef} />}
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="min-w-[36px] text-sm font-medium tabular-nums text-slate-700">{fmtSecs(recSecs)}</span>
              </div>
              <button onPointerMove={onPtrMove} onPointerUp={onPtrUp} onPointerCancel={() => stopRec(true)}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-md transition-all ${isCancelZone ? 'scale-90 bg-red-500 text-white' : 'scale-125 bg-[#2196F3] text-white'}`}
                style={{ touchAction: 'none' }}>
                {recMode === 'audio' ? <IconMic /> : <IconVideo />}
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => setAttachOpen((v) => !v)} disabled={uploading}
                className={`mb-[3px] flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm transition disabled:opacity-40 ${attachOpen ? 'bg-[#2196F3] text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}`} aria-label="Прикрепить">
                <IconClip />
              </button>
              <textarea ref={taRef} value={text} onChange={onTAChange} onKeyDown={onTAKey}
                onPaste={(e) => { const files = e.clipboardData?.files; if (!files?.length) return; e.preventDefault(); onFiles(files); }}
                onClick={(e) => { setAttachOpen(false); refreshMent(e.currentTarget.value, e.currentTarget.selectionStart ?? text.length); }}
                onFocus={() => { setTimeout(() => scrollToBottom('smooth'), 300); }}
                placeholder={activeDmId ? `Сообщение для ${dmOtherUser?.name || ''}…` : activeRoomId ? `Сообщение в ${activeRoom?.name || 'канал'}…` : 'Сообщение...'}
                rows={1} style={{ minHeight: 36, maxHeight: 120, overflowY: 'auto', fontSize: 16 }}
                className="flex-1 resize-none rounded-2xl bg-white px-3.5 py-2 shadow-sm ring-1 ring-slate-200/80 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <div className="mb-[3px] flex shrink-0 items-center gap-1">
                {!hasText && !hasPendingFiles && (
                  <button type="button" onClick={() => setRecMode((m) => m === 'audio' ? 'video' : 'audio')}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100"
                    title={recMode === 'audio' ? 'Режим видео-круга' : 'Режим голосового'}>
                    {recMode === 'audio' ? <IconVideo /> : <IconMic />}
                  </button>
                )}
                {hasText || hasPendingFiles ? (
                  <button type="button" onClick={hasPendingFiles ? sendPendingFiles : sendText} disabled={sending || uploading}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2196F3] text-white shadow-md transition hover:bg-[#1E88E5] disabled:opacity-40" aria-label="Отправить">
                    <IconSend />
                  </button>
                ) : (
                  <button disabled={uploading} onPointerDown={onPtrDown} onPointerMove={onPtrMove} onPointerUp={onPtrUp} onPointerCancel={() => stopRec(true)}
                    className="flex h-10 w-10 select-none items-center justify-center rounded-full bg-[#2196F3] text-white shadow-md transition hover:bg-[#1E88E5] disabled:opacity-40"
                    style={{ touchAction: 'none' }} aria-label={recMode === 'audio' ? 'Зажать — голосовое' : 'Зажать — видео-круг'}>
                    {recMode === 'audio' ? <IconMic /> : <IconVideo />}
                  </button>
                )}
              </div>
            </div>
          )}

          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files, 'image')} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files, 'image')} />
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files, 'file')} />
          {!isRec && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Enter — отправить · Shift+Enter — строка · @ — упомянуть · зажать {recMode === 'audio' ? '🎤' : '🎥'} — записать
            </p>
          )}
        </div>

      {/* ── Manage room modal ───────────────────────────────────────────────── */}
      {showManageRoom && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-80 overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-gray-700">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Настройки канала</h3>
              <button onClick={() => setShowManageRoom(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
            </div>
            {manageLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">Загрузка...</div>
            ) : roomDetails ? (
              <div className="max-h-[65vh] overflow-y-auto">
                {/* Rename (admin only) */}
                {activeRoom?.my_role === 'admin' && (
                  <div className="border-b border-slate-100 p-4 dark:border-gray-700">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Название</label>
                    <div className="flex gap-2">
                      <input type="text" ref={manageNameRef} defaultValue={roomDetails.name}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-slate-100" />
                      <button onClick={handleRenameRoom}
                        className="rounded-xl bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-gray-700 dark:text-slate-200 dark:hover:bg-gray-600">
                        Сохранить
                      </button>
                    </div>
                  </div>
                )}

                {/* Members list */}
                <div className="p-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Участники ({(roomDetails.members || []).length})
                  </div>
                  <div className="space-y-1">
                    {(roomDetails.members || []).map((member) => (
                      <div key={member.user_id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                        {member.avatar_url
                          ? <img src={member.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                          : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ background: nameCol(member.user_id) }}>{initials(member.name)}</div>
                        }
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{member.name}</span>
                          <span className="text-[11px] text-slate-400">{member.role === 'admin' ? 'Администратор' : 'Участник'}</span>
                        </div>
                        {member.user_id === user.id
                          ? <span className="text-[10px] text-slate-400">вы</span>
                          : activeRoom?.my_role === 'admin' && (
                            <button onClick={() => handleRemoveMember(member.user_id)}
                              className="rounded-lg px-2 py-1 text-[11px] text-red-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
                              Удалить
                            </button>
                          )
                        }
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add member (admin only) */}
                {activeRoom?.my_role === 'admin' && nonMemberUsers.length > 0 && (
                  <div className="border-t border-slate-100 p-4 dark:border-gray-700">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Добавить участника</div>
                    <div className="flex gap-2">
                      <select value={addMemberUserId} onChange={(e) => setAddMemberUserId(e.target.value)}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-slate-200">
                        <option value="">Выбрать...</option>
                        {nonMemberUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <button onClick={handleAddMember} disabled={!addMemberUserId}
                        className="rounded-xl bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 transition hover:bg-blue-100 disabled:opacity-40 dark:bg-blue-900/30 dark:text-blue-400">
                        Добавить
                      </button>
                    </div>
                  </div>
                )}

                {/* Leave / Delete */}
                <div className="space-y-2 border-t border-slate-100 p-4 dark:border-gray-700">
                  {activeRoom?.my_role !== 'admin' && (
                    <button onClick={() => handleRemoveMember(user.id)}
                      className="w-full rounded-xl border border-red-200 py-2 text-sm font-medium text-red-500 transition hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30">
                      Покинуть канал
                    </button>
                  )}
                  {activeRoom?.my_role === 'admin' && (
                    <button onClick={handleDeleteRoom}
                      className="w-full rounded-xl bg-red-500 py-2 text-sm font-medium text-white transition hover:bg-red-600">
                      Удалить канал
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
