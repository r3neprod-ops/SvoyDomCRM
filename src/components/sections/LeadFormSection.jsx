'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Container from '@/components/ui/Container';

const QUIZ_STEPS = 4;
const TOTAL_STEPS = 5;

const stepTitles = [
  'Бюджет',
  'Количество комнат',
  'Способ оплаты',
  'Срок покупки',
  'Контакты',
];

const budgetOptions = [
  { label: 'до 4 млн ₽', value: 'under_4' },
  { label: '4–6 млн ₽', value: '4_6' },
  { label: '6–8 млн ₽', value: '6_8' },
  { label: '8–10 млн ₽', value: '8_10' },
  { label: '10+ млн ₽', value: '10_plus' },
  { label: 'Свой вариант', value: 'custom' },
];

const roomOptions = [
  { label: 'Студия', value: 'studio' },
  { label: '1 комната', value: '1room' },
  { label: '2 комнаты', value: '2rooms' },
  { label: '3+ комнат', value: '3plus' },
  { label: 'Не важно', value: 'any' },
];

const paymentOptions = [
  { label: 'Ипотека под 2%', value: 'mortgage' },
  { label: 'Наличные', value: 'cash' },
  { label: 'Военный сертификат', value: 'military_cert' },
  { label: 'Маткапитал', value: 'matcap' },
  { label: 'Смешанный вариант', value: 'mixed' },
];

const timelineOptions = [
  { label: 'В ближайший месяц', value: 'asap' },
  { label: '1–3 месяца', value: '1_3_months' },
  { label: '3–6 месяцев', value: '3_6_months' },
  { label: 'Пока изучаю варианты', value: 'exploring' },
];

const initialAnswers = {
  budgetPreset: '',
  budgetCustom: '',
  district: '',
  rooms: '',
  paymentType: '',
  purchaseTimeline: '',
  name: '',
  phone: '',
  telegram: '',
  company: '',
  privacyConsent: false,
};

