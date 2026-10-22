import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

export interface HttpOptions {
  staticDir: string;
  /** Readiness probe: true when the store answers. */
  isReady: () => Promise<boolean>;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Strict CSP. `wasm-unsafe-eval` and `worker-src blob:` are for the MediaPipe hand tracker
 * (camera input runs fully in the browser), `style-src 'unsafe-inline'` for Svelte transitions.
 * WebSocket endpoints are listed explicitly for browsers whose `'self'` does not cover ws(s).
 */
function csp(host: string | undefined): string {
  const ws = host && /^[\w.-]+(:\d+)?$/.test(host) ? ` ws://${host} wss://${host}` : '';
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self'${ws}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function securityHeaders(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('Content-Security-Policy', csp(req.headers.host));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
}

function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Probes, then the built web app with SPA fallback to index.html. */
export function createHttpHandler(options: HttpOptions): RequestListener {
  const root = normalize(options.staticDir);

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    securityHeaders(req, res);
    const pathname = (req.url ?? '/').split('?')[0] ?? '/';
    if (pathname === '/healthz') return text(res, 200, 'ok');
    if (pathname === '/readyz') {
      const ready = await options.isReady().catch(() => false);
      return text(res, ready ? 200 : 503, ready ? 'ready' : 'not ready');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return text(res, 405, 'method not allowed');
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return text(res, 400, 'bad request');
    }
    if (decoded.includes('\0')) return text(res, 400, 'bad request');
    const file = normalize(join(root, decoded));
    if (file !== root && !file.startsWith(root + sep)) return text(res, 404, 'not found');

    let target = file;
    if (!(await isFile(target))) {
      // Unknown app routes (no file extension) belong to the SPA; missing assets are a 404.
      if (extname(decoded) !== '') return text(res, 404, 'not found');
      target = join(root, 'index.html');
      if (!(await isFile(target))) return text(res, 404, 'not found');
    }

    const isIndex = target === join(root, 'index.html');
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      // Vite emits content-hashed files under assets/; everything else must revalidate.
      'Cache-Control':
        !isIndex && decoded.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return void res.end();
    createReadStream(target)
      .on('error', () => res.destroy())
      .pipe(res);
  }

  return (req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) text(res, 500, 'internal error');
      else res.destroy();
    });
  };
}
