'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamChatPanel from './TeamChatPanel';
import { ConfirmDialog, ToastStack } from './Feedback';
import LeadContactActions from './LeadContactActions';
import { useTheme } from '@/app/ThemeProvider';

const STATUS_LABELS = {
  new: 'Новый',
  in_progress: 'В работе',
  meeting: 'Встреча',
  documents: 'Документы',
  deal: 'Сделка',
  closed_won: 'Закрыт успешно',
  closed_lost: 'Отказ / сорвался',
  closed: 'Закрыт успешно',
};
const STATUS_COLORS = {
  new: 'border border-crm-accent/35 bg-crm-accent/12 text-crm-accent',
  in_progress: 'border border-crm-info/35 bg-crm-info/12 text-crm-info',
  meeting: 'border border-crm-warning/35 bg-crm-warning/12 text-crm-warning',
  documents: 'border border-violet-300/35 bg-violet-400/12 text-violet-200',
  deal: 'border border-emerald-300/35 bg-emerald-400/12 text-emerald-200',
  closed_won: 'border border-crm-success/35 bg-crm-success/12 text-crm-success',
  closed_lost: 'border border-crm-danger/40 bg-crm-danger/12 text-crm-danger',
  closed: 'border border-crm-success/35 bg-crm-success/12 text-crm-success',
};

function statusBadgeClass(status) {
  return `inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[status] ?? 'border border-crm-border bg-crm-surface/60 text-crm-muted'}`;
}

function leadFilterChipClass(isActive) {
  return `crm-focus-ring rounded-crmLg px-4 py-2 text-sm font-medium transition ${
    isActive
      ? 'border border-crm-accent/45 bg-crm-accent/15 text-crm-accent shadow-crmGlow'
      : 'border border-crm-border bg-crm-surface/40 text-crm-muted hover:border-crm-accent/30 hover:bg-crm-accent/8 hover:text-crm-text'
  }`;
}

function leadStatCardClass(accent) {
  const base = 'crm-card crm-soft-rise rounded-crmXl px-4 py-3.5 shadow-crmCard';
  if (accent === 'total') return `${base} crm-card-strong`;
  if (accent === 'new') return `${base} border-crm-accent/25`;
  if (accent === 'in_progress') return `${base} border-crm-info/25`;
  if (accent === 'meeting') return `${base} border-crm-warning/25`;
  if (accent === 'documents') return `${base} border-violet-300/25`;
  if (accent === 'deal') return `${base} border-emerald-300/25`;
  if (accent === 'closed_won' || accent === 'closed') return `${base} border-crm-success/25`;
  if (accent === 'closed_lost') return `${base} border-crm-danger/25`;
  return base;
}

function leadStatValueClass(accent) {
  if (accent === 'new') return 'text-crm-accent';
  if (accent === 'in_progress') return 'text-crm-info';
  if (accent === 'meeting') return 'text-crm-warning';
  if (accent === 'documents') return 'text-violet-200';
  if (accent === 'deal') return 'text-emerald-200';
  if (accent === 'closed_won' || accent === 'closed') return 'text-crm-success';
  if (accent === 'closed_lost') return 'text-crm-danger';
  return 'text-crm-text';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_STATUS_COLORS = {
  new: '#2dd4bf',
  in_progress: '#60a5fa',
  meeting: '#f5c451',
  documents: '#c4b5fd',
  deal: '#34d399',
  closed_won: '#86efac',
  closed_lost: '#fb7185',
  closed: '#86efac',
};

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseLeadDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDay(value) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(value);
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function makeDonutGradient(segments, total) {
  if (!total) return 'conic-gradient(rgba(255,255,255,0.08) 0deg 360deg)';
  let cursor = 0;
  const stops = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = cursor;
      const end = cursor + (segment.value / total) * 360;
      cursor = end;
      return `${segment.color} ${start}deg ${end}deg`;
    });
  return `conic-gradient(${stops.join(', ')}, rgba(255,255,255,0.08) ${cursor}deg 360deg)`;
}

function ReportMetricCard({ label, value, hint, tone = 'accent' }) {
  const toneStyle = {
    accent: { text: 'text-crm-accent', dot: 'bg-crm-accent' },
    success: { text: 'text-crm-success', dot: 'bg-crm-success' },
    warning: { text: 'text-crm-warning', dot: 'bg-crm-warning' },
    danger: { text: 'text-crm-danger', dot: 'bg-crm-danger' },
    info: { text: 'text-crm-info', dot: 'bg-crm-info' },
  }[tone] || { text: 'text-crm-accent', dot: 'bg-crm-accent' };

  return (
    <div className="crm-premium-panel crm-soft-rise rounded-crmXl p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-crm-muted">{label}</p>
        <span className={`h-2.5 w-2.5 rounded-full ${toneStyle.dot}`} />
      </div>
      <p className={`mt-3 text-3xl font-semibold tabular-nums ${toneStyle.text}`}>{value}</p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-crm-muted">{hint}</p>}
    </div>
  );
}

