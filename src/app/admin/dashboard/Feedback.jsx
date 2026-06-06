'use client';

function toastClass(type) {
  const base = 'pointer-events-auto flex items-start gap-3 rounded-crmXl border px-4 py-3 text-sm shadow-crmCard backdrop-blur-xl';
  if (type === 'success') return `${base} border-crm-success/35 bg-crm-success/15 text-crm-success`;
  if (type === 'error') return `${base} border-crm-danger/35 bg-crm-danger/15 text-crm-danger`;
  if (type === 'warning') return `${base} border-crm-warning/35 bg-crm-warning/15 text-crm-warning`;
  return `${base} border-crm-border bg-[var(--crm-surface-strong)] text-crm-text`;
}

export function ToastStack({ toasts, onClose }) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-96">
      {toasts.map((toast) => (
        <div key={toast.id} className={toastClass(toast.type)} role="status" aria-live="polite">
          <p className="min-w-0 flex-1 leading-relaxed">{toast.message}</p>
          <button
            type="button"
            onClick={() => onClose(toast.id)}
            className="crm-focus-ring -mr-1 rounded-crmLg px-2 py-1 text-xs opacity-70 transition hover:bg-white/10 hover:opacity-100"
          >
            Закрыть
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog({ state, onCancel, onConfirm }) {
  if (!state) return null;
  const danger = state.tone === 'danger';
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
      <div className="crm-glass w-full max-w-md rounded-crm2xl border border-crm-border shadow-crmCard">
        <div className="border-b border-crm-border px-5 py-4">
          <h2 className="text-base font-semibold text-crm-text">{state.title}</h2>
          {state.message && <p className="mt-1.5 text-sm leading-relaxed text-crm-muted">{state.message}</p>}
        </div>
        <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="crm-focus-ring min-h-11 rounded-crmLg border border-crm-border px-4 py-2.5 text-sm text-crm-muted transition hover:bg-crm-surface/60 hover:text-crm-text"
          >
            {state.cancelLabel || 'Отмена'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`crm-focus-ring min-h-11 rounded-crmLg border px-4 py-2.5 text-sm font-medium transition ${
              danger
                ? 'border-crm-danger/40 bg-crm-danger/15 text-crm-danger hover:bg-crm-danger/22'
                : 'border-crm-accent/40 bg-crm-accent/15 text-crm-accent hover:bg-crm-accent/22'
            }`}
          >
            {state.confirmLabel || 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  );
}
