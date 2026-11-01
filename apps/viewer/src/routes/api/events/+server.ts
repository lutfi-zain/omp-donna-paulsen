import type { RequestHandler } from './$types';
import { sseClients } from '$lib/server/vault-manager';

export const GET: RequestHandler = async ({ request }) => {
  const textEncoder = new TextEncoder();
  let clientController: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(controller) {
      clientController = controller;
      sseClients.add(controller);
      controller.enqueue(textEncoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));
    },
    cancel() {
      if (clientController) {
        sseClients.delete(clientController);
      }
    },
  });

  request.signal.addEventListener('abort', () => {
    if (clientController) {
      sseClients.delete(clientController);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};
