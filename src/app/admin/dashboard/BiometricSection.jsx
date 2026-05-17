'use client';

import { useCallback, useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';

function fmtDate(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export default function BiometricSection() {
  const [supported, setSupported] = useState(false);
  const [credentials, setCredentials] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [regLoading, setRegLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const loadCreds = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/auth/webauthn/credentials');
      const data = await res.json();
      if (data.ok) setCredentials(data.credentials);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !window.PublicKeyCredential
    ) return;
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((ok) => {
        setSupported(ok);
        if (ok) loadCreds();
        else setLoadingList(false);
      })
      .catch(() => setLoadingList(false));
  }, [loadCreds]);

  const handleRegister = async () => {
    setRegLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const optRes = await fetch('/api/auth/webauthn/register-options', { method: 'POST' });
      const optData = await optRes.json();
      if (!optData.ok) throw new Error(optData.message || 'Не удалось получить параметры');

      let credential;
      try {
        credential = await startRegistration({ optionsJSON: optData.options });
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          showMsg('error', 'Биометрия отклонена или не подтверждена');
        } else {
          showMsg('error', err.message || 'Ошибка биометрии');
        }
        return;
      }

      const verRes = await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const verData = await verRes.json();
      if (!verData.ok) throw new Error(verData.message || 'Ошибка верификации');

      showMsg('ok', 'Биометрия успешно добавлена!');
      loadCreds();
    } catch (err) {
      showMsg('error', err.message || 'Ошибка регистрации');
    } finally {
      setRegLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await fetch(`/api/auth/webauthn/credential/${id}`, { method: 'DELETE' });
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      showMsg('ok', 'Устройство удалено');
    } catch {
      showMsg('error', 'Не удалось удалить');
    } finally {
      setDeletingId(null);
    }
  };

  if (!supported && !loadingList) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-semibold">Биометрический вход</h2>
        <p className="mt-1 text-sm text-slate-500">
          Входите по отпечатку пальца или Face ID без пароля.
        </p>
      </div>

      <div className="px-5 py-5 space-y-4">
        {message.text && (
          <p className={`rounded-lg px-3 py-2 text-sm ${
            message.type === 'ok'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600'
          }`}>
            {message.text}
          </p>
        )}

        {loadingList ? (
          <p className="text-sm text-slate-400">Загрузка...</p>
        ) : credentials.length === 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-600">Биометрия ещё не настроена.</p>
            <button
              onClick={handleRegister}
              disabled={regLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {regLoading ? (
                <span>Подождите...</span>
              ) : (
                <>
                  <span>🔑</span>
                  <span>Включить вход по биометрии</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {credentials.map((cred) => (
                <li key={cred.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{cred.device_name || 'Устройство'}</p>
                    <p className="text-xs text-slate-400">Добавлено {fmtDate(cred.created_at)}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(cred.id)}
                    disabled={deletingId === cred.id}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                  >
                    {deletingId === cred.id ? '...' : 'Удалить'}
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={handleRegister}
              disabled={regLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {regLoading ? 'Подождите...' : '+ Добавить ещё устройство'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
