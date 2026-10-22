import { io, type Socket } from 'socket.io-client';
import { writable, type Readable } from 'svelte/store';
import type {
  ClientEventName,
  ClientEventPayloads,
  ErrorCode,
  RoomJoined,
  RoomView,
  SeatId,
  ServerEvents,
} from '@rps/shared';

/** The shared event payload maps as socket.io listener maps. */
type ListenersOf<Payloads> = { [K in keyof Payloads]: (payload: Payloads[K]) => void };
type GameSocket = Socket<ListenersOf<ServerEvents>, ListenersOf<ClientEventPayloads>>;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
export interface LastError {
  code: ErrorCode;
  message: string;
}

const SESSION_KEY = 'rps.session';

interface Session {
  code: string;
  token: string;
}

// sessionStorage may be missing or throw (privacy modes, sandboxed frames): the app must still work.
function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (
      typeof data === 'object' &&
      data !== null &&
      'code' in data &&
      'token' in data &&
      typeof data.code === 'string' &&
      typeof data.token === 'string'
    ) {
      return { code: data.code, token: data.token };
    }
  } catch {
    // unreadable or malformed: treat as no session
  }
  return null;
}

function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // without storage a reload simply loses the room
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // nothing to clean up
  }
}

const roomStore = writable<RoomView | null>(null);
const lastErrorStore = writable<LastError | null>(null);
const statusStore = writable<ConnectionStatus>('connecting');

export const room: Readable<RoomView | null> = { subscribe: roomStore.subscribe };
export const lastError: Readable<LastError | null> = { subscribe: lastErrorStore.subscribe };
export const status: Readable<ConnectionStatus> = { subscribe: statusStore.subscribe };

let socket: GameSocket | null = null;
// True while the last thing we sent was the automatic room:rejoin and the server has not answered yet.
let pendingRejoin = false;

/** Opens the websocket (once). Call from main.ts; importing this module has no side effects. */
export function connect(): void {
  if (socket) return;
  const s: GameSocket = io({ transports: ['websocket'] });
  socket = s;

  s.on('connect', () => {
    statusStore.set('connected');
    const session = loadSession();
    if (session) {
      pendingRejoin = true;
      s.emit('room:rejoin', session);
    }
  });
  s.on('disconnect', () => statusStore.set('disconnected'));
  s.on('connect_error', () => statusStore.set('disconnected'));

  s.on('room:state', (view) => {
    pendingRejoin = false;
    roomStore.set(view);
  });
  s.on('room:joined', (joined: RoomJoined) => {
    pendingRejoin = false;
    saveSession({ code: joined.code, token: joined.token });
  });
  s.on('room:error', (error) => {
    lastErrorStore.set({ code: error.code, message: error.message });
    // Only a rejected automatic rejoin invalidates the saved session; a mistyped join must not.
    if (pendingRejoin && (error.code === 'bad_token' || error.code === 'room_not_found')) {
      clearSession();
      roomStore.set(null);
    }
    pendingRejoin = false;
  });
}

/** Dev-only hook for lib/demo.ts: feeds mock state without a server. Unused (tree-shaken) in production. */
export function setDemoState(view: RoomView | null, connection: ConnectionStatus = 'connected'): void {
  roomStore.set(view);
  statusStore.set(connection);
}

export function clearError(): void {
  lastErrorStore.set(null);
}

/** Drops the stored room credentials, so the next page load starts fresh instead of rejoining. */
export function forgetSession(): void {
  clearSession();
}

function send<K extends ClientEventName>(event: K, payload: ClientEventPayloads[K]): void {
  connect();
  pendingRejoin = false;
  // A generic event name cannot be matched against the per-event listener map; the signature above already ties them together.
  (socket as Socket | null)?.emit(event, payload);
}

export const createRoom = (payload: ClientEventPayloads['room:create']) => send('room:create', payload);
export const joinRoom = (payload: ClientEventPayloads['room:join']) => send('room:join', payload);
export const startMatch = () => send('room:start', {});
export const moveSeat = (from: SeatId, to: SeatId) => send('seat:move', { from, to });
export const announce = (emote: string | null) => send('game:announce', { emote });
export const pick = (gesture: string) => send('game:pick', { gesture });
export const next = () => send('game:next', {});
export const rematch = () => send('room:rematch', {});
