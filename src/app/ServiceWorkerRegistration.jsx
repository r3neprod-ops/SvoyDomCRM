'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (window.Capacitor?.isNativePlatform?.()) return;
    if (!('serviceWorker' in navigator)) return;

    const { hostname, protocol } = window.location;
    const isSecureContext = protocol === 'https:' || hostname === 'localhost';
    if (!isSecureContext) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      reg.update().catch(() => undefined);
    }).catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  }, []);

  return null;
}
