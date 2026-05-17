'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamChatPanel from './TeamChatPanel';

const STATUS_LABELS = { new: 'Новый', in_progress: 'В работе', closed: 'Закрыт' };
const STATUS_COLORS = {
  new:         'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  closed:      'bg-green-100 text-green-700',
};
const STATUSES = ['new', 'in_progress', 'closed'];
const FILTER_OPTIONS = [
  { value: '',            label: 'Все' },
  { value: 'new',         label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'closed',      label: 'Закрыты' },
];

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

export default function DashboardClient({ user }) {
  const router = useRouter();
  const isAdmin = user.role === 'admin';

  const [activeTab, setActiveTab] = useState('leads');
  const [leads, setLeads] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState('');
  const [employeeLeadTab, setEmployeeLeadTab] = useState('common');
  const [loading, setLoading] = useState(true);
  const [notifStatus, setNotifStatus] = useState('default');
  const [claimingLeadId, setClaimingLeadId] = useState(null);

  // Comments modal
  const [commentModal, setCommentModal] = useState(null); // { leadId, leadName }
  const [comments, setComments] = useState([]);
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
  const [closeReasonModal, setCloseReasonModal] = useState(null); // { leadId, leadName }
  const [closeReasonText, setCloseReasonText] = useState('');
  const [closeReasonLoading, setCloseReasonLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifStatus(Notification.permission);
    }
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
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setNotifStatus('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setNotifStatus(permission); return; }
      const registration = await navigator.serviceWorker.register('/sw.js');
      const keyRes = await fetch('/api/push/vapid-public-key');
      const { publicKey } = await keyRes.json();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });
      setNotifStatus('granted');
    } catch (err) {
      console.error('Push subscription error:', err);
      setNotifStatus('default');
    }
  };

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter ? `/api/leads?status=${filter}` : '/api/leads';
      const res = await fetch(url);
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
  }, [filter, router]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const updateStatus = async (id, status) => {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchLeads();
  };

  const openCloseReason = (lead) => {
    setCloseReasonModal({ leadId: lead.id, leadName: lead.name || `Лид #${lead.id}` });
    setCloseReasonText('');
  };

  const submitCloseReason = async () => {
    if (!closeReasonText.trim() || !closeReasonModal) return;
    setCloseReasonLoading(true);
    try {
      await fetch(`/api/leads/${closeReasonModal.leadId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🔒 Закрыто: ${closeReasonText.trim()}` }),
      });
      await fetch(`/api/leads/${closeReasonModal.leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      setCloseReasonModal(null);
      fetchLeads();
    } finally {
      setCloseReasonLoading(false);
    }
  };

  const assignLead = async (id, value) => {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to: value ? Number(value) : null }),
    });
    fetchLeads();
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
        alert(data.message || 'Не удалось забрать лид');
      } else {
        setEmployeeLeadTab('my');
      }
      await fetchLeads();
    } finally {
      setClaimingLeadId(null);
    }
  };

  const deleteLead = async (id) => {
    if (!confirm('Удалить лид?')) return;
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    fetchLeads();
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  // --- Comments ---

  const openComments = async (lead) => {
    setCommentModal({ leadId: lead.id, leadName: lead.name || `Лид #${lead.id}` });
    setCommentText('');
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/comments`);
      const data = await res.json();
      if (data.ok) setComments(data.comments);
    } finally {
      setCommentsLoading(false);
    }
  };

  const closeComments = () => {
    setCommentModal(null);
    setComments([]);
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
      setCommentText('');
      setLeads((prev) =>
        prev.map((l) =>
          l.id === commentModal.leadId
            ? { ...l, comment_count: (l.comment_count || 0) + 1 }
            : l
        )
      );
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
    } finally {
      setCreateLoading(false);
    }
  };

  const toggleAvailability = async (emp) => {
    const res = await fetch(`/api/users/${emp.id}/availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !emp.is_active }),
    });
    const data = await res.json();
    if (data.ok) {
      setEmployees((prev) =>
        prev.map((e) => (e.id === emp.id ? { ...e, is_active: !emp.is_active } : e))
      );
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
      if (!res.ok) return;
      const blob = await res.blob();
      const a = document.createElement('a');
      const from = dateFrom || 'all';
      const to = dateTo || 'all';
      a.href = URL.createObjectURL(blob);
      a.download = dateFrom || dateTo ? `leads_${from}_${to}.xlsx` : 'leads_all.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
      setShowExportModal(false);
    } finally {
      setExportLoading(false);
    }
  };

  // --- Employee delete ---

  const deleteEmployee = async (emp) => {
    if (!confirm(`Вы уверены? Сотрудник "${emp.name}" будет удалён.`)) return;
    const res = await fetch(`/api/users/${emp.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
    } else {
      alert(data.message || 'Ошибка удаления');
    }
  };

  const commonLeads = isAdmin ? [] : leads.filter((lead) => lead.assigned_to === null);
  const myLeads = isAdmin ? [] : leads.filter((lead) => lead.assigned_to === user.id);
  const visibleLeads = isAdmin ? leads : employeeLeadTab === 'common' ? commonLeads : myLeads;
  const showWorkColumns = isAdmin || employeeLeadTab === 'my';
  const emptyLeadsText = isAdmin
    ? 'Лидов нет.'
    : employeeLeadTab === 'common'
    ? 'Общих лидов нет.'
    : 'У вас пока нет лидов.';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">CRM</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {isAdmin ? `Администратор · ${user.name}` : `Сотрудник · ${user.name}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={notifStatus === 'granted' ? undefined : enableNotifications}
                disabled={notifStatus === 'loading' || notifStatus === 'denied'}
                className={`rounded-xl border px-4 py-2 text-sm transition ${
                  notifStatus === 'granted'
                    ? 'cursor-default border-green-200 bg-green-50 text-green-700'
                    : notifStatus === 'denied'
                    ? 'cursor-not-allowed border-red-200 bg-red-50 text-red-600'
                    : notifStatus === 'loading'
                    ? 'cursor-wait border-slate-200 bg-white text-slate-400'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {notifStatus === 'granted'
                  ? 'Уведомления включены ✓'
                  : notifStatus === 'denied'
                  ? 'Уведомления заблокированы'
                  : notifStatus === 'loading'
                  ? 'Подключение...'
                  : 'Включить уведомления'}
              </button>
            )}
            <button
              onClick={logout}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              Выйти
            </button>
          </div>
        </header>

        {/* Main tabs */}
        <div className="flex gap-2 border-b border-slate-200 pb-0">
          {[
            { key: 'leads', label: 'Лиды' },
            ...(isAdmin ? [
              { key: 'employees', label: 'Сотрудники' },
              { key: 'distribution', label: 'Распределение' },
            ] : []),
            { key: 'chat', label: 'Общий чат' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`rounded-t-xl border border-b-0 px-5 py-2 text-sm font-medium transition ${
                activeTab === key
                  ? 'border-slate-200 bg-white text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Leads tab ── */}
        {activeTab === 'leads' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    className={`rounded-xl px-4 py-2 text-sm transition ${
                      filter === value
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
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
                      className={`rounded-xl px-4 py-2 text-sm transition ${
                        employeeLeadTab === key
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowExportModal(true)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
                >
                  📥 Экспорт
                </button>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="p-3">Дата</th>
                        <th className="p-3">Имя</th>
                        <th className="p-3">Телефон</th>
                        <th className="p-3">Сообщение</th>
                        <th className="p-3">Статус</th>
                        {isAdmin && <th className="p-3">Назначен</th>}
                        {showWorkColumns && <th className="p-3">Комментарии</th>}
                        <th className="p-3">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-t border-slate-100 align-top">
                          <td className="p-3"><div className="h-4 w-24 animate-pulse rounded bg-gray-200" /></td>
                          <td className="p-3"><div className="h-4 w-28 animate-pulse rounded bg-gray-200" /></td>
                          <td className="p-3"><div className="h-4 w-28 animate-pulse rounded bg-gray-200" /></td>
                          <td className="p-3"><div className="h-4 w-48 animate-pulse rounded bg-gray-200" /></td>
                          <td className="p-3"><div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" /></td>
                          {isAdmin && <td className="p-3"><div className="h-6 w-24 animate-pulse rounded-lg bg-gray-200" /></td>}
                          {showWorkColumns && <td className="p-3"><div className="h-4 w-36 animate-pulse rounded bg-gray-200" /></td>}
                          <td className="p-3"><div className="h-6 w-32 animate-pulse rounded-lg bg-gray-200" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : visibleLeads.length === 0 ? (
                <div className="py-16 text-center text-slate-500">{emptyLeadsText}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="p-3">Дата</th>
                        <th className="p-3">Имя</th>
                        <th className="p-3">Телефон</th>
                        <th className="p-3">Сообщение</th>
                        <th className="p-3">Статус</th>
                        {isAdmin && <th className="p-3">Назначен</th>}
                        {showWorkColumns && <th className="p-3">Комментарии</th>}
                        <th className="p-3">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLeads.map((lead) => (
                        <tr key={lead.id} className="border-t border-slate-100 align-top">
                          <td className="whitespace-nowrap p-3 text-slate-500">{formatDate(lead.created_at)}</td>
                          <td className="p-3 font-medium">{lead.name || '—'}</td>
                          <td className="whitespace-nowrap p-3">
                            {lead.phone ? (
                              <a
                                href={`tel:${lead.phone}`}
                                className="flex items-center gap-1 text-inherit hover:text-blue-600 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                📞 {lead.phone}
                              </a>
                            ) : '—'}
                          </td>
                          <td className="max-w-xs p-3 text-slate-600">{formatMessage(lead.message)}</td>
                          <td className="p-3">
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[lead.status] ?? 'bg-slate-100 text-slate-600'}`}>
                              {STATUS_LABELS[lead.status] ?? lead.status}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className="p-3">
                              <select
                                value={lead.assigned_to ?? ''}
                                onChange={(e) => assignLead(lead.id, e.target.value || null)}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
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
                                className="group w-full text-left"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 group-hover:bg-slate-200">
                                    💬 {lead.comment_count || 0}
                                  </span>
                                </div>
                                {lead.last_comment_text && (
                                  <p className="mt-1 text-xs text-slate-500 line-clamp-2 group-hover:text-slate-700">
                                    {lead.last_comment_text.length > 50
                                      ? lead.last_comment_text.slice(0, 50) + '…'
                                      : lead.last_comment_text}
                                  </p>
                                )}
                              </button>
                            </td>
                          )}
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {!isAdmin && employeeLeadTab === 'common' ? (
                                <button
                                  onClick={() => claimLead(lead.id)}
                                  disabled={claimingLeadId === lead.id}
                                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                                >
                                  {claimingLeadId === lead.id ? 'Забираю...' : 'Забрать'}
                                </button>
                              ) : (
                                <>
                                  {STATUSES.filter((s) => s !== lead.status).map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => s === 'closed' ? openCloseReason(lead) : updateStatus(lead.id, s)}
                                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs transition hover:bg-slate-100"
                                    >
                                      → {STATUS_LABELS[s]}
                                    </button>
                                  ))}
                                  {isAdmin && (
                                    <button
                                      onClick={() => deleteLead(lead.id)}
                                      className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
                                    >
                                      Удалить
                                    </button>
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

        {/* ── Team chat tab ── */}
        {activeTab === 'chat' && <TeamChatPanel user={user} />}

        {/* ── Distribution tab (admin only) ── */}
        {isAdmin && activeTab === 'distribution' && (
          <div className="space-y-6">
            {/* Lead distribution mode */}
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div>
                <p className="text-sm font-medium text-slate-800">Общий пул лидов</p>
                <p className="text-xs text-slate-500">Новые лиды не назначаются автоматически. Сотрудники забирают свободные лиды вручную.</p>
              </div>
            </div>

            {/* Employees table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {employees.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">Сотрудников нет.</div>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="p-3">Имя</th>
                      <th className="p-3">Активных лидов</th>
                      <th className="p-3">Статус</th>
                      <th className="p-3">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp.id} className="border-t border-slate-100">
                        <td className="p-3 font-medium">{emp.name}</td>
                        <td className="p-3 text-slate-600">{emp.active_leads_count ?? 0}</td>
                        <td className="p-3">
                          {emp.is_active ? (
                            <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">🟢 Активен</span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">⏸ Пауза</span>
                          )}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => toggleAvailability(emp)}
                            className={`rounded-lg border px-3 py-1 text-xs transition ${
                              emp.is_active
                                ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                                : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                            }`}
                          >
                            {emp.is_active ? 'Пауза' : 'Активировать'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Statistics */}
            {employees.length > 0 && (() => {
              const total = employees.reduce((s, e) => s + (e.leads_count || 0), 0);
              return total > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Статистика назначений</p>
                  <div className="flex flex-wrap gap-3">
                    {employees.map((emp) => {
                      const pct = total > 0 ? Math.round(((emp.leads_count || 0) / total) * 100) : 0;
                      return (
                        <span key={emp.id} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                          {emp.name}: <strong>{emp.leads_count || 0}</strong> лидов ({pct}%)
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}

        {/* ── Employees tab (admin only) ── */}
        {isAdmin && activeTab === 'employees' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={openCreateModal}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-700"
              >
                + Добавить сотрудника
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Имя</th>
                      <th className="p-3">Логин</th>
                      <th className="p-3">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-3"><div className="h-4 w-6 animate-pulse rounded bg-gray-200" /></td>
                        <td className="p-3"><div className="h-4 w-32 animate-pulse rounded bg-gray-200" /></td>
                        <td className="p-3"><div className="h-4 w-20 animate-pulse rounded bg-gray-200" /></td>
                        <td className="p-3"><div className="h-6 w-16 animate-pulse rounded-lg bg-gray-200" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : employees.length === 0 ? (
                <div className="py-16 text-center text-slate-500">Сотрудников нет.</div>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Имя</th>
                      <th className="p-3">Логин</th>
                      <th className="p-3">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp.id} className="border-t border-slate-100">
                        <td className="p-3 text-slate-400">#{emp.id}</td>
                        <td className="p-3">
                          {editingEmployee === emp.id ? (
                            <input
                              ref={editInputRef}
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => handleEditKey(e, emp.id)}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                            />
                          ) : (
                            <span className="font-medium">{emp.name}</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-500">{emp.username || '—'}</td>
                        <td className="p-3">
                          {editingEmployee === emp.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => saveEmployeeName(emp.id)}
                                className="rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs text-green-700 transition hover:bg-green-100"
                              >
                                ✓
                              </button>
                              <button
                                onClick={cancelEditEmployee}
                                className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <button
                                onClick={() => startEditEmployee(emp)}
                                className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => deleteEmployee(emp)}
                                className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 transition hover:bg-red-50"
                              >
                                🗑️
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Create employee modal ── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeCreateModal(); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold">Новый сотрудник</h2>
              <button
                onClick={closeCreateModal}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <form onSubmit={submitCreateEmployee} className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Имя</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Иван Иванов"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Логин</label>
                <input
                  type="text"
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="ivan"
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Пароль</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Минимум 4 символа"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Подтверждение пароля</label>
                <input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(e) => setCreateForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Повторите пароль"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              {createError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{createError}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-700 disabled:opacity-50"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setCloseReasonModal(null); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-semibold">Причина закрытия</h2>
                <p className="text-xs text-slate-500">{closeReasonModal.leadName}</p>
              </div>
              <button
                onClick={() => setCloseReasonModal(null)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <textarea
                autoFocus
                value={closeReasonText}
                onChange={(e) => setCloseReasonText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCloseReason(); } }}
                placeholder="Напишите причину закрытия..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setCloseReasonModal(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
                >
                  Отмена
                </button>
                <button
                  onClick={submitCloseReason}
                  disabled={!closeReasonText.trim() || closeReasonLoading}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-700 disabled:opacity-40"
                >
                  {closeReasonLoading ? 'Закрытие...' : 'Закрыть лид'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Export modal ── */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold">Экспорт в Excel</h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Дата от</label>
                  <input
                    type="date"
                    value={exportDateFrom}
                    onChange={(e) => setExportDateFrom(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Дата до</label>
                  <input
                    type="date"
                    value={exportDateTo}
                    onChange={(e) => setExportDateTo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => downloadExport({ dateFrom: exportDateFrom, dateTo: exportDateTo })}
                  disabled={exportLoading}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {exportLoading ? 'Загрузка...' : '📥 Скачать'}
                </button>
                <button
                  onClick={() => downloadExport()}
                  disabled={exportLoading}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeComments(); }}
        >
          <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: '80vh' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-semibold">Комментарии</h2>
                <p className="text-xs text-slate-500">{commentModal.leadName}</p>
              </div>
              <button
                onClick={closeComments}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {commentsLoading ? (
                <p className="py-8 text-center text-sm text-slate-400">Загрузка...</p>
              ) : comments.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Комментариев пока нет. Будьте первым!</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-700">{c.author_name || 'Неизвестно'}</span>
                      <span className="text-xs text-slate-400">{formatDate(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.text}</p>
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="flex gap-2">
                <input
                  ref={commentInputRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={handleCommentKey}
                  placeholder="Написать комментарий..."
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button
                  onClick={sendComment}
                  disabled={!commentText.trim()}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-700 disabled:opacity-40"
                >
                  Отправить
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Enter — отправить · Shift+Enter — новая строка</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
