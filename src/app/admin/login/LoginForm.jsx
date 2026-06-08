'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-2.228-2.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0 text-crm-accent" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.ok) {
        router.push(data.redirectTo || '/admin/dashboard');
      } else {
        setError(data.message || 'Ошибка входа');
      }
    } catch {
      setError('Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  const inputClassName =
    'crm-focus-ring w-full rounded-crmXl border border-crm-border bg-crm-surface/60 px-4 text-base text-crm-text placeholder:text-crm-muted outline-none transition-colors duration-200 focus:border-crm-accent/50 h-[48px]';
  const oauthError = searchParams.get('oauth_error');
  const oauthErrorText = oauthError
    ? oauthError.includes('not_configured')
      ? 'Провайдер входа еще не настроен на сервере. Нужно добавить client_id и client_secret.'
      : 'Не удалось войти через внешний аккаунт. Попробуйте еще раз или войдите по логину.'
    : '';
  const oauthProviders = [
    { id: 'google', label: 'Google', mark: 'G' },
    { id: 'yandex', label: 'Яндекс', mark: 'Я' },
    { id: 'vk', label: 'VK', mark: 'VK' },
    { id: 'mailru', label: 'Mail.ru', mark: '@' },
  ];

  return (
    <main className="crm-app-bg crm-mobile-safe-bottom relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="relative z-10 w-full max-w-[420px] min-w-0">
        {/* Brand mark */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-crmXl border border-crm-border bg-crm-surface/50 shadow-crmGlow backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
              <path
                d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z"
                stroke="url(#loginLogoGradient)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="loginLogoGradient" x1="3" y1="4" x2="21" y2="21" gradientUnits="userSpaceOnUse">
                  <stop stopColor="var(--crm-accent)" />
                  <stop offset="1" stopColor="var(--crm-accent-strong)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <p className="text-sm font-medium tracking-wide text-crm-muted">СвойДом CRM</p>
        </div>

        {/* Login card */}
        <div className="crm-glass rounded-crm2xl border border-crm-border p-6 shadow-crmCard sm:p-8">
          <div className="mb-8">
            <h1 className="text-[1.625rem] font-semibold leading-tight tracking-tight text-crm-text sm:text-[1.75rem]">
              Добро пожаловать
              <span className="block crm-gradient-text">в СвойДом CRM</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-crm-muted">
              Единое пространство для управления лидами, сотрудниками и коммуникацией
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-crm-text">
                Логин или @никнейм
              </label>
              <input
                id="username"
                type="text"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClassName}
                placeholder="admin или @nickname"
                required
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-crm-text">
                Пароль
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClassName} pr-12`}
                  placeholder="Введите пароль"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="crm-focus-ring absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-crmLg text-crm-muted transition-colors hover:text-crm-text"
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  tabIndex={-1}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-crmXl border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="crm-focus-ring flex min-h-[48px] w-full items-center justify-center rounded-crmXl bg-gradient-to-r from-crm-accent to-[var(--crm-accent-strong)] px-4 text-base font-semibold text-white shadow-crmGlow transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Вход...
                </span>
              ) : (
                'Войти'
              )}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-crm-border" />
            <span className="text-xs uppercase tracking-wide text-crm-muted">или</span>
            <div className="h-px flex-1 bg-crm-border" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {oauthProviders.map((provider) => (
              <a
                key={provider.id}
                href={`/api/auth/oauth/${provider.id}`}
                className="crm-focus-ring flex min-h-11 items-center justify-center gap-2 rounded-crmXl border border-crm-border bg-crm-surface/45 px-3 text-sm font-semibold text-crm-text transition hover:border-crm-accent/35 hover:bg-crm-accent/10 hover:text-crm-accent"
              >
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full border border-crm-border bg-crm-surface/70 text-[11px]">
                  {provider.mark}
                </span>
                {provider.label}
              </a>
            ))}
          </div>

          {oauthErrorText && (
            <div className="mt-4 rounded-crmXl border border-crm-warning/35 bg-crm-warning/10 px-4 py-3 text-sm leading-relaxed text-crm-warning">
              {oauthErrorText}
            </div>
          )}

          <div className="mt-6 flex items-start gap-2.5 rounded-crmXl border border-crm-border/60 bg-crm-surface/40 px-4 py-3">
            <ShieldIcon />
            <p className="text-xs leading-relaxed text-crm-muted">
              Ваши данные защищены. Безопасный вход по современным стандартам.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
