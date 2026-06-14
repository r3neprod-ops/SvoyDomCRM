'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const PIN_LENGTH = 4;
const LOCK_PREFIX = 'crm24-app-lock-v1:';
const SESSION_PREFIX = 'crm24-app-unlocked-v1:';
const BIOMETRIC_SERVER = '24crmka.ru';

function isNativeApp() {
  return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
}

function userKey(profile) {
  return String(profile?.id || profile?.username || 'current');
}

function storageKey(profile) {
  return `${LOCK_PREFIX}${userKey(profile)}`;
}

function sessionKey(profile) {
  return `${SESSION_PREFIX}${userKey(profile)}`;
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin, salt, profile) {
  return sha256(`${salt}:${userKey(profile)}:${pin}`);
}

function loadLock(profile) {
  try {
    const raw = window.localStorage.getItem(storageKey(profile));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLock(profile, value) {
  window.localStorage.setItem(storageKey(profile), JSON.stringify(value));
}

function clearUnlockSession(profile) {
  try {
    window.sessionStorage.removeItem(sessionKey(profile));
  } catch {
    // local storage can be disabled in some embedded browsers
  }
}

function markUnlockSession(profile) {
  window.sessionStorage.setItem(sessionKey(profile), '1');
}

async function getNativeBiometric() {
  const biometricModule = await import('@capgo/capacitor-native-biometric');
  return biometricModule.NativeBiometric;
}

async function isBiometricAvailable() {
  try {
    const NativeBiometric = await getNativeBiometric();
    const result = await NativeBiometric.isAvailable({ useFallback: true });
    return Boolean(result?.isAvailable);
  } catch {
    return false;
  }
}

async function verifyBiometricIdentity(title) {
  const NativeBiometric = await getNativeBiometric();
  await NativeBiometric.verifyIdentity({
    title,
    reason: 'Подтвердите вход в CRM24',
    subtitle: 'CRM24',
    description: 'Используйте биометрию устройства или системный PIN.',
    negativeButtonText: 'PIN-код',
    useFallback: true,
    maxAttempts: 3,
  });
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20.25a7.5 7.5 0 0 1 15 0M17.25 14.25l1.5 1.5 2.75-3" />
    </svg>
  );
}

function BackspaceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.75H9.75L3.75 12l6 5.25h10.5a1.5 1.5 0 0 0 1.5-1.5v-7.5a1.5 1.5 0 0 0-1.5-1.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 9.75 4.5 4.5m0-4.5-4.5 4.5" />
    </svg>
  );
}

function PinDots({ value }) {
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length: PIN_LENGTH }, (_, index) => (
        <span
          key={index}
          className={`h-3.5 w-3.5 rounded-full border transition-all duration-200 ${
            index < value.length ? 'border-crm-accent bg-crm-accent shadow-crmGlow' : 'border-crm-border bg-crm-surface/70'
          }`}
        />
      ))}
    </div>
  );
}

