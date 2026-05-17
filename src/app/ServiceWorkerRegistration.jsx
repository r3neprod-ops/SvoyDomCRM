'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const { hostname, protocol } = window.location;
    const isSecureContext = protocol === 'https:' || hostname === 'localhost';
    if (!isSecureContext) return;

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  }, []);

  return null;
}
