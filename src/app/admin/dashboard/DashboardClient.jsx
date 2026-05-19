'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamChatPanel from './TeamChatPanel';
import { useTheme } from '@/app/ThemeProvider';

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

export default function DashboardClient({ user }) {
  const router = useRouter();
  const isAdmin = user.role === 'admin';
  const { theme, toggle: toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState('leads');
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
  const [closeReasonModal, setCloseReasonModal] = useState(null); // { leadId, leadName }
  const [closeReasonText, setCloseReasonText] = useState('');
  const [closeReasonLoading, setCloseReasonLoading] = useState(false);

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
    if (!confirm('Выключить уведомления?')) return;
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
    } catch (err) {
      console.error('[Push] Unsubscribe error:', err);
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
    if (activeTab !== 'chat') return;
    fetchChatNavUsers();
    fetchDmList();
    fetchRoomList();
    const i1 = setInterval(fetchDmList,  4000);
    const i2 = setInterval(fetchRoomList, 4000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [activeTab, fetchChatNavUsers, fetchDmList, fetchRoomList]);

  const openChatGeneral = useCallback(() => {
    setActiveDmId(null); setDmOtherUser(null);
    setActiveRoomId(null); setActiveRoom(null);
  }, []);

  const openChatDm = useCallback((chatId, otherUser) => {
    setActiveDmId(chatId); setDmOtherUser(otherUser);
    setActiveRoomId(null); setActiveRoom(null);
  }, []);

  const openChatRoom = useCallback((roomId, room) => {
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
    const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setLeads((prev) => prev.filter((lead) => lead.id !== id));
      fetchLeads();
      return;
    }
    alert(data.message || 'Не удалось удалить лид');
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
      setLeads((prev) =>
        prev.map((lead) =>
          lead.assigned_to === emp.id
            ? { ...lead, assigned_to: null, assigned_to_name: null, status: lead.status === 'in_progress' ? 'new' : lead.status }
            : lead
        )
      );
    } else {
      alert(data.message || 'Ошибка удаления');
    }
  };

  const commonLeads = isAdmin ? [] : leads.filter((lead) => lead.assigned_to === null);
  const myLeads = isAdmin ? [] : leads.filter((lead) => lead.assigned_to === user.id);
  const visibleLeads = isAdmin ? leads : employeeLeadTab === 'common' ? commonLeads : myLeads;
  const leadStats = useMemo(() => {
    const countByStatus = (status) => leads.filter((lead) => lead.status === status).length;
    return [
      { label: 'Всего', value: leads.length, tone: 'bg-slate-900 text-white' },
      { label: STATUS_LABELS.new, value: countByStatus('new'), tone: 'bg-blue-50 text-blue-700' },
      { label: STATUS_LABELS.in_progress, value: countByStatus('in_progress'), tone: 'bg-yellow-50 text-yellow-700' },
      { label: STATUS_LABELS.closed, value: countByStatus('closed'), tone: 'bg-green-50 text-green-700' },
    ];
  }, [leads]);
  const filteredVisibleLeads = useMemo(() => {
    const query = leadSearch.trim().toLowerCase();
    if (!query) return visibleLeads;
    return visibleLeads.filter((lead) => {
      const assignee = employees.find((emp) => emp.id === lead.assigned_to);
      return [
        lead.name,
        lead.phone,
        formatMessage(lead.message),
        STATUS_LABELS[lead.status] ?? lead.status,
        assignee?.name,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [employees, leadSearch, visibleLeads]);
  const showWorkColumns = isAdmin || employeeLeadTab === 'my';
  const emptyLeadsText = isAdmin
    ? 'Лидов нет.'
    : employeeLeadTab === 'common'
    ? 'Общих лидов нет.'
    : 'У вас пока нет лидов.';
  const searchEmptyText = leadSearch.trim() ? 'По этому поиску лидов нет.' : emptyLeadsText;
  const navItems = [
    { key: 'leads', label: 'Лиды', icon: '📋' },
    ...(isAdmin ? [
      { key: 'employees', label: 'Сотрудники', icon: '👥' },
    ] : []),
    { key: 'chat', label: 'Общий чат', icon: '💬', badge: chatUnread },
    { key: 'profile', label: 'Профиль', icon: '👤' },
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
    ? 'border-green-200 bg-green-50 text-green-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700'
    : notifStatus === 'denied' || notifStatus === 'unsupported' || notifStatus === 'unsupported_ios' || notifStatus === 'ios_install_required' || notifStatus === 'not_configured'
    ? 'border-red-200 bg-red-50 text-red-600'
    : notifStatus === 'error'
    ? 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100';

  const notificationBlocked = ['denied', 'unsupported', 'unsupported_ios', 'ios_install_required', 'not_configured'].includes(notifStatus);

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

      <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <div key={item.key}>
            <button
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

            {item.key === 'chat' && activeTab === 'chat' && (
              <div className="mt-1 space-y-0.5 pb-1">
                <button
                  onClick={() => { openChatGeneral(); setDrawerOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded-xl py-1.5 pl-9 pr-3 text-left text-xs transition ${
                    !activeDmId && !activeRoomId ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #2196F3, #00BCD4)' }}>CRM</div>
                  <span className="flex-1 truncate">Общий чат</span>
                  {chatGenUnread > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {chatGenUnread > 99 ? '99+' : chatGenUnread}
                    </span>
                  )}
                </button>

                <p className="px-3 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Сотрудники</p>
                {chatNavUsers.filter((u) => u.id !== user.id).map((emp) => {
                  const dmEntry  = dmList.find((c) => c.other_user_id === emp.id);
                  const dmUnread = dmEntry?.unread_count || 0;
                  const isActive = dmEntry ? activeDmId === dmEntry.id : false;
                  return (
                    <button key={emp.id}
                      onClick={() => { handleOpenChatDm(emp); setDrawerOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded-xl py-1.5 pl-9 pr-3 text-left text-xs transition ${
                        isActive ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {emp.avatar_url
                        ? <img src={emp.avatar_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                        : <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                            style={{ background: chatColor(emp.id) }}>{chatInitials(emp.name)}</div>
                      }
                      <span className="min-w-0 flex-1 truncate">{emp.name}</span>
                      {dmUnread > 0 && (
                        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {dmUnread > 99 ? '99+' : dmUnread}
                        </span>
                      )}
                    </button>
                  );
                })}

                <div className="flex items-center px-3 pb-0.5 pt-2">
                  <span className="flex-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Каналы</span>
                  <button onClick={() => setShowCreateRoom(true)}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-500 transition hover:bg-blue-100 hover:text-blue-600"
                    title="Создать канал">
                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </button>
                </div>
                {roomList.length === 0 && (
                  <p className="pl-9 pr-3 text-[11px] text-slate-400">Нет каналов</p>
                )}
                {roomList.map((room) => (
                  <button key={room.id}
                    onClick={() => { openChatRoom(room.id, room); setDrawerOpen(false); }}
                    className={`flex w-full items-center gap-2 rounded-xl py-1.5 pl-9 pr-3 text-left text-xs transition ${
                      activeRoomId === room.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                      style={{ background: chatColor(room.id + 5) }}>
                      {room.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="min-w-0 flex-1 truncate">{room.name}</span>
                    {room.unread_count > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
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

      <div className="space-y-2 border-t border-slate-100 p-4">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
        >
          <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
          <span className="text-base">{theme === 'dark' ? '☀️' : '🌙'}</span>
        </button>
        <button
          onClick={notifStatus === 'granted' ? disableNotifications : notificationBlocked ? undefined : enableNotifications}
          disabled={notifStatus === 'loading' || notificationBlocked}
          className={`w-full rounded-xl border px-3 py-2 text-sm transition disabled:cursor-default ${notificationClass}`}
        >
          {notificationLabel}
        </button>
        {notificationError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-snug text-red-700">
            {notificationError}
          </p>
        )}
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

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {leadStats.map((stat) => (
                <div key={stat.label} className={`rounded-xl border border-slate-200 px-4 py-3 shadow-sm ${stat.tone}`}>
                  <p className="text-xs opacity-75">{stat.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Поиск по имени, телефону, сообщению или сотруднику"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                {leadSearch && (
                  <button
                    type="button"
                    onClick={() => setLeadSearch('')}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Очистить поиск"
                  >
                    ×
                  </button>
                )}
              </div>
              <span className="shrink-0 text-xs text-slate-500">
                Показано {filteredVisibleLeads.length} из {visibleLeads.length}
              </span>
            </div>

            <div className="space-y-3 md:hidden">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 h-4 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="mb-2 h-3 w-48 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                  </div>
                ))
              ) : filteredVisibleLeads.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500 shadow-sm">{searchEmptyText}</div>
              ) : (
                filteredVisibleLeads.map((lead) => (
                  <article key={lead.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{lead.name || '—'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{formatDate(lead.created_at)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[lead.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_LABELS[lead.status] ?? lead.status}
                      </span>
                    </div>
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="mb-3 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-medium text-slate-800">
                        📞 {lead.phone}
                      </a>
                    )}
                    <p className="mb-3 text-sm leading-relaxed text-slate-600">{formatMessage(lead.message)}</p>
                    {isAdmin && (
                      <select
                        value={lead.assigned_to ?? ''}
                        onChange={(e) => assignLead(lead.id, e.target.value || null)}
                        className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                      >
                        <option value="">Не назначен</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                      </select>
                    )}
                    {showWorkColumns && (
                      <button onClick={() => openComments(lead)} className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700">
                        💬 Комментарии: {lead.comment_count || 0}
                        {lead.last_comment_text && <span className="mt-1 block truncate text-xs text-slate-500">{lead.last_comment_text}</span>}
                      </button>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {!isAdmin && employeeLeadTab === 'common' ? (
                        <button
                          onClick={() => claimLead(lead.id)}
                          disabled={claimingLeadId === lead.id}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 disabled:opacity-50"
                        >
                          {claimingLeadId === lead.id ? 'Забираю...' : '→ В работу'}
                        </button>
                      ) : (
                        <>
                          {STATUSES.filter((s) => s !== lead.status).map((s) => (
                            <button
                              key={s}
                              onClick={() => s === 'closed' ? openCloseReason(lead) : updateStatus(lead.id, s)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                            >
                              → {STATUS_LABELS[s]}
                            </button>
                          ))}
                          {isAdmin && (
                            <button
                              onClick={() => deleteLead(lead.id)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600"
                            >
                              Удалить
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
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
              ) : filteredVisibleLeads.length === 0 ? (
                <div className="py-16 text-center text-slate-500">{searchEmptyText}</div>
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
                      {filteredVisibleLeads.map((lead) => (
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
                                  {claimingLeadId === lead.id ? 'Забираю...' : '→ В работе'}
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
          />
        )}

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

          {/* ── Notifications section ── */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold">Уведомления</h2>
              <p className="mt-1 text-sm text-slate-500">Push-уведомления о новых лидах и сообщениях.</p>
            </div>
            <div className="space-y-3 px-5 py-5">
              {notifStatus === 'granted' ? (
                <button
                  onClick={disableNotifications}
                  className="w-full rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 transition hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                >
                  {notificationLabel}
                </button>
              ) : (
                <button
                  onClick={notificationBlocked ? undefined : enableNotifications}
                  disabled={notifStatus === 'loading' || notificationBlocked}
                  className={`w-full rounded-xl border px-4 py-2 text-sm transition disabled:cursor-default ${notificationClass}`}
                >
                  {notificationLabel}
                </button>
              )}
              {notificationError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-snug text-red-700">
                  {notificationError}
                </p>
              )}
              {notifStatus === 'granted' && (
                <button
                  onClick={sendTestPush}
                  disabled={testPushStatus === 'loading'}
                  className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                >
                  {testPushStatus === 'loading' ? 'Отправка...' : testPushStatus === 'sent' ? 'Отправлено!' : testPushStatus === 'error' ? 'Ошибка отправки' : 'Отправить тестовый пуш'}
                </button>
              )}
              <button
                onClick={runPushDiagnostics}
                disabled={pushDiagnosticsLoading}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                {pushDiagnosticsLoading ? 'Проверка...' : 'Диагностика push'}
              </button>
              {pushDiagnostics && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                  {pushDiagnostics.error ? (
                    <p className="text-red-600">{pushDiagnostics.error}</p>
                  ) : (
                    <div className="space-y-1.5">
                      <p>{pushDiagnostics.browser?.notificationApi ? '✓' : '×'} Notification API: {pushDiagnostics.browser?.permission}</p>
                      <p>{pushDiagnostics.browser?.serviceWorker ? '✓' : '×'} Service Worker</p>
                      <p>{pushDiagnostics.browser?.pushManager ? '✓' : '×'} PushManager</p>
                      {pushDiagnostics.browser?.ios && (
                        <p>{pushDiagnostics.browser?.standalone ? '✓' : '×'} iPhone PWA: {pushDiagnostics.browser?.standalone ? 'запущено с экрана Домой' : 'нужно установить через Safari'}</p>
                      )}
                      <p>{pushDiagnostics.browser?.subscription ? '✓' : '×'} Подписка в браузере{pushDiagnostics.browser?.endpoint ? `: ${pushDiagnostics.browser.endpoint}` : ''}</p>
                      <p>{pushDiagnostics.server?.vapidPublicKey?.ok ? '✓' : '×'} VAPID public key</p>
                      <p>{pushDiagnostics.server?.vapidPrivateKey?.ok ? '✓' : '×'} VAPID private key</p>
                      <p>{pushDiagnostics.server?.database?.ok ? '✓' : '×'} База данных: {pushDiagnostics.server?.database?.label}</p>
                      <p>{pushDiagnostics.server?.subscriptions?.ok ? '✓' : '×'} Подписки на сервере: {pushDiagnostics.server?.subscriptions?.count || 0}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

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

      {/* ── Create Room modal ── */}
      {showCreateRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-80 overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="font-semibold text-slate-800">Создать канал</h3>
              <button onClick={() => { setShowCreateRoom(false); setNewRoomName(''); setNewRoomMembers([]); }}
                className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto p-4">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Название</label>
                <input type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                  placeholder="Например: Маркетинг"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Участники</label>
                {chatNavUsers.filter((u) => u.id !== user.id).map((emp) => (
                  <label key={emp.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-slate-50">
                    <input type="checkbox" checked={newRoomMembers.includes(emp.id)}
                      onChange={(e) => {
                        if (e.target.checked) setNewRoomMembers((p) => [...p, emp.id]);
                        else setNewRoomMembers((p) => p.filter((id) => id !== emp.id));
                      }}
                      className="rounded accent-blue-500" />
                    {emp.avatar_url
                      ? <img src={emp.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                      : <div className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold text-white"
                          style={{ background: chatColor(emp.id) }}>{chatInitials(emp.name)}</div>
                    }
                    <span className="text-sm text-slate-700">{emp.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-100 p-3">
              <button onClick={handleCreateRoom} disabled={!newRoomName.trim() || creatingRoom}
                className="w-full rounded-xl bg-[#2196F3] py-2.5 text-sm font-semibold text-white transition hover:bg-[#1E88E5] disabled:opacity-40">
                {creatingRoom ? 'Создание...' : 'Создать канал'}
              </button>
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
              {leadEvents.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">История действий</h3>
                  <div className="space-y-2">
                    {leadEvents.map((event) => (
                      <div key={event.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700">{event.author_name || 'Система'}</span>
                          <span className="text-[11px] text-slate-400">{formatDate(event.created_at)}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">{event.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
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
