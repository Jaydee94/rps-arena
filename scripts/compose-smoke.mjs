#!/usr/bin/env node
// Two-replica smoke test: client A talks to instance 1, client B to instance 2, both on the same
// Redis. Checks room creation/joining across replicas, that a pick stays secret until both sides
// picked, the cross-replica reveal broadcast and that a rejoin via the other instance with the
// session token restores the seat.
//
//   APP_URL=http://127.0.0.1:8080 APP2_URL=http://127.0.0.1:8081 node scripts/compose-smoke.mjs
//
// Exits 0 on success and 1 with a message naming the failed step otherwise.
/* global URL, console, process, setTimeout, clearTimeout */
import { io } from 'socket.io-client';

const APP_URL = process.env.APP_URL ?? process.argv[2] ?? 'http://127.0.0.1:8080';
const APP2_URL = process.env.APP2_URL ?? process.argv[3] ?? 'http://127.0.0.1:8081';
const TIMEOUT_MS = 10_000;
// First entry of AVATARS in packages/shared/src/protocol.ts (that file is TypeScript source and
// not importable from plain Node). Must not contain the secret gesture below.
const AVATAR = 'fox';
const SECRET = 'rock'; // A's pick; must never reach B before B has picked
const NICKNAME_A = 'Smoke A';
const NICKNAME_B = 'Smoke B';

class SmokeFailure extends Error {}

const clients = [];

/** Connects like the browser client does: websocket only, `Origin` equal to the server's own origin. */
function connectClient(name, url) {
  const socket = io(url, {
    transports: ['websocket'],
    extraHeaders: { Origin: new URL(url).origin },
    reconnection: false,
  });
  const client = { name, url, socket, states: [], joins: [], errors: [], connectError: null, waiters: new Set() };
  clients.push(client);
  const wake = () => client.waiters.forEach((check) => check());
  socket.on('room:state', (view) => (client.states.push(view), wake()));
  socket.on('room:joined', (joined) => (client.joins.push(joined), wake()));
  socket.on('room:error', (error) => (client.errors.push(error), wake()));
  socket.on('connect_error', (error) => ((client.connectError = error), wake()));
  socket.on('connect', wake);
  socket.on('disconnect', wake);
  return client;
}

/** Resolves with the first value `find(client)` returns that is not undefined. Fails on timeout or any server error. */
function waitFor(client, description, find) {
  return new Promise((resolve, reject) => {
    let timer;
    const check = () => {
      if (client.connectError) {
        return done(reject, new SmokeFailure(`${client.name}: cannot connect to ${client.url}: ${client.connectError.message}`));
      }
      if (client.errors.length > 0) {
        const { code } = client.errors[0];
        return done(reject, new SmokeFailure(`${client.name}: server sent room:error "${code}" while waiting for ${description}`));
      }
      const found = find(client);
      if (found !== undefined) done(resolve, found);
    };
    const done = (settle, value) => {
      clearTimeout(timer);
      client.waiters.delete(check);
      settle(value);
    };
    timer = setTimeout(
      () => done(reject, new SmokeFailure(`${client.name}: timeout after ${TIMEOUT_MS / 1000}s waiting for ${description}`)),
      TIMEOUT_MS,
    );
    client.waiters.add(check);
    check();
  });
}

const connected = (client) =>
  waitFor(client, `connection to ${client.url}`, (c) => (c.socket.connected ? true : undefined));

const waitState = (client, description, predicate) =>
  waitFor(client, description, (c) => c.states.find(predicate));

function assert(condition, message) {
  if (!condition) throw new SmokeFailure(message);
}

function step(message) {
  console.log(`  - ${message}`);
}

