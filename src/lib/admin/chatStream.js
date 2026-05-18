export function createChatStream({ request, initialAfter = 0, intervalMs = 2500, maxTicks = 240, getMaxId }) {
  const encoder = new TextEncoder();
  let after = Number(initialAfter) || 0;
  let closed = false;

  request.signal?.addEventListener('abort', () => {
    closed = true;
  });

  const send = (controller, event, data) => {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };

  return new Response(new ReadableStream({
    async start(controller) {
      send(controller, 'ready', { after });
      for (let tick = 0; tick < maxTicks && !closed; tick += 1) {
        try {
          const maxId = await getMaxId();
          if (maxId > after) {
            after = maxId;
            send(controller, 'changed', { maxId });
          } else {
            send(controller, 'ping', { at: Date.now() });
          }
        } catch (err) {
          send(controller, 'error', { message: err?.message || 'stream error' });
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      controller.close();
    },
    cancel() {
      closed = true;
    },
  }), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
