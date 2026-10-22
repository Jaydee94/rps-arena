/** Distinct messages are logged at most once per window; repeats are only counted. */
export const REJECTION_LOG_WINDOW_MS = 30_000;
const REJECTION_LOG_MAX_KEYS = 100;

/**
 * Last line of defence against a rejected promise nobody awaits (third-party code such as the
 * Socket.IO adapter fires commands without a catch): log it and keep serving instead of letting
 * Node exit and take every room of this replica down. Only name and message are logged, never the
 * error object itself (connection options may carry the Redis URL with its password).
 *
 * Deliberately no `uncaughtException` handler: a synchronous exception that escaped everything
 * leaves the process in an unknown state, and restarting (Kubernetes, `restart: unless-stopped`)
 * is the correct reaction.
 */
export function installUnhandledRejectionGuard(
  target: Pick<NodeJS.Process, 'on'>,
  log: (message: string) => void,
  now: () => number = Date.now,
): void {
  const lastLogged = new Map<string, { at: number; suppressed: number }>();
  target.on('unhandledRejection', (reason: unknown) => {
    const message =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : `non-Error rejection (${typeof reason})`;
    const at = now();
    const seen = lastLogged.get(message);
    if (seen && at - seen.at < REJECTION_LOG_WINDOW_MS) {
      seen.suppressed += 1;
      return;
    }
    if (!seen && lastLogged.size >= REJECTION_LOG_MAX_KEYS) lastLogged.clear();
    const suppressed = seen?.suppressed ?? 0;
    lastLogged.set(message, { at, suppressed: 0 });
    log(
      `unhandled rejection (process keeps running): ${message}` +
        (suppressed > 0 ? ` [+${suppressed} similar suppressed]` : ''),
    );
  });
}
