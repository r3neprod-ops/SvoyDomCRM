'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  const reloadPage = () => {
    window.location.reload();
  };

  return (
    <html lang="ru">
      <body>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'var(--crm-gradient-app, #0b0f14)',
            color: 'var(--crm-text, #f4f7fb)',
            fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          <section
            style={{
              width: '100%',
              maxWidth: '460px',
              border: '1px solid var(--crm-border, rgba(255,255,255,.12))',
              borderRadius: '18px',
              background: 'var(--crm-surface, rgba(18,24,31,.9))',
              boxShadow: 'var(--crm-shadow-card, 0 22px 58px rgba(0,0,0,.45))',
              padding: '28px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                margin: '0 0 10px',
                color: 'var(--crm-accent, #2dd4bf)',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
              }}
            >
              CRM24
            </p>
            <h1 style={{ margin: 0, fontSize: '26px', lineHeight: 1.15 }}>
              Нужно обновить страницу
            </h1>
            <p
              style={{
                margin: '14px 0 22px',
                color: 'var(--crm-text-muted, rgba(183,194,207,.72))',
                fontSize: '14px',
                lineHeight: 1.6,
              }}
            >
              Приложение обновилось, а браузер оставил старую версию экрана.
              Обновите страницу, и вход продолжит работать.
            </p>
            <div style={{ display: 'grid', gap: '10px' }}>
              <button
                type="button"
                onClick={reloadPage}
                style={{
                  minHeight: '46px',
                  border: 0,
                  borderRadius: '14px',
                  background: 'var(--crm-gradient-primary, linear-gradient(135deg, #2dd4bf 0%, #60a5fa 100%))',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 700,
                }}
              >
                Обновить страницу
              </button>
              <button
                type="button"
                onClick={reset}
                style={{
                  minHeight: '44px',
                  border: '1px solid var(--crm-border, rgba(255,255,255,.12))',
                  borderRadius: '14px',
                  background: 'transparent',
                  color: 'var(--crm-text, #f4f7fb)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Попробовать еще раз
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