async function run() {
  console.log(`Smoke test: A -> ${APP_URL}, B -> ${APP2_URL}`);
  const a = connectClient('A', APP_URL);
  const b = connectClient('B', APP2_URL);
  await Promise.all([connected(a), connected(b)]);
  step('both clients connected (websocket, same-origin Origin header)');

  // A creates a classic best-of-3 room on instance 1.
  a.socket.emit('room:create', { config: { mode: 'classic', bestOf: 3 }, nickname: NICKNAME_A, avatar: AVATAR });
  const joinedA = await waitFor(a, 'room:joined after room:create', (c) => c.joins[0]);
  assert(joinedA.code && joinedA.token && joinedA.seat, 'A: room:joined lacks code, token or seat');
  await waitState(a, 'room:state after room:create', (s) => s.code === joinedA.code);
  step(`A created room ${joinedA.code} (seat ${joinedA.seat})`);

  // B joins through instance 2: the room must be visible across replicas.
  b.socket.emit('room:join', { code: joinedA.code, nickname: NICKNAME_B, avatar: AVATAR });
  const joinedB = await waitFor(b, 'room:joined after room:join', (c) => c.joins[0]);
  assert(joinedB.code === joinedA.code, `B joined room ${joinedB.code}, expected ${joinedA.code}`);
  assert(joinedB.seat !== joinedA.seat, `A and B share seat ${joinedA.seat}`);
  await waitState(a, 'A sees both players', (s) => Object.keys(s.players).length === 2);
  step(`B joined on the other instance (seat ${joinedB.seat})`);

  // A (host) starts the match; both reach the pick phase.
  a.socket.emit('room:start');
  await Promise.all([
    waitState(a, 'match.phase === "pick" (A)', (s) => s.match?.phase === 'pick'),
    waitState(b, 'match.phase === "pick" (B)', (s) => s.match?.phase === 'pick'),
  ]);
  step('match started, both in phase pick');

  // A picks. B must learn that A locked in (cross-replica) but never which gesture.
  a.socket.emit('game:pick', { gesture: SECRET });
  const ownView = await waitState(a, 'A sees its own pick', (s) => s.match?.yourPick === SECRET);
  assert(JSON.stringify(ownView).includes(SECRET), 'test setup: the secret gesture is not detectable in A\'s own view');
  await waitState(b, "B is told that A locked in (cross-replica broadcast)", (s) =>
    s.match?.lockedSeats?.includes(joinedA.seat),
  );
  const leaked = b.states.filter((s) => JSON.stringify(s).includes(SECRET));
  assert(leaked.length === 0, `SECRET LEAK: B received A's gesture "${SECRET}" before picking: ${JSON.stringify(leaked[0])}`);
  const tokenLeak = b.states.some((s) => JSON.stringify(s).includes(joinedA.token));
  assert(!tokenLeak, "SECRET LEAK: B received A's session token in a room:state");
  assert(b.states.every((s) => s.match?.yourPick == null), "B's view holds a pick although B has not picked");
  step(`B received ${b.states.length} room:state messages before its own pick; none reveals A's gesture`);

  // B picks; both get the reveal with both gestures and the score.
  b.socket.emit('game:pick', { gesture: 'scissors' });
  const isReveal = (s) =>
    s.match?.phase === 'reveal' &&
    s.match.lastRound?.picks?.[joinedA.seat] === SECRET &&
    s.match.lastRound.picks[joinedB.seat] === 'scissors';
  const [revealA, revealB] = await Promise.all([
    waitState(a, 'reveal with both gestures (A)', isReveal),
    waitState(b, 'reveal with both gestures (B, cross-replica broadcast)', isReveal),
  ]);
  for (const [who, view] of [['A', revealA], ['B', revealB]]) {
    assert(view.match.score.a === 1 && view.match.score.b === 0, `${who}: expected score a:1 b:0 after rock vs scissors, got ${JSON.stringify(view.match.score)}`);
  }
  step('both received the reveal (rock beats scissors, score a:1 b:0)');

  // B drops and comes back through instance 1 with the token.
  b.socket.disconnect();
  const b2 = connectClient('B (rejoin)', APP_URL);
  await connected(b2);
  b2.socket.emit('room:rejoin', { code: joinedB.code, token: joinedB.token });
  const rejoined = await waitFor(b2, 'room:joined after room:rejoin', (c) => c.joins[0]);
  assert(rejoined.seat === joinedB.seat, `rejoin returned seat ${rejoined.seat}, expected ${joinedB.seat}`);
  assert(rejoined.code === joinedB.code, `rejoin returned room ${rejoined.code}, expected ${joinedB.code}`);
  await waitState(b2, 'room:state for the restored seat', (s) => s.code === joinedB.code && s.you === joinedB.seat);
  step(`B rejoined via the other instance and got seat ${rejoined.seat} back`);
}

let failed = false;
try {
  await run();
} catch (error) {
  failed = true;
  console.error(`FAIL: ${error instanceof SmokeFailure ? error.message : (error?.stack ?? error)}`);
} finally {
  for (const { socket } of clients) socket.disconnect();
}
if (failed) {
  process.exit(1);
}
console.log('PASS: cross-replica smoke test');
