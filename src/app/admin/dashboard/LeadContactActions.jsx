'use client';

function normalizePhoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function phoneHref(phone) {
  const digits = normalizePhoneDigits(phone);
  return digits ? `tel:+${digits}` : '';
}

function telegramHandleFromMessage(message) {
  const text = String(message || '');
  const link = text.match(/t\.me\/([a-zA-Z0-9_]{3,})/i);
  if (link?.[1]) return link[1];
  const handle = text.match(/Telegram:\s*@?([a-zA-Z0-9_]{3,})/i);
  return handle?.[1] || '';
}

function telegramHref(message) {
  const handle = telegramHandleFromMessage(message);
  return handle ? `https://t.me/${handle}` : '';
}

export default function LeadContactActions({ lead, compact = false }) {
  const tel = phoneHref(lead.phone);
  const tg = telegramHref(lead.message);
  const buttonClass = compact
    ? 'crm-focus-ring inline-flex min-h-9 items-center justify-center rounded-crmLg border border-crm-border bg-crm-surface/35 px-2.5 text-xs font-medium text-crm-text transition hover:border-crm-accent/35 hover:bg-crm-accent/10 hover:text-crm-accent'
    : 'crm-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-crmLg border border-crm-border bg-crm-surface/40 px-3 py-2 text-sm font-medium text-crm-text transition hover:border-crm-accent/35 hover:bg-crm-accent/10 hover:text-crm-accent';

  if (!tel && !tg) {
    return compact ? <span className="text-crm-muted">—</span> : null;
  }

  return (
    <div className={`flex min-w-0 max-w-full flex-wrap gap-2 overflow-hidden ${compact ? '' : 'mb-3'}`}>
      {tel && (
        <a href={tel} className={`${buttonClass} min-w-0 max-w-full`} onClick={(event) => event.stopPropagation()}>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3 5.18 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L9 10.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <span className="min-w-0 truncate">{compact ? 'Звонок' : lead.phone}</span>
        </a>
      )}
      {tg && (
        <a href={tg} target="_blank" rel="noreferrer" className={`${buttonClass} min-w-0 max-w-full`} onClick={(event) => event.stopPropagation()}>
          TG
        </a>
      )}
    </div>
  );
}
