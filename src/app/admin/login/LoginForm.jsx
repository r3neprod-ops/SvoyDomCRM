'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';

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

function PhoneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106a1.125 1.125 0 0 0-1.173.417l-.97 1.293a1.125 1.125 0 0 1-1.21.38 12.035 12.035 0 0 1-7.143-7.143 1.125 1.125 0 0 1 .38-1.21l1.293-.97c.36-.27.527-.726.417-1.173L6.963 3.102A1.125 1.125 0 0 0 5.872 2.25H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20.25a7.5 7.5 0 0 1 15 0M16.5 14.25l1.5 1.5 3-3" />
    </svg>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState('phone');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsSent, setSmsSent] = useState(false);
  const [smsPhoneLabel, setSmsPhoneLabel] = useState('');
  const [emailLogin, setEmailLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const inputClassName =
    'crm-focus-ring w-full rounded-crmXl border border-crm-border bg-crm-surface/60 px-4 text-base text-crm-text placeholder:text-crm-muted outline-none transition-colors duration-200 focus:border-crm-accent/50 h-[46px] sm:h-[48px]';
  const quickButtonClass =
    'crm-focus-ring flex min-h-10 w-full items-center justify-center gap-2 rounded-crmXl border border-crm-border bg-crm-surface/45 px-2 text-xs font-semibold text-crm-text transition hover:border-crm-accent/35 hover:bg-crm-accent/10 hover:text-crm-accent disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-11 sm:px-3 sm:text-sm';

  const oauthError = searchParams.get('oauth_error');
  const oauthErrorText = oauthError
    ? oauthError.includes('not_configured')
      ? 'Провайдер входа еще не настроен на сервере. Нужно добавить client_id и client_secret.'
      : 'Не удалось войти через внешний аккаунт. Проверьте настройки приложения и callback URL.'
    : '';
  const oauthProviders = [
    { id: 'yandex', label: 'Яндекс', mark: 'Я' },
    { id: 'mailru', label: 'Mail.ru', mark: '@' },
    { id: 'vk', label: 'VK', mark: 'VK' },
  ];

  const finishLogin = (data) => {
    router.push(data.redirectTo || '/admin/dashboard');
  };

  const handlePhoneSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const url = smsSent ? '/api/auth/sms/verify' : '/api/auth/sms/start';
      const payload = smsSent ? { phone, code: smsCode } : { phone };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setError(data.message || 'Не удалось выполнить вход по телефону');
        return;
      }
      if (smsSent) {
        finishLogin(data);
        return;
      }
      setSmsSent(true);
      setSmsPhoneLabel(data.phone || phone);
      setSmsCode('');
    } catch {
      setError('Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: emailLogin, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        finishLogin(data);
      } else {
        setError(data.message || 'Ошибка входа');
      }
    } catch {
      setError('Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError('');
    if (!browserSupportsWebAuthn()) {
      setError('Этот браузер не поддерживает быстрый вход.');
      return;
    }
    setPasskeyLoading(true);
    try {
      const optionsRes = await fetch('/api/auth/passkey/login/options', { method: 'POST' });
      const optionsData = await optionsRes.json().catch(() => ({}));
      if (!optionsData.ok) {
        setError(optionsData.message || 'Быстрый вход еще не включен.');
        return;
      }

      const response = await startAuthentication({ optionsJSON: optionsData.options });
      const verifyRes = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyData.ok) {
        setError(verifyData.message || 'Не удалось войти быстрым способом.');
        return;
      }
      finishLogin(verifyData);
    } catch (err) {
      if (err?.name !== 'NotAllowedError') {
        setError('Не удалось выполнить быстрый вход.');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
  };

  return (
    <main className="crm-app-bg crm-login-screen crm-mobile-safe-bottom relative flex min-h-[100svh] items-center justify-center overflow-x-hidden px-3 py-4 sm:px-4 sm:py-10">
      <div className="relative z-10 w-full max-w-[430px] min-w-0">
        <div className="crm-login-brand mb-5 text-center sm:mb-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-crmXl border border-crm-border bg-crm-surface/50 shadow-crmGlow backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
              <path
                d="M4 12.2 12 5l8 7.2V20a1 1 0 0 1-1 1h-4.7v-5.8H9.7V21H5a1 1 0 0 1-1-1v-7.8Z"
                stroke="url(#loginLogoGradient)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M8.4 11.7h7.2M8.4 14.5h4.2" stroke="var(--crm-accent)" strokeWidth="1.5" strokeLinecap="round" />
              <defs>
                <linearGradient id="loginLogoGradient" x1="4" y1="5" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                  <stop stopColor="var(--crm-accent)" />
                  <stop offset="1" stopColor="var(--crm-accent-strong)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <p className="text-sm font-medium tracking-wide text-crm-muted">CRM24</p>
        </div>

        <div className="crm-glass crm-login-card rounded-crm2xl border border-crm-border p-5 shadow-crmCard sm:p-8">
          <div className="mb-5 sm:mb-7">
            <h1 className="crm-login-title text-[1.5rem] font-semibold leading-tight tracking-tight text-crm-text sm:text-[1.75rem]">
              Войти в CRM
              <span className="block crm-gradient-text">без лишних шагов</span>
            </h1>
            <p className="crm-login-copy mt-2 text-sm leading-relaxed text-crm-muted sm:mt-3">
              Телефон, email-пароль или аккаунт сервиса. Быстрый вход можно включить после первого входа.
            </p>
          </div>

          {mode === 'phone' ? (
            <form onSubmit={handlePhoneSubmit} className="space-y-3 sm:space-y-4">
              <div>
                <label htmlFor="phone" className="mb-2 flex items-center gap-2 text-sm font-medium text-crm-text">
                  <PhoneIcon />
                  Телефон
                </label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  name="phone"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setSmsSent(false);
                    setSmsCode('');
                  }}
                  className={inputClassName}
                  placeholder="+7 999 000-00-00"
                  required
                  autoComplete="tel"
                  disabled={loading}
                />
              </div>

              {smsSent && (
                <div>
                  <label htmlFor="sms-code" className="mb-2 block text-sm font-medium text-crm-text">
                    Код из SMS
                  </label>
                  <input
                    id="sms-code"
                    type="text"
                    inputMode="numeric"
                    name="sms-code"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={inputClassName}
                    placeholder="000000"
                    required
                    autoComplete="one-time-code"
                    disabled={loading}
                  />
                  <p className="mt-2 text-xs text-crm-muted">Код отправлен на {smsPhoneLabel || phone}</p>
                </div>
              )}

              {error && <div role="alert" className="rounded-crmXl border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="crm-focus-ring flex min-h-[46px] w-full items-center justify-center rounded-crmXl bg-gradient-to-r from-crm-accent to-[var(--crm-accent-strong)] px-4 text-sm font-semibold text-white shadow-crmGlow transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[48px] sm:text-base"
              >
                {loading ? 'Подождите...' : smsSent ? 'Войти по коду' : 'Получить код'}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => switchMode('email')} className={quickButtonClass}>
                  Email
                </button>
                <button type="button" onClick={handlePasskeyLogin} disabled={passkeyLoading} className={quickButtonClass}>
                  <PasskeyIcon />
                  <span>{passkeyLoading ? 'Проверка...' : 'Биометрия'}</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-3 sm:space-y-4">
              <div>
                <label htmlFor="email-login" className="mb-2 block text-sm font-medium text-crm-text">
                  Email или @никнейм
                </label>
                <input
                  id="email-login"
                  type="text"
                  name="email-login"
                  value={emailLogin}
                  onChange={(e) => setEmailLogin(e.target.value)}
                  className={inputClassName}
                  placeholder="mail@example.com или @nickname"
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

              {error && <div role="alert" className="rounded-crmXl border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="crm-focus-ring flex min-h-[46px] w-full items-center justify-center rounded-crmXl bg-gradient-to-r from-crm-accent to-[var(--crm-accent-strong)] px-4 text-sm font-semibold text-white shadow-crmGlow transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[48px] sm:text-base"
              >
                {loading ? 'Вход...' : 'Войти'}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => switchMode('phone')} className={quickButtonClass}>
                  Телефон
                </button>
                <button type="button" onClick={handlePasskeyLogin} disabled={passkeyLoading} className={quickButtonClass}>
                  <PasskeyIcon />
                  <span>{passkeyLoading ? 'Проверка...' : 'Биометрия'}</span>
                </button>
              </div>
            </form>
          )}

          <div className="crm-login-divider my-4 flex items-center gap-3 sm:my-6">
            <div className="h-px flex-1 bg-crm-border" />
            <span className="text-[11px] uppercase tracking-wide text-crm-muted sm:text-xs">или через сервис</span>
            <div className="h-px flex-1 bg-crm-border" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {oauthProviders.map((provider) => (
              <a
                key={provider.id}
                href={`/api/auth/oauth/${provider.id}`}
                className="crm-focus-ring flex min-h-12 items-center justify-center gap-2 rounded-crmXl border border-crm-border bg-crm-surface/45 px-2 text-sm font-semibold text-crm-text transition hover:border-crm-accent/35 hover:bg-crm-accent/10 hover:text-crm-accent"
                aria-label={`Войти через ${provider.label}`}
                title={`Войти через ${provider.label}`}
              >
                <span className="flex h-8 min-w-8 items-center justify-center rounded-full border border-crm-border bg-crm-surface/70 text-[12px] font-black">
                  {provider.mark}
                </span>
                <span className="hidden sm:inline">{provider.label}</span>
              </a>
            ))}
          </div>

          {oauthErrorText && (
            <div className="mt-4 rounded-crmXl border border-crm-warning/35 bg-crm-warning/10 px-4 py-3 text-sm leading-relaxed text-crm-warning">
              {oauthErrorText}
            </div>
          )}

          <div className="crm-login-safe-note mt-5 flex items-start gap-2.5 rounded-crmXl border border-crm-border/60 bg-crm-surface/40 px-4 py-3 sm:mt-6">
            <ShieldIcon />
            <p className="text-xs leading-relaxed text-crm-muted">
              Данные защищены. Быстрый вход включается только после входа в аккаунт.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
