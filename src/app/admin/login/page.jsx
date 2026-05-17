'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // WebAuthn
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return;
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setBiometricSupported)
      .catch(() => {});
  }, []);

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
        router.push('/admin/dashboard');
      } else {
        setError(data.message || 'Ошибка входа');
      }
    } catch {
      setError('Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    const name = username.trim();
    if (!name) {
      setError('Введите логин для входа по биометрии');
      return;
    }
    setBiometricLoading(true);
    setError('');
    try {
      // 1. Get authentication options from server
      const optRes = await fetch('/api/auth/webauthn/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name }),
      });
      const optData = await optRes.json();
      if (!optData.ok) {
        setError(optData.message || 'Не удалось получить параметры');
        return;
      }

      // 2. Prompt browser biometric
      let credential;
      try {
        credential = await startAuthentication({ optionsJSON: optData.options });
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          setError('Биометрия отклонена или не подтверждена');
        } else {
          setError(err.message || 'Ошибка биометрии');
        }
        return;
      }

      // 3. Verify on server and get JWT
      const verRes = await fetch('/api/auth/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, credential }),
      });
      const verData = await verRes.json();
      if (!verData.ok) {
        setError(verData.message || 'Верификация не прошла');
        return;
      }

      router.push('/admin/dashboard');
    } catch {
      setError('Ошибка сервера');
    } finally {
      setBiometricLoading(false);
    }
  };

  const showBiometric = biometricSupported && username.trim().length > 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Вход в панель</h1>
        <p className="mt-1 text-sm text-slate-500">SvoyDom CRM</p>

        {/* Biometric button — appears after username is typed */}
        {showBiometric && (
          <button
            type="button"
            onClick={handleBiometric}
            disabled={biometricLoading}
            className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-100 disabled:opacity-60"
          >
            {biometricLoading ? (
              <span>Ожидание биометрии...</span>
            ) : (
              <>
                <span className="text-xl">🔑</span>
                <span>Войти по биометрии</span>
              </>
            )}
          </button>
        )}

        {showBiometric && (
          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs text-slate-400">или</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>
        )}

        <form onSubmit={handleSubmit} className={showBiometric ? '' : 'mt-6'}>
          <div className={showBiometric ? 'space-y-4' : 'space-y-4 mt-0'}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Логин</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="admin"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </main>
  );
}
