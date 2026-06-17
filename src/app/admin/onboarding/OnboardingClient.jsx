'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const inputClass =
  'crm-focus-ring crm-input-surface h-12 w-full rounded-crmXl px-4 text-sm outline-none transition focus:border-crm-accent/50';
const textareaClass =
  'crm-focus-ring crm-input-surface min-h-24 w-full rounded-crmXl px-4 py-3 text-sm outline-none transition focus:border-crm-accent/50';

function cleanUsername(value) {
  return String(value || '').replace(/^@+/, '').toLowerCase();
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: text.slice(0, 400) };
  }
}

export default function OnboardingClient({ initialUser, initialIntent = 'choice' }) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [intent, setIntent] = useState(['employee', 'owner', 'choice'].includes(initialIntent) ? initialIntent : 'choice');
  const [profile, setProfile] = useState({
    name: initialUser?.name || '',
    username: initialUser?.username || '',
    phone: initialUser?.phone || '',
    status_text: initialUser?.status_text || '',
  });
  const [profileSaved, setProfileSaved] = useState(Boolean(initialUser?.profile_completed));
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [companies, setCompanies] = useState([]);
  const [companyQuery, setCompanyQuery] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companyError, setCompanyError] = useState('');

  const [createForm, setCreateForm] = useState({
    name: '',
    public_id: '',
    website_url: '',
    description: '',
  });
  const [creating, setCreating] = useState(false);

  const nicknamePreview = useMemo(() => {
    const nick = cleanUsername(profile.username);
    return nick ? `@${nick}` : '@nickname';
  }, [profile.username]);

  const fetchCompanies = async (query = companyQuery) => {
    setCompaniesLoading(true);
    setCompanyError('');
    try {
      const res = await fetch(`/api/companies?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok || !data.ok) {
        setCompanyError(data.message || 'Не удалось загрузить компании');
        return;
      }
      setCompanies(data.companies || []);
    } catch (error) {
      setCompanyError(error?.message || 'Не удалось загрузить компании');
    } finally {
      setCompaniesLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies('');
  }, []);

  useEffect(() => {
    try {
      const savedIntent = window.localStorage.getItem('crm24_auth_intent');
      if (savedIntent === 'employee' || savedIntent === 'owner' || savedIntent === 'choice') {
        setIntent(savedIntent);
      }
    } catch {
      // The query param already carries the intent when storage is unavailable.
    }
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileLoading(true);
    setProfileError('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          username: cleanUsername(profile.username),
        }),
      });
      const data = await readJson(res);
      if (!res.ok || !data.ok) {
        setProfileError(data.message || 'Не удалось сохранить профиль');
        return;
      }
      setUser((prev) => ({ ...prev, ...(data.user || {}), profile_completed: true }));
      setProfile((prev) => ({ ...prev, username: data.user?.username || cleanUsername(prev.username) }));
      setProfileSaved(true);
    } catch (error) {
      setProfileError(error?.message || 'Не удалось сохранить профиль');
    } finally {
      setProfileLoading(false);
    }
  };

  const createCompany = async (event) => {
    event.preventDefault();
    setCreating(true);
    setCompanyError('');
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await readJson(res);
      if (!res.ok || !data.ok) {
        setCompanyError(data.message || 'Не удалось создать компанию');
        return;
      }
      router.push('/admin/dashboard');
      router.refresh();
    } catch (error) {
      setCompanyError(error?.message || 'Не удалось создать компанию');
    } finally {
      setCreating(false);
    }
  };

  const joinCompany = async (companyId) => {
    setCompanyError('');
    try {
      const res = await fetch(`/api/companies/${companyId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: joinMessage }),
      });
      const data = await readJson(res);
      if (!res.ok || !data.ok) {
        setCompanyError(data.message || 'Не удалось отправить заявку');
        return;
      }
      if (data.joined || data.alreadyMember) {
        router.push('/admin/dashboard');
        router.refresh();
        return;
      }
      await fetchCompanies();
    } catch (error) {
      setCompanyError(error?.message || 'Не удалось отправить заявку');
    }
  };

  return (
    <main className="crm-app-bg min-h-screen px-4 py-6 text-crm-text sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="crm-glass rounded-crm2xl border border-crm-border p-5 shadow-crmCard sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-crm-accent">CRM24</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-crm-text sm:text-3xl">Настройка аккаунта</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-crm-muted">
                Сначала закрепляем ваш никнейм, потом {intent === 'employee'
                  ? 'ищем вашу компанию или принимаем приглашение.'
                  : intent === 'owner'
                    ? 'создаём компанию и запускаем рабочее пространство.'
                    : 'выбираем: создать компанию или присоединиться к существующей.'}
              </p>
            </div>
            <div className="rounded-crmXl border border-crm-border bg-crm-surface/70 px-4 py-3 text-sm">
              <span className="block text-crm-muted">Ваш ник в системе</span>
              <span className="font-semibold text-crm-accent">{nicknamePreview}</span>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <form onSubmit={saveProfile} className="crm-glass rounded-crm2xl border border-crm-border p-5 shadow-crmCard">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-crm-text">Профиль</h2>
              <p className="mt-1 text-sm text-crm-muted">Никнейм обязателен: по нему вас будут приглашать в компании.</p>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-crm-text">Имя</span>
                <input
                  className={inputClass}
                  value={profile.name}
                  onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Например: Владислав"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-crm-text">Никнейм</span>
                <div className="crm-input-surface flex items-center rounded-crmXl focus-within:border-crm-accent/50">
                  <span className="pl-4 text-crm-muted">@</span>
                  <input
                    className="h-12 min-w-0 flex-1 bg-transparent px-2 text-sm text-crm-text outline-none placeholder:text-crm-muted"
                    value={cleanUsername(profile.username)}
                    onChange={(e) => setProfile((prev) => ({ ...prev, username: cleanUsername(e.target.value) }))}
                    placeholder="nickname"
                    required
                  />
                </div>
                <p className="mt-2 text-xs text-crm-muted">3-32 символа: латиница, цифры и _</p>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-crm-text">Телефон</span>
                <input
                  className={inputClass}
                  value={profile.phone}
                  onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="+7 999 000-00-00"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-crm-text">Статус</span>
                <textarea
                  className={textareaClass}
                  value={profile.status_text}
                  onChange={(e) => setProfile((prev) => ({ ...prev, status_text: e.target.value }))}
                  placeholder="Например: на показах до 18:00"
                />
              </label>
            </div>
            {profileError && <p className="mt-4 rounded-crmXl border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger">{profileError}</p>}
            <button
              type="submit"
              disabled={profileLoading}
              className="crm-focus-ring mt-5 inline-flex h-11 items-center justify-center rounded-crmXl bg-crm-accent px-5 text-sm font-semibold text-white shadow-crmGlow transition hover:brightness-110 disabled:opacity-60"
            >
              {profileLoading ? 'Сохраняю...' : profileSaved ? 'Обновить профиль' : 'Сохранить профиль'}
            </button>
          </form>

          <div className={`flex flex-col gap-5 ${!profileSaved ? 'pointer-events-none opacity-45' : ''}`}>
            <form onSubmit={createCompany} className={`crm-glass rounded-crm2xl border border-crm-border p-5 shadow-crmCard ${intent === 'owner' ? 'order-1' : 'order-2'}`}>
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-crm-text">Создать компанию</h2>
                <p className="mt-1 text-sm text-crm-muted">У компании будет свой раздел данных и отдельный ключ для приема лидов с сайта.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-crm-text">Название</span>
                  <input className={inputClass} value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Например: Агентство Север" required />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-crm-text">ID компании</span>
                  <input className={inputClass} value={createForm.public_id} onChange={(e) => setCreateForm((prev) => ({ ...prev, public_id: e.target.value.toLowerCase() }))} placeholder="sever-crm" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-crm-text">Сайт</span>
                  <input className={inputClass} value={createForm.website_url} onChange={(e) => setCreateForm((prev) => ({ ...prev, website_url: e.target.value }))} placeholder="https://example.ru" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-crm-text">Описание</span>
                  <textarea className={textareaClass} value={createForm.description} onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Коротко, чтобы сотрудники понимали, куда вступают" />
                </label>
              </div>
              <button type="submit" disabled={creating} className="crm-focus-ring mt-5 inline-flex h-11 items-center justify-center rounded-crmXl bg-crm-accent px-5 text-sm font-semibold text-white shadow-crmGlow transition hover:brightness-110 disabled:opacity-60">
                {creating ? 'Создаю...' : 'Создать и войти'}
              </button>
            </form>

            <section className={`crm-glass rounded-crm2xl border border-crm-border p-5 shadow-crmCard ${intent === 'employee' ? 'order-1' : 'order-2'}`}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-crm-text">Найти компанию</h2>
                  <p className="mt-1 text-sm text-crm-muted">Можно искать по названию или ID компании.</p>
                </div>
                <div className="flex gap-2">
                  <input className={inputClass} value={companyQuery} onChange={(e) => setCompanyQuery(e.target.value)} placeholder="Название или ID" />
                  <button type="button" onClick={() => fetchCompanies(companyQuery)} className="crm-focus-ring h-12 rounded-crmXl border border-crm-border px-4 text-sm font-semibold text-crm-text transition hover:border-crm-accent/40 hover:text-crm-accent">
                    Найти
                  </button>
                </div>
              </div>
              <textarea className={`${textareaClass} mb-4`} value={joinMessage} onChange={(e) => setJoinMessage(e.target.value)} placeholder="Комментарий к заявке, если нужен" />
              {companyError && <p className="mb-4 rounded-crmXl border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger">{companyError}</p>}
              <div className="grid gap-3">
                {companiesLoading && <p className="text-sm text-crm-muted">Загружаю компании...</p>}
                {!companiesLoading && companies.length === 0 && <p className="text-sm text-crm-muted">Компании не найдены.</p>}
                {companies.map((company) => (
                  <div key={company.id} className="rounded-crmXl border border-crm-border bg-crm-surface/50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-crm-text">{company.name}</p>
                        <p className="mt-1 text-xs text-crm-muted">ID: {company.public_id}</p>
                        {company.description && <p className="mt-2 text-sm text-crm-muted">{company.description}</p>}
                      </div>
                      {company.membership_status === 'active' ? (
                        <button type="button" onClick={() => router.push('/admin/dashboard')} className="crm-focus-ring h-10 rounded-crmXl border border-crm-accent/40 px-4 text-sm font-semibold text-crm-accent">Войти</button>
                      ) : company.request_status === 'invited' ? (
                        <button type="button" onClick={() => joinCompany(company.id)} className="crm-focus-ring h-10 rounded-crmXl bg-crm-accent px-4 text-sm font-semibold text-white shadow-crmGlow">
                          Принять приглашение
                        </button>
                      ) : company.request_status === 'pending' ? (
                        <span className="rounded-full border border-crm-warning/30 bg-crm-warning/10 px-3 py-1 text-xs font-semibold text-crm-warning">Заявка отправлена</span>
                      ) : (
                        <button type="button" onClick={() => joinCompany(company.id)} className="crm-focus-ring h-10 rounded-crmXl border border-crm-border px-4 text-sm font-semibold text-crm-text transition hover:border-crm-accent/40 hover:text-crm-accent">Постучаться</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
