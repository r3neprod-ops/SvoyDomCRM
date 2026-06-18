'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const AUTH_INTENT_KEY = 'crm24_auth_intent';
const AUTH_INTENT_CHOICE = 'choice';
const MOBILE_SPLIT_REVEAL_DELAY_MS = 760;
const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

function normalizeLogin(value) {
  const login = String(value || '').trim();
  if (login.startsWith('@')) return login.replace(/^@+/, '').toLowerCase();
  return login.toLowerCase();
}

function normalizeUsernameInput(value) {
  return String(value || '').replace(/^@+/, '').trim().toLowerCase();
}

function getUsernameValidation(username) {
  if (!username) return { status: 'idle', message: '3-32 символа: латиница, цифры и подчёркивание' };
  if (!USERNAME_PATTERN.test(username)) {
    return { status: 'invalid', message: 'Используйте латиницу, цифры и _' };
  }
  return { status: 'valid', message: 'Формат подходит. Занятость проверится при подключении регистрации.' };
}

function BrandMark({ compact = false }) {
  return (
    <div className={`inline-flex items-center gap-3 ${compact ? 'scale-90' : ''}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] border border-white/55 bg-white/24 text-crm-text shadow-crmGlow backdrop-blur-xl">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
          <path d="M4 12.2 12 5l8 7.2V20a1 1 0 0 1-1 1h-4.7v-5.8H9.7V21H5a1 1 0 0 1-1-1v-7.8Z" stroke="url(#crmLoginLogoGradient)" strokeWidth="1.55" strokeLinejoin="round" />
          <path d="M8.4 11.7h7.2M8.4 14.5h4.2" stroke="var(--crm-accent)" strokeWidth="1.55" strokeLinecap="round" />
          <defs>
            <linearGradient id="crmLoginLogoGradient" x1="4" y1="5" x2="20" y2="21" gradientUnits="userSpaceOnUse">
              <stop stopColor="var(--crm-accent)" />
              <stop offset="1" stopColor="var(--crm-accent-strong)" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className="text-sm font-black uppercase tracking-[0.32em] text-crm-text/80">CRM24</span>
    </div>
  );
}

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

function ScenarioGlyph({ type, className = 'h-8 w-8' }) {
  if (type === 'employee') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M15 19a6 6 0 0 0-12 0" />
        <circle cx="9" cy="8" r="4" />
        <path d="M19 7v6" />
        <path d="M16 10h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 21h18" />
      <path d="M5 21V8l7-5 7 5v13" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 10h.01M15 10h.01" />
    </svg>
  );
}

function OAuthIcon({ provider }) {
  const base = 'h-5 w-5 shrink-0';
  if (provider === 'yandex') {
    return (
      <svg viewBox="0 0 24 24" className={base} aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.12" />
        <path d="M12.92 18h-2.08v-4.64L7.5 6h2.22l2.15 5.06L14.04 6h2.18l-3.3 7.34V18Z" fill="currentColor" />
      </svg>
    );
  }
  if (provider === 'vk') {
    return (
      <svg viewBox="0 0 24 24" className={base} aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="7" fill="currentColor" opacity="0.12" />
        <path d="M5.9 8h2.16c.08 3.08 1.42 4.38 2.47 4.65V8h2.04v2.66c1.02-.11 2.09-1.33 2.45-2.66h2.04a5.08 5.08 0 0 1-2.26 3.32 5.37 5.37 0 0 1 2.65 3.68h-2.25c-.4-1.27-1.37-2.25-2.63-2.38V15h-.24c-4.28 0-6.72-2.94-6.83-7h.4Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={base} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.12" />
      <path d="M12.24 7.15a4.52 4.52 0 0 1 4.59 4.64v.33c0 1.08-.48 1.79-1.37 1.79-.58 0-.92-.31-.92-.87v-4.2h-1.6v.49a2.54 2.54 0 0 0-1.95-.73 3.03 3.03 0 0 0-3.05 3.16 2.98 2.98 0 0 0 3.01 3.15 2.62 2.62 0 0 0 2.14-.92 2.31 2.31 0 0 0 2.19 1.24c1.9 0 3.09-1.22 3.09-3.16v-.28a6.06 6.06 0 0 0-6.14-6.19 6.15 6.15 0 1 0 0 12.3 6.7 6.7 0 0 0 3.07-.69l-.54-1.28a5.22 5.22 0 0 1-2.53.58 4.71 4.71 0 1 1 0-9.42Zm-1 6.29a1.62 1.62 0 0 1-1.64-1.68 1.63 1.63 0 1 1 3.26 0 1.62 1.62 0 0 1-1.62 1.68Z" fill="currentColor" />
    </svg>
  );
}

function GeneratedArtwork({ type, compact = false }) {
  const sideClass = type === 'employee' ? 'crm-generated-art--employee' : 'crm-generated-art--owner';
  const modeClass = compact ? 'crm-generated-art--mobile' : 'crm-generated-art--desktop';

  return (
    <span
      className={`crm-generated-art ${sideClass} ${modeClass}`}
      aria-hidden="true"
    />
  );
}

function ScenarioPanel({ item, activeScenario, pressedScenario, isInlineOpen, inlineAuth, onActivate, onClear, onOpen }) {
  const isActive = activeScenario === item.id;
  const isMuted = activeScenario && activeScenario !== item.id;
  const isPressed = pressedScenario === item.id;
  const sideClass = item.id === 'employee' ? 'crm-split-panel--employee' : 'crm-split-panel--owner';

  return (
    <section
      className={`crm-split-panel ${sideClass} ${isActive ? 'is-active' : ''} ${isMuted ? 'is-muted' : ''} ${isPressed ? 'is-pressed' : ''} ${isInlineOpen ? 'is-auth-open' : ''}`}
      onMouseEnter={() => onActivate(item.id)}
      onMouseLeave={onClear}
      onFocus={() => onActivate(item.id)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onClear();
      }}
      onClick={() => {
        if (isMuted) onOpen(item.id);
      }}
      aria-label={`${item.title}. ${item.text}`}
    >
      <span className="crm-split-panel__shine" />
      <span className="crm-split-panel__compact-title">{item.title}</span>
      <div className="crm-split-panel__content">
        <span className="crm-split-panel__icon">
          <ScenarioGlyph type={item.id} />
        </span>
        <span className="crm-split-panel__title">{item.title}</span>
        <span className="crm-split-panel__text">{item.text}</span>
        <span className="crm-split-panel__hint">{item.hint}</span>
        <button
          type="button"
          onClick={() => onOpen(item.id)}
          className="crm-focus-ring crm-split-panel__cta"
          aria-expanded={isInlineOpen}
        >
          {item.cta}
        </button>
        {inlineAuth}
      </div>
      <GeneratedArtwork type={item.id} />
    </section>
  );
}

function MobileScenarioCard({ item, pressedScenario, isInlineOpen, inlineAuth, onOpen }) {
  const sideClass = item.id === 'employee' ? 'crm-mobile-choice-card--employee' : 'crm-mobile-choice-card--owner';

  return (
    <section
      className={`crm-focus-ring crm-mobile-choice-card ${sideClass} ${pressedScenario === item.id ? 'is-pressed' : ''} ${isInlineOpen ? 'is-auth-open' : ''}`}
      aria-label={`${item.title}. ${item.text}`}
      aria-expanded={isInlineOpen}
      aria-pressed={isInlineOpen}
      role="button"
      onClick={(event) => {
        if (isInlineOpen) return;
        if (event.target.closest('button, a, input, select, textarea, .crm-split-inline-auth')) return;
        onOpen(item.id);
      }}
      onKeyDown={(event) => {
        if (isInlineOpen) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(item.id);
      }}
      tabIndex={isInlineOpen ? undefined : 0}
    >
      <span className="crm-mobile-choice-card__content flex flex-col gap-3">
        <span className="crm-mobile-choice-card__head flex items-start justify-between gap-4">
          <span className="crm-mobile-choice-card__icon flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.35rem] border border-white/68 bg-white/38 text-crm-accent shadow-crmGlow backdrop-blur-xl">
            <ScenarioGlyph type={item.id} />
          </span>
          <GeneratedArtwork type={item.id} compact />
        </span>
        <span className="crm-mobile-choice-card__title block text-[1.65rem] font-semibold leading-tight tracking-tight text-crm-text">{item.title}</span>
        <span className="crm-mobile-choice-card__text block text-sm leading-relaxed text-crm-muted">{item.text}</span>
        <span className="crm-mobile-choice-hint block text-xs leading-relaxed text-crm-text/75">{item.hint}</span>
      </span>
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className="crm-focus-ring crm-mobile-choice-card__cta"
        aria-expanded={isInlineOpen}
      >
        {item.cta}
      </button>
      {inlineAuth}
    </section>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authOpen, setAuthOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [activeScenario, setActiveScenario] = useState(null);
  const [pressedScenario, setPressedScenario] = useState(null);
  const [inlineScenario, setInlineScenario] = useState(null);
  const [authTab, setAuthTab] = useState('login');
  const [emailLogin, setEmailLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registerForm, setRegisterForm] = useState({ username: '', name: '', email: '', password: '', confirmPassword: '' });
  const [acceptPolicy, setAcceptPolicy] = useState(false);
  const [usernameCheckState, setUsernameCheckState] = useState('idle');
  const [loginNotice, setLoginNotice] = useState('');
  const [registerNotice, setRegisterNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const scenarios = useMemo(() => ([
    {
      id: 'employee',
      title: 'Присоединиться',
      text: 'Войти в команду по приглашению или заявке',
      hint: 'Для сотрудников, агентов, маркетологов и администраторов',
      cta: 'Войти в команду',
    },
    {
      id: 'owner',
      title: 'Создать компанию',
      text: 'Запустить рабочее пространство и пригласить команду',
      hint: 'Для владельца или руководителя',
      cta: 'Создать компанию',
    },
  ]), []);

  const oauthError = searchParams.get('oauth_error');
  const oauthErrorText = oauthError
    ? oauthError.includes('not_configured')
      ? 'Провайдер входа еще не настроен на сервере. Нужно добавить client_id и client_secret.'
      : 'Не удалось войти через внешний аккаунт. Проверьте настройки приложения и callback URL.'
    : '';

  const oauthProviders = [
    { id: 'yandex', label: 'Яндекс' },
    { id: 'vk', label: 'VK' },
    { id: 'mailru', label: 'Mail.ru' },
  ];

  const scenario = scenarios.find((item) => item.id === selectedScenario) || null;
  const usernameValidation = useMemo(() => getUsernameValidation(registerForm.username), [registerForm.username]);
  const usernameHelpText = usernameCheckState === 'checking'
    ? 'Проверяем формат...'
    : usernameValidation.message;
  const inputClassName =
    'crm-focus-ring crm-input-surface w-full rounded-[1.25rem] px-4 text-base outline-none transition-colors duration-200 focus:border-crm-accent/60 h-12';

  useEffect(() => {
    const saved = window.localStorage.getItem(AUTH_INTENT_KEY);
    if (saved === 'owner' || saved === 'employee' || saved === AUTH_INTENT_CHOICE) return;
    window.localStorage.removeItem(AUTH_INTENT_KEY);
  }, []);

  useEffect(() => {
    if (!authOpen && !inlineScenario) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (authOpen) {
        closeAuth();
        return;
      }
      closeInlineAuth();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authOpen, inlineScenario]);

  useEffect(() => {
    if (usernameValidation.status !== 'valid') {
      setUsernameCheckState('idle');
      return undefined;
    }

    setUsernameCheckState('checking');
    // TODO: подключить debounce-проверку занятости, когда появится public endpoint регистрации.
    const timer = window.setTimeout(() => setUsernameCheckState('ready'), 260);
    return () => window.clearTimeout(timer);
  }, [usernameValidation.status, registerForm.username]);

  const rememberIntent = (intent) => {
    try {
      window.localStorage.setItem(AUTH_INTENT_KEY, intent);
    } catch {
      // Local storage can be unavailable in hardened browser modes.
    }
  };

  const openAuth = (intent, tab = 'login') => {
    rememberIntent(intent);
    setSelectedScenario(intent);
    setInlineScenario(null);
    setAuthOpen(true);
    setAuthTab(tab);
    setError('');
    setLoginNotice('');
    setRegisterNotice('');
    setPressedScenario(null);
  };

  const openScenarioAuth = (intent) => {
    rememberIntent(intent);
    setSelectedScenario(intent);
    setActiveScenario(intent);
    setAuthOpen(false);
    setAuthTab('login');
    setError('');
    setLoginNotice('');
    setRegisterNotice('');
    setPressedScenario(intent);
    window.setTimeout(() => {
      setInlineScenario(intent);
      setPressedScenario(null);
    }, MOBILE_SPLIT_REVEAL_DELAY_MS);
  };

  const openExistingLogin = () => {
    rememberIntent(AUTH_INTENT_CHOICE);
    setSelectedScenario(null);
    setInlineScenario(null);
    setAuthOpen(true);
    setAuthTab('login');
    setError('');
    setLoginNotice('');
    setRegisterNotice('');
    setPressedScenario(null);
  };

  const closeAuth = () => {
    setAuthOpen(false);
    setSelectedScenario(null);
    setError('');
    setLoginNotice('');
    setRegisterNotice('');
  };

  const closeInlineAuth = () => {
    setInlineScenario(null);
    setSelectedScenario(null);
    setError('');
    setLoginNotice('');
    setRegisterNotice('');
  };

  const finishLogin = (data) => {
    const intent = selectedScenario || AUTH_INTENT_CHOICE;
    rememberIntent(intent);
    const redirectTo = data.redirectTo || '/admin/dashboard';
    if (redirectTo === '/admin/onboarding') {
      router.push(`/admin/onboarding?intent=${encodeURIComponent(intent)}`);
      return;
    }
    router.push(redirectTo);
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setLoginNotice('');
    setRegisterNotice('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalizeLogin(emailLogin), password }),
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

  const handleRegistrationSubmit = (event) => {
    event.preventDefault();
    setError('');
    setRegisterNotice('');
    if (usernameValidation.status !== 'valid') {
      setError(usernameValidation.message);
      return;
    }
    if (!acceptPolicy) {
      setError('Подтвердите согласие на обработку данных.');
      return;
    }
    if (registerForm.password.length < 6) {
      setError('Пароль должен быть минимум 6 символов.');
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Пароли не совпадают.');
      return;
    }
    setRegisterNotice(`Регистрация для @${registerForm.username} подготовлена в интерфейсе. Backend для самостоятельной регистрации подключим отдельным этапом, чтобы не сломать роли и компании.`);
  };

  const resetAuthMessages = () => {
    setError('');
    setLoginNotice('');
    setRegisterNotice('');
  };

  const tabClass = (tab) => (
    `crm-focus-ring crm-auth-tab ${authTab === tab ? 'is-active' : ''}`
  );

  const renderAuthContent = ({ inline = false } = {}) => (
    <div className={inline ? 'crm-auth-inline-body crm-scrollbar' : 'crm-scrollbar max-h-[calc(100svh-9rem)] overflow-y-auto px-5 py-5 sm:px-6'}>
      {authTab === 'login' ? (
        <form onSubmit={handlePasswordSubmit} className={inline ? 'space-y-3' : 'space-y-4'}>
          <div>
            <label htmlFor={inline ? 'inline-email-login' : 'email-login'} className="mb-2 block text-sm font-semibold text-crm-text">Email или никнейм</label>
            <input
              id={inline ? 'inline-email-login' : 'email-login'}
              type="text"
              name="email-login"
              value={emailLogin}
              onChange={(event) => setEmailLogin(event.target.value)}
              className={inputClassName}
              placeholder="mail@example.com или @username"
              required
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor={inline ? 'inline-password' : 'password'} className="mb-2 block text-sm font-semibold text-crm-text">Пароль</label>
            <div className="relative">
              <input
                id={inline ? 'inline-password' : 'password'}
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${inputClassName} pr-12`}
                placeholder="Введите пароль"
                required
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="crm-focus-ring absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[1rem] text-crm-muted transition-colors hover:text-crm-text"
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                tabIndex={-1}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLoginNotice('Восстановление пароля пока не подключено в web-интерфейсе. Используйте вход через OAuth или обратитесь к владельцу компании.')}
            className="crm-focus-ring -mt-1 inline-flex text-sm font-semibold text-crm-accent transition hover:text-crm-text"
          >
            Забыли пароль?
          </button>

          {error && <div role="alert" className="rounded-[1.1rem] border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger">{error}</div>}
          {loginNotice && <div className="rounded-[1.1rem] border border-crm-warning/30 bg-crm-warning/10 px-4 py-3 text-sm leading-relaxed text-crm-warning">{loginNotice}</div>}

          <button
            type="submit"
            disabled={loading}
            className="crm-focus-ring flex min-h-12 w-full items-center justify-center rounded-[1.25rem] bg-gradient-to-r from-crm-accent to-[var(--crm-accent-strong)] px-4 text-base font-semibold text-white shadow-crmGlow transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegistrationSubmit} className={inline ? 'space-y-3' : 'space-y-4'}>
          <div>
            <label htmlFor={inline ? 'inline-register-username' : 'register-username'} className="mb-2 block text-sm font-semibold text-crm-text">Никнейм</label>
            <div className={`crm-input-surface flex h-12 items-center rounded-[1.25rem] transition ${
              usernameValidation.status === 'invalid'
                ? 'border-crm-danger/55'
                : usernameCheckState === 'ready'
                  ? 'border-crm-success/45'
                  : ''
            }`}>
              <span className="flex h-full items-center border-r border-crm-border px-4 text-base font-semibold text-crm-muted">@</span>
              <input
                id={inline ? 'inline-register-username' : 'register-username'}
                type="text"
                value={registerForm.username}
                onChange={(event) => {
                  const username = normalizeUsernameInput(event.target.value);
                  setRegisterForm((prev) => ({ ...prev, username }));
                }}
                className="min-w-0 flex-1 bg-transparent px-3 text-base text-crm-text outline-none placeholder:text-crm-muted"
                placeholder="username"
                autoComplete="username"
                required
              />
            </div>
            <p className={`mt-2 text-xs leading-relaxed ${
              usernameValidation.status === 'invalid'
                ? 'text-crm-danger'
                : usernameCheckState === 'ready'
                  ? 'text-crm-success'
                  : 'text-crm-muted'
            }`}>
              {usernameHelpText}
            </p>
          </div>
          <div>
            <label htmlFor={inline ? 'inline-register-name' : 'register-name'} className="mb-2 block text-sm font-semibold text-crm-text">Отображаемое имя</label>
            <input
              id={inline ? 'inline-register-name' : 'register-name'}
              type="text"
              value={registerForm.name}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
              className={inputClassName}
              placeholder="Как вас увидит команда"
              autoComplete="name"
              required
            />
          </div>
          <div>
            <label htmlFor={inline ? 'inline-register-email' : 'register-email'} className="mb-2 block text-sm font-semibold text-crm-text">Email</label>
            <input
              id={inline ? 'inline-register-email' : 'register-email'}
              type="email"
              value={registerForm.email}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
              className={inputClassName}
              placeholder="mail@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={inline ? 'inline-register-password' : 'register-password'} className="mb-2 block text-sm font-semibold text-crm-text">Пароль</label>
              <input
                id={inline ? 'inline-register-password' : 'register-password'}
                type="password"
                value={registerForm.password}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                className={inputClassName}
                placeholder="Минимум 6 символов"
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label htmlFor={inline ? 'inline-register-confirm-password' : 'register-confirm-password'} className="mb-2 block text-sm font-semibold text-crm-text">Повтор пароля</label>
              <input
                id={inline ? 'inline-register-confirm-password' : 'register-confirm-password'}
                type="password"
                value={registerForm.confirmPassword}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                className={inputClassName}
                placeholder="Повторите пароль"
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <label className="crm-auth-note flex items-start gap-3 rounded-[1.1rem] border border-crm-border px-4 py-3 text-sm leading-relaxed text-crm-muted">
            <input
              type="checkbox"
              checked={acceptPolicy}
              onChange={(event) => setAcceptPolicy(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-crm-border accent-crm-accent"
            />
            <span>Согласен на обработку данных для регистрации аккаунта CRM24.</span>
          </label>

          {error && <div role="alert" className="rounded-[1.1rem] border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger">{error}</div>}
          {registerNotice && <div className="rounded-[1.1rem] border border-crm-warning/30 bg-crm-warning/10 px-4 py-3 text-sm leading-relaxed text-crm-warning">{registerNotice}</div>}

          <button
            type="submit"
            className="crm-focus-ring flex min-h-12 w-full items-center justify-center rounded-[1.25rem] border border-crm-accent/35 bg-crm-accent/12 px-4 text-base font-semibold text-crm-accent shadow-crmGlow transition-all duration-200 hover:bg-crm-accent/18"
          >
            Продолжить регистрацию
          </button>
        </form>
      )}

      <div className="crm-login-divider my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-crm-border" />
        <span className="text-[11px] uppercase tracking-wide text-crm-muted">или через сервис</span>
        <div className="h-px flex-1 bg-crm-border" />
      </div>

      <div className={`grid gap-2 ${inline ? 'crm-oauth-row--icon-only' : ''}`}>
        {oauthProviders.map((provider) => (
          <a
            key={provider.id}
            href={`/api/auth/oauth/${provider.id}`}
            onClick={() => rememberIntent(selectedScenario || AUTH_INTENT_CHOICE)}
            className="crm-focus-ring crm-oauth-button flex min-h-12 items-center justify-start gap-3 rounded-[1.25rem] border border-crm-border px-4 text-sm font-semibold text-crm-text transition"
            aria-label={`Войти через ${provider.label}`}
            title={`Войти через ${provider.label}`}
          >
            <span className="crm-oauth-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-crm-border text-crm-text">
              <OAuthIcon provider={provider.id} />
            </span>
            <span className="crm-oauth-label">Войти через {provider.label}</span>
          </a>
        ))}
      </div>

      {oauthErrorText && (
        <div className="mt-4 rounded-[1.1rem] border border-crm-warning/35 bg-crm-warning/10 px-4 py-3 text-sm leading-relaxed text-crm-warning">
          {oauthErrorText}
        </div>
      )}

      <div className="crm-auth-note crm-login-safe-note mt-4 flex items-start gap-2.5 rounded-[1.1rem] border border-crm-border/60 px-4 py-3">
        <ShieldIcon />
        <p className="text-xs leading-relaxed text-crm-muted">
          OAuth endpoints и callback URL не менялись. Пароли, токены и коды доступа не сохраняются во frontend.
        </p>
      </div>
    </div>
  );

  const renderInlineAuth = (item) => (
    <div
      className={`crm-split-inline-auth crm-split-inline-auth--${item.id} is-open`}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="crm-split-inline-auth__header">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-crm-accent">{item.title}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-crm-text">
            {authTab === 'login' ? 'Вход' : 'Регистрация'}
          </h2>
        </div>
        <button
          type="button"
          onClick={closeInlineAuth}
          className="crm-focus-ring crm-auth-close flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] border border-crm-border text-crm-muted transition hover:text-crm-text"
          aria-label="Закрыть форму"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="crm-auth-tabs mt-4 flex rounded-[1.2rem] border border-crm-border p-1">
        <button type="button" onClick={() => { setAuthTab('login'); resetAuthMessages(); }} className={tabClass('login')}>
          Вход
        </button>
        <button type="button" onClick={() => { setAuthTab('register'); resetAuthMessages(); }} className={tabClass('register')}>
          Регистрация
        </button>
      </div>

      {renderAuthContent({ inline: true })}
    </div>
  );

  const activateScenario = (intent) => {
    if (inlineScenario && inlineScenario !== intent) return;
    setActiveScenario(intent);
  };

  const clearScenario = () => {
    if (inlineScenario) return;
    setActiveScenario(null);
  };

  return (
    <main className="crm-app-bg crm-login-screen crm-mobile-safe-bottom relative min-h-[100svh] overflow-x-hidden text-crm-text">
      <section
        className="crm-split-desktop hidden min-h-[100svh] lg:block"
        data-active={activeScenario || 'none'}
      >
        <div className="crm-split-desktop__stage">
          {scenarios.map((item) => (
            <ScenarioPanel
              key={item.id}
              item={item}
              activeScenario={activeScenario}
              pressedScenario={pressedScenario}
              isInlineOpen={inlineScenario === item.id}
              inlineAuth={inlineScenario === item.id ? renderInlineAuth(item) : null}
              onActivate={activateScenario}
              onClear={clearScenario}
              onOpen={openScenarioAuth}
            />
          ))}
        </div>

        <div
          className={`crm-split-center ${inlineScenario ? 'is-inline-auth-open' : ''}`}
          aria-hidden={authOpen || inlineScenario ? 'true' : 'false'}
        >
          <div className="crm-split-center__top">
            <BrandMark compact />
            <h1>Вход в рабочее пространство</h1>
            <p>Выберите сторону или войдите в уже существующий аккаунт.</p>
            <button
              type="button"
              onClick={openExistingLogin}
              className="crm-focus-ring crm-split-login-pill"
            >
              <span>Уже есть аккаунт?</span>
              <strong>Войти</strong>
            </button>
          </div>
        </div>
      </section>

      <section
        className={`crm-mobile-login crm-mobile-split-login px-4 py-4 lg:hidden ${pressedScenario ? 'is-splitting' : ''} ${inlineScenario ? 'is-inline-auth-open' : ''}`}
        data-active={inlineScenario || pressedScenario || 'none'}
      >
        <div className="crm-mobile-split-stage mx-auto max-w-[31rem]">
          <div className="crm-mobile-split-brand">
            <BrandMark compact />
            <h1>Вход в рабочее пространство</h1>
            <p>Выберите сценарий или войдите в существующий аккаунт.</p>
          </div>

          <MobileScenarioCard
            item={scenarios[0]}
            pressedScenario={pressedScenario}
            isInlineOpen={inlineScenario === scenarios[0].id}
            inlineAuth={inlineScenario === scenarios[0].id ? renderInlineAuth(scenarios[0]) : null}
            onOpen={openScenarioAuth}
          />

          <div className="crm-mobile-split-axis">
            <button
              type="button"
              onClick={openExistingLogin}
              className="crm-focus-ring crm-mobile-login-pill"
            >
              <span>Уже есть аккаунт?</span>
              <strong>Войти</strong>
            </button>
          </div>

          <MobileScenarioCard
            item={scenarios[1]}
            pressedScenario={pressedScenario}
            isInlineOpen={inlineScenario === scenarios[1].id}
            inlineAuth={inlineScenario === scenarios[1].id ? renderInlineAuth(scenarios[1]) : null}
            onOpen={openScenarioAuth}
          />
        </div>
      </section>

      {authOpen && (
        <div
          className="crm-auth-backdrop fixed inset-0 z-50 flex items-end justify-center bg-[rgba(2,18,28,0.54)] p-0 backdrop-blur-md sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAuth();
          }}
        >
          <div className="crm-auth-sheet crm-glass w-full max-w-[34rem] overflow-hidden rounded-t-[2rem] border border-crm-border shadow-crmCard sm:rounded-[2rem]">
            <div className="border-b border-crm-border px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-crm-accent">{scenario?.title || 'Уже есть аккаунт'}</p>
                  <h2 id="auth-dialog-title" className="mt-1 text-2xl font-semibold tracking-tight text-crm-text">
                    {authTab === 'login' ? 'Вход' : 'Регистрация'}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-crm-muted">{scenario?.text || 'Войдите в рабочую CRM без повторного выбора сценария'}</p>
                </div>
                <button
                  type="button"
                  onClick={closeAuth}
                  className="crm-focus-ring crm-auth-close flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-crm-border text-crm-muted transition hover:text-crm-text"
                  aria-label="Закрыть окно входа"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
              {scenario && (
                <div className="crm-auth-tabs mt-4 flex rounded-[1.2rem] border border-crm-border p-1">
                  <button type="button" onClick={() => { setAuthTab('login'); resetAuthMessages(); }} className={tabClass('login')}>
                    Вход
                  </button>
                  <button type="button" onClick={() => { setAuthTab('register'); resetAuthMessages(); }} className={tabClass('register')}>
                    Регистрация
                  </button>
                </div>
              )}
            </div>

            <div className="crm-scrollbar max-h-[calc(100svh-9rem)] overflow-y-auto px-5 py-5 sm:px-6">
              {authTab === 'login' ? (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email-login" className="mb-2 block text-sm font-semibold text-crm-text">Email или никнейм</label>
                    <input
                      id="email-login"
                      type="text"
                      name="email-login"
                      value={emailLogin}
                      onChange={(event) => setEmailLogin(event.target.value)}
                      className={inputClassName}
                      placeholder="mail@example.com или @username"
                      required
                      autoComplete="username"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="mb-2 block text-sm font-semibold text-crm-text">Пароль</label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className={`${inputClassName} pr-12`}
                        placeholder="Введите пароль"
                        required
                        autoComplete="current-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="crm-focus-ring absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[1rem] text-crm-muted transition-colors hover:text-crm-text"
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                        tabIndex={-1}
                      >
                        <EyeIcon open={showPassword} />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLoginNotice('Восстановление пароля пока не подключено в web-интерфейсе. Используйте вход через OAuth или обратитесь к владельцу компании.')}
                    className="crm-focus-ring -mt-1 inline-flex text-sm font-semibold text-crm-accent transition hover:text-crm-text"
                  >
                    Забыли пароль?
                  </button>

                  {error && <div role="alert" className="rounded-[1.1rem] border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger">{error}</div>}
                  {loginNotice && <div className="rounded-[1.1rem] border border-crm-warning/30 bg-crm-warning/10 px-4 py-3 text-sm leading-relaxed text-crm-warning">{loginNotice}</div>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="crm-focus-ring flex min-h-12 w-full items-center justify-center rounded-[1.25rem] bg-gradient-to-r from-crm-accent to-[var(--crm-accent-strong)] px-4 text-base font-semibold text-white shadow-crmGlow transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? 'Вход...' : 'Войти'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegistrationSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="register-username" className="mb-2 block text-sm font-semibold text-crm-text">Никнейм</label>
                    <div className={`crm-input-surface flex h-12 items-center rounded-[1.25rem] transition ${
                      usernameValidation.status === 'invalid'
                        ? 'border-crm-danger/55'
                        : usernameCheckState === 'ready'
                          ? 'border-crm-success/45'
                          : ''
                    }`}>
                      <span className="flex h-full items-center border-r border-crm-border px-4 text-base font-semibold text-crm-muted">@</span>
                      <input
                        id="register-username"
                        type="text"
                        value={registerForm.username}
                        onChange={(event) => {
                          const username = normalizeUsernameInput(event.target.value);
                          setRegisterForm((prev) => ({ ...prev, username }));
                        }}
                        className="min-w-0 flex-1 bg-transparent px-3 text-base text-crm-text outline-none placeholder:text-crm-muted"
                        placeholder="username"
                        autoComplete="username"
                        required
                      />
                    </div>
                    <p className={`mt-2 text-xs leading-relaxed ${
                      usernameValidation.status === 'invalid'
                        ? 'text-crm-danger'
                        : usernameCheckState === 'ready'
                          ? 'text-crm-success'
                          : 'text-crm-muted'
                    }`}>
                      {usernameHelpText}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="register-name" className="mb-2 block text-sm font-semibold text-crm-text">Отображаемое имя</label>
                    <input
                      id="register-name"
                      type="text"
                      value={registerForm.name}
                      onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                      className={inputClassName}
                      placeholder="Как вас увидит команда"
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="register-email" className="mb-2 block text-sm font-semibold text-crm-text">Email</label>
                    <input
                      id="register-email"
                      type="email"
                      value={registerForm.email}
                      onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                      className={inputClassName}
                      placeholder="mail@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="register-password" className="mb-2 block text-sm font-semibold text-crm-text">Пароль</label>
                      <input
                        id="register-password"
                        type="password"
                        value={registerForm.password}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                        className={inputClassName}
                        placeholder="Минимум 6 символов"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="register-confirm-password" className="mb-2 block text-sm font-semibold text-crm-text">Повтор пароля</label>
                      <input
                        id="register-confirm-password"
                        type="password"
                        value={registerForm.confirmPassword}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                        className={inputClassName}
                        placeholder="Повторите пароль"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  </div>
                  <label className="crm-auth-note flex items-start gap-3 rounded-[1.1rem] border border-crm-border px-4 py-3 text-sm leading-relaxed text-crm-muted">
                    <input
                      type="checkbox"
                      checked={acceptPolicy}
                      onChange={(event) => setAcceptPolicy(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-crm-border accent-crm-accent"
                    />
                    <span>Согласен на обработку данных для регистрации аккаунта CRM24.</span>
                  </label>

                  {error && <div role="alert" className="rounded-[1.1rem] border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger">{error}</div>}
                  {registerNotice && <div className="rounded-[1.1rem] border border-crm-warning/30 bg-crm-warning/10 px-4 py-3 text-sm leading-relaxed text-crm-warning">{registerNotice}</div>}

                  <button
                    type="submit"
                    className="crm-focus-ring flex min-h-12 w-full items-center justify-center rounded-[1.25rem] border border-crm-accent/35 bg-crm-accent/12 px-4 text-base font-semibold text-crm-accent shadow-crmGlow transition-all duration-200 hover:bg-crm-accent/18"
                  >
                    Продолжить регистрацию
                  </button>
                </form>
              )}

              <div className="crm-login-divider my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-crm-border" />
                <span className="text-[11px] uppercase tracking-wide text-crm-muted">или через сервис</span>
                <div className="h-px flex-1 bg-crm-border" />
              </div>

              <div className="grid gap-2">
                {oauthProviders.map((provider) => (
                  <a
                    key={provider.id}
                    href={`/api/auth/oauth/${provider.id}`}
                    onClick={() => rememberIntent(selectedScenario || AUTH_INTENT_CHOICE)}
                    className="crm-focus-ring crm-oauth-button flex min-h-12 items-center justify-start gap-3 rounded-[1.25rem] border border-crm-border px-4 text-sm font-semibold text-crm-text transition"
                    aria-label={`Войти через ${provider.label}`}
                    title={`Войти через ${provider.label}`}
                  >
                    <span className="crm-oauth-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-crm-border text-crm-text">
                      <OAuthIcon provider={provider.id} />
                    </span>
                    <span>Войти через {provider.label}</span>
                  </a>
                ))}
              </div>

              {oauthErrorText && (
                <div className="mt-4 rounded-[1.1rem] border border-crm-warning/35 bg-crm-warning/10 px-4 py-3 text-sm leading-relaxed text-crm-warning">
                  {oauthErrorText}
                </div>
              )}

              <div className="crm-auth-note crm-login-safe-note mt-4 flex items-start gap-2.5 rounded-[1.1rem] border border-crm-border/60 px-4 py-3">
                <ShieldIcon />
                <p className="text-xs leading-relaxed text-crm-muted">
                  OAuth endpoints и callback URL не менялись. Пароли, токены и коды доступа не сохраняются во frontend.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
