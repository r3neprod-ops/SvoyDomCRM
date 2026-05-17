'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamChatPanel from './TeamChatPanel';
import BiometricSection from './BiometricSection';

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

function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
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
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[Push] ServiceWorker or PushManager not supported');
      return;
    }
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator.standalone === true);
    console.log('[Push] Starting subscription, standalone:', isStandalone);
    setNotifStatus('loading');
    try {
      const permission = await Notification.requestPermission();
      console.log('[Push] Permission:', permission);
      if (permission !== 'granted') { setNotifStatus(permission); return; }

      // Always register first (idempotent if already registered)
      await navigator.serviceWorker.register('/sw.js');
      console.log('[Push] SW registered, waiting for ready state...');

      // Wait for the SW to become active (with 10s timeout)
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SW ready timeout')), 10_000)
        ),
      ]);
      console.log('[Push] SW ready, state:', registration.active?.state);

      const keyRes = await fetch('/api/push/vapid-public-key');
      const { publicKey } = await keyRes.json();
      console.log('[Push] Got VAPID key, subscribing...');

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      console.log('[Push] Subscribed:', subscription.endpoint);

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });
      console.log('[Push] Saved subscription on server');
      setNotifStatus('granted');
    } catch (err) {
      console.error('[Push] Subscription error:', err);
      setNotifStatus('error');
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

  const fetchChatUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/read');
      if (res.status === 401) return;
      const data = await res.json();
      if (data.ok) setChatUnread(data.unread_count || 0);
    } catch (err) {
      console.error('Chat unread fetch error:', err);
    }
  }, []);

  useEffect(() => {
    fetchChatUnread();
    const interval = setInterval(fetchChatUnread, 10000);
    return () => clearInterval(interval);
  }, [fetchChatUnread]);

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
  const navItems = [
    { key: 'leads', label: 'Лиды', icon: '📋' },
    ...(isAdmin ? [
      { key: 'employees', label: 'Сотрудники', icon: '👥' },
    ] : []),
    { key: 'chat', label: 'Общий чат', icon: '💬', badge: chatUnread },
    { key: 'profile', label: 'Профиль', icon: '👤' },
  ];
  const notificationLabel = notifStatus === 'granted'
    ? 'Уведомления включены'
    : notifStatus === 'denied'
    ? 'Уведомления заблокированы'
    : notifStatus === 'loading'
    ? 'Подключение...'
    : notifStatus === 'error'
    ? 'Ошибка, попробуйте снова'
    : 'Включить уведомления';
  const notificationClass = notifStatus === 'granted'
    ? 'border-green-200 bg-green-50 text-green-700'
    : notifStatus === 'denied'
    ? 'border-red-200 bg-red-50 text-red-600'
    : notifStatus === 'error'
    ? 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100';

  const renderNavigation = () => (
    <div className="flex h-full flex-col">
      <button
        onClick={() => selectTab('profile')}
        className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 text-left transition hover:bg-slate-50"
      >
        <AvatarCircle profile={profile} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{profile.name}</p>
          <p className="truncate text-xs text-slate-500">
            {profile.status_text || (isAdmin ? 'Администратор' : 'Сотрудник')}
          </p>
        </div>
      </button>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => selectTab(item.key)}
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
              activeTab === item.key
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="w-6 text-center text-base">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.badge > 0 && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="space-y-2 border-t border-slate-100 p-4">
        <button
          onClick={notifStatus === 'granted' ? undefined : enableNotifications}
          disabled={notifStatus === 'loading' || notifStatus === 'denied' || notifStatus === 'granted'}
          className={`w-full rounded-xl border px-3 py-2 text-sm transition disabled:cursor-default ${notificationClass}`}
        >
          {notificationLabel}
        </button>
        <button
          onClick={logout}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
        >
          Выйти
        </button>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white shadow-sm md:block">
        {renderNavigation()}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Закрыть меню"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative h-full w-80 max-w-[86vw] bg-white shadow-2xl">
            {renderNavigation()}
          </aside>
        </div>
      )}

      <section className="min-h-screen px-4 py-5 sm:px-6 md:pl-80 md:pr-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex items-center justify-between gap-3 md:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xl leading-none shadow-sm"
              aria-label="Открыть меню"
            >
              ☰
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold">CRM</h1>
              <p className="truncate text-sm text-slate-500">{profile.name}</p>
            </div>
            <button onClick={() => selectTab('profile')} className="shrink-0">
              <AvatarCircle profile={profile} />
            </button>
          </header>

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
        {activeTab === 'chat' && <TeamChatPanel user={profile} onUnreadChange={setChatUnread} />}

        {/* ── Profile tab ── */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold">Профиль</h2>
              <p className="mt-1 text-sm text-slate-500">
                Личные данные видны в CRM и общем чате.
              </p>
            </div>
            <form onSubmit={saveProfile} className="space-y-5 px-5 py-5">
              <div className="flex flex-wrap items-center gap-4">
                <AvatarCircle profile={profile} size="lg" />
                <div>
                  <p className="font-medium">{profile.name}</p>
                  <p className="text-sm text-slate-500">@{profile.username}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Отображаемое имя</label>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Иван Иванов"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Никнейм</label>
                  <div className="flex rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-slate-400">
                    <span className="flex items-center border-r border-slate-200 px-3 text-sm text-slate-400">@</span>
                    <input
                      type="text"
                      value={profileForm.username}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value.replace(/^@+/, '') }))}
                      placeholder="nickname"
                      autoComplete="username"
                      className="min-w-0 flex-1 rounded-r-xl px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">3-32 символа: латиница, цифры и _.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Телефон</label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="+7 999 000-00-00"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Аватар</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, avatar: e.target.files?.[0] || null }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:text-slate-700"
                  />
                  <p className="mt-1 text-xs text-slate-400">JPG/PNG/WebP до 5 МБ.</p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Статус</label>
                <textarea
                  value={profileForm.status_text}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, status_text: e.target.value }))}
                  maxLength={160}
                  rows={3}
                  placeholder="Например: на показах до 18:00"
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <p className="mt-1 text-xs text-slate-400">{profileForm.status_text.length}/160</p>
              </div>

              {profileError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{profileError}</p>}
              {profileSaved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Профиль сохранён.</p>}

              <button
                type="submit"
                disabled={profileSaving}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                {profileSaving ? 'Сохранение...' : 'Сохранить профиль'}
              </button>
            </form>
          </section>

          {/* ── Credentials section ── */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold">Безопасность</h2>
              <p className="mt-1 text-sm text-slate-500">
                Смена логина и пароля. Текущий пароль обязателен для любых изменений.
              </p>
            </div>
            <form onSubmit={saveCredentials} className="space-y-4 px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Новый логин (необязательно)</label>
                  <div className="flex rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-slate-400">
                    <span className="flex items-center border-r border-slate-200 px-3 text-sm text-slate-400">@</span>
                    <input
                      type="text"
                      value={credForm.new_username}
                      onChange={(e) => setCredForm((f) => ({ ...f, new_username: e.target.value.replace(/^@+/, '') }))}
                      placeholder={profile.username}
                      autoComplete="off"
                      className="min-w-0 flex-1 rounded-r-xl px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">При смене логина вы будете разлогинены.</p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Текущий пароль *</label>
                  <input
                    type="password"
                    value={credForm.current_password}
                    onChange={(e) => setCredForm((f) => ({ ...f, current_password: e.target.value }))}
                    placeholder="Введите текущий пароль"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Новый пароль (необязательно)</label>
                  <input
                    type="password"
                    value={credForm.new_password}
                    onChange={(e) => setCredForm((f) => ({ ...f, new_password: e.target.value }))}
                    placeholder="Минимум 4 символа"
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Повтор нового пароля</label>
                  <input
                    type="password"
                    value={credForm.confirm_password}
                    onChange={(e) => setCredForm((f) => ({ ...f, confirm_password: e.target.value }))}
                    placeholder="Повторите новый пароль"
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              </div>

              {credError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{credError}</p>}
              {credSaved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{credSaved}</p>}

              <button
                type="submit"
                disabled={credSaving}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                {credSaving ? 'Сохранение...' : 'Обновить данные'}
              </button>
            </form>
          </section>

          {/* ── Biometric login section ── */}
          <BiometricSection />
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
      </section>

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
