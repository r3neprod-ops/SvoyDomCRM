'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const inputClass =
  'crm-focus-ring crm-input-surface h-12 w-full rounded-[1.35rem] px-4 text-sm text-crm-text placeholder:text-crm-muted outline-none transition focus:border-crm-accent/50';
const textareaClass =
  'crm-focus-ring crm-input-surface min-h-24 w-full rounded-[1.35rem] px-4 py-3 text-sm text-crm-text placeholder:text-crm-muted outline-none transition focus:border-crm-accent/50';

async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: text.slice(0, 400) };
  }
}

export default function CompanyClient() {
  const router = useRouter();
  const [company, setCompany] = useState(null);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  const [form, setForm] = useState({ name: '', public_id: '', website_url: '', description: '' });
  const endpoint = useMemo(() => 'https://24crmka.ru/api/lead', []);
  const quickStats = useMemo(() => ([
    { label: 'Сотрудники', value: members.length, hint: 'в команде' },
    { label: 'Заявки', value: requests.length, hint: 'на вступление' },
    { label: 'Сайт', value: company?.website_url ? 'OK' : '-', hint: company?.website_url || 'не указан' },
    { label: 'ID', value: company?.public_id || '-', hint: 'для поиска компании' },
  ]), [company?.public_id, company?.website_url, members.length, requests.length]);

  const loadCompany = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/company', { cache: 'no-store' });
      const data = await readJson(res);
      if (res.status === 428) {
        router.push('/admin/onboarding');
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.message || 'Не удалось загрузить компанию');
        return;
      }
      setCompany(data.company);
      setMembers(data.members || []);
      setRequests(data.requests || []);
      setCanManage(Boolean(data.canManage));
      setForm({
        name: data.company?.name || '',
        public_id: data.company?.public_id || '',
        website_url: data.company?.website_url || '',
        description: data.company?.description || '',
      });
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить компанию');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompany();
  }, []);

  const saveCompany = async (rotate = false) => {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const res = await fetch('/api/company', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, rotate_lead_token: rotate }),
      });
      const data = await readJson(res);
      if (!res.ok || !data.ok) {
        setError(data.message || 'Не удалось сохранить компанию');
        return;
      }
      setCompany(data.company);
      setForm({
        name: data.company.name || '',
        public_id: data.company.public_id || '',
        website_url: data.company.website_url || '',
        description: data.company.description || '',
      });
      setSaved(rotate ? 'Ключ приема лидов обновлен' : 'Компания сохранена');
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить компанию');
    } finally {
      setSaving(false);
    }
  };

  const processRequest = async (requestId, action) => {
    setError('');
    try {
      const res = await fetch(`/api/company/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, role: 'agent' }),
      });
      const data = await readJson(res);
      if (!res.ok || !data.ok) {
        setError(data.message || 'Не удалось обработать заявку');
        return;
      }
      await loadCompany();
    } catch (err) {
      setError(err?.message || 'Не удалось обработать заявку');
    }
  };

  const sendInvite = async (event) => {
    event.preventDefault();
    setInviteLoading(true);
    setError('');
    setSaved('');
    try {
      const res = await fetch('/api/company/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: inviteUsername }),
      });
      const data = await readJson(res);
      if (!res.ok || !data.ok) {
        setError(data.message || 'Не удалось отправить приглашение');
        return;
      }
      setInviteUsername('');
      setSaved('Приглашение отправлено');
    } catch (err) {
      setError(err?.message || 'Не удалось отправить приглашение');
    } finally {
      setInviteLoading(false);
    }
  };

  const copyIntegration = async () => {
    const snippet = `fetch('${endpoint}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-crm-company-key': '${company?.lead_token || ''}'
  },
  body: JSON.stringify({
    name: 'Имя клиента',
    phone: '+7 999 000-00-00',
    privacyConsent: true,
    answers: {}
  })
});`;
    await navigator.clipboard?.writeText(snippet);
    setSaved('Код подключения скопирован');
  };

  return (
    <main className="crm-app-bg min-h-screen px-4 py-6 text-crm-text sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="crm-premium-panel overflow-hidden rounded-[2rem] border border-crm-border p-5 shadow-crmCard sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-crm-accent">Компания</p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight crm-gradient-text sm:text-4xl">{company?.name || 'Настройки компании'}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-crm-muted">Профиль компании, участники, заявки и безопасный ключ приема лидов в одном месте.</p>
            </div>
            <button onClick={() => router.push('/admin/dashboard')} className="crm-focus-ring inline-flex h-12 items-center justify-center rounded-[1.35rem] bg-gradient-to-r from-crm-accent via-[var(--crm-accent-soft)] to-[var(--crm-accent-strong)] px-5 text-sm font-semibold text-white shadow-crmGlow transition hover:brightness-105">
              В CRM
            </button>
          </div>
        </header>

        {!loading && company && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickStats.map((stat) => (
              <div key={stat.label} className="crm-card crm-soft-rise rounded-[1.6rem] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-crm-muted">{stat.label}</p>
                <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-crm-text">{stat.value}</p>
                <p className="mt-1 truncate text-xs text-crm-muted">{stat.hint}</p>
              </div>
            ))}
          </section>
        )}

        {loading && <div className="crm-glass rounded-crm2xl border border-crm-border p-5 text-sm text-crm-muted">Загружаю...</div>}
        {error && <div className="rounded-crmXl border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger">{error}</div>}
        {saved && <div className="rounded-crmXl border border-crm-success/30 bg-crm-success/10 px-4 py-3 text-sm text-crm-success">{saved}</div>}

        {!loading && company && (
          <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <div className="space-y-5">
              <section className="crm-premium-panel rounded-[1.75rem] border border-crm-border p-5 shadow-crmCard">
                <h2 className="text-lg font-semibold text-crm-text">Редактирование</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-medium">Название</span>
                    <input disabled={!canManage} className={inputClass} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">ID компании</span>
                    <input disabled={!canManage} className={inputClass} value={form.public_id} onChange={(e) => setForm((prev) => ({ ...prev, public_id: e.target.value.toLowerCase() }))} />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Сайт</span>
                    <input disabled={!canManage} className={inputClass} value={form.website_url} onChange={(e) => setForm((prev) => ({ ...prev, website_url: e.target.value }))} />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-medium">Описание</span>
                    <textarea disabled={!canManage} className={textareaClass} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
                  </label>
                </div>
                {canManage && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button disabled={saving} onClick={() => saveCompany(false)} className="crm-focus-ring h-11 rounded-crmXl bg-crm-accent px-5 text-sm font-semibold text-white shadow-crmGlow transition hover:brightness-110 disabled:opacity-60">
                      {saving ? 'Сохраняю...' : 'Сохранить'}
                    </button>
                    <button disabled={saving} onClick={() => saveCompany(true)} className="crm-focus-ring h-11 rounded-crmXl border border-crm-border px-5 text-sm font-semibold text-crm-text transition hover:border-crm-danger/40 hover:text-crm-danger disabled:opacity-60">
                      Обновить lead key
                    </button>
                  </div>
                )}
              </section>

              <section className="crm-premium-panel rounded-[1.75rem] border border-crm-border p-5 shadow-crmCard">
                <h2 className="text-lg font-semibold text-crm-text">Участники</h2>
                {canManage && (
                  <form onSubmit={sendInvite} className="mt-4 flex flex-col gap-2 rounded-crmXl border border-crm-border bg-crm-surface/45 p-3 sm:flex-row">
                    <input
                      className={inputClass}
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      placeholder="@nickname"
                    />
                    <button disabled={inviteLoading} className="crm-focus-ring h-12 rounded-crmXl bg-crm-accent px-4 text-sm font-semibold text-white shadow-crmGlow disabled:opacity-60">
                      {inviteLoading ? 'Отправляю...' : 'Пригласить'}
                    </button>
                  </form>
                )}
                <div className="mt-4 grid gap-3">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-3 rounded-crmXl border border-crm-border bg-crm-surface/50 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-crm-text">{member.name}</p>
                        <p className="text-xs text-crm-muted">@{member.username} · {member.role}</p>
                      </div>
                      <span className="rounded-full border border-crm-border px-3 py-1 text-xs text-crm-muted">{member.status}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-5">
              <section className="crm-premium-panel rounded-[1.75rem] border border-crm-border p-5 shadow-crmCard">
                <h2 className="text-lg font-semibold text-crm-text">Подключение сайта</h2>
                <p className="mt-2 text-sm text-crm-muted">Этот ключ добавляется в форму на сайте. Это не доступ к базе, а безопасный вход для новых лидов.</p>
                <div className="mt-4 space-y-3 rounded-crmXl border border-crm-border bg-crm-surface/50 p-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-crm-muted">Endpoint</p>
                    <code className="mt-1 block break-all text-sm text-crm-text">{endpoint}</code>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-crm-muted">Lead key</p>
                    <code className="mt-1 block break-all text-sm text-crm-accent">{company.lead_token}</code>
                  </div>
                </div>
                <button onClick={copyIntegration} className="crm-focus-ring mt-4 h-11 rounded-crmXl border border-crm-border px-5 text-sm font-semibold text-crm-text transition hover:border-crm-accent/40 hover:text-crm-accent">
                  Скопировать пример кода
                </button>
              </section>

              {canManage && (
                <section className="crm-premium-panel rounded-[1.75rem] border border-crm-border p-5 shadow-crmCard">
                  <h2 className="text-lg font-semibold text-crm-text">Заявки на вступление</h2>
                  <div className="mt-4 grid gap-3">
                    {requests.length === 0 && <p className="text-sm text-crm-muted">Новых заявок нет.</p>}
                    {requests.map((request) => (
                      <div key={request.id} className="rounded-crmXl border border-crm-border bg-crm-surface/50 p-4">
                        <p className="text-sm font-semibold text-crm-text">{request.name} <span className="text-crm-muted">@{request.username}</span></p>
                        {request.message && <p className="mt-2 text-sm text-crm-muted">{request.message}</p>}
                        <div className="mt-4 flex gap-2">
                          <button onClick={() => processRequest(request.id, 'approve')} className="crm-focus-ring h-10 rounded-crmXl bg-crm-accent px-4 text-sm font-semibold text-white">Принять</button>
                          <button onClick={() => processRequest(request.id, 'reject')} className="crm-focus-ring h-10 rounded-crmXl border border-crm-border px-4 text-sm font-semibold text-crm-text hover:border-crm-danger/40 hover:text-crm-danger">Отклонить</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
