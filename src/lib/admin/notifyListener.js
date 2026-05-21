import postgres from 'postgres';
import { getSql, ensureSchema, pushDebugLog } from './db.js';
import { sendPushToAll } from './push.js';

let started = false;
let pollTimer = null;

// ─── helpers ────────────────────────────────────────────────────────────────

async function getLastSeenLeadId() {
  try {
    const sql = getSql();
    const [row] = await sql`SELECT value FROM settings WHERE key = 'listener:last_lead_id'`;
    return row ? (parseInt(row.value, 10) || 0) : null; // null = not yet initialized
  } catch {
    return 0;
  }
}

async function setLastSeenLeadId(id) {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO settings (key, value) VALUES ('listener:last_lead_id', ${String(id)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  } catch (e) {
    console.error('[listener] setLastSeenLeadId error:', e.message);
  }
}

async function handleNewLead(leadId, name, phone) {
  console.log('[listener] New lead detected, id =', leadId);
  await pushDebugLog('listener:new_lead', { leadId, data: { name, phone } });
  try {
    const body = name
      ? `${name}${phone ? ` — тел. ${phone}` : ''}`
      : 'Новая заявка с сайта';
    await sendPushToAll({
      title: 'Новый лид!',
      body,
      url: '/admin/dashboard',
      tag: `svoydom-crm-lead-${leadId}`,
      type: 'lead_created',
    });
    await pushDebugLog('listener:push_sent', { leadId, data: { ok: true } });
    console.log('[listener] Push sent for lead', leadId);
  } catch (e) {
    await pushDebugLog('listener:push_error', { leadId, error: String(e?.message || e) });
    console.error('[listener] Push error for lead', leadId, e?.message);
  }
}

// ─── polling fallback ────────────────────────────────────────────────────────

async function pollOnce() {
  try {
    let lastId = await getLastSeenLeadId();

    if (lastId === null) {
      // First ever start: set checkpoint to current MAX to avoid firing for old leads
      const sql = getSql();
      const [row] = await sql`SELECT COALESCE(MAX(id), 0)::int AS m FROM leads`;
      const maxId = row?.m ?? 0;
      await setLastSeenLeadId(maxId);
      await pushDebugLog('listener:poll_init', { data: { initializedAt: maxId } });
      console.log('[listener] Poll initialized at lead id', maxId);
      return;
    }

    const sql = getSql();
    const newLeads = await sql`
      SELECT id, name, phone FROM leads WHERE id > ${lastId} ORDER BY id ASC LIMIT 20
    `;
    if (!newLeads.length) return;

    await pushDebugLog('listener:poll_found', { data: { count: newLeads.length, fromId: lastId } });
    for (const lead of newLeads) {
      await handleNewLead(lead.id, lead.name, lead.phone);
      await setLastSeenLeadId(lead.id);
    }
  } catch (e) {
    console.error('[listener] Poll error:', e.message);
    await pushDebugLog('listener:poll_error', { error: String(e?.message || e) }).catch(() => {});
  }
}

function schedulePoll(intervalMs) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    await pollOnce();
    schedulePoll(intervalMs);
  }, intervalMs);
}

// ─── LISTEN / NOTIFY ─────────────────────────────────────────────────────────

async function startListenNotify() {
  if (!process.env.DATABASE_URL) return false;

  try {
    const dbUrl = process.env.DATABASE_URL;
    const listenSql = postgres(dbUrl, {
      ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
      max: 1,
      idle_timeout: null,
      connect_timeout: 30,
      onnotice: () => {},
    });

    await listenSql.listen('new_lead', async (payload) => {
      await pushDebugLog('listener:notify_recv', { data: { channel: 'new_lead', payload } });
      try {
        const data = typeof payload === 'string' ? JSON.parse(payload) : (payload ?? {});
        const leadId = Number(data.lead_id);
        if (!leadId) return;

        // Skip if polling already processed this lead
        const lastId = (await getLastSeenLeadId()) ?? 0;
        if (leadId <= lastId) {
          await pushDebugLog('listener:notify_skip_dup', { leadId, data: { lastId } });
          return;
        }

        await handleNewLead(leadId, data.name, data.phone);
        await setLastSeenLeadId(leadId);
      } catch (e) {
        console.error('[listener] new_lead handler error:', e.message);
        await pushDebugLog('listener:notify_error', { error: String(e?.message || e) }).catch(() => {});
      }
    });

    await pushDebugLog('listener:connected', { data: { channel: 'new_lead' } });
    console.log('[listener] LISTEN/NOTIFY active on channel: new_lead');
    return true;
  } catch (e) {
    console.error('[listener] LISTEN/NOTIFY setup failed:', e.message);
    await pushDebugLog('listener:listen_failed', { error: String(e?.message || e) }).catch(() => {});
    return false;
  }
}

// ─── entry point ─────────────────────────────────────────────────────────────

export async function startListener() {
  if (started) return;
  started = true;

  console.log('[listener] Starting push notification listener...');

  try {
    await ensureSchema();
  } catch (e) {
    console.error('[listener] ensureSchema error on startup:', e.message);
  }

  const listenOk = await startListenNotify();

  // Polling always runs as safety net; shorter interval when LISTEN is unavailable
  const pollIntervalMs = listenOk ? 7000 : 5000;
  schedulePoll(pollIntervalMs);

  await pushDebugLog('listener:started', {
    data: { listenOk, pollIntervalMs },
  }).catch(() => {});

  console.log(
    '[listener] Ready. LISTEN/NOTIFY:',
    listenOk ? 'active' : 'disabled (polling only)',
    `| polling every ${pollIntervalMs / 1000}s`
  );
}
