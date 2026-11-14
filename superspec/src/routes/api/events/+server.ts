import { subscribe } from '$lib/server/watcher';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // stream already closed; ignore
        }
      };
      send(': connected\n\n');
      unsubscribe = subscribe(() => send('data: changed\n\n'));
      heartbeat = setInterval(() => send(': ping\n\n'), 30000);
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive'
    }
  });
};