function LeadStatusDonut({ report }) {
  const segments = report.statusSegments;
  const gradient = makeDonutGradient(segments, report.total);

  return (
    <div className="crm-premium-panel rounded-crmXl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-crm-text">Воронка по статусам</h3>
          <p className="mt-1 text-sm text-crm-muted">Сколько лидов сейчас в каждом состоянии</p>
        </div>
        <span className="rounded-full border border-crm-border bg-crm-surface/55 px-2.5 py-1 text-xs text-crm-muted">
          {report.total} всего
        </span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[11rem,1fr] sm:items-center">
        <div className="relative mx-auto h-40 w-40 rounded-full p-4" style={{ background: gradient }}>
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-crm-border bg-[var(--crm-bg-deep)]/88 text-center shadow-inner">
            <span className="text-3xl font-semibold tabular-nums text-crm-text">{report.closedRate}%</span>
            <span className="mt-1 text-xs text-crm-muted">закрыто</span>
          </div>
        </div>
        <div className="space-y-3">
          {segments.map((segment) => (
            <div key={segment.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-crm-text">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                  {segment.label}
                </span>
                <span className="tabular-nums text-crm-muted">{segment.value} · {percent(segment.value, report.total)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${percent(segment.value, report.total)}%`, backgroundColor: segment.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LeadTrendChart({ report }) {
  const max = Math.max(1, ...report.trend.map((item) => item.total));

  return (
    <div className="crm-premium-panel rounded-crmXl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-crm-text">Динамика за 7 дней</h3>
          <p className="mt-1 text-sm text-crm-muted">Новые лиды по дням, чтобы видеть темп входящего потока</p>
        </div>
        <span className="rounded-full border border-crm-accent/25 bg-crm-accent/10 px-2.5 py-1 text-xs text-crm-accent">
          {report.weekTotal} за неделю
        </span>
      </div>

      <div className="mt-6 flex h-48 items-end gap-2 rounded-crmLg border border-crm-border bg-black/10 px-3 pb-3 pt-5">
        {report.trend.map((item) => {
          const height = Math.max(8, Math.round((item.total / max) * 100));
          return (
            <div key={item.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
              <div className="flex min-h-0 flex-1 items-end">
                <div
                  className="w-full rounded-t-crmLg bg-[linear-gradient(180deg,var(--crm-accent),var(--crm-info))] shadow-crmGlow transition-all duration-500 ease-out"
                  style={{ height: `${height}%` }}
                  title={`${item.label}: ${item.total}`}
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold tabular-nums text-crm-text">{item.total}</p>
                <p className="truncate text-[10px] text-crm-muted">{item.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmployeeReportChart({ report }) {
  const max = Math.max(1, ...report.employeeRows.map((item) => item.total));

  return (
    <div className="crm-premium-panel rounded-crmXl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-crm-text">Нагрузка по сотрудникам</h3>
          <p className="mt-1 text-sm text-crm-muted">Кому назначены лиды и где есть перегруз</p>
        </div>
        <span className="rounded-full border border-crm-border bg-crm-surface/55 px-2.5 py-1 text-xs text-crm-muted">
          {report.assigned} назначено
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {report.employeeRows.length === 0 ? (
          <p className="rounded-crmLg border border-dashed border-crm-border px-4 py-8 text-center text-sm text-crm-muted">
            Сотрудники пока не добавлены
          </p>
        ) : (
          report.employeeRows.map((employee) => (
            <div key={employee.id} className="rounded-crmLg border border-crm-border bg-crm-surface/35 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-crm-text">{employee.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-crm-muted">
                  взял {employee.total} · активно {employee.active}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--crm-accent),var(--crm-warning))] transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(4, percent(employee.total, max))}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-3">
                {PIPELINE_STATUSES.slice(1).map((status) => (
                  <div key={status} className="rounded-md border border-crm-border/70 bg-black/10 px-2 py-1.5">
                    <p className="truncate text-crm-muted">{STATUS_LABELS[status]}</p>
                    <p className={`mt-0.5 font-semibold tabular-nums ${leadStatValueClass(status)}`}>
                      {employee.stageCounts[status] || 0}
                    </p>
                  </div>
                ))}
                <div className="rounded-md border border-crm-danger/30 bg-crm-danger/10 px-2 py-1.5">
                  <p className="truncate text-crm-muted">Отказ</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-crm-danger">{employee.stageCounts.closed_lost || 0}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmployeePersonalStats({ stats }) {
  return (
    <div className="crm-premium-panel rounded-crmXl p-4 shadow-crmCard">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-crm-accent">Моя статистика</p>
          <h3 className="mt-1 text-lg font-semibold text-crm-text">Лиды в работе</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-crmLg border border-crm-border bg-crm-surface/35 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-crm-muted">Взял</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-crm-text">{stats.total}</p>
          </div>
          <div className="rounded-crmLg border border-crm-warning/25 bg-crm-warning/10 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-crm-muted">Активно</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-crm-warning">{stats.active}</p>
          </div>
          <div className="rounded-crmLg border border-crm-success/25 bg-crm-success/10 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-crm-muted">Успешно</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-crm-success">{stats.closedWon}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PIPELINE_STATUSES.slice(1).map((status) => (
          <div key={status} className="rounded-crmLg border border-crm-border bg-crm-surface/30 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-crm-muted">{STATUS_LABELS[status]}</span>
              <span className={`text-sm font-semibold tabular-nums ${leadStatValueClass(status)}`}>
                {stats.stageCounts[status] || 0}
              </span>
            </div>
          </div>
        ))}
        <div className="rounded-crmLg border border-crm-danger/30 bg-crm-danger/10 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-crm-muted">Отказ / сорвался</span>
            <span className="text-sm font-semibold tabular-nums text-crm-danger">{stats.stageCounts.closed_lost || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadReportsPanel({ report, isAdmin, onExport, onOpenLeads }) {
  return (
    <div className="crm-panel-enter space-y-5">
      <div className="crm-premium-panel overflow-hidden rounded-crm2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-crm-accent">Отчет по лидам</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-crm-text sm:text-3xl">Пульс продаж и обработки</h2>
            <p className="mt-2 text-sm leading-relaxed text-crm-muted">
              Видно, сколько заявок приходит, кто забирает лиды, где зависают новые обращения и как быстро команда доводит их до закрытия.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {isAdmin && (
              <button
                onClick={onExport}
                className="crm-focus-ring inline-flex min-h-11 items-center justify-center rounded-crmLg border border-crm-border bg-crm-surface/50 px-4 py-2.5 text-sm font-medium text-crm-text transition hover:border-crm-accent/35 hover:bg-crm-accent/10 hover:text-crm-accent"
              >
                Скачать отчет
              </button>
            )}
            <button
              onClick={onOpenLeads}
              className="crm-focus-ring inline-flex min-h-11 items-center justify-center rounded-crmLg border border-crm-accent/35 bg-crm-accent/15 px-4 py-2.5 text-sm font-semibold text-crm-accent shadow-crmGlow transition hover:bg-crm-accent/22"
            >
              Перейти к лидам
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard label="Всего лидов" value={report.total} hint={`Сегодня: ${report.today}`} tone="accent" />
        <ReportMetricCard label="В работе" value={report.inProgress} hint={`${report.activeRate}% активной базы`} tone="warning" />
        <ReportMetricCard label="Закрыто" value={`${report.closedRate}%`} hint={`${report.closed} из ${report.total || 0} лидов`} tone="success" />
        <ReportMetricCard label="Без ответственного" value={report.unassigned} hint={report.unassigned ? 'Нужно распределить' : 'Все разобрано'} tone={report.unassigned ? 'danger' : 'info'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
        <LeadTrendChart report={report} />
        <LeadStatusDonut report={report} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
        <EmployeeReportChart report={report} />
        <div className="crm-premium-panel rounded-crmXl p-5">
          <h3 className="text-base font-semibold text-crm-text">Контрольные точки</h3>
          <p className="mt-1 text-sm text-crm-muted">Что требует внимания руководителя прямо сейчас</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Новые без ответственного', value: report.unassignedNew, tone: report.unassignedNew ? 'text-crm-danger' : 'text-crm-success' },
              { label: 'Без комментариев', value: report.noComment, tone: report.noComment ? 'text-crm-warning' : 'text-crm-success' },
              { label: 'Среднее в день', value: report.avgPerDay, tone: 'text-crm-info' },
              { label: 'Закрыто за неделю', value: report.weekClosed, tone: 'text-crm-success' },
            ].map((item) => (
              <div key={item.label} className="rounded-crmLg border border-crm-border bg-crm-surface/35 p-4">
                <p className="text-xs uppercase tracking-wide text-crm-muted">{item.label}</p>
                <p className={`mt-2 text-2xl font-semibold tabular-nums ${item.tone}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadsEmptyState({ children }) {
  return (
    <div className="crm-card flex flex-col items-center justify-center rounded-crmXl border border-dashed border-crm-border px-6 py-14 text-center shadow-crmCard">
      <p className="max-w-xs text-sm leading-relaxed text-crm-muted">{children}</p>
    </div>
  );
}

function EmployeesEmptyState() {
  return (
    <div className="crm-card flex flex-col items-center justify-center rounded-crmXl border border-dashed border-crm-border px-6 py-14 text-center shadow-crmCard">
      <p className="text-sm font-medium text-crm-text">Сотрудники пока не добавлены</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-crm-muted">
        Добавьте первого сотрудника, чтобы распределять лиды
      </p>
    </div>
  );
}

function employeeInputClass() {
  return 'crm-focus-ring w-full min-h-11 rounded-crmLg border border-crm-border bg-crm-surface/50 px-3 py-2.5 text-sm text-crm-text placeholder:text-crm-muted';
}

function employeeActionButtonClass(variant) {
  const base =
    'crm-focus-ring inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-crmLg px-3 py-2 text-xs font-medium transition';
  if (variant === 'edit') {
    return `${base} border border-crm-accent/35 bg-crm-accent/10 text-crm-accent hover:bg-crm-accent/18`;
  }
  if (variant === 'delete') {
    return `${base} border border-crm-danger/35 bg-crm-danger/10 text-crm-danger hover:bg-crm-danger/15`;
  }
  if (variant === 'save') {
    return `${base} border border-crm-success/40 bg-crm-success/15 text-crm-success hover:bg-crm-success/22`;
  }
  if (variant === 'cancel') {
    return `${base} border border-crm-border bg-crm-surface/40 text-crm-muted hover:bg-crm-surface/60 hover:text-crm-text`;
  }
  return base;
}

function employeeCardClass() {
  return 'crm-card rounded-crmXl border border-crm-border p-4 shadow-crmCard transition hover:border-crm-accent/20';
}

function employeeStatusBadgeClass(isActive) {
  return `inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${
    isActive !== false
      ? 'border border-crm-success/35 bg-crm-success/12 text-crm-success'
      : 'border border-crm-border bg-crm-surface/60 text-crm-muted'
  }`;
}

function profileInputClass() {
  return 'crm-focus-ring w-full min-h-11 rounded-crmLg border border-crm-border bg-crm-surface/50 px-3 py-2.5 text-sm text-crm-text placeholder:text-crm-muted';
}

function profileTextareaClass() {
  return 'crm-focus-ring w-full min-h-[5.5rem] resize-none rounded-crmLg border border-crm-border bg-crm-surface/50 px-3 py-2.5 text-sm text-crm-text placeholder:text-crm-muted';
}

function profileLabelClass() {
  return 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-crm-muted';
}

function profileHintClass() {
  return 'mt-1.5 text-xs leading-relaxed text-crm-muted';
}

function settingsCardClass() {
  return 'crm-glass overflow-hidden rounded-crmXl border border-crm-border shadow-crmCard';
}

function settingsCardHeaderClass() {
  return 'border-b border-crm-border px-5 py-4 sm:px-6';
}

function settingsCardBodyClass() {
  return 'px-5 py-5 sm:px-6';
}

function profileButtonClass(variant = 'primary') {
  const base =
    'crm-focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-crmLg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto';
  if (variant === 'primary') {
    return `${base} border border-crm-accent/40 bg-crm-accent/15 text-crm-accent shadow-crmGlow hover:bg-crm-accent/22`;
  }
  if (variant === 'secondary') {
    return `${base} border border-crm-border bg-crm-surface/40 text-crm-text hover:border-crm-accent/30 hover:bg-crm-accent/8`;
  }
  if (variant === 'danger') {
    return `${base} border border-crm-danger/35 bg-crm-danger/10 text-crm-danger hover:bg-crm-danger/15`;
  }
  if (variant === 'success') {
    return `${base} border border-crm-success/35 bg-crm-success/10 text-crm-success hover:bg-crm-success/18`;
  }
  if (variant === 'test') {
    return `${base} border border-crm-accent/30 bg-crm-accent/8 text-crm-accent hover:bg-crm-accent/15`;
  }
  return base;
}

function profileAlertClass(type) {
  if (type === 'error') {
    return 'rounded-crmLg border border-crm-danger/35 bg-crm-danger/10 px-3 py-2.5 text-sm text-crm-danger';
  }
  if (type === 'success') {
    return 'rounded-crmLg border border-crm-success/35 bg-crm-success/10 px-3 py-2.5 text-sm text-crm-success';
  }
  return 'rounded-crmLg border border-crm-border bg-crm-surface/40 px-3 py-2.5 text-sm text-crm-muted';
}

function pushStatusPillClass(status) {
  if (status === 'granted') {
    return 'inline-flex shrink-0 items-center rounded-full border border-crm-success/35 bg-crm-success/12 px-2.5 py-1 text-xs font-medium text-crm-success';
  }
  if (status === 'error' || status === 'denied') {
    return 'inline-flex shrink-0 items-center rounded-full border border-crm-danger/35 bg-crm-danger/12 px-2.5 py-1 text-xs font-medium text-crm-danger';
  }
  return 'inline-flex shrink-0 items-center rounded-full border border-crm-border bg-crm-surface/60 px-2.5 py-1 text-xs font-medium text-crm-muted';
}

function pushStatusLabel(status) {
  if (status === 'granted') return 'Активны';
  if (status === 'denied') return 'Заблокированы';
  if (status === 'loading') return 'Подключение...';
  if (status === 'error') return 'Ошибка';
  if (status === 'unsupported' || status === 'unsupported_ios') return 'Недоступны';
  if (status === 'ios_install_required') return 'Нужна установка';
  if (status === 'not_configured') return 'Не настроены';
  return 'Выключены';
}

function ProfileSectionIcon({ name }) {
  const props = {
    className: 'h-5 w-5 shrink-0 text-crm-accent',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (name === 'personal') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (name === 'security') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  }
  if (name === 'notifications') {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    );
  }
  return null;
}

function DiagnosticsMark({ ok }) {
  if (ok) {
    return (
      <svg viewBox="0 0 24 24" className="inline h-3.5 w-3.5 shrink-0 text-crm-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="inline h-3.5 w-3.5 shrink-0 text-crm-danger" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function PasswordVisibilityToggle({ show, onToggle, label }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="crm-focus-ring absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-crmLg text-crm-muted transition hover:bg-crm-accent/10 hover:text-crm-accent"
      aria-label={show ? `Скрыть ${label}` : `Показать ${label}`}
    >
      {show ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M1 1l22 22" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

function EmployeeInitialCircle({ name, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm';
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-crm-accent/25 bg-crm-accent/12 font-semibold text-crm-accent`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}

function EmployeeEditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function EmployeeDeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function EmployeeCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function EmployeeCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
const PIPELINE_STATUSES = ['new', 'in_progress', 'meeting', 'documents', 'deal', 'closed_won'];
const ACTIVE_PIPELINE_STATUSES = ['new', 'in_progress', 'meeting', 'documents', 'deal'];
const FINAL_STATUSES = ['closed_won', 'closed_lost', 'closed'];
const STATUSES = [...PIPELINE_STATUSES, 'closed_lost', 'closed'];
const FILTER_OPTIONS = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'meeting', label: 'Встреча' },
  { value: 'documents', label: 'Документы' },
  { value: 'deal', label: 'Сделка' },
  { value: 'closed_won', label: 'Успешно' },
  { value: 'closed_lost', label: 'Отказ' },
];

function isActiveLeadStatus(status) {
  return ACTIVE_PIPELINE_STATUSES.includes(status);
}

function isFinalLeadStatus(status) {
  return FINAL_STATUSES.includes(status);
}

function getLeadPipelineActions(status) {
  if (status === 'new') {
    return [{ status: 'in_progress', label: 'В работу', variant: 'primary' }];
  }
  if (status === 'in_progress') {
    return [
      { status: 'meeting', label: 'Договорились о встрече', variant: 'primary' },
      { status: 'closed_lost', label: 'Отказ / ошибка', variant: 'danger', needsReason: true },
    ];
  }
  if (status === 'meeting') {
    return [
      { status: 'documents', label: 'Документы', variant: 'primary' },
      { status: 'closed_lost', label: 'Сорвалось', variant: 'danger', needsReason: true },
    ];
  }
  if (status === 'documents') {
    return [
      { status: 'deal', label: 'Сделка', variant: 'primary' },
      { status: 'closed_lost', label: 'Сорвалось', variant: 'danger', needsReason: true },
    ];
  }
  if (status === 'deal') {
    return [
      { status: 'closed_won', label: 'Закрыть успешно', variant: 'success' },
      { status: 'closed_lost', label: 'Сорвалось', variant: 'danger', needsReason: true },
    ];
  }
  if (isFinalLeadStatus(status)) {
    return [{ status: 'in_progress', label: 'Вернуть в работу', variant: 'secondary' }];
  }
  return [{ status: 'in_progress', label: 'Вернуть в работу', variant: 'secondary' }];
}

function filterMatchesLead(lead, filter) {
  if (!filter) return true;
  if (filter === 'closed_won') return lead.status === 'closed_won' || lead.status === 'closed';
  return lead.status === filter;
}

function leadActionButtonClass(variant = 'secondary', compact = false) {
  const size = compact ? 'rounded-crmLg px-2.5 py-1.5 text-xs' : 'min-h-11 rounded-crmLg px-3 py-2.5 text-xs';
  const base = `crm-focus-ring border font-medium transition ${size}`;
  if (variant === 'primary') return `${base} border-crm-accent/35 bg-crm-accent/12 text-crm-accent hover:bg-crm-accent/18`;
  if (variant === 'success') return `${base} border-crm-success/35 bg-crm-success/12 text-crm-success hover:bg-crm-success/20`;
  if (variant === 'danger') return `${base} border-crm-danger/35 bg-crm-danger/10 text-crm-danger hover:bg-crm-danger/16`;
  return `${base} border-crm-border bg-crm-surface/40 text-crm-text hover:border-crm-accent/30 hover:bg-crm-accent/8`;
}

const MSG_LABELS = {
  'Тип': {
    apartment:          'Новостройка (квартира)',
    apartment_newbuild: 'Новостройка (квартира)',
    house:              'Частный дом',
    land_house:         'Участок + дом',
    'land+house':       'Участок + дом',
    plot_house:         'Участок + дом',
    consultation:       'Нужна консультация',
  },
  'Планировка': {
    studio_20_30: 'Студия 20–30 м²',
    studio_30_40: 'Студия 30–40 м²',
    one_40_55:    '1-комнатная 40–55 м²',
    '1k_40_55':   '1-комнатная 40–55 м²',
    two_55_75:    '2-комнатная 55–75 м²',
    '2k_55_65':   '2-комнатная 55–65 м²',
    three_75_100: '3-комнатная 75–100 м²',
    '3k_65_plus': '3+ комнат 65+ м²',
    four_100:     '4+ комнат от 100 м²',
  },
  'Бюджет': {
    '3_5':    '3–5 млн ₽',
    '5_7':    '5–7 млн ₽',
    '6_8':    '6–8 млн ₽',
    '7_10':   '7–10 млн ₽',
    '10_15':  '10–15 млн ₽',
    '15_plus':'от 15 млн ₽',
  },
  'Взнос': {
    matcap:      'Материнский капитал',
    mortgage:    'Ипотека',
    cash:        'Наличные',
    installment: 'Рассрочка',
  },
};

function formatMessage(message) {
  if (!message) return '—';
  return message.split(', ').map((part) => {
    const sep = part.indexOf(': ');
    if (sep === -1) return part;
    const key = part.slice(0, sep);
    const val = part.slice(sep + 2);
    const dict = MSG_LABELS[key];
    return `${key}: ${dict?.[val] ?? val}`;
  }).join(', ');
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function uint8ArrayToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function subscriptionUsesPublicKey(subscription, publicKey) {
  const currentKey = subscription?.options?.applicationServerKey;
  if (!currentKey) return true;
  return uint8ArrayToBase64Url(currentKey) === publicKey.replace(/=+$/, '');
}

function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function getIosInstallMessage() {
  return 'На iPhone push включаются только в установленном PWA: откройте CRM в Safari, нажмите «Поделиться» → «На экран Домой», затем запустите CRM с иконки и включите уведомления там.';
}

function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

async function readApiJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: text.slice(0, 500) };
  }
}

const CHAT_PALETTE = ['#E91E63','#9C27B0','#673AB7','#3F51B5','#2196F3','#00BCD4','#009688','#4CAF50','#FF9800','#FF5722'];
const chatColor = (uid) => CHAT_PALETTE[(uid ?? 0) % CHAT_PALETTE.length];
function chatInitials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function AvatarCircle({ profile, size = 'md' }) {
  const classes = size === 'lg' ? 'h-14 w-14 text-base' : 'h-10 w-10 text-sm';
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`${classes} rounded-full object-cover`} />;
  }
  return (
    <div className={`${classes} flex items-center justify-center rounded-full bg-slate-900 font-semibold text-white`}>
      {getInitials(profile?.name)}
    </div>
  );
}

function NavIcon({ name, className = 'h-5 w-5 shrink-0' }) {
  const props = { className, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (name) {
    case 'leads':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case 'employees':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'reports':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M3 3v18h18" />
          <rect x="7" y="12" width="3" height="5" rx="1" />
          <rect x="12" y="8" width="3" height="9" rx="1" />
          <rect x="17" y="5" width="3" height="12" rx="1" />
        </svg>
      );
    case 'chat':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'profile':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    default:
      return null;
  }
}

function shellNavItemClass(isActive) {
  return isActive
    ? 'border border-crm-accent/35 bg-crm-accent/12 text-crm-accent shadow-crmGlow'
    : 'border border-transparent text-crm-muted hover:bg-white/[0.04] hover:text-crm-text';
}

function shellChatSubItemClass(isActive) {
  return isActive
    ? 'border border-crm-accent/35 bg-crm-accent/14 font-medium text-crm-accent shadow-crmGlow'
    : 'border border-transparent bg-crm-surface/20 text-crm-muted hover:border-crm-accent/20 hover:bg-crm-accent/8 hover:text-crm-text';
}

export default function DashboardClient({ user }) {
  const router = useRouter();
  const isAdmin = user.role === 'admin';
  const { theme, toggle: toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState(isAdmin ? 'reports' : 'chat');
  const [leads, setLeads] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [employeeLeadTab, setEmployeeLeadTab] = useState('common');
  const [loading, setLoading] = useState(true);
  const [notifStatus, setNotifStatus] = useState('default');
  const [testPushStatus, setTestPushStatus] = useState('idle');
  const [pushDiagnostics, setPushDiagnostics] = useState(null);
  const [pushDiagnosticsLoading, setPushDiagnosticsLoading] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [claimingLeadId, setClaimingLeadId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [reminderSending, setReminderSending] = useState(false);

  // Chat navigation state (shared with TeamChatPanel)
  const [chatNavUsers,   setChatNavUsers]   = useState([]);
  const [dmList,         setDmList]         = useState([]);
  const [roomList,       setRoomList]       = useState([]);
  const [activeDmId,     setActiveDmId]     = useState(null);
  const [dmOtherUser,    setDmOtherUser]    = useState(null);
  const [activeRoomId,   setActiveRoomId]   = useState(null);
  const [activeRoom,     setActiveRoom]     = useState(null);
  const [chatGenUnread,  setChatGenUnread]  = useState(0);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName,    setNewRoomName]    = useState('');
  const [newRoomMembers, setNewRoomMembers] = useState([]);
  const [creatingRoom,   setCreatingRoom]   = useState(false);
  const [profile, setProfile] = useState({ ...user, phone: '', status_text: '', avatar_url: '' });
  const [profileForm, setProfileForm] = useState({
    name: user.name || '',
    username: user.username || '',
    phone: '',
    status_text: '',
    avatar: null,
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);

  // Credentials change (login / password)
  const [credForm, setCredForm] = useState({ current_password: '', new_username: '', new_password: '', confirm_password: '' });
  const [credSaving, setCredSaving] = useState(false);
  const [credError, setCredError] = useState('');
  const [credSaved, setCredSaved] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Comments modal
  const [commentModal, setCommentModal] = useState(null); // { leadId, leadName }
  const [comments, setComments] = useState([]);
  const [leadEvents, setLeadEvents] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const commentInputRef = useRef(null);
  const commentsEndRef = useRef(null);

  // Employee editing
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editName, setEditName] = useState('');
  const editInputRef = useRef(null);

  // Employee create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', username: '', password: '', confirmPassword: '' });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  // Close reason modal
  const [closeReasonModal, setCloseReasonModal] = useState(null); // { leadId, leadName, targetStatus, title }
  const [closeReasonText, setCloseReasonText] = useState('');
  const [closeReasonLoading, setCloseReasonLoading] = useState(false);
  const [nudgeModal, setNudgeModal] = useState(null); // { leadId, leadName, assignedToName }
  const [nudgeText, setNudgeText] = useState('');
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const closeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, type === 'error' ? 6500 : 4200);
  }, []);

  const askConfirm = useCallback((nextState) => {
    setConfirmState(nextState);
  }, []);

  const cancelConfirm = useCallback(() => {
    setConfirmState(null);
  }, []);

  const acceptConfirm = useCallback(async () => {
    const action = confirmState?.onConfirm;
    setConfirmState(null);
    await action?.();
  }, [confirmState]);

  const getVapidPublicKey = useCallback(async () => {
    const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
    const data = await keyRes.json().catch(() => ({}));
    if (!keyRes.ok) {
      const err = new Error(data.message || 'Failed to load VAPID public key');
      err.code = data.code || 'vapid_public_key_error';
      throw err;
    }
    const { publicKey } = data;
    if (!publicKey) {
      const err = new Error('VAPID public key is not configured');
      err.code = 'vapid_public_key_missing';
      throw err;
    }
    return publicKey;
  }, []);

  const savePushSubscription = useCallback(async (subscription) => {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.message || `Failed to save push subscription (${res.status})`);
    }
  }, []);

  const refreshNotificationStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const ios = isIosDevice();
    const standalone = isStandaloneApp();
    if (ios && !standalone) {
      setNotificationError(getIosInstallMessage());
      setNotifStatus('ios_install_required');
      return;
    }

    if (!('Notification' in window)) {
      setNotificationError('');
      setNotifStatus(ios ? 'unsupported_ios' : 'unsupported');
      return;
    }
    if (Notification.permission !== 'granted') {
      setNotificationError('');
      setNotifStatus(Notification.permission);
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotificationError(ios ? 'Нужен iOS 16.4 или новее и запуск CRM с иконки на экране Домой.' : '');
      setNotifStatus(ios ? 'unsupported_ios' : 'unsupported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setNotificationError('');
        setNotifStatus('default');
        return;
      }

      const publicKey = await getVapidPublicKey();
      if (!subscriptionUsesPublicKey(subscription, publicKey)) {
        console.warn('[Push] Existing subscription uses another VAPID key, resubscribe required');
        setNotificationError('');
        setNotifStatus('default');
        return;
      }

      await savePushSubscription(subscription);
      setNotificationError('');
      setNotifStatus('granted');
    } catch (err) {
      console.error('[Push] Status check error:', err);
      if (err.code === 'vapid_public_key_missing') {
        setNotificationError('На сервере не настроен публичный VAPID-ключ');
        setNotifStatus('not_configured');
        return;
      }
      setNotificationError(err.message || '');
      setNotifStatus('error');
    }
  }, [getVapidPublicKey, savePushSubscription]);

  useEffect(() => {
    refreshNotificationStatus();
  }, [refreshNotificationStatus]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.ok) {
          setProfile(data.profile);
          setProfileForm({
            name: data.profile.name || '',
            username: data.profile.username || '',
            phone: data.profile.phone || '',
            status_text: data.profile.status_text || '',
            avatar: null,
          });
        }
      })
      .catch((err) => console.error('Profile fetch error:', err));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (editingEmployee && editInputRef.current) editInputRef.current.focus();
  }, [editingEmployee]);

  useEffect(() => {
    if (commentModal && commentInputRef.current) commentInputRef.current.focus();
  }, [commentModal]);

  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments]);

  const enableNotifications = async () => {
    const ios = isIosDevice();
    if (ios && !isStandaloneApp()) {
      setNotificationError(getIosInstallMessage());
      setNotifStatus('ios_install_required');
      return;
    }

    if (!('Notification' in window)) {
      setNotificationError(ios ? 'Нужен iOS 16.4 или новее и запуск CRM с иконки на экране Домой.' : '');
      setNotifStatus(ios ? 'unsupported_ios' : 'unsupported');
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[Push] ServiceWorker or PushManager not supported');
      setNotificationError(ios ? 'Нужен iOS 16.4 или новее и запуск CRM с иконки на экране Домой.' : '');
      setNotifStatus(ios ? 'unsupported_ios' : 'unsupported');
      return;
    }
    const isStandalone = isStandaloneApp();
    console.log('[Push] Starting subscription, standalone:', isStandalone);
    setNotifStatus('loading');
    try {
      const permission = await Notification.requestPermission();
      console.log('[Push] Permission:', permission);
      if (permission !== 'granted') { setNotifStatus(permission); return; }

      const publicKey = await getVapidPublicKey();
      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      // Always register first (idempotent if already registered)
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[Push] SW registered, waiting for ready state...');

      // Wait for the SW to become active (with 10s timeout)
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SW ready timeout')), 10_000)
        ),
      ]);
      console.log('[Push] SW ready, state:', registration.active?.state);

      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !subscriptionUsesPublicKey(subscription, publicKey)) {
        console.log('[Push] VAPID key changed, recreating subscription...');
        await subscription.unsubscribe();
        subscription = null;
      }

      if (!subscription) {
        console.log('[Push] Got VAPID key, subscribing...');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      } else {
        console.log('[Push] Existing subscription found:', subscription.endpoint);
      }
      console.log('[Push] Subscribed:', subscription.endpoint);

      await savePushSubscription(subscription);
      console.log('[Push] Saved subscription on server');
      setNotificationError('');
      setNotifStatus('granted');
      showToast('Уведомления включены', 'success');
    } catch (err) {
      console.error('[Push] Subscription error:', err);
      if (err.code === 'vapid_public_key_missing') {
        setNotificationError('На сервере не настроен публичный VAPID-ключ');
        setNotifStatus('not_configured');
        return;
      }
      setNotificationError(err.message || '');
      setNotifStatus('error');
    }
  };

  const sendTestPush = async () => {
    setTestPushStatus('loading');
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        console.warn('[Push] Test push failed:', data.message || res.status);
        if (res.status === 404) await refreshNotificationStatus();
        if (data.code === 'vapid_keys_missing') {
          setNotificationError('На сервере не настроены VAPID-ключи');
          setNotifStatus('not_configured');
        }
        setTestPushStatus('error');
        return;
      }
      setNotificationError('');
      setTestPushStatus('sent');
      showToast('Тестовое уведомление отправлено', 'success');
    } catch (err) {
      console.error('[Push] Test push request error:', err);
      setTestPushStatus('error');
    } finally {
      setTimeout(() => setTestPushStatus('idle'), 3000);
    }
  };

  const runPushDiagnostics = async () => {
    setPushDiagnosticsLoading(true);
    try {
      const browser = {
        notificationApi: typeof window !== 'undefined' && 'Notification' in window,
        serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
        pushManager: typeof window !== 'undefined' && 'PushManager' in window,
        permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
        ios: isIosDevice(),
        standalone: isStandaloneApp(),
        subscription: false,
        endpoint: '',
      };

      if (browser.serviceWorker && browser.pushManager) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        browser.subscription = Boolean(subscription);
        browser.endpoint = subscription?.endpoint
          ? `${subscription.endpoint.slice(0, 18)}...${subscription.endpoint.slice(-8)}`
          : '';
      }

      const res = await fetch('/api/push/diagnostics', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setPushDiagnostics({ browser, server: data.diagnostics || null });
    } catch (err) {
      setPushDiagnostics({ error: err?.message || 'Ошибка диагностики' });
    } finally {
      setPushDiagnosticsLoading(false);
    }
  };

  const disableNotifications = async () => {
    askConfirm({
      title: 'Выключить уведомления?',
      message: 'Новые лиды и сообщения перестанут приходить на это устройство.',
      confirmLabel: 'Выключить',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            const endpoint = subscription.endpoint;
            await subscription.unsubscribe();
            await fetch('/api/push/subscribe', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint }),
            });
          }
          setNotificationError('');
          setNotifStatus('default');
          showToast('Уведомления выключены на этом устройстве', 'success');
        } catch (err) {
          console.error('[Push] Unsubscribe error:', err);
          showToast('Не удалось выключить уведомления', 'error');
        }
      }
    });
  };

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads');
      if (res.status === 401) { router.push('/admin/login'); return; }
      const data = await res.json();
      if (data.ok) {
        setLeads(data.leads);
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error('fetchLeads error:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const fetchChatUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/read');
      if (res.status === 401) return;
      const data = await res.json();
      if (data.ok) setChatGenUnread(data.unread_count || 0);
    } catch (err) {
      console.error('Chat unread fetch error:', err);
    }
  }, []);

  useEffect(() => {
    fetchChatUnread();
    const interval = setInterval(fetchChatUnread, 10000);
    return () => clearInterval(interval);
  }, [fetchChatUnread]);

  // Sync total chat badge: general + DMs + rooms
  useEffect(() => {
    const dmTotal   = dmList.reduce((s, c) => s + (c.unread_count || 0), 0);
    const roomTotal = roomList.reduce((s, r) => s + (r.unread_count || 0), 0);
    setChatUnread(chatGenUnread + dmTotal + roomTotal);
  }, [chatGenUnread, dmList, roomList]);

  const fetchChatNavUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/users');
      const data = await res.json();
      if (data.ok) setChatNavUsers(data.users || []);
    } catch {}
  }, []);

  const fetchDmList = useCallback(async () => {
    try {
      const res = await fetch('/api/direct-chats');
      const data = await res.json();
      if (data.ok) setDmList(data.chats || []);
    } catch {}
  }, []);

  const fetchRoomList = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.ok) setRoomList(data.rooms || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchChatNavUsers();
    fetchDmList();
    fetchRoomList();
    const i0 = setInterval(fetchChatNavUsers, 15000);
    const i1 = setInterval(fetchDmList,  8000);
    const i2 = setInterval(fetchRoomList, 8000);
    return () => { clearInterval(i0); clearInterval(i1); clearInterval(i2); };
  }, [fetchChatNavUsers, fetchDmList, fetchRoomList]);

  const openChatGeneral = useCallback(() => {
    setActiveTab('chat');
    setActiveDmId(null); setDmOtherUser(null);
    setActiveRoomId(null); setActiveRoom(null);
  }, []);

  const openChatDm = useCallback((chatId, otherUser) => {
    setActiveTab('chat');
    setActiveDmId(chatId); setDmOtherUser(otherUser);
    setActiveRoomId(null); setActiveRoom(null);
  }, []);

  const openChatRoom = useCallback((roomId, room) => {
    setActiveTab('chat');
    setActiveDmId(null); setDmOtherUser(null);
    setActiveRoomId(roomId); setActiveRoom(room);
  }, []);

  const handleOpenChatDm = useCallback(async (emp) => {
    const existing = dmList.find((c) => c.other_user_id === emp.id);
    if (existing) { openChatDm(existing.id, emp); return; }
    try {
      const res = await fetch('/api/direct-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ other_user_id: emp.id }),
      });
      const data = await res.json();
      if (data.ok) { fetchDmList(); openChatDm(data.chat.id, emp); }
    } catch {}
  }, [dmList, openChatDm, fetchDmList]);

  const handleCreateRoom = async () => {
    const name = newRoomName.trim();
    if (!name || creatingRoom) return;
    setCreatingRoom(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, member_ids: newRoomMembers }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowCreateRoom(false); setNewRoomName(''); setNewRoomMembers([]);
        await fetchRoomList();
        openChatRoom(data.room.id, { ...data.room, my_role: 'admin', member_count: newRoomMembers.length + 1 });
      }
    } catch {}
    finally { setCreatingRoom(false); }
  };

  const updateStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await readApiJson(res);
      if (!res.ok || data.ok === false) {
        showToast(data.message || 'Не удалось обновить статус', 'error');
        return;
      }
      showToast('Статус обновлен', 'success');
      fetchLeads();
    } catch (err) {
      showToast(err?.message || 'Не удалось обновить статус', 'error');
    }
  };

  const openCloseReason = (lead, targetStatus = 'closed_lost', title = 'Закрыть в отказ') => {
    setCloseReasonModal({
      leadId: lead.id,
      leadName: lead.name || `Лид #${lead.id}`,
      targetStatus,
      title,
    });
    setCloseReasonText('');
  };

  const submitCloseReason = async () => {
    if (!closeReasonText.trim() || !closeReasonModal) return;
    setCloseReasonLoading(true);
    try {
      const targetStatus = closeReasonModal.targetStatus || 'closed_lost';
      const statusLabel = STATUS_LABELS[targetStatus] || 'Закрыто';
      await fetch(`/api/leads/${closeReasonModal.leadId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${statusLabel}: ${closeReasonText.trim()}` }),
      });
      await fetch(`/api/leads/${closeReasonModal.leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      setCloseReasonModal(null);
      showToast('Статус лида обновлен', 'success');
      fetchLeads();
    } finally {
      setCloseReasonLoading(false);
    }
  };

  const openNudge = (lead) => {
    if (!lead.assigned_to) {
      showToast('Сначала назначьте ответственного сотрудника', 'error');
      return;
    }
    setNudgeModal({
      leadId: lead.id,
      leadName: lead.name || `Лид #${lead.id}`,
      assignedTo: lead.assigned_to,
      assignedToName: lead.assigned_to_name || employees.find((emp) => emp.id === lead.assigned_to)?.name || 'сотрудник',
    });
    setNudgeText('');
  };

  const closeNudge = () => {
    setNudgeModal(null);
    setNudgeText('');
  };

  const submitNudge = async () => {
    if (!nudgeModal || nudgeLoading) return;
    setNudgeLoading(true);
    try {
      const res = await fetch(`/api/leads/${nudgeModal.leadId}/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: nudgeText.trim() }),
      });
      const data = await readApiJson(res);
      if (!res.ok || data.ok === false) {
        showToast(data.message || 'Не удалось отправить напоминание', 'error');
        return;
      }
      showToast('Напоминание отправлено ответственному', 'success');
      const emp = employees.find((item) => item.id === nudgeModal.assignedTo) || {
        id: nudgeModal.assignedTo,
        name: nudgeModal.assignedToName,
      };
      if (data.chat_id) openChatDm(data.chat_id, emp);
      fetchDmList();
      closeNudge();
    } catch (err) {
      showToast(err?.message || 'Не удалось отправить напоминание', 'error');
    } finally {
      setNudgeLoading(false);
    }
  };

  const assignLead = async (id, value) => {
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: value ? Number(value) : null }),
      });
      const data = await readApiJson(res);
      if (!res.ok || data.ok === false) {
        showToast(data.message || 'Не удалось назначить лид', 'error');
        return;
      }
      showToast(value ? 'Ответственный назначен' : 'Ответственный снят', 'success');
      fetchLeads();
    } catch (err) {
      showToast(err?.message || 'Не удалось назначить лид', 'error');
    }
  };

  const claimLead = async (id) => {
    setClaimingLeadId(id);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: user.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.message || 'Не удалось забрать лид', 'error');
      } else {
        setEmployeeLeadTab('my');
        showToast('Лид теперь в ваших задачах', 'success');
      }
      await fetchLeads();
    } finally {
      setClaimingLeadId(null);
    }
  };

  const deleteLead = async (id) => {
    askConfirm({
      title: 'Удалить лид?',
      message: 'Лид, комментарии и история действий будут удалены без восстановления.',
      confirmLabel: 'Удалить',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
          const data = await readApiJson(res);
          if (res.ok && data.ok) {
            setLeads((prev) => prev.filter((lead) => lead.id !== id));
            fetchLeads();
            showToast('Лид удален', 'success');
            return;
          }
          showToast(data.message || `Не удалось удалить лид (${res.status})`, 'error');
        } catch (err) {
          showToast(err?.message || 'Не удалось удалить лид', 'error');
        }
      }
    });
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  const selectTab = (key) => {
    setActiveTab(key);
    setDrawerOpen(false);
    if (key === 'chat') setChatUnread(0);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    setProfileSaved(false);
    try {
      const formData = new FormData();
      formData.append('name', profileForm.name);
      formData.append('username', profileForm.username);
      formData.append('phone', profileForm.phone);
      formData.append('status_text', profileForm.status_text);
      if (profileForm.avatar) formData.append('avatar', profileForm.avatar);

      const res = await fetch('/api/profile', { method: 'PATCH', body: formData });
      const data = await res.json();
      if (!data.ok) {
        setProfileError(data.message || 'Не удалось сохранить профиль');
        return;
      }
      setProfile(data.profile);
      setProfileForm((prev) => ({ ...prev, avatar: null }));
      setProfileSaved(true);
      showToast('Профиль сохранен', 'success');
    } catch (err) {
      console.error('Profile save error:', err);
      setProfileError('Не удалось сохранить профиль');
    } finally {
      setProfileSaving(false);
    }
  };

  // --- Credentials ---

  const saveCredentials = async (event) => {
    event.preventDefault();
    const { current_password, new_username, new_password, confirm_password } = credForm;

    if (!current_password) { setCredError('Введите текущий пароль'); return; }
    if (!new_username.trim() && !new_password) { setCredError('Укажите новый логин или новый пароль'); return; }
    if (new_password && new_password.length < 4) { setCredError('Новый пароль минимум 4 символа'); return; }
    if (new_password && new_password !== confirm_password) { setCredError('Пароли не совпадают'); return; }

    setCredSaving(true);
    setCredError('');
    setCredSaved('');
    try {
      const body = { current_password };
      if (new_username.trim()) body.new_username = new_username.trim();
      if (new_password) { body.new_password = new_password; body.confirm_new_password = confirm_password; }

      const res = await fetch('/api/profile/credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) { setCredError(data.message || 'Ошибка сохранения'); return; }

      if (data.username_changed) {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/admin/login');
        return;
      }
      setCredSaved('Данные обновлены');
      showToast('Данные входа обновлены', 'success');
      setCredForm({ current_password: '', new_username: '', new_password: '', confirm_password: '' });
    } catch (err) {
      console.error('Credentials save error:', err);
      setCredError('Ошибка сохранения');
    } finally {
      setCredSaving(false);
    }
  };

  // --- Comments ---

  const openComments = async (lead) => {
    setCommentModal({ leadId: lead.id, leadName: lead.name || `Лид #${lead.id}` });
    setCommentText('');
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/comments`);
      const data = await res.json();
      if (data.ok) {
        setComments(data.comments);
        setLeadEvents(data.events || []);
      }
    } finally {
      setCommentsLoading(false);
    }
  };

  const closeComments = () => {
    setCommentModal(null);
    setComments([]);
    setLeadEvents([]);
  };

  const sendComment = async () => {
    if (!commentText.trim() || !commentModal) return;
    const res = await fetch(`/api/leads/${commentModal.leadId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: commentText.trim() }),
    });
    const data = await res.json();
    if (data.ok) {
      setComments((prev) => [...prev, data.comment]);
      if (data.event) {
        setLeadEvents((prev) => [...prev, { ...data.event, author_name: user.name }]);
      }
      setCommentText('');
      setLeads((prev) =>
        prev.map((l) =>
          l.id === commentModal.leadId
            ? { ...l, comment_count: (l.comment_count || 0) + 1 }
            : l
        )
      );
    } else {
      showToast(data.message || 'Не удалось отправить комментарий', 'error');
    }
  };

  const handleCommentKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
  };

  // --- Employee editing ---

  const startEditEmployee = (emp) => {
    setEditingEmployee(emp.id);
    setEditName(emp.name);
  };

  const cancelEditEmployee = () => {
    setEditingEmployee(null);
    setEditName('');
  };

  const saveEmployeeName = async (empId) => {
    if (!editName.trim()) return;
    const res = await fetch(`/api/users/${empId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    const data = await res.json();
    if (data.ok) {
      setEmployees((prev) =>
        prev.map((e) => (e.id === empId ? { ...e, name: editName.trim() } : e))
      );
      setEditingEmployee(null);
    }
  };

  const handleEditKey = (e, empId) => {
    if (e.key === 'Enter') saveEmployeeName(empId);
    if (e.key === 'Escape') cancelEditEmployee();
  };

  // --- Employee create ---

  const openCreateModal = () => {
    setCreateForm({ name: '', username: '', password: '', confirmPassword: '' });
    setCreateError('');
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateError('');
  };

  const submitCreateEmployee = async (e) => {
    e.preventDefault();
    const { name, username, password, confirmPassword } = createForm;
    if (!name.trim() || !username.trim() || !password || !confirmPassword) {
      setCreateError('Все поля обязательны');
      return;
    }
    if (password.length < 4) {
      setCreateError('Пароль минимум 4 символа');
      return;
    }
    if (password !== confirmPassword) {
      setCreateError('Пароли не совпадают');
      return;
    }
    setCreateLoading(true);
    setCreateError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), username: username.trim(), password }),
      });
      const data = await res.json();
      if (!data.ok) { setCreateError(data.message || 'Ошибка создания'); return; }
      setEmployees((prev) => [...prev, data.user]);
      closeCreateModal();
      showToast('Сотрудник добавлен', 'success');
    } finally {
      setCreateLoading(false);
    }
  };

  // --- Export ---

  const downloadExport = async ({ dateFrom, dateTo } = {}) => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const url = `/api/leads/export${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        showToast('Не удалось подготовить экспорт', 'error');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      const from = dateFrom || 'all';
      const to = dateTo || 'all';
      a.href = URL.createObjectURL(blob);
      a.download = dateFrom || dateTo ? `leads_${from}_${to}.xlsx` : 'leads_all.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
      setShowExportModal(false);
      showToast('Экспорт скачан', 'success');
    } finally {
      setExportLoading(false);
    }
  };

  // --- Employee delete ---

  const deleteEmployee = async (emp) => {
    askConfirm({
      title: `Удалить ${emp.name}?`,
      message: 'Активные лиды сотрудника вернутся в общий пул.',
      confirmLabel: 'Удалить',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/users/${emp.id}`, { method: 'DELETE' });
          const data = await readApiJson(res);
          if (res.ok && data.ok) {
            setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
            setLeads((prev) =>
              prev.map((lead) =>
                lead.assigned_to === emp.id
                  ? { ...lead, assigned_to: null, assigned_to_name: null, status: isActiveLeadStatus(lead.status) ? 'new' : lead.status }
                  : lead
              )
            );
            fetchLeads();
            showToast('Сотрудник удален', 'success');
            return;
          }
          showToast(data.message || `Ошибка удаления (${res.status})`, 'error');
        } catch (err) {
          showToast(err?.message || 'Ошибка удаления', 'error');
        }
      }
    });
  };

  const commonLeads = useMemo(
    () => isAdmin ? [] : leads.filter((lead) => lead.assigned_to === null),
    [isAdmin, leads]
  );
  const myLeads = useMemo(
    () => isAdmin ? [] : leads.filter((lead) => lead.assigned_to === user.id),
    [isAdmin, leads, user.id]
  );
  const visibleLeads = useMemo(
    () => isAdmin ? leads : employeeLeadTab === 'common' ? commonLeads : myLeads,
    [commonLeads, employeeLeadTab, isAdmin, leads, myLeads]
  );
  const employeePersonalStats = useMemo(() => {
    const stageCounts = STATUSES.reduce((acc, status) => {
      acc[status] = myLeads.filter((lead) => filterMatchesLead(lead, status)).length;
      return acc;
    }, {});
    return {
      total: myLeads.length,
      active: myLeads.filter((lead) => isActiveLeadStatus(lead.status)).length,
      closedWon: myLeads.filter((lead) => lead.status === 'closed_won' || lead.status === 'closed').length,
      stageCounts,
    };
  }, [myLeads]);
  const leadStats = useMemo(() => {
    const countByStatus = (status) => leads.filter((lead) => filterMatchesLead(lead, status)).length;
    return [
      { label: 'Всего', value: leads.length, accent: 'total' },
      { label: STATUS_LABELS.new, value: countByStatus('new'), accent: 'new' },
      { label: STATUS_LABELS.in_progress, value: countByStatus('in_progress'), accent: 'in_progress' },
      { label: STATUS_LABELS.meeting, value: countByStatus('meeting'), accent: 'meeting' },
      { label: STATUS_LABELS.documents, value: countByStatus('documents'), accent: 'documents' },
      { label: STATUS_LABELS.deal, value: countByStatus('deal'), accent: 'deal' },
      { label: 'Успешно', value: countByStatus('closed_won'), accent: 'closed_won' },
      { label: 'Отказ', value: countByStatus('closed_lost'), accent: 'closed_lost' },
    ];
  }, [leads]);
  const leadReport = useMemo(() => {
    const total = leads.length;
    const byStatus = {
      new: leads.filter((lead) => lead.status === 'new').length,
      in_progress: leads.filter((lead) => lead.status === 'in_progress').length,
      meeting: leads.filter((lead) => lead.status === 'meeting').length,
      documents: leads.filter((lead) => lead.status === 'documents').length,
      deal: leads.filter((lead) => lead.status === 'deal').length,
      closed_won: leads.filter((lead) => lead.status === 'closed_won' || lead.status === 'closed').length,
      closed_lost: leads.filter((lead) => lead.status === 'closed_lost').length,
    };
    const todayStart = startOfDay();
    const trend = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(todayStart.getTime() - (6 - index) * DAY_MS);
      const nextDay = new Date(day.getTime() + DAY_MS);
      const dayLeads = leads.filter((lead) => {
        const created = parseLeadDate(lead.created_at);
        return created && created >= day && created < nextDay;
      });

      return {
        key: day.toISOString(),
        label: formatShortDay(day),
        total: dayLeads.length,
        closed: dayLeads.filter((lead) => lead.status === 'closed_won' || lead.status === 'closed').length,
      };
    });
    const weekTotal = trend.reduce((sum, item) => sum + item.total, 0);
    const weekClosed = trend.reduce((sum, item) => sum + item.closed, 0);
    const today = trend[trend.length - 1]?.total || 0;
    const assigned = leads.filter((lead) => lead.assigned_to).length;
    const unassigned = total - assigned;
    const unassignedNew = leads.filter((lead) => lead.status === 'new' && !lead.assigned_to).length;
    const noComment = leads.filter((lead) => !lead.comment_count).length;
    const employeeRows = employees
      .map((employee) => {
        const employeeLeads = leads.filter((lead) => lead.assigned_to === employee.id);
        const stageCounts = STATUSES.reduce((acc, status) => {
          acc[status] = employeeLeads.filter((lead) => filterMatchesLead(lead, status)).length;
          return acc;
        }, {});
        return {
          id: employee.id,
          name: employee.name,
          total: employeeLeads.length,
          active: employeeLeads.filter((lead) => isActiveLeadStatus(lead.status)).length,
          closed: employeeLeads.filter((lead) => lead.status === 'closed_won' || lead.status === 'closed').length,
          stageCounts,
        };
      })
      .sort((a, b) => b.total - a.total || b.active - a.active);

    return {
      total,
      today,
      weekTotal,
      weekClosed,
      assigned,
      unassigned,
      unassignedNew,
      noComment,
      newLeads: byStatus.new,
      inProgress: byStatus.in_progress,
      closed: byStatus.closed_won,
      lost: byStatus.closed_lost,
      activeRate: percent(ACTIVE_PIPELINE_STATUSES.reduce((sum, status) => sum + (byStatus[status] || 0), 0), total),
      closedRate: percent(byStatus.closed_won, total),
      avgPerDay: weekTotal ? (weekTotal / 7).toFixed(1) : '0',
      trend,
      employeeRows,
      statusSegments: [
        { key: 'new', label: STATUS_LABELS.new, value: byStatus.new, color: REPORT_STATUS_COLORS.new },
        { key: 'in_progress', label: STATUS_LABELS.in_progress, value: byStatus.in_progress, color: REPORT_STATUS_COLORS.in_progress },
        { key: 'meeting', label: STATUS_LABELS.meeting, value: byStatus.meeting, color: REPORT_STATUS_COLORS.meeting },
        { key: 'documents', label: STATUS_LABELS.documents, value: byStatus.documents, color: REPORT_STATUS_COLORS.documents },
        { key: 'deal', label: STATUS_LABELS.deal, value: byStatus.deal, color: REPORT_STATUS_COLORS.deal },
        { key: 'closed_won', label: 'Успешно', value: byStatus.closed_won, color: REPORT_STATUS_COLORS.closed_won },
        { key: 'closed_lost', label: 'Отказ', value: byStatus.closed_lost, color: REPORT_STATUS_COLORS.closed_lost },
      ],
    };
  }, [employees, leads]);
  const filteredVisibleLeads = useMemo(() => {
    const statusFilteredLeads = visibleLeads.filter((lead) => filterMatchesLead(lead, filter));
    const query = leadSearch.trim().toLowerCase();
    if (!query) return statusFilteredLeads;
    return statusFilteredLeads.filter((lead) => {
      const assignee = employees.find((emp) => emp.id === lead.assigned_to);
      return [
        lead.name,
        lead.phone,
        formatMessage(lead.message),
        STATUS_LABELS[lead.status] ?? lead.status,
        assignee?.name,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [employees, filter, leadSearch, visibleLeads]);
  const showWorkColumns = isAdmin || employeeLeadTab === 'my';
  const unassignedNewLeads = useMemo(
    () => leads.filter((lead) => lead.status === 'new' && !lead.assigned_to),
    [leads]
  );
  const chatSidebarUsers = useMemo(
    () => chatNavUsers.filter((item) => item.id !== user.id),
    [chatNavUsers, user.id]
  );
  const chatSidebarScrollClass =
    chatSidebarUsers.length + roomList.length + 1 > 10
      ? 'crm-scrollbar max-h-[28rem] overflow-y-auto pr-1'
      : 'pr-1';

  const sendLeadReminder = async () => {
    if (reminderSending || unassignedNewLeads.length === 0) return;
    setReminderSending(true);
    try {
      const preview = unassignedNewLeads
        .slice(0, 3)
        .map((lead) => `${lead.name || `Лид #${lead.id}`}${lead.phone ? ` (${lead.phone})` : ''}`)
        .join(', ');
      const suffix = unassignedNewLeads.length > 3 ? ` и еще ${unassignedNewLeads.length - 3}` : '';
      const text = `Коллеги, нужно разобрать ${unassignedNewLeads.length} новых лидов без ответственного: ${preview}${suffix}. Кто свободен, заберите лид в работу.`;
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data.message || 'Не удалось отправить напоминание', 'error');
        return;
      }
      showToast('Напоминание отправлено в общий чат', 'success');
      openChatGeneral();
      fetchChatUnread();
    } catch (err) {
      showToast(err?.message || 'Не удалось отправить напоминание', 'error');
    } finally {
      setReminderSending(false);
    }
  };
  const emptyLeadsText = isAdmin
    ? 'Лидов нет.'
    : employeeLeadTab === 'common'
    ? 'Общих лидов нет.'
    : 'У вас пока нет лидов.';
  const searchEmptyText = leadSearch.trim() ? 'По этому поиску лидов нет.' : emptyLeadsText;
  const navItems = [
    { key: 'leads', label: 'Лиды', icon: 'leads' },
    ...(isAdmin ? [
      { key: 'reports', label: 'Статистика', icon: 'reports' },
      { key: 'employees', label: 'Сотрудники', icon: 'employees' },
    ] : []),
    { key: 'chat', label: 'Общий чат', icon: 'chat', badge: chatUnread },
    { key: 'profile', label: 'Профиль', icon: 'profile' },
  ];
  const notificationLabel = notifStatus === 'granted'
    ? 'Уведомления включены ✓'
    : notifStatus === 'denied'
    ? 'Уведомления заблокированы'
    : notifStatus === 'unsupported'
    ? 'Push не поддерживается'
    : notifStatus === 'unsupported_ios'
    ? 'Push недоступен на этом iPhone'
    : notifStatus === 'ios_install_required'
    ? 'Установите CRM на экран Домой'
    : notifStatus === 'not_configured'
    ? 'Push-ключи не настроены'
    : notifStatus === 'loading'
    ? 'Подключение...'
    : notifStatus === 'error'
    ? 'Ошибка, попробуйте снова'
    : 'Включить уведомления';
  const notificationClass = notifStatus === 'granted'
    ? 'border-crm-success/30 bg-crm-success/10 text-crm-success hover:border-crm-danger/30 hover:bg-crm-danger/10 hover:text-crm-danger'
    : notifStatus === 'denied' || notifStatus === 'unsupported' || notifStatus === 'unsupported_ios' || notifStatus === 'ios_install_required' || notifStatus === 'not_configured'
    ? 'border-crm-danger/30 bg-crm-danger/10 text-crm-danger'
    : notifStatus === 'error'
    ? 'border-crm-warning/30 bg-crm-warning/10 text-crm-warning hover:bg-crm-warning/15'
    : 'border-crm-border bg-crm-surface/60 text-crm-muted hover:border-white/[0.14] hover:bg-crm-surfaceStrong hover:text-crm-text';

  const notificationBlocked = ['denied', 'unsupported', 'unsupported_ios', 'ios_install_required', 'not_configured'].includes(notifStatus);

  const renderNavigation = () => (
    <div className="flex h-full min-h-0 flex-col">
      <button
        onClick={() => selectTab('profile')}
        className="crm-focus-ring group flex items-center gap-3 border-b border-crm-border px-4 py-4 text-left transition hover:bg-white/[0.03] sm:px-5 sm:py-5"
      >
        <div className="rounded-full ring-2 ring-crm-border transition group-hover:ring-crm-accent/35">
          <AvatarCircle profile={profile} size="lg" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-crm-text">{profile.name}</p>
          <p className="truncate text-xs text-crm-muted">
            {profile.status_text || (isAdmin ? 'Администратор' : 'Сотрудник')}
          </p>
        </div>
      </button>

      <nav className="crm-scrollbar flex-1 space-y-0.5 overflow-y-auto px-2 py-3 sm:px-3 sm:py-4">
        {navItems.map((item) => (
          <div key={item.key}>
            <button
              onClick={() => selectTab(item.key)}
              className={`crm-focus-ring flex w-full items-center gap-3 rounded-crmXl px-3 py-2.5 text-left text-sm transition ${shellNavItemClass(activeTab === item.key)}`}
            >
              <NavIcon name={item.icon} />
              <span className="flex-1">{item.label}</span>
              {item.badge > 0 && (
                <span className="rounded-full bg-crm-danger px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>

            {item.key === 'chat' && (
              <div className={`mt-2 space-y-1.5 rounded-crmXl border border-crm-border/70 bg-crm-surface/35 p-1.5 shadow-inner ${chatSidebarScrollClass}`}>
                <button
                  onClick={() => { openChatGeneral(); setDrawerOpen(false); }}
                  className={`crm-focus-ring flex min-h-10 w-full items-center gap-2 rounded-crmLg px-2.5 py-2 text-left text-xs transition ${shellChatSubItemClass(!activeDmId && !activeRoomId)}`}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                    style={{ background: 'var(--crm-gradient-primary)' }}>CRM</div>
                  <span className="flex-1 truncate">Общий чат</span>
                  {chatGenUnread > 0 && (
                    <span className="rounded-full bg-crm-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {chatGenUnread > 99 ? '99+' : chatGenUnread}
                    </span>
                  )}
                </button>

                <p className="px-3 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wider text-crm-muted">Сотрудники</p>
                {chatSidebarUsers.map((emp) => {
                  const dmEntry  = dmList.find((c) => c.other_user_id === emp.id);
                  const dmUnread = dmEntry?.unread_count || 0;
                  const isActive = dmEntry ? activeDmId === dmEntry.id : false;
                  return (
                    <button key={emp.id}
                      onClick={() => { handleOpenChatDm(emp); setDrawerOpen(false); }}
                      className={`crm-focus-ring flex min-h-10 w-full items-center gap-2 rounded-crmLg px-2.5 py-2 text-left text-xs transition ${shellChatSubItemClass(isActive)}`}
                    >
                      {emp.avatar_url
                        ? <img src={emp.avatar_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-crm-border" />
                        : <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                            style={{ background: chatColor(emp.id) }}>{chatInitials(emp.name)}</div>
                      }
                      <span className="min-w-0 flex-1 truncate">{emp.name}</span>
                      {dmUnread > 0 && (
                        <span className="rounded-full bg-crm-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {dmUnread > 99 ? '99+' : dmUnread}
                        </span>
                      )}
                    </button>
                  );
                })}

                <div className="flex items-center px-3 pb-0.5 pt-2">
                  <span className="flex-1 text-[9px] font-semibold uppercase tracking-wider text-crm-muted">Каналы</span>
                  <button onClick={() => setShowCreateRoom(true)}
                    className="crm-focus-ring flex h-8 w-8 items-center justify-center rounded-full border border-crm-border bg-crm-surface/60 text-crm-muted transition hover:border-crm-accent/35 hover:bg-crm-accent/10 hover:text-crm-accent"
                    aria-label="Создать канал">
                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </button>
                </div>
                {roomList.length === 0 && (
                  <p className="pl-5 pr-3 text-[11px] text-crm-muted">Нет каналов</p>
                )}
                {roomList.map((room) => (
                  <button key={room.id}
                    onClick={() => { openChatRoom(room.id, room); setDrawerOpen(false); }}
                    className={`crm-focus-ring flex min-h-10 w-full items-center gap-2 rounded-crmLg px-2.5 py-2 text-left text-xs transition ${shellChatSubItemClass(activeRoomId === room.id)}`}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                      style={{ background: chatColor(room.id + 5) }}>
                      {room.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="min-w-0 flex-1 truncate">{room.name}</span>
                    {room.unread_count > 0 && (
                      <span className="rounded-full bg-crm-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {room.unread_count > 99 ? '99+' : room.unread_count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="crm-mobile-safe-bottom space-y-2 border-t border-crm-border p-3 sm:p-4">
        <button
          onClick={toggleTheme}
          className="crm-focus-ring flex w-full items-center justify-between rounded-crmLg border border-crm-border bg-crm-surface/60 px-3 py-2 text-sm text-crm-muted transition hover:border-white/[0.14] hover:bg-crm-surfaceStrong hover:text-crm-text"
        >
          <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
          <span className="text-crm-accent">{theme === 'dark' ? '☀️' : '🌙'}</span>
        </button>
        <button
          onClick={notifStatus === 'granted' ? disableNotifications : notificationBlocked ? undefined : enableNotifications}
          disabled={notifStatus === 'loading' || notificationBlocked}
          className={`crm-focus-ring w-full rounded-crmLg border px-3 py-2 text-sm transition disabled:cursor-default ${notificationClass}`}
        >
          {notificationLabel}
        </button>
        {notificationError && (
          <p className="rounded-crmLg border border-crm-danger/20 bg-crm-danger/10 px-3 py-2 text-xs leading-snug text-crm-danger">
            {notificationError}
          </p>
        )}
        <button
          onClick={logout}
          className="crm-focus-ring w-full rounded-crmLg border border-crm-border bg-crm-surface/60 px-3 py-2 text-sm text-crm-muted transition hover:border-crm-danger/30 hover:bg-crm-danger/10 hover:text-crm-danger"
        >
          Выйти
        </button>
      </div>
    </div>
  );

  return (
    <main
      className={`crm-app-bg crm-mobile-safe-bottom min-w-0 text-crm-text ${
        activeTab === 'chat'
          ? 'overflow-hidden'
          : 'min-h-dvh touch-pan-y'
      }`}
    >
      <ToastStack toasts={toasts} onClose={closeToast} />
      <ConfirmDialog state={confirmState} onCancel={cancelConfirm} onConfirm={acceptConfirm} />

      <aside className="crm-glass fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-crm-border shadow-crmCard md:block">
        {renderNavigation()}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Закрыть меню"
            className="absolute inset-0 bg-[var(--crm-bg-deep)]/65 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="crm-glass crm-mobile-safe-bottom relative flex h-full w-[min(20rem,86vw)] flex-col border-r border-crm-border shadow-crmCard">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Закрыть меню"
              className="crm-focus-ring absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-crmLg border border-crm-border bg-crm-surfaceStrong/90 text-crm-muted transition hover:border-white/[0.14] hover:text-crm-text"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            {renderNavigation()}
          </aside>
        </div>
      )}

      <section
        className={
          activeTab === 'chat'
            ? 'min-w-0 px-4 py-4 md:ml-72 md:px-8 md:py-5'
            : 'min-h-dvh min-w-0 px-4 py-4 md:ml-72 md:px-8 md:py-5'
        }
      >
        <div className="w-full min-w-0 space-y-6">
          <header className="crm-glass -mx-4 mb-1 flex items-center justify-between gap-3 rounded-crmXl border border-crm-border px-3 py-2.5 shadow-crmCard sm:-mx-6 md:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              className="crm-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-crmLg border border-crm-border bg-crm-surface/60 text-crm-text transition hover:border-crm-accent/35 hover:bg-crm-accent/10 hover:text-crm-accent"
              aria-label="Открыть меню"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold crm-gradient-text">СвойДом CRM</h1>
              <p className="truncate text-xs text-crm-muted">{profile.name}</p>
            </div>
            <button onClick={() => selectTab('profile')} className="crm-focus-ring shrink-0 rounded-full ring-2 ring-crm-border transition hover:ring-crm-accent/35">
              <AvatarCircle profile={profile} />
            </button>
          </header>

        {/* ── Leads tab ── */}
        {activeTab === 'leads' && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold tracking-tight crm-gradient-text">Лиды</h2>
                <p className="mt-1 text-sm text-crm-muted">
                  Все обращения, статусы и назначения в одной рабочей зоне
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setShowExportModal(true)}
                  className="crm-focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-crmLg border border-crm-border bg-crm-surface/60 px-4 py-2.5 text-sm font-medium text-crm-text transition hover:border-crm-accent/35 hover:bg-crm-accent/10 hover:text-crm-accent"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Экспорт
                </button>
              )}
            </div>

            {isAdmin && unassignedNewLeads.length > 0 && (
              <div className="crm-card crm-card-strong rounded-crmXl border border-crm-warning/35 bg-crm-warning/10 p-4 shadow-crmCard">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-crm-text">
                      Нужно разобрать новые лиды: {unassignedNewLeads.length}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-crm-muted">
                      Напомните сотрудникам в общем чате, чтобы кто-то взял заявки в работу.
                    </p>
                  </div>
                  <button
                    onClick={sendLeadReminder}
                    disabled={reminderSending}
                    className="crm-focus-ring inline-flex min-h-11 shrink-0 items-center justify-center rounded-crmLg border border-crm-warning/45 bg-crm-warning/18 px-4 py-2.5 text-sm font-semibold text-crm-warning transition hover:bg-crm-warning/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {reminderSending ? 'Отправляю...' : 'Напомнить в чат'}
                  </button>
                </div>
              </div>
            )}

            {!isAdmin && (
              <EmployeePersonalStats stats={employeePersonalStats} />
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {leadStats.map((stat) => (
                <div key={stat.label} className={leadStatCardClass(stat.accent)}>
                  <p className="text-xs font-medium uppercase tracking-wide text-crm-muted">{stat.label}</p>
                  <p className={`mt-1.5 text-3xl font-semibold tabular-nums ${leadStatValueClass(stat.accent)}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    className={leadFilterChipClass(filter === value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!isAdmin && (
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'common', label: `Общие (${commonLeads.length})` },
                    { key: 'my', label: `Мои (${myLeads.length})` },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setEmployeeLeadTab(key)}
                      className={leadFilterChipClass(employeeLeadTab === key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="crm-glass flex flex-col gap-2 rounded-crmXl border border-crm-border p-3 shadow-crmCard sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Поиск по имени, телефону, сообщению…"
                  className="crm-focus-ring w-full rounded-crmLg border border-crm-border bg-crm-surface/50 py-2.5 pl-10 pr-10 text-sm text-crm-text placeholder:text-crm-muted"
                />
                {leadSearch && (
                  <button
                    type="button"
                    onClick={() => setLeadSearch('')}
                    className="crm-focus-ring absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-crm-muted transition hover:bg-crm-accent/10 hover:text-crm-accent"
                    aria-label="Очистить поиск"
                  >
                    ×
                  </button>
                )}
              </div>
              <span className="shrink-0 px-1 text-xs text-crm-muted sm:px-2">
                Показано {filteredVisibleLeads.length} из {visibleLeads.length}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 xl:hidden">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="crm-premium-panel animate-pulse rounded-crmXl p-4 shadow-crmCard">
                    <div className="mb-3 h-4 w-32 rounded bg-crm-border/60" />
                    <div className="mb-2 h-3 w-48 rounded bg-crm-border/50" />
                    <div className="h-3 w-full rounded bg-crm-border/40" />
                  </div>
                ))
              ) : filteredVisibleLeads.length === 0 ? (
                <LeadsEmptyState>{searchEmptyText}</LeadsEmptyState>
              ) : (
                filteredVisibleLeads.map((lead) => (
                  <article key={lead.id} className="crm-premium-panel crm-soft-rise flex min-h-[23rem] flex-col rounded-crmXl border border-crm-border p-4 shadow-crmCard">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-crm-text">{lead.name || '—'}</p>
                        <p className="mt-0.5 text-xs text-crm-muted">#{lead.id} · {formatDate(lead.created_at)}</p>
                      </div>
                      <span className={statusBadgeClass(lead.status)}>
                        {STATUS_LABELS[lead.status] ?? lead.status}
                      </span>
                    </div>
                    <LeadContactActions lead={lead} />
                    <p className="mb-3 line-clamp-5 text-sm leading-relaxed text-crm-muted">{formatMessage(lead.message)}</p>
                    <div className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div className="rounded-crmLg border border-crm-border bg-crm-surface/35 px-3 py-2">
                        <p className="uppercase tracking-wide text-crm-muted">Ответственный</p>
                        <p className="mt-1 truncate font-medium text-crm-text">
                          {lead.assigned_to_name || employees.find((emp) => emp.id === lead.assigned_to)?.name || 'Не назначен'}
                        </p>
                      </div>
                      <button
                        onClick={() => openComments(lead)}
                        className="crm-focus-ring rounded-crmLg border border-crm-border bg-crm-surface/35 px-3 py-2 text-left transition hover:border-crm-accent/30 hover:bg-crm-accent/8"
                      >
                        <p className="uppercase tracking-wide text-crm-muted">Комментарии</p>
                        <p className="mt-1 truncate font-medium text-crm-text">
                          {lead.comment_count || 0}{lead.last_comment_text ? ` · ${lead.last_comment_text}` : ''}
                        </p>
                      </button>
                    </div>
                    {isAdmin && (
                      <select
                        value={lead.assigned_to ?? ''}
                        onChange={(e) => assignLead(lead.id, e.target.value || null)}
                        className="crm-focus-ring mb-3 w-full min-h-11 rounded-crmLg border border-crm-border bg-crm-surface/50 px-3 py-2 text-sm text-crm-text"
                      >
                        <option value="">Не назначен</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                      </select>
                    )}
                    {showWorkColumns && !isAdmin && (
                      <button
                        onClick={() => openComments(lead)}
                        className="crm-focus-ring mb-3 flex min-h-11 w-full flex-col justify-center rounded-crmLg border border-crm-border bg-crm-surface/40 px-3 py-2 text-left text-sm text-crm-text transition hover:border-crm-accent/30 hover:bg-crm-accent/8"
                      >
                        <span className="font-medium">Комментарии: {lead.comment_count || 0}</span>
                        {lead.last_comment_text && (
                          <span className="mt-1 block truncate text-xs text-crm-muted">{lead.last_comment_text}</span>
                        )}
                      </button>
                    )}
                    {(lead.status === 'new' && !lead.assigned_to) || !lead.comment_count ? (
                      <div className="mb-3 rounded-crmLg border border-crm-warning/25 bg-crm-warning/10 px-3 py-2 text-xs text-crm-warning">
                        {lead.status === 'new' && !lead.assigned_to ? 'Нужно назначить ответственного' : 'Нужен комментарий по контакту'}
                      </div>
                    ) : null}
                    <div className="mt-auto flex flex-wrap gap-2">
                      {!isAdmin && employeeLeadTab === 'common' ? (
                        <button
                          onClick={() => claimLead(lead.id)}
                          disabled={claimingLeadId === lead.id}
                          className="crm-focus-ring min-h-11 rounded-crmLg border border-crm-accent/35 bg-crm-accent/12 px-4 py-2.5 text-xs font-medium text-crm-accent disabled:opacity-50"
                        >
                          {claimingLeadId === lead.id ? 'Забираю...' : '→ В работу'}
                        </button>
                      ) : (
                        <>
                          {getLeadPipelineActions(lead.status).map((action) => (
                            <button
                              key={action.status}
                              onClick={() => action.needsReason ? openCloseReason(lead, action.status, action.label) : updateStatus(lead.id, action.status)}
                              className={leadActionButtonClass(action.variant)}
                            >
                              {action.label}
                            </button>
                          ))}
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => openNudge(lead)}
                                disabled={!lead.assigned_to}
                                className="crm-focus-ring min-h-11 rounded-crmLg border border-crm-warning/45 bg-crm-warning/15 px-3 py-2.5 text-xs font-semibold text-crm-warning transition hover:bg-crm-warning/22 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Пнуть
                              </button>
                              <button
                                onClick={() => deleteLead(lead.id)}
                                className="crm-focus-ring min-h-11 rounded-crmLg border border-crm-danger/35 bg-crm-danger/10 px-3 py-2.5 text-xs font-medium text-crm-danger transition hover:bg-crm-danger/15"
                              >
                                Удалить
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="crm-premium-panel hidden overflow-hidden rounded-crmXl border border-crm-border shadow-crmCard xl:block">
              {loading ? (
                <div className="crm-scrollbar overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-crm-border bg-black/10 text-xs uppercase tracking-wide text-crm-muted">
                      <tr>
                        <th className="p-3 font-semibold">Дата</th>
                        <th className="p-3 font-semibold">Имя</th>
                        <th className="p-3 font-semibold">Телефон</th>
                        <th className="p-3 font-semibold">Сообщение</th>
                        <th className="p-3 font-semibold">Статус</th>
                        {isAdmin && <th className="p-3 font-semibold">Назначен</th>}
                        {showWorkColumns && <th className="p-3 font-semibold">Комментарии</th>}
                        <th className="p-3 font-semibold">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-t border-crm-border/60 align-top">
                          <td className="p-3"><div className="h-4 w-24 animate-pulse rounded bg-crm-border/50" /></td>
                          <td className="p-3"><div className="h-4 w-28 animate-pulse rounded bg-crm-border/50" /></td>
                          <td className="p-3"><div className="h-4 w-28 animate-pulse rounded bg-crm-border/50" /></td>
                          <td className="p-3"><div className="h-4 w-48 animate-pulse rounded bg-crm-border/50" /></td>
                          <td className="p-3"><div className="h-5 w-16 animate-pulse rounded-full bg-crm-border/50" /></td>
                          {isAdmin && <td className="p-3"><div className="h-8 w-24 animate-pulse rounded-crmLg bg-crm-border/50" /></td>}
                          {showWorkColumns && <td className="p-3"><div className="h-4 w-36 animate-pulse rounded bg-crm-border/50" /></td>}
                          <td className="p-3"><div className="h-8 w-32 animate-pulse rounded-crmLg bg-crm-border/50" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : filteredVisibleLeads.length === 0 ? (
                <div className="px-6 py-16">
                  <LeadsEmptyState>{searchEmptyText}</LeadsEmptyState>
                </div>
              ) : (
                <div className="crm-scrollbar overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-crm-border bg-black/10 text-xs uppercase tracking-wide text-crm-muted">
                      <tr>
                        <th className="p-3 font-semibold">Дата</th>
                        <th className="p-3 font-semibold">Имя</th>
                        <th className="p-3 font-semibold">Телефон</th>
                        <th className="p-3 font-semibold">Сообщение</th>
                        <th className="p-3 font-semibold">Статус</th>
                        {isAdmin && <th className="p-3 font-semibold">Назначен</th>}
                        {showWorkColumns && <th className="p-3 font-semibold">Комментарии</th>}
                        <th className="p-3 font-semibold">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVisibleLeads.map((lead) => (
                        <tr key={lead.id} className="border-t border-crm-border/60 align-top transition duration-200 hover:bg-crm-accent/10">
                          <td className="whitespace-nowrap p-3 text-crm-muted">{formatDate(lead.created_at)}</td>
                          <td className="p-3 font-medium text-crm-text">{lead.name || '—'}</td>
                          <td className="whitespace-nowrap p-3">
                            <LeadContactActions lead={lead} compact />
                          </td>
                          <td className="max-w-xs p-3 text-crm-muted">{formatMessage(lead.message)}</td>
                          <td className="p-3">
                            <span className={statusBadgeClass(lead.status)}>
                              {STATUS_LABELS[lead.status] ?? lead.status}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className="p-3">
                              <select
                                value={lead.assigned_to ?? ''}
                                onChange={(e) => assignLead(lead.id, e.target.value || null)}
                                className="crm-focus-ring rounded-crmLg border border-crm-border bg-crm-surface/50 px-2 py-1.5 text-xs text-crm-text"
                              >
                                <option value="">Не назначен</option>
                                {employees.map((emp) => (
                                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                              </select>
                            </td>
                          )}
                          {showWorkColumns && (
                            <td className="max-w-[200px] p-3">
                              <button
                                onClick={() => openComments(lead)}
                                className="crm-focus-ring group w-full rounded-crmLg text-left transition hover:bg-crm-accent/8"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="rounded-full border border-crm-border bg-crm-surface/60 px-2 py-0.5 text-xs font-medium text-crm-text group-hover:border-crm-accent/30 group-hover:text-crm-accent">
                                    {lead.comment_count || 0}
                                  </span>
                                </div>
                                {lead.last_comment_text && (
                                  <p className="mt-1 line-clamp-2 text-xs text-crm-muted group-hover:text-crm-text">
                                    {lead.last_comment_text.length > 50
                                      ? lead.last_comment_text.slice(0, 50) + '…'
                                      : lead.last_comment_text}
                                  </p>
                                )}
                              </button>
                            </td>
                          )}
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1.5">
                              {!isAdmin && employeeLeadTab === 'common' ? (
                                <button
                                  onClick={() => claimLead(lead.id)}
                                  disabled={claimingLeadId === lead.id}
                                  className="crm-focus-ring rounded-crmLg border border-crm-accent/35 bg-crm-accent/12 px-3 py-1.5 text-xs font-medium text-crm-accent transition hover:bg-crm-accent/18 disabled:opacity-50"
                                >
                                  {claimingLeadId === lead.id ? 'Забираю...' : '→ В работе'}
                                </button>
                              ) : (
                                <>
                                  {getLeadPipelineActions(lead.status).map((action) => (
                                    <button
                                      key={action.status}
                                      onClick={() => action.needsReason ? openCloseReason(lead, action.status, action.label) : updateStatus(lead.id, action.status)}
                                      className={leadActionButtonClass(action.variant, true)}
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                  {isAdmin && (
                                    <>
                                      <button
                                        onClick={() => openNudge(lead)}
                                        disabled={!lead.assigned_to}
                                        className="crm-focus-ring rounded-crmLg border border-crm-warning/40 bg-crm-warning/12 px-2.5 py-1.5 text-xs font-medium text-crm-warning transition hover:bg-crm-warning/20 disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        Пнуть
                                      </button>
                                      <button
                                        onClick={() => deleteLead(lead.id)}
                                        className="crm-focus-ring rounded-crmLg border border-crm-danger/35 bg-crm-danger/10 px-2.5 py-1.5 text-xs font-medium text-crm-danger transition hover:bg-crm-danger/15"
                                      >
                                        Удалить
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Reports tab ── */}
        {activeTab === 'reports' && isAdmin && (
          <LeadReportsPanel
            report={leadReport}
            isAdmin={isAdmin}
            onExport={() => setShowExportModal(true)}
            onOpenLeads={() => selectTab('leads')}
          />
        )}

        {/* ── Team chat tab ── */}
        {activeTab === 'chat' && (
          <TeamChatPanel
            user={profile}
            chatUsers={chatNavUsers}
            activeDmId={activeDmId}
            dmOtherUser={dmOtherUser}
            activeRoomId={activeRoomId}
            activeRoom={activeRoom}
            onOpenGeneral={openChatGeneral}
            onSetActiveRoom={setActiveRoom}
            onGeneralUnread={setChatGenUnread}
            onDmSent={fetchDmList}
            onRoomSent={fetchRoomList}
            onRoomListRefresh={fetchRoomList}
            onOpenMenu={() => setDrawerOpen(true)}
            showToast={showToast}
            askConfirm={askConfirm}
          />
        )}

        {/* ── Profile tab ── */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight crm-gradient-text">Профиль</h2>
              <p className="mt-1 text-sm text-crm-muted">
                Личные данные, безопасность и уведомления в одном месте
              </p>
            </div>

            <div className="crm-card crm-card-strong rounded-crm2xl border border-crm-border p-5 shadow-crmCard sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="rounded-full p-0.5 ring-2 ring-crm-accent/35 ring-offset-2 ring-offset-crm-bg">
                    <AvatarCircle profile={profile} size="lg" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-crm-text">{profile.name || 'Без имени'}</p>
                    <p className="truncate text-sm text-crm-muted">@{profile.username || '—'}</p>
                    {profile.status_text ? (
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-crm-text/90">{profile.status_text}</p>
                    ) : (
                      <p className="mt-2 text-sm text-crm-muted">Статус не задан</p>
                    )}
                  </div>
                </div>
                <span className="inline-flex shrink-0 self-start rounded-full border border-crm-accent/30 bg-crm-accent/10 px-3 py-1 text-xs font-medium text-crm-accent sm:self-center">
                  {isAdmin ? 'Администратор' : 'Сотрудник'}
                </span>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className={settingsCardClass()}>
                <div className={settingsCardHeaderClass()}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-crmLg border border-crm-accent/25 bg-crm-accent/10">
                      <ProfileSectionIcon name="personal" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-crm-text">Личные данные</h3>
                      <p className="mt-1 text-sm text-crm-muted">
                        Имя, контакты и аватар видны в CRM и общем чате
                      </p>
                    </div>
                  </div>
                </div>
                <form onSubmit={saveProfile} className={`${settingsCardBodyClass()} space-y-5`}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={profileLabelClass()}>Отображаемое имя</label>
                      <input
                        type="text"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Иван Иванов"
                        className={profileInputClass()}
                      />
                    </div>
                    <div>
                      <label className={profileLabelClass()}>Никнейм</label>
                      <div className="crm-focus-ring flex min-h-11 overflow-hidden rounded-crmLg border border-crm-border bg-crm-surface/50 focus-within:ring-2">
                        <span className="flex items-center border-r border-crm-border px-3 text-sm text-crm-muted">@</span>
                        <input
                          type="text"
                          value={profileForm.username}
                          onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value.replace(/^@+/, '') }))}
                          placeholder="nickname"
                          autoComplete="username"
                          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-crm-text placeholder:text-crm-muted focus:outline-none"
                        />
                      </div>
                      <p className={profileHintClass()}>3-32 символа: латиница, цифры и _.</p>
                    </div>
                    <div>
                      <label className={profileLabelClass()}>Телефон</label>
                      <input
                        type="tel"
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="+7 999 000-00-00"
                        className={profileInputClass()}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={profileLabelClass()}>Аватар</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, avatar: e.target.files?.[0] || null }))}
                        className={`${profileInputClass()} file:mr-3 file:rounded-crmLg file:border-0 file:bg-crm-accent/15 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-crm-accent hover:file:bg-crm-accent/22`}
                      />
                      <p className={profileHintClass()}>JPG/PNG/WebP до 5 МБ.</p>
                    </div>
                  </div>

                  <div>
                    <label className={profileLabelClass()}>Статус</label>
                    <textarea
                      value={profileForm.status_text}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, status_text: e.target.value }))}
                      maxLength={160}
                      rows={3}
                      placeholder="Например: на показах до 18:00"
                      className={profileTextareaClass()}
                    />
                    <p className={`${profileHintClass()} text-right tabular-nums`}>{profileForm.status_text.length}/160</p>
                  </div>

                  {profileError && <p className={profileAlertClass('error')}>{profileError}</p>}
                  {profileSaved && <p className={profileAlertClass('success')}>Профиль сохранён.</p>}

                  <button type="submit" disabled={profileSaving} className={profileButtonClass('primary')}>
                    {profileSaving ? 'Сохранение...' : 'Сохранить профиль'}
                  </button>
                </form>
              </section>

              <section className={settingsCardClass()}>
                <div className={settingsCardHeaderClass()}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-crmLg border border-crm-accent/25 bg-crm-accent/10">
                      <ProfileSectionIcon name="security" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-crm-text">Безопасность</h3>
                      <p className="mt-1 text-sm text-crm-muted">
                        Смена логина и пароля. Текущий пароль обязателен для любых изменений.
                      </p>
                    </div>
                  </div>
                </div>
                <form onSubmit={saveCredentials} className={`${settingsCardBodyClass()} space-y-4`}>
                  <div className="grid gap-4">
                    <div>
                      <label className={profileLabelClass()}>Новый логин (необязательно)</label>
                      <div className="crm-focus-ring flex min-h-11 overflow-hidden rounded-crmLg border border-crm-border bg-crm-surface/50 focus-within:ring-2">
                        <span className="flex items-center border-r border-crm-border px-3 text-sm text-crm-muted">@</span>
                        <input
                          type="text"
                          value={credForm.new_username}
                          onChange={(e) => setCredForm((f) => ({ ...f, new_username: e.target.value.replace(/^@+/, '') }))}
                          placeholder={profile.username}
                          autoComplete="off"
                          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-crm-text placeholder:text-crm-muted focus:outline-none"
                        />
                      </div>
                      <p className={profileHintClass()}>При смене логина вы будете разлогинены.</p>
                    </div>

                    <div>
                      <label className={profileLabelClass()}>Текущий пароль *</label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={credForm.current_password}
                          onChange={(e) => setCredForm((f) => ({ ...f, current_password: e.target.value }))}
                          placeholder="Введите текущий пароль"
                          autoComplete="current-password"
                          required
                          className={`${profileInputClass()} pr-11`}
                        />
                        <PasswordVisibilityToggle
                          show={showCurrentPassword}
                          onToggle={() => setShowCurrentPassword((v) => !v)}
                          label="текущий пароль"
                        />
                      </div>
                    </div>

                    <div>
                      <label className={profileLabelClass()}>Новый пароль (необязательно)</label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={credForm.new_password}
                          onChange={(e) => setCredForm((f) => ({ ...f, new_password: e.target.value }))}
                          placeholder="Минимум 4 символа"
                          autoComplete="new-password"
                          className={`${profileInputClass()} pr-11`}
                        />
                        <PasswordVisibilityToggle
                          show={showNewPassword}
                          onToggle={() => setShowNewPassword((v) => !v)}
                          label="новый пароль"
                        />
                      </div>
                    </div>

                    <div>
                      <label className={profileLabelClass()}>Повтор нового пароля</label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={credForm.confirm_password}
                          onChange={(e) => setCredForm((f) => ({ ...f, confirm_password: e.target.value }))}
                          placeholder="Повторите новый пароль"
                          autoComplete="new-password"
                          className={`${profileInputClass()} pr-11`}
                        />
                        <PasswordVisibilityToggle
                          show={showConfirmPassword}
                          onToggle={() => setShowConfirmPassword((v) => !v)}
                          label="повтор пароля"
                        />
                      </div>
                    </div>
                  </div>

                  {credError && <p className={profileAlertClass('error')}>{credError}</p>}
                  {credSaved && <p className={profileAlertClass('success')}>{credSaved}</p>}

                  <button type="submit" disabled={credSaving} className={profileButtonClass('primary')}>
                    {credSaving ? 'Сохранение...' : 'Обновить данные'}
                  </button>
                </form>
              </section>

              <section className={`${settingsCardClass()} lg:col-span-2`}>
                <div className={settingsCardHeaderClass()}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-crmLg border border-crm-accent/25 bg-crm-accent/10">
                        <ProfileSectionIcon name="notifications" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-crm-text">Уведомления</h3>
                        <p className="mt-1 text-sm text-crm-muted">Push-уведомления о новых лидах и сообщениях.</p>
                      </div>
                    </div>
                    <span className={pushStatusPillClass(notifStatus === 'granted' ? 'granted' : notifStatus === 'error' || notifStatus === 'denied' ? 'error' : 'off')}>
                      {pushStatusLabel(notifStatus)}
                    </span>
                  </div>
                </div>
                <div className={`${settingsCardBodyClass()} space-y-3`}>
                  {notifStatus === 'granted' ? (
                    <button
                      onClick={disableNotifications}
                      className={`${profileButtonClass('success')} hover:border-crm-danger/35 hover:bg-crm-danger/10 hover:text-crm-danger`}
                    >
                      {notificationLabel}
                    </button>
                  ) : (
                    <button
                      onClick={notificationBlocked ? undefined : enableNotifications}
                      disabled={notifStatus === 'loading' || notificationBlocked}
                      className={`crm-focus-ring inline-flex min-h-11 w-full items-center justify-center rounded-crmLg border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${notificationClass}`}
                    >
                      {notificationLabel}
                    </button>
                  )}
                  {notificationError && (
                    <p className={profileAlertClass('error')}>{notificationError}</p>
                  )}
                  {notifStatus === 'granted' && (
                    <button
                      onClick={sendTestPush}
                      disabled={testPushStatus === 'loading'}
                      className={profileButtonClass('test')}
                    >
                      {testPushStatus === 'loading' ? 'Отправка...' : testPushStatus === 'sent' ? 'Отправлено!' : testPushStatus === 'error' ? 'Ошибка отправки' : 'Отправить тестовый пуш'}
                    </button>
                  )}
                  <button
                    onClick={runPushDiagnostics}
                    disabled={pushDiagnosticsLoading}
                    className={profileButtonClass('secondary')}
                  >
                    {pushDiagnosticsLoading ? 'Проверка...' : 'Диагностика push'}
                  </button>
                  {pushDiagnostics && (
                    <div className="crm-scrollbar max-h-80 overflow-y-auto rounded-crmLg border border-crm-border bg-crm-bg/80 px-4 py-3 font-mono text-xs leading-relaxed text-crm-muted shadow-inner">
                      {pushDiagnostics.error ? (
                        <p className="text-crm-danger">{pushDiagnostics.error}</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="flex items-start gap-2">
                            <DiagnosticsMark ok={pushDiagnostics.browser?.notificationApi} />
                            <span>Notification API: {pushDiagnostics.browser?.permission}</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <DiagnosticsMark ok={pushDiagnostics.browser?.serviceWorker} />
                            <span>Service Worker</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <DiagnosticsMark ok={pushDiagnostics.browser?.pushManager} />
                            <span>PushManager</span>
                          </p>
                          {pushDiagnostics.browser?.ios && (
                            <p className="flex items-start gap-2">
                              <DiagnosticsMark ok={pushDiagnostics.browser?.standalone} />
                              <span>
                                iPhone PWA: {pushDiagnostics.browser?.standalone ? 'запущено с экрана Домой' : 'нужно установить через Safari'}
                              </span>
                            </p>
                          )}
                          <p className="flex items-start gap-2 break-all">
                            <DiagnosticsMark ok={pushDiagnostics.browser?.subscription} />
                            <span>
                              Подписка в браузере
                              {pushDiagnostics.browser?.endpoint ? `: ${pushDiagnostics.browser.endpoint}` : ''}
                            </span>
                          </p>
                          <p className="flex items-start gap-2">
                            <DiagnosticsMark ok={pushDiagnostics.server?.vapidPublicKey?.ok} />
                            <span>VAPID public key</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <DiagnosticsMark ok={pushDiagnostics.server?.vapidPrivateKey?.ok} />
                            <span>VAPID private key</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <DiagnosticsMark ok={pushDiagnostics.server?.database?.ok} />
                            <span>База данных: {pushDiagnostics.server?.database?.label}</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <DiagnosticsMark ok={pushDiagnostics.server?.subscriptions?.ok} />
                            <span>Подписки на сервере: {pushDiagnostics.server?.subscriptions?.count || 0}</span>
                          </p>
                          {pushDiagnostics.server?.subscriptions?.items?.length > 0 && (
                            <div className="mt-3 space-y-2 rounded-crmLg border border-crm-border/70 bg-crm-surface/30 px-3 py-3">
                              {pushDiagnostics.server.subscriptions.items.map((item) => (
                                <div key={item.id} className="border-b border-crm-border/60 pb-2 last:border-0 last:pb-0">
                                  <p className="break-all text-crm-text">#{item.id} {item.platform || 'unknown'} · {item.endpoint}</p>
                                  {item.last_success_at && (
                                    <p className="mt-1 text-crm-success">Последняя доставка: {new Date(item.last_success_at).toLocaleString('ru-RU')}</p>
                                  )}
                                  {item.last_error && (
                                    <p className="mt-1 text-crm-danger">Ошибка {item.last_status_code || ''}: {item.last_error}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ── Employees tab (admin only) ── */}
        {isAdmin && activeTab === 'employees' && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold tracking-tight crm-gradient-text">Сотрудники</h2>
                <p className="mt-1 text-sm text-crm-muted">
                  Управление командой, доступами и рабочими ролями
                </p>
              </div>
              <button
                onClick={openCreateModal}
                className="crm-focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-crmLg border border-crm-accent/40 bg-crm-accent/15 px-4 py-2.5 text-sm font-medium text-crm-accent shadow-crmGlow transition hover:bg-crm-accent/22"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Добавить сотрудника
              </button>
            </div>

            <div className="space-y-3 md:hidden">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="crm-card animate-pulse rounded-crmXl p-4 shadow-crmCard">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-crm-border/60" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-32 rounded bg-crm-border/50" />
                        <div className="h-3 w-20 rounded bg-crm-border/40" />
                      </div>
                    </div>
                    <div className="h-10 w-full rounded-crmLg bg-crm-border/40" />
                  </div>
                ))
              ) : employees.length === 0 ? (
                <EmployeesEmptyState />
              ) : (
                employees.map((emp) => (
                  <article key={emp.id} className={employeeCardClass()}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <EmployeeInitialCircle name={emp.name} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-crm-muted">#{emp.id}</p>
                          {editingEmployee === emp.id ? (
                            <input
                              ref={editInputRef}
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => handleEditKey(e, emp.id)}
                              className={`${employeeInputClass()} mt-1`}
                            />
                          ) : (
                            <p className="truncate text-base font-semibold text-crm-text">{emp.name}</p>
                          )}
                          <p className="mt-0.5 truncate text-sm text-crm-muted">@{emp.username || '—'}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="rounded-full border border-crm-border bg-crm-surface/60 px-2.5 py-1 text-xs font-medium text-crm-muted">
                          Сотрудник
                        </span>
                        <span className={employeeStatusBadgeClass(emp.is_active)}>
                          {emp.is_active !== false ? 'Активен' : 'Неактивен'}
                        </span>
                      </div>
                    </div>
                    {typeof emp.active_leads_count === 'number' && emp.active_leads_count > 0 && (
                      <p className="mb-3 text-xs text-crm-muted">
                        Лидов в работе: <span className="font-medium text-crm-text">{emp.active_leads_count}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {editingEmployee === emp.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveEmployeeName(emp.id)}
                            className={employeeActionButtonClass('save')}
                            aria-label="Сохранить"
                          >
                            <EmployeeCheckIcon />
                            <span>Сохранить</span>
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditEmployee}
                            className={employeeActionButtonClass('cancel')}
                            aria-label="Отмена"
                          >
                            <EmployeeCloseIcon />
                            <span>Отмена</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditEmployee(emp)}
                            className={employeeActionButtonClass('edit')}
                            aria-label="Редактировать"
                          >
                            <EmployeeEditIcon />
                            <span>Изменить</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEmployee(emp)}
                            className={employeeActionButtonClass('delete')}
                            aria-label="Удалить"
                          >
                            <EmployeeDeleteIcon />
                            <span>Удалить</span>
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="crm-glass hidden rounded-crmXl border border-crm-border shadow-crmCard md:block">
              {loading ? (
                <div className="crm-scrollbar overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-crm-border bg-crm-surface/95 text-xs uppercase tracking-wide text-crm-muted">
                      <tr>
                        <th className="p-3 font-semibold">ID</th>
                        <th className="p-3 font-semibold">Имя</th>
                        <th className="p-3 font-semibold">Логин</th>
                        <th className="p-3 font-semibold">Статус</th>
                        <th className="p-3 font-semibold">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="border-t border-crm-border/60">
                          <td className="p-3"><div className="h-4 w-8 animate-pulse rounded bg-crm-border/50" /></td>
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 animate-pulse rounded-full bg-crm-border/50" />
                              <div className="h-4 w-32 animate-pulse rounded bg-crm-border/50" />
                            </div>
                          </td>
                          <td className="p-3"><div className="h-4 w-24 animate-pulse rounded bg-crm-border/50" /></td>
                          <td className="p-3"><div className="h-5 w-16 animate-pulse rounded-full bg-crm-border/50" /></td>
                          <td className="p-3"><div className="h-9 w-24 animate-pulse rounded-crmLg bg-crm-border/50" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : employees.length === 0 ? (
                <div className="px-6 py-16">
                  <EmployeesEmptyState />
                </div>
              ) : (
                <div className="crm-scrollbar overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-crm-border bg-crm-surface/95 text-xs uppercase tracking-wide text-crm-muted">
                      <tr>
                        <th className="p-3 font-semibold">ID</th>
                        <th className="p-3 font-semibold">Имя</th>
                        <th className="p-3 font-semibold">Логин</th>
                        <th className="p-3 font-semibold">Статус</th>
                        <th className="p-3 font-semibold">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp) => (
                        <tr key={emp.id} className="border-t border-crm-border/60 transition hover:bg-white/[0.03]">
                          <td className="whitespace-nowrap p-3 tabular-nums text-crm-muted">#{emp.id}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <EmployeeInitialCircle name={emp.name} />
                              {editingEmployee === emp.id ? (
                                <input
                                  ref={editInputRef}
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  onKeyDown={(e) => handleEditKey(e, emp.id)}
                                  className={`${employeeInputClass()} max-w-xs`}
                                />
                              ) : (
                                <span className="font-medium text-crm-text">{emp.name}</span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap p-3 text-crm-muted">@{emp.username || '—'}</td>
                          <td className="p-3">
                            <span className={employeeStatusBadgeClass(emp.is_active)}>
                              {emp.is_active !== false ? 'Активен' : 'Неактивен'}
                            </span>
                          </td>
                          <td className="p-3">
                            {editingEmployee === emp.id ? (
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => saveEmployeeName(emp.id)}
                                  className={employeeActionButtonClass('save')}
                                  aria-label="Сохранить"
                                >
                                  <EmployeeCheckIcon />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditEmployee}
                                  className={employeeActionButtonClass('cancel')}
                                  aria-label="Отмена"
                                >
                                  <EmployeeCloseIcon />
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => startEditEmployee(emp)}
                                  className={employeeActionButtonClass('edit')}
                                  aria-label="Редактировать"
                                >
                                  <EmployeeEditIcon />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteEmployee(emp)}
                                  className={employeeActionButtonClass('delete')}
                                  aria-label="Удалить"
                                >
                                  <EmployeeDeleteIcon />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        </div>
      </section>

      {/* ── Create employee modal ── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeCreateModal(); }}
        >
          <div className="crm-glass w-full max-w-md rounded-crm2xl border border-crm-border shadow-crmCard">
            <div className="flex items-center justify-between border-b border-crm-border px-5 py-4">
              <h2 className="font-semibold text-crm-text">Добавить сотрудника</h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="crm-focus-ring rounded-crmLg p-1.5 text-crm-muted transition hover:bg-crm-accent/10 hover:text-crm-accent"
                aria-label="Закрыть"
              >
                <EmployeeCloseIcon />
              </button>
            </div>
            <form onSubmit={submitCreateEmployee} className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-crm-muted">Имя</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Иван Иванов"
                  className={employeeInputClass()}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-crm-muted">Логин</label>
                <input
                  type="text"
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="ivan"
                  autoComplete="off"
                  className={employeeInputClass()}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-crm-muted">Пароль</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Минимум 4 символа"
                  autoComplete="new-password"
                  className={employeeInputClass()}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-crm-muted">Подтверждение пароля</label>
                <input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(e) => setCreateForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Повторите пароль"
                  autoComplete="new-password"
                  className={employeeInputClass()}
                />
              </div>
              {createError && (
                <p className="rounded-crmLg border border-crm-danger/35 bg-crm-danger/10 px-3 py-2 text-xs text-crm-danger">
                  {createError}
                </p>
              )}
              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="crm-focus-ring min-h-11 rounded-crmLg border border-crm-border px-4 py-2.5 text-sm text-crm-muted transition hover:bg-crm-surface/60 hover:text-crm-text"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="crm-focus-ring min-h-11 rounded-crmLg border border-crm-accent/40 bg-crm-accent/15 px-4 py-2.5 text-sm font-medium text-crm-accent shadow-crmGlow transition hover:bg-crm-accent/22 disabled:opacity-50"
                >
                  {createLoading ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Close reason modal ── */}
      {closeReasonModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setCloseReasonModal(null); }}
        >
          <div className="crm-glass w-full max-w-md rounded-crm2xl border border-crm-border shadow-crmCard">
            <div className="flex items-center justify-between border-b border-crm-border px-5 py-4">
              <div>
                <h2 className="font-semibold text-crm-text">{closeReasonModal.title || 'Причина закрытия'}</h2>
                <p className="text-xs text-crm-muted">{closeReasonModal.leadName}</p>
              </div>
              <button
                onClick={() => setCloseReasonModal(null)}
                className="crm-focus-ring flex h-11 w-11 items-center justify-center rounded-crmLg text-crm-muted transition hover:bg-crm-accent/10 hover:text-crm-accent"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap gap-2">
                {['Неадекват', 'Ошибка / не туда', 'Не отвечает', 'Передумал', 'Не подходит бюджет', 'Сорвалась встреча'].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setCloseReasonText(reason)}
                    className="crm-focus-ring rounded-full border border-crm-border bg-crm-surface/40 px-3 py-1.5 text-xs text-crm-muted transition hover:border-crm-danger/35 hover:bg-crm-danger/10 hover:text-crm-danger"
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <textarea
                autoFocus
                value={closeReasonText}
                onChange={(e) => setCloseReasonText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCloseReason(); } }}
                placeholder="Напишите причину закрытия..."
                rows={3}
                className="crm-focus-ring w-full resize-none rounded-crmLg border border-crm-border bg-crm-surface/50 px-3 py-2.5 text-sm text-crm-text placeholder:text-crm-muted"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setCloseReasonModal(null)}
                  className="crm-focus-ring min-h-11 rounded-crmLg border border-crm-border px-4 py-2.5 text-sm text-crm-muted transition hover:bg-crm-surface/60 hover:text-crm-text"
                >
                  Отмена
                </button>
                <button
                  onClick={submitCloseReason}
                  disabled={!closeReasonText.trim() || closeReasonLoading}
                  className="crm-focus-ring min-h-11 rounded-crmLg border border-crm-danger/40 bg-crm-danger/12 px-4 py-2.5 text-sm font-medium text-crm-danger transition hover:bg-crm-danger/18 disabled:opacity-40"
                >
                  {closeReasonLoading ? 'Закрытие...' : (closeReasonModal.targetStatus === 'closed_lost' ? 'Закрыть в отказ' : 'Закрыть лид')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Room modal ── */}
      {/* Lead reminder modal */}
      {nudgeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeNudge(); }}
        >
          <div className="crm-glass w-full max-w-md rounded-crm2xl border border-crm-border shadow-crmCard">
            <div className="flex items-center justify-between border-b border-crm-border px-5 py-4">
              <div>
                <h2 className="font-semibold text-crm-text">Пнуть ответственного</h2>
                <p className="text-xs text-crm-muted">
                  {nudgeModal.leadName} → {nudgeModal.assignedToName}
                </p>
              </div>
              <button
                onClick={closeNudge}
                className="crm-focus-ring flex h-11 w-11 items-center justify-center rounded-crmLg text-crm-muted transition hover:bg-crm-accent/10 hover:text-crm-accent"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="rounded-crmLg border border-crm-warning/30 bg-crm-warning/10 px-3 py-2.5 text-sm leading-relaxed text-crm-muted">
                В интерфейсе сотрудника это придет как обычное напоминание. Если оставить поле пустым, уйдет стандартный текст: связаться с клиентом и обновить статус или комментарий.
              </div>
              <textarea
                autoFocus
                value={nudgeText}
                onChange={(e) => setNudgeText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitNudge(); }}
                placeholder="Например: позвони сегодня до 18:00, клиент ждет подборку по ипотеке"
                rows={4}
                className="crm-focus-ring w-full resize-none rounded-crmLg border border-crm-border bg-crm-surface/50 px-3 py-2.5 text-sm text-crm-text placeholder:text-crm-muted"
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  onClick={closeNudge}
                  className="crm-focus-ring min-h-11 rounded-crmLg border border-crm-border px-4 py-2.5 text-sm text-crm-muted transition hover:bg-crm-surface/60 hover:text-crm-text"
                >
                  Отмена
                </button>
                <button
                  onClick={submitNudge}
                  disabled={nudgeLoading}
                  className="crm-focus-ring min-h-11 rounded-crmLg border border-crm-warning/45 bg-crm-warning/15 px-4 py-2.5 text-sm font-semibold text-crm-warning transition hover:bg-crm-warning/22 disabled:opacity-40"
                >
                  {nudgeLoading ? 'Отправляю...' : nudgeText.trim() ? 'Пнуть с комментарием' : 'Пнуть стандартно'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateRoom(false); setNewRoomName(''); setNewRoomMembers([]); } }}
        >
          <div className="crm-glass w-full max-w-sm overflow-hidden rounded-crm2xl border border-crm-border shadow-crmCard">
            <div className="flex items-center justify-between border-b border-crm-border px-5 py-4">
              <h3 className="font-semibold text-crm-text">Создать канал</h3>
              <button
                type="button"
                onClick={() => { setShowCreateRoom(false); setNewRoomName(''); setNewRoomMembers([]); }}
                className="crm-focus-ring flex h-11 w-11 items-center justify-center rounded-crmLg text-crm-muted transition hover:bg-crm-accent/10 hover:text-crm-accent"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            <div className="crm-scrollbar max-h-[55vh] space-y-4 overflow-y-auto px-5 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-crm-muted">Название</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                  placeholder="Например: Маркетинг"
                  className={employeeInputClass()}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-crm-muted">Участники</label>
                <div className="space-y-1">
                  {chatNavUsers.filter((u) => u.id !== user.id).map((emp) => (
                    <label key={emp.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-crmLg px-2 py-2 transition hover:bg-crm-accent/10">
                      <input
                        type="checkbox"
                        checked={newRoomMembers.includes(emp.id)}
                        onChange={(e) => {
                          if (e.target.checked) setNewRoomMembers((p) => [...p, emp.id]);
                          else setNewRoomMembers((p) => p.filter((id) => id !== emp.id));
                        }}
                        className="rounded accent-crm-accent"
                      />
                      {emp.avatar_url
                        ? <img src={emp.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        : <div className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ background: chatColor(emp.id) }}>{chatInitials(emp.name)}</div>
                      }
                      <span className="text-sm text-crm-text">{emp.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-crm-border px-5 py-4">
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={!newRoomName.trim() || creatingRoom}
                className="crm-focus-ring min-h-11 w-full rounded-crmLg border border-crm-accent/40 bg-crm-accent/15 py-2.5 text-sm font-semibold text-crm-accent shadow-crmGlow transition hover:bg-crm-accent/22 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {creatingRoom ? 'Создание...' : 'Создать канал'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export modal ── */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}
        >
          <div className="crm-glass w-full max-w-sm rounded-crm2xl border border-crm-border shadow-crmCard">
            <div className="flex items-center justify-between border-b border-crm-border px-5 py-4">
              <h2 className="font-semibold text-crm-text">Экспорт в Excel</h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="crm-focus-ring flex h-11 w-11 items-center justify-center rounded-crmLg text-crm-muted transition hover:bg-crm-accent/10 hover:text-crm-accent"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-crm-muted">Дата от</label>
                  <input
                    type="date"
                    value={exportDateFrom}
                    onChange={(e) => setExportDateFrom(e.target.value)}
                    className="crm-focus-ring w-full min-h-11 rounded-crmLg border border-crm-border bg-crm-surface/50 px-3 py-2 text-sm text-crm-text"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-crm-muted">Дата до</label>
                  <input
                    type="date"
                    value={exportDateTo}
                    onChange={(e) => setExportDateTo(e.target.value)}
                    className="crm-focus-ring w-full min-h-11 rounded-crmLg border border-crm-border bg-crm-surface/50 px-3 py-2 text-sm text-crm-text"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => downloadExport({ dateFrom: exportDateFrom, dateTo: exportDateTo })}
                  disabled={exportLoading}
                  className="crm-focus-ring rounded-crmLg border border-crm-accent/40 bg-crm-accent/15 px-4 py-2.5 text-sm font-medium text-crm-accent transition hover:bg-crm-accent/22 disabled:opacity-50"
                >
                  {exportLoading ? 'Загрузка...' : 'Скачать за период'}
                </button>
                <button
                  onClick={() => downloadExport()}
                  disabled={exportLoading}
                  className="crm-focus-ring rounded-crmLg border border-crm-border px-4 py-2.5 text-sm text-crm-text transition hover:bg-crm-surface/60 disabled:opacity-50"
                >
                  Скачать всё
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Comments modal ── */}
      {commentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeComments(); }}
        >
          <div className="crm-glass flex w-full max-w-lg flex-col rounded-crm2xl border border-crm-border shadow-crmCard" style={{ maxHeight: '80vh' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-crm-border px-5 py-4">
              <div>
                <h2 className="font-semibold text-crm-text">Комментарии</h2>
                <p className="text-xs text-crm-muted">{commentModal.leadName}</p>
              </div>
              <button
                onClick={closeComments}
                className="crm-focus-ring flex h-11 w-11 items-center justify-center rounded-crmLg text-crm-muted transition hover:bg-crm-accent/10 hover:text-crm-accent"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            {/* Comments list */}
            <div className="crm-scrollbar flex-1 space-y-3 overflow-y-auto px-5 py-3">
              {commentsLoading ? (
                <p className="py-8 text-center text-sm text-crm-muted">Загрузка...</p>
              ) : comments.length === 0 ? (
                <p className="py-8 text-center text-sm text-crm-muted">Комментариев пока нет. Будьте первым!</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-crmLg border border-crm-border bg-crm-surface/50 px-4 py-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-crm-text">{c.author_name || 'Неизвестно'}</span>
                      <span className="text-xs text-crm-muted">{formatDate(c.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-crm-text">{c.text}</p>
                  </div>
                ))
              )}
              {leadEvents.length > 0 && (
                <div className="mt-4 border-t border-crm-border pt-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-crm-muted">История действий</h3>
                  <div className="space-y-2">
                    {leadEvents.map((event) => (
                      <div key={event.id} className="rounded-crmLg border border-crm-border bg-crm-surface/40 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-crm-text">{event.author_name || 'Система'}</span>
                          <span className="text-[11px] text-crm-muted">{formatDate(event.created_at)}</span>
                        </div>
                        <p className="mt-1 text-sm text-crm-muted">{event.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-crm-border px-5 py-4">
              <div className="flex gap-2">
                <input
                  ref={commentInputRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={handleCommentKey}
                  placeholder="Написать комментарий..."
                  className="crm-focus-ring min-h-11 flex-1 rounded-crmLg border border-crm-border bg-crm-surface/50 px-3 py-2.5 text-sm text-crm-text placeholder:text-crm-muted"
                />
                <button
                  onClick={sendComment}
                  disabled={!commentText.trim()}
                  className="crm-focus-ring min-h-11 shrink-0 rounded-crmLg border border-crm-accent/40 bg-crm-accent/15 px-4 py-2.5 text-sm font-medium text-crm-accent transition hover:bg-crm-accent/22 disabled:opacity-40"
                >
                  Отправить
                </button>
              </div>
              <p className="mt-1.5 text-xs text-crm-muted">Enter — отправить · Shift+Enter — новая строка</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
