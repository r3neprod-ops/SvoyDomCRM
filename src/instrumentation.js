export async function register() {
  // Skip Edge Runtime — listener needs Node.js fs/net APIs
  if (process.env.NEXT_RUNTIME === 'edge') return;

  // Write to push_debug_log immediately so we know register() was invoked
  try {
    const { pushDebugLog } = await import('./lib/admin/db.js');
    await pushDebugLog('instrumentation:register_called', {
      data: { runtime: process.env.NEXT_RUNTIME ?? 'undefined', pid: process.pid },
    });
  } catch {}

  try {
    const { startListener } = await import('./lib/admin/notifyListener.js');
    await startListener();
  } catch (e) {
    console.error('[instrumentation] Failed to start push listener:', e.message);
    try {
      const { pushDebugLog } = await import('./lib/admin/db.js');
      await pushDebugLog('instrumentation:start_failed', { error: String(e.message) });
    } catch {}
  }
}