function PinPad({ disabled, onDigit, onErase }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'erase'];

  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((key, index) => {
        if (!key) return <span key={`empty-${index}`} />;
        if (key === 'erase') {
          return (
            <button
              key={key}
              type="button"
              onClick={onErase}
              disabled={disabled}
              className="crm-focus-ring flex h-14 items-center justify-center rounded-crmXl border border-crm-border bg-crm-surface/50 text-crm-muted transition hover:border-crm-accent/40 hover:text-crm-text disabled:opacity-50"
              aria-label="Удалить цифру"
            >
              <BackspaceIcon />
            </button>
          );
        }
        return (
          <button
            key={key}
            type="button"
            onClick={() => onDigit(key)}
            disabled={disabled}
            className="crm-focus-ring flex h-14 items-center justify-center rounded-crmXl border border-crm-border bg-crm-surface/50 text-xl font-semibold text-crm-text transition hover:border-crm-accent/40 hover:bg-crm-accent/10 disabled:opacity-50"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

function AppLockShell({ children, profile, title, subtitle, error, footer }) {
  const displayName = profile?.name || profile?.username || 'Аккаунт';
  const username = profile?.username ? `@${profile.username}` : '';

  return (
    <main className="crm-app-bg crm-mobile-safe-bottom flex min-h-[100svh] items-center justify-center px-4 py-6">
      <section className="crm-glass w-full max-w-[420px] rounded-crm2xl border border-crm-border p-5 shadow-crmCard">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-crmXl border border-crm-accent/40 bg-crm-accent/10 text-crm-accent shadow-crmGlow">
            <KeyIcon />
          </div>
          <p className="text-sm font-semibold text-crm-text">{displayName}</p>
          {username && <p className="mt-1 text-xs text-crm-muted">{username}</p>}
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold leading-tight text-crm-text">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-crm-muted">{subtitle}</p>}
        </div>

        <div className="space-y-5">
          {children}
          {error && <div className="rounded-crmXl border border-crm-danger/30 bg-crm-danger/10 px-4 py-3 text-sm text-crm-danger">{error}</div>}
          {footer}
        </div>
      </section>
    </main>
  );
}

export default function AppLock({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState('checking');
  const [profile, setProfile] = useState(null);
  const [lockConfig, setLockConfig] = useState(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [autoBiometricTried, setAutoBiometricTried] = useState(false);
  const [setupStep, setSetupStep] = useState('create');
  const [setupPin, setSetupPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [unlockPin, setUnlockPin] = useState('');
  const [error, setError] = useState('');

  const shouldRun = useMemo(() => {
    return isNativeApp() && !pathname?.startsWith('/admin/login');
  }, [pathname]);

  const markUnlocked = useCallback(
    (targetProfile = profile) => {
      if (targetProfile) markUnlockSession(targetProfile);
      setStatus('unlocked');
      setError('');
    },
    [profile]
  );

  const runBiometric = useCallback(
    async ({ silent = false, setup = false } = {}) => {
      if (!profile || biometricBusy) return false;
      setBiometricBusy(true);
      if (!silent) setError('');
      try {
        await verifyBiometricIdentity(setup ? 'Включить биометрию' : 'Вход в CRM24');
        if (setup && lockConfig) {
          const nextConfig = { ...lockConfig, biometricEnabled: true };
          saveLock(profile, nextConfig);
          setLockConfig(nextConfig);
        }
        markUnlocked(profile);
        return true;
      } catch {
        if (!silent) setError('Не получилось подтвердить биометрию. Введите PIN-код.');
        return false;
      } finally {
        setBiometricBusy(false);
      }
    },
    [biometricBusy, lockConfig, markUnlocked, profile]
  );

  useEffect(() => {
    if (!shouldRun) {
      setStatus('unlocked');
      return;
    }

    let cancelled = false;

    async function boot() {
      setStatus('checking');
      setError('');
      try {
        const response = await fetch('/api/profile', { cache: 'no-store' });
        if (!response.ok) {
          setStatus('unlocked');
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!data.ok || !data.profile) {
          setStatus('unlocked');
          return;
        }

        const nextProfile = data.profile;
        const nativeBiometricAvailable = await isBiometricAvailable();
        if (cancelled) return;

        setProfile(nextProfile);
        setBiometricAvailable(nativeBiometricAvailable);
        setAutoBiometricTried(false);
        setSetupStep('create');
        setSetupPin('');
        setConfirmPin('');
        setUnlockPin('');

        const existingLock = loadLock(nextProfile);
        setLockConfig(existingLock);

        if (window.sessionStorage.getItem(sessionKey(nextProfile)) === '1') {
          setStatus('unlocked');
        } else if (existingLock?.pinHash && existingLock?.pinSalt) {
          setStatus('locked');
        } else {
          setStatus('setup');
        }
      } catch {
        setStatus('unlocked');
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [shouldRun]);

  useEffect(() => {
    if (status !== 'locked' || autoBiometricTried || !lockConfig?.biometricEnabled || !biometricAvailable) return;
    setAutoBiometricTried(true);
    const timer = window.setTimeout(() => {
      runBiometric({ silent: true });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [autoBiometricTried, biometricAvailable, lockConfig?.biometricEnabled, runBiometric, status]);

  useEffect(() => {
    if (status !== 'setup' || setupStep !== 'confirm' || confirmPin.length !== PIN_LENGTH || !profile) return;

    async function finishSetup() {
      if (confirmPin !== setupPin) {
        setError('PIN-коды не совпали. Введите заново.');
        setSetupStep('create');
        setSetupPin('');
        setConfirmPin('');
        return;
      }

      const pinSalt = randomSalt();
      const pinHash = await hashPin(setupPin, pinSalt, profile);
      const nextConfig = {
        enabled: true,
        userKey: userKey(profile),
        username: profile.username || '',
        displayName: profile.name || '',
        pinSalt,
        pinHash,
        biometricEnabled: false,
        createdAt: new Date().toISOString(),
      };
      saveLock(profile, nextConfig);
      setLockConfig(nextConfig);
      setSetupPin('');
      setConfirmPin('');
      setError('');
      setStatus(biometricAvailable ? 'biometric' : 'unlocked');
      if (!biometricAvailable) markUnlocked(profile);
    }

    finishSetup();
  }, [biometricAvailable, confirmPin, markUnlocked, profile, setupPin, setupStep, status]);

  useEffect(() => {
    if (status !== 'locked' || unlockPin.length !== PIN_LENGTH || !profile || !lockConfig) return;

    async function verifyPin() {
      const pinHash = await hashPin(unlockPin, lockConfig.pinSalt, profile);
      if (pinHash === lockConfig.pinHash) {
        markUnlocked(profile);
      } else {
        setError('Неверный PIN-код.');
        window.setTimeout(() => setUnlockPin(''), 180);
      }
    }

    verifyPin();
  }, [lockConfig, markUnlocked, profile, status, unlockPin]);

  const addSetupDigit = (digit) => {
    setError('');
    if (setupStep === 'create') {
      setSetupPin((current) => {
        const next = `${current}${digit}`.slice(0, PIN_LENGTH);
        if (next.length === PIN_LENGTH) {
          window.setTimeout(() => setSetupStep('confirm'), 120);
        }
        return next;
      });
      return;
    }
    setConfirmPin((current) => `${current}${digit}`.slice(0, PIN_LENGTH));
  };

  const eraseSetupDigit = () => {
    setError('');
    if (setupStep === 'create') {
      setSetupPin((current) => current.slice(0, -1));
      return;
    }
    setConfirmPin((current) => current.slice(0, -1));
  };

  const signInAnotherAccount = async () => {
    if (profile) clearUnlockSession(profile);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/admin/login');
    router.refresh();
  };

  if (!shouldRun || status === 'unlocked') return children;

  if (status === 'checking' || !profile) {
    return (
      <main className="crm-app-bg flex min-h-[100svh] items-center justify-center px-4">
        <div className="crm-glass rounded-crm2xl border border-crm-border px-5 py-4 text-sm font-medium text-crm-muted shadow-crmCard">
          Проверяем вход...
        </div>
      </main>
    );
  }

  if (status === 'setup') {
    const pinValue = setupStep === 'create' ? setupPin : confirmPin;
    return (
      <AppLockShell
        profile={profile}
        title={setupStep === 'create' ? 'Создайте PIN-код' : 'Повторите PIN-код'}
        subtitle="Он будет нужен для входа в приложение, если биометрия недоступна."
        error={error}
        footer={
          <button type="button" onClick={() => markUnlocked(profile)} className="w-full text-center text-sm font-semibold text-crm-muted transition hover:text-crm-text">
            Настроить позже
          </button>
        }
      >
        <PinDots value={pinValue} />
        <PinPad disabled={pinValue.length >= PIN_LENGTH} onDigit={addSetupDigit} onErase={eraseSetupDigit} />
      </AppLockShell>
    );
  }

  if (status === 'biometric') {
    return (
      <AppLockShell
        profile={profile}
        title="Включить биометрию?"
        subtitle="После этого можно будет открывать CRM24 отпечатком, Face ID или системной защитой телефона."
        error={error}
        footer={
          <button type="button" onClick={() => markUnlocked(profile)} className="w-full text-center text-sm font-semibold text-crm-muted transition hover:text-crm-text">
            Пока только PIN
          </button>
        }
      >
        <button
          type="button"
          onClick={() => runBiometric({ setup: true })}
          disabled={biometricBusy}
          className="crm-focus-ring flex min-h-12 w-full items-center justify-center rounded-crmXl bg-gradient-to-r from-crm-accent to-[var(--crm-accent-strong)] px-4 text-sm font-semibold text-white shadow-crmGlow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {biometricBusy ? 'Проверяем...' : 'Включить биометрию'}
        </button>
      </AppLockShell>
    );
  }

  return (
    <AppLockShell
      profile={profile}
      title="Разблокируйте CRM24"
      subtitle="Введите PIN-код или подтвердите вход биометрией."
      error={error}
      footer={
        <button type="button" onClick={signInAnotherAccount} className="w-full text-center text-sm font-semibold text-crm-muted transition hover:text-crm-text">
          Войти в другой аккаунт
        </button>
      }
    >
      <PinDots value={unlockPin} />
      <PinPad
        disabled={unlockPin.length >= PIN_LENGTH}
        onDigit={(digit) => {
          setError('');
          setUnlockPin((current) => `${current}${digit}`.slice(0, PIN_LENGTH));
        }}
        onErase={() => {
          setError('');
          setUnlockPin((current) => current.slice(0, -1));
        }}
      />
      {lockConfig?.biometricEnabled && biometricAvailable && (
        <button
          type="button"
          onClick={() => runBiometric()}
          disabled={biometricBusy}
          className="crm-focus-ring flex min-h-12 w-full items-center justify-center rounded-crmXl border border-crm-border bg-crm-surface/45 px-4 text-sm font-semibold text-crm-text transition hover:border-crm-accent/40 hover:bg-crm-accent/10 hover:text-crm-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {biometricBusy ? 'Проверяем...' : 'Войти по биометрии'}
        </button>
      )}
    </AppLockShell>
  );
}
