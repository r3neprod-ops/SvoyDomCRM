'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

const SEEN_KEY = 'crm24-install-prompt-seen';
const INSTALLED_KEY = 'crm24-install-prompt-installed';
const INSTALL_PROMPT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PWA_PROMPT !== '0';

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isNativeApp() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function isIosDevice() {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

function isSafari() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
}

function hasStorageFlag(key) {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function setStorageFlag(key) {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Local storage can be unavailable in private browser modes.
  }
}

function shouldSuppressPrompt() {
  if (isNativeApp() || isStandaloneMode()) return true;
  return hasStorageFlag(SEEN_KEY) || hasStorageFlag(INSTALLED_KEY);
}

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState('install');

  useEffect(() => {
    if (!INSTALL_PROMPT_ENABLED || shouldSuppressPrompt()) return;

    let fallbackTimer;

    const show = (nextMode) => {
      if (shouldSuppressPrompt()) return;
      setMode(nextMode);
      setVisible(true);
    };

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      show('install');
    };

    const onAppInstalled = () => {
      setStorageFlag(INSTALLED_KEY);
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    if (isIosDevice() && isSafari()) {
      fallbackTimer = window.setTimeout(() => show('ios'), 2200);
    }

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const dismiss = () => {
    setStorageFlag(SEEN_KEY);
    setVisible(false);
    setDeferredPrompt(null);
  };

  const install = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    setDeferredPrompt(null);

    if (choice?.outcome === 'accepted') {
      setStorageFlag(INSTALLED_KEY);
    } else {
      setStorageFlag(SEEN_KEY);
    }

    setVisible(false);
  };

  if (!INSTALL_PROMPT_ENABLED || !visible || shouldSuppressPrompt()) return null;

  const canInstall = Boolean(deferredPrompt);
  const title = mode === 'ios' ? 'Добавить CRM24 на экран Домой' : 'Установить CRM24';
  const description =
    mode === 'ios'
      ? 'Откройте CRM в Safari, нажмите «Поделиться» и выберите «На экран Домой». Подсказка появится только один раз.'
      : 'CRM откроется отдельной иконкой, без адресной строки браузера и с быстрым доступом к работе.';

  return (
    <div className="crm-install-prompt" role="dialog" aria-modal="false" aria-labelledby="crm-install-title">
      <div className="crm-install-prompt__scrim" aria-hidden="true" />
      <section className="crm-install-prompt__panel">
        <button
          type="button"
          className="crm-install-prompt__close crm-focus-ring"
          onClick={dismiss}
          aria-label="Закрыть окно установки"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="crm-install-prompt__top">
          <Image className="crm-install-prompt__icon" src="/icon-192.png" alt="" width={58} height={58} priority={false} />
          <div className="crm-install-prompt__copy">
            <p className="crm-install-prompt__eyebrow">Приложение CRM24</p>
            <h2 id="crm-install-title">{title}</h2>
            <p>{description}</p>
          </div>
        </div>

        <div className="crm-install-prompt__benefits" aria-label="Преимущества установки">
          <span>Быстрый запуск</span>
          <span>Без адресной строки</span>
          <span>Уведомления</span>
        </div>

        <div className={`crm-install-prompt__actions${canInstall ? '' : ' crm-install-prompt__actions--single'}`}>
          {canInstall && (
            <button type="button" className="crm-install-prompt__primary crm-focus-ring" onClick={install}>
              Установить
            </button>
          )}
          <button type="button" className="crm-install-prompt__secondary crm-focus-ring" onClick={dismiss}>
            {canInstall ? 'Не сейчас' : 'Понятно'}
          </button>
        </div>
      </section>
    </div>
  );
}
