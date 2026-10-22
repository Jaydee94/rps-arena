import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

/** Largest accepted Socket.IO message; anything bigger closes the connection. */
export const MAX_MESSAGE_BYTES = 10_000;

/**
 * Same-origin check. Browsers always send `Origin` on a WebSocket handshake, and CORS does not
 * protect WebSockets, so a browser request is only accepted when its origin's host equals the
 * `Host` it connects to. Requests without `Origin` (non-browser clients) are allowed.
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Socket.IO server with the hardened defaults the game needs (no CORS, websocket only). */
export function createIoServer(http: HttpServer): Server {
  return new Server(http, {
    transports: ['websocket'],
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    serveClient: false,
    // No `cors` option: no cross-origin access at all.
    allowRequest: (req, callback) => callback(null, isSameOrigin(req)),
  });
}
