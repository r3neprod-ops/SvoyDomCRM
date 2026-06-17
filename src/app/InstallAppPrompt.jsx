'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'crm24-install-dismissed-at';
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000;
const INSTALL_PROMPT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PWA_PROMPT === '1';

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isNativeApp() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 820px)').matches || /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

function getInstallMode() {
  if (typeof window === 'undefined') return 'hidden';
  const ua = window.navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (ios && !isStandaloneMode()) return 'ios';
  if (/Android/i.test(ua) && !isStandaloneMode()) return 'android';
  return 'mobile';
}

function shouldStayDismissed() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_TTL;
  } catch {
    return false;
  }
}

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState('hidden');

  useEffect(() => {
    if (!INSTALL_PROMPT_ENABLED) return;
    if (isNativeApp()) return;
    if (!isMobileDevice() || isStandaloneMode() || shouldStayDismissed()) return;

    const nextMode = getInstallMode();
    setMode(nextMode);

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setMode('android');
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => setVisible(false), { once: true });

    const fallbackTimer = window.setTimeout(() => {
      if (!isStandaloneMode()) setVisible(true);
    }, 1600);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    };
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Local storage can be blocked in private browser modes.
    }
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => undefined);
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!INSTALL_PROMPT_ENABLED || !visible || mode === 'hidden') return null;

  const title = mode === 'ios' ? 'Добавить CRM на экран Домой' : 'Установить CRM на телефон';
  const description =
    mode === 'ios'
      ? 'На iPhone откройте страницу в Safari, нажмите «Поделиться» и выберите «На экран Домой».'
      : 'Откройте CRM отдельной иконкой, без адресной строки браузера.';

  return (
    <div className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-md pb-[env(safe-area-inset-bottom)] sm:hidden">
      <div className="rounded-2xl border border-crm-border bg-crm-panel/96 p-4 shadow-crmCard backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-crm-accent/35 bg-crm-accent/12 text-sm font-black text-crm-accent">
            CRM
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-crm-text">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-crm-muted">{description}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {deferredPrompt && (
            <button
              type="button"
              onClick={install}
              className="crm-focus-ring flex-1 rounded-crmLg bg-crm-accent px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-crm-accent-strong"
            >
              Установить
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="crm-focus-ring flex-1 rounded-crmLg border border-crm-border bg-crm-surface/70 px-3 py-2 text-sm font-semibold text-crm-text transition hover:border-crm-accent/45"
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