export default function LeadFormSection() {
  const [leadAnswers, setLeadAnswers] = useState(initialAnswers);
  const [open, setOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [embeddedStep, setEmbeddedStep] = useState(1);
  const [done, setDone] = useState(false);
  const [submitErrorMessage, setSubmitErrorMessage] = useState('');
  const [embeddedDone, setEmbeddedDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const flag = sessionStorage.getItem('leadModalClosed');
    if (flag) return;

    const openModal = () => setOpen(true);
    let timeoutId;

    if (typeof window.requestIdleCallback === 'function') {
      timeoutId = window.requestIdleCallback(openModal, { timeout: 1500 });
    } else {
      timeoutId = setTimeout(openModal, 900);
    }

    return () => {
      if (typeof window.cancelIdleCallback === 'function' && typeof timeoutId === 'number') {
        window.cancelIdleCallback(timeoutId);
      } else {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const modalProgress = useMemo(() => {
    if (done) return 100;
    return Math.min(100, Math.max(0, Math.round((modalStep / TOTAL_STEPS) * 100)));
  }, [done, modalStep]);

  const embeddedProgress = useMemo(() => {
    if (embeddedDone) return 100;
    return Math.min(100, Math.max(0, Math.round((embeddedStep / TOTAL_STEPS) * 100)));
  }, [embeddedDone, embeddedStep]);

  const closeModal = () => {
    sessionStorage.setItem('leadModalClosed', '1');
    setOpen(false);
  };

  const setValue = (key, value) => setLeadAnswers((prev) => ({ ...prev, [key]: value }));

  const canProceed = (step) => {
    if (step === 1) {
      if (!leadAnswers.budgetPreset) return false;
      if (leadAnswers.budgetPreset === 'custom') return Boolean(leadAnswers.budgetCustom.trim());
      return true;
    }
    if (step === 2) return Boolean(leadAnswers.rooms);
    if (step === 3) return Boolean(leadAnswers.paymentType);
    if (step === 4) return Boolean(leadAnswers.purchaseTimeline);
    return true;
  };

  const nextModal = () => setModalStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  const prevModal = () => setModalStep((prev) => Math.max(prev - 1, 1));
  const nextEmbedded = () => setEmbeddedStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  const prevEmbedded = () => setEmbeddedStep((prev) => Math.max(prev - 1, 1));

  const resetEmbedded = () => {
    setEmbeddedDone(false);
    setEmbeddedStep(1);
    setLeadAnswers(initialAnswers);
    setSubmitErrorMessage('');
  };

  const buildPayload = () => ({
    name: leadAnswers.name,
    phone: leadAnswers.phone,
    privacyConsent: leadAnswers.privacyConsent,
    pageUrl: window.location.href,
    createdAt: new Date().toISOString(),
    company: leadAnswers.company,
    answers: {
      budgetPreset: leadAnswers.budgetPreset,
      budgetCustom: leadAnswers.budgetCustom || null,
      district: leadAnswers.district,
      rooms: leadAnswers.rooms,
      paymentType: leadAnswers.paymentType,
      purchaseTimeline: leadAnswers.purchaseTimeline,
      telegram: leadAnswers.telegram,
      // Legacy fields kept for API/admin compatibility
      propertyType: 'apartment_newbuild',
      apartmentType: leadAnswers.rooms,
      downPaymentType: leadAnswers.paymentType || null,
      downPaymentOwnAmount: null,
    },
    utm: {
      source: new URLSearchParams(window.location.search).get('utm_source') || '',
      medium: new URLSearchParams(window.location.search).get('utm_medium') || '',
      campaign: new URLSearchParams(window.location.search).get('utm_campaign') || '',
      term: new URLSearchParams(window.location.search).get('utm_term') || '',
      content: new URLSearchParams(window.location.search).get('utm_content') || '',
    },
  });

  const submitLead = async () => {
    if (isSubmitting) return false;

    if (!leadAnswers.name.trim()) {
      setSubmitErrorMessage('Укажите ваше имя.');
      return false;
    }
    if (!leadAnswers.phone.trim()) {
      setSubmitErrorMessage('Укажите номер телефона.');
      return false;
    }
    if (!leadAnswers.privacyConsent) {
      setSubmitErrorMessage('Необходимо согласие на обработку персональных данных.');
      return false;
    }

    const payload = buildPayload();
    setIsSubmitting(true);
    setSubmitErrorMessage('');

    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data?.ok === true) {
        if (typeof window !== 'undefined' && typeof window.ym === 'function') {
          window.ym(107023721, 'reachGoal', 'lead_submit');
        }
        return true;
      }

      const msg = data?.message || 'Не удалось отправить. Попробуйте ещё раз.';
      console.error('[LeadForm] submit error:', msg, data);
      setSubmitErrorMessage(msg);
      return false;
    } catch (error) {
      console.error('[LeadForm] submit failed:', error);
      setSubmitErrorMessage('Не удалось отправить. Попробуйте ещё раз.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const ok = await submitLead();
    if (ok) setDone(true);
  };

  const submitEmbedded = async (event) => {
    event.preventDefault();
    const ok = await submitLead();
    if (ok) setEmbeddedDone(true);
  };

  const stepLabel = (step) =>
    step <= QUIZ_STEPS ? `Вопрос ${step} из ${QUIZ_STEPS}` : 'Контакты';

  const renderStep = (step) => {
    if (step === 1) {
      return (
        <div className="space-y-3">
          <p className="text-sm font-medium">На какой бюджет ориентируетесь?</p>
          <InlineChoice
            options={budgetOptions.map((o) => o.label)}
            value={budgetOptions.find((o) => o.value === leadAnswers.budgetPreset)?.label || ''}
            onSelect={(label) => {
              const opt = budgetOptions.find((o) => o.label === label);
              if (opt) setValue('budgetPreset', opt.value);
            }}
          />
          {leadAnswers.budgetPreset === 'custom' && (
            <div className="space-y-2">
              <label className="text-sm text-[color:var(--muted)]">Введите сумму (можно примерно)</label>
              <input
                className="focus-ring w-full rounded-xl border border-[color:var(--border)] px-4 py-3"
                placeholder="Например: 7 500 000"
                value={leadAnswers.budgetCustom}
                onChange={(e) => setValue('budgetCustom', e.target.value)}
              />
            </div>
          )}
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-3">
          <p className="text-sm font-medium">Сколько комнат?</p>
          <InlineChoice
            options={roomOptions.map((o) => o.label)}
            value={roomOptions.find((o) => o.value === leadAnswers.rooms)?.label || ''}
            onSelect={(label) => {
              const opt = roomOptions.find((o) => o.label === label);
              if (opt) setValue('rooms', opt.value);
            }}
          />
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="space-y-3">
          <p className="text-sm font-medium">Способ оплаты?</p>
          <InlineChoice
            options={paymentOptions.map((o) => o.label)}
            value={paymentOptions.find((o) => o.value === leadAnswers.paymentType)?.label || ''}
            onSelect={(label) => {
              const opt = paymentOptions.find((o) => o.label === label);
              if (opt) setValue('paymentType', opt.value);
            }}
          />
        </div>
      );
    }

    if (step === 4) {
      return (
        <div className="space-y-3">
          <p className="text-sm font-medium">Когда планируете покупку?</p>
          <InlineChoice
            options={timelineOptions.map((o) => o.label)}
            value={timelineOptions.find((o) => o.value === leadAnswers.purchaseTimeline)?.label || ''}
            onSelect={(label) => {
              const opt = timelineOptions.find((o) => o.label === label);
              if (opt) setValue('purchaseTimeline', opt.value);
            }}
          />
          {leadAnswers.purchaseTimeline && (
            <p className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg2)] px-4 py-3 text-sm text-[color:var(--muted)]">
              Уже подобрали 5–7 вариантов под ваш бюджет — вышлем на следующем шаге
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        <p className="text-sm text-[color:var(--muted)]">Оставьте контакты — вышлем подборку и поможем с ипотекой</p>
        <input
          className="focus-ring rounded-xl border border-[color:var(--border)] px-4 py-3"
          placeholder="Ваше имя"
          value={leadAnswers.name}
          onChange={(e) => setValue('name', e.target.value)}
          required
        />
        <input
          className="focus-ring rounded-xl border border-[color:var(--border)] px-4 py-3"
          placeholder="Номер телефона"
          type="tel"
          value={leadAnswers.phone}
          onChange={(e) => setValue('phone', e.target.value)}
          required
        />
        <input
          className="focus-ring rounded-xl border border-[color:var(--border)] px-4 py-3"
          placeholder="Ваш Telegram (не обязательно)"
          value={leadAnswers.telegram}
          onChange={(e) => setValue('telegram', e.target.value)}
        />
        <label className="flex items-start gap-2.5 rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.7)] px-3 py-2.5 text-xs leading-relaxed text-[color:var(--muted)] md:text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--accent2)]"
            checked={leadAnswers.privacyConsent}
            onChange={(e) => setValue('privacyConsent', e.target.checked)}
            required
          />
          <span>
            Нажимая кнопку, я даю согласие на обработку персональных данных в соответствии с{' '}
            <Link
              href="/privacy-policy"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-[color:var(--accent2)] underline-offset-2 transition hover:text-[color:var(--accent2)]"
            >
              Политикой конфиденциальности
            </Link>
            .
          </span>
        </label>
        <input
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
          name="company"
          value={leadAnswers.company}
          onChange={(e) => setValue('company', e.target.value)}
        />
      </div>
    );
  };

  return (
    <>
      <section id="lead-form" className="py-12 md:py-16">
        <Container>
          {/* Pre-quiz intro — продающий заголовок над формой */}
          {!embeddedDone && (
            <div className="mb-5 text-center md:text-left">
              <h2 className="text-2xl font-bold tracking-tight text-[#111827] md:text-3xl">
                Получите подборку квартир под ваш бюджет
              </h2>
              <div className="mt-3 flex flex-wrap justify-center gap-2 md:justify-start">
                <span className="quiz-benefit-pill">→ 5–7 вариантов квартир</span>
                <span className="quiz-benefit-pill">→ Расчёт ипотеки</span>
                <span className="quiz-benefit-pill">→ Одобрение за 24 часа</span>
              </div>
            </div>
          )}

          <Card className="embedded-lead-card reveal p-7 transition-colors duration-200 md:p-10">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[rgba(17,24,39,0.55)]">Быстрый подбор</p>
            <p className="mt-3 max-w-2xl text-[rgba(17,24,39,0.70)]">4 вопроса — и мы пришлём варианты с ценами и планировками.</p>

            <div className="mb-2 mt-6 flex items-center justify-between text-xs text-[color:var(--muted)]">
              <span>{embeddedDone ? 'Готово' : stepLabel(embeddedStep)}</span>
              <span>{embeddedDone ? '100%' : `${embeddedProgress}%`}</span>
            </div>
            <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-[color:var(--bg2)]">
              <div
                className="h-full max-w-full rounded-full bg-[color:var(--accent2)] transition-all"
                style={{ width: `${embeddedProgress}%` }}
              />
            </div>

            {embeddedDone ? (
              <div className="space-y-5">
                <h3 className="text-2xl tracking-tight">Заявка принята!</h3>
                <p className="text-[color:var(--muted)]">Мы свяжемся с вами в течение 5 минут и пришлём подборку квартир.</p>
                <p className="text-xs text-[color:var(--muted)]">Для вас это бесплатно — мою работу оплачивает застройщик.</p>
                <Button type="button" onClick={resetEmbedded}>Начать заново</Button>
              </div>
            ) : (
              <form onSubmit={submitEmbedded} className="space-y-6">
                <div key={`emb-${embeddedStep}`} className="quiz-step-animate">
                  {renderStep(embeddedStep)}
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  {embeddedStep > 1 && (
                    <Button type="button" variant="ghost" onClick={prevEmbedded}>Назад</Button>
                  )}
                  {embeddedStep < TOTAL_STEPS ? (
                    <Button type="button" onClick={nextEmbedded} disabled={!canProceed(embeddedStep)}>
                      Далее
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={
                        isSubmitting ||
                        !leadAnswers.name.trim() ||
                        !leadAnswers.phone.trim() ||
                        !leadAnswers.privacyConsent
                      }
                    >
                      {isSubmitting ? 'Отправка...' : 'Получить подборку квартир'}
                    </Button>
                  )}
                </div>
                {submitErrorMessage && (
                  <p className="text-sm text-red-500">{submitErrorMessage}</p>
                )}
              </form>
            )}
          </Card>
        </Container>
      </section>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 p-4 md:items-center">
          <div className="w-full max-w-2xl rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[var(--shadowHover)] md:p-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--accent)]">Получить подборку</p>
                <h3 className="text-2xl tracking-tight">
                  {done ? 'Заявка принята!' : stepTitles[modalStep - 1]}
                </h3>
              </div>
              <button type="button" className="focus-ring rounded-lg px-2 py-1 text-sm" onClick={closeModal}>
                Закрыть
              </button>
            </div>

            {!done && (
              <div className="mb-2 flex items-center justify-between text-xs text-[color:var(--muted)]">
                <span>{stepLabel(modalStep)}</span>
                <span>{modalProgress}%</span>
              </div>
            )}
            <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-[color:var(--bg2)]">
              <div
                className="h-full max-w-full rounded-full bg-[color:var(--accent2)] transition-all"
                style={{ width: `${modalProgress}%` }}
              />
            </div>

            {done ? (
              <div className="space-y-5">
                <p className="text-[color:var(--muted)]">
                  Мы свяжемся с вами в течение 5 минут и пришлём подборку квартир.
                </p>
                <p className="text-xs text-[color:var(--muted)]">Для вас это бесплатно — мою работу оплачивает застройщик.</p>
                <Button onClick={closeModal}>Закрыть</Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-6">
                <div key={`mod-${modalStep}`} className="quiz-step-animate">
                  {renderStep(modalStep)}
                </div>
                <div className="flex flex-wrap gap-3">
                  {modalStep > 1 && (
                    <Button type="button" variant="ghost" onClick={prevModal}>Назад</Button>
                  )}
                  {modalStep < TOTAL_STEPS ? (
                    <Button type="button" onClick={nextModal} disabled={!canProceed(modalStep)}>
                      Далее
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={
                        isSubmitting ||
                        !leadAnswers.name.trim() ||
                        !leadAnswers.phone.trim() ||
                        !leadAnswers.privacyConsent
                      }
                    >
                      {isSubmitting ? 'Отправка...' : 'Получить подборку квартир'}
                    </Button>
                  )}
                </div>
                {submitErrorMessage && (
                  <p className="text-sm text-red-500">{submitErrorMessage}</p>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function InlineChoice({ title, options, value, onSelect }) {
  return (
    <div>
      {title && <p className="mb-3 text-sm font-medium">{title}</p>}
      <div className="grid gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`focus-ring rounded-xl border px-4 py-3 text-left text-sm transition ${
              value === option
                ? 'border-[color:var(--accent2)] bg-[color:var(--bg2)]'
                : 'border-[color:var(--border)] hover:border-[color:var(--borderStrong)]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
