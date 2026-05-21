export async function register() {
  // Only run in the Node.js server runtime, not in Edge or during build
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { startListener } = await import('./src/lib/admin/notifyListener.js');
    await startListener();
  } catch (e) {
    console.error('[instrumentation] Failed to start push listener:', e.message);
  }
}
