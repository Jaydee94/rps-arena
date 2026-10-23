import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import type { RoomView, RoundResult, SeatId } from '@rps/shared';
import { makeMatch, makeRoom, makeSpectatorRoom } from '../test/fixtures';

const play = vi.fn();
const unlock = vi.fn();
const roomStore = writable<RoomView | null>(null);

vi.mock('./audio', () => ({
  audio: { play: (...args: unknown[]) => play(...args), unlock: () => unlock() },
  // Every attack sound and the clash last 0.4 s here.
  SOUND_LENGTH: new Proxy(
    { click: 0.1, lock: 0.2, reveal: 0.7, win: 0.6, lose: 0.9, draw: 0.4 } as Record<string, number>,
    { get: (lengths, name) => lengths[name as string] ?? 0.4 },
  ),
  // Where the hit of each matchup sound is: slash opens with a whoosh, curse with a swell.
  HIT_AT: new Proxy({ 'attack-slash': 0.17, 'attack-curse': 0.12 } as Record<string, number>, {
    get: (hits, name) => hits[name as string] ?? 0,
  }),
}));
vi.mock('./connection', () => ({ room: roomStore }));

const { CONTACT_S, FX_HIT_S, IMPACT_AT_S, RESULT_GAP_S, createRoomSoundPlayer, diffRoomSounds, revealSoundsFor, scheduleRoomSounds, startSfxBridge } =
  await import('./sfx-bridge');
const { emitCountdownEnded } = await import('./countdown');
const { motion } = await import('./motion');

const revealRoom = (you: SeatId, winner: 'a' | 'b' | 'draw', yourPick: string | null = 'rock') =>
  makeRoom({
    you,
    match: {
      phase: 'reveal',
      yourPick,
      lastRound: { picks: {}, duels: [], winner },
    },
  });

/** A reveal of a real 1v1 duel: a0 shows `a`, b0 shows `b`. */
const duelRoom = (you: SeatId, a: string, b: string, result: 'a' | 'b' | 'draw') =>
  makeRoom({
    you,
    match: {
      phase: 'reveal',
      yourPick: a,
      lastRound: { picks: { a0: a, b0: b }, duels: [{ seats: ['a0', 'b0'], result }], winner: result },
    },
  });

describe('diffRoomSounds', () => {
  it('plays nothing without a previous state (first state after load or reconnect)', () => {
    expect(diffRoomSounds(null, revealRoom('a0', 'a'))).toEqual([]);
    expect(diffRoomSounds(null, makeRoom({ match: { yourPick: 'rock' } }))).toEqual([]);
    expect(diffRoomSounds(null, null)).toEqual([]);
  });

  it('plays nothing for an identical state', () => {
    const room = revealRoom('a0', 'a');
    expect(diffRoomSounds(room, room)).toEqual([]);
    expect(diffRoomSounds(revealRoom('a0', 'a'), revealRoom('a0', 'a'))).toEqual([]);
  });

  it('plays nothing when the room disappears or there is no match yet', () => {
    expect(diffRoomSounds(makeRoom(), null)).toEqual([]);
    expect(diffRoomSounds(makeRoom({ match: null }), makeRoom({ match: null }))).toEqual([]);
  });

  it('locks in when yourPick becomes non-null', () => {
    const prev = makeRoom({ match: { yourPick: null } });
    const next = makeRoom({ match: { yourPick: 'rock' } });
    expect(diffRoomSounds(prev, next)).toEqual(['lock']);
    expect(diffRoomSounds(next, makeRoom({ match: { yourPick: 'rock', lockedSeats: ['b0'] } }))).toEqual([]);
  });

  it('plays reveal then the round result when the phase becomes reveal', () => {
    const prev = makeRoom({ match: { yourPick: 'rock' } });
    expect(diffRoomSounds(prev, revealRoom('a0', 'a'))).toEqual(['reveal', 'win']);
  });

  it('includes the lock sound when your own pick completes the round', () => {
    const prev = makeRoom({ match: { yourPick: null } });
    expect(diffRoomSounds(prev, revealRoom('a0', 'a'))).toEqual(['lock', 'reveal', 'win']);
  });

  it.each([
    ['a0', 'a', 'win'],
    ['a0', 'b', 'lose'],
    ['a0', 'draw', 'draw'],
    ['a1', 'a', 'win'],
    ['b0', 'a', 'lose'],
    ['b0', 'b', 'win'],
    ['b1', 'b', 'win'],
    ['b1', 'draw', 'draw'],
  ] as const)('maps viewer %s and round winner %s to %s', (you, winner, sound) => {
    const prev = makeRoom({ you, match: { yourPick: 'rock' } });
    expect(diffRoomSounds(prev, revealRoom(you, winner))).toEqual(['reveal', sound]);
  });

  it('skips the result sound when the reveal carries no round result', () => {
    const prev = makeRoom({ match: { yourPick: 'rock' } });
    const next = makeRoom({ match: { phase: 'reveal', yourPick: 'rock', lastRound: null } });
    expect(diffRoomSounds(prev, next)).toEqual(['reveal']);
  });

  it('does not repeat reveal while the phase stays reveal', () => {
    const prev = revealRoom('a0', 'a');
    const next = makeRoom({ ...prev, match: { ...prev.match, lockedSeats: ['a0'] } });
    expect(diffRoomSounds(prev, next)).toEqual([]);
  });

  it('plays the fanfare once when the match finishes', () => {
    const reveal = revealRoom('a0', 'a');
    const finished = makeRoom({ you: 'a0', match: { phase: 'finished', winner: 'a', yourPick: 'rock' } });
    expect(diffRoomSounds(reveal, finished)).toEqual(['win']);
    expect(diffRoomSounds(finished, finished)).toEqual([]);
    expect(diffRoomSounds(finished, makeRoom({ ...finished }))).toEqual([]);
  });

  it('plays the lose fanfare for the losing team', () => {
    const reveal = revealRoom('b1', 'a');
    const finished = makeRoom({ you: 'b1', match: { phase: 'finished', winner: 'a' } });
    expect(diffRoomSounds(reveal, finished)).toEqual(['lose']);
  });

  it('plays nothing for a finished match without a winner or from a fresh load', () => {
    const reveal = revealRoom('a0', 'a');
    expect(diffRoomSounds(reveal, makeRoom({ match: { phase: 'finished', winner: null } }))).toEqual([]);
    expect(diffRoomSounds(null, makeRoom({ match: { phase: 'finished', winner: 'a' } }))).toEqual([]);
  });

  it('is quiet after a rematch starts a new match', () => {
    const finished = makeRoom({ match: { phase: 'finished', winner: 'a' } });
    expect(diffRoomSounds(finished, makeRoom({ match: makeMatch({ phase: 'pick' }) }))).toEqual([]);
  });
});

describe('startSfxBridge', () => {
  let stop: () => void;

  beforeEach(() => {
    play.mockClear();
    unlock.mockClear();
    roomStore.set(null);
    stop = startSfxBridge();
  });

  afterEach(() => {
    stop();
  });

  it('unlocks audio and plays click on pointerdown on a button', () => {
    const button = document.createElement('button');
    const inner = document.createElement('span');
    button.append(inner);
    document.body.append(button);
    inner.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(unlock).toHaveBeenCalled();
    expect(play).toHaveBeenCalledWith('click');
    button.remove();
  });

  it('unlocks but stays silent for non-button targets and disabled buttons', () => {
    const div = document.createElement('div');
    const disabled = document.createElement('button');
    disabled.disabled = true;
    document.body.append(div, disabled);
    div.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    disabled.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(unlock).toHaveBeenCalledTimes(2);
    expect(play).not.toHaveBeenCalled();
    div.remove();
    disabled.remove();
  });

  it('unlocks on keydown', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(unlock).toHaveBeenCalled();
  });

  it.each(['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'])(
    'unlocks on %s (activation events differ between engines)',
    (type) => {
      document.body.dispatchEvent(new Event(type, { bubbles: true }));
      expect(unlock).toHaveBeenCalledTimes(1);
    },
  );

  it('plays the click sound only once per tap (on pointerdown, not on pointerup/click)', () => {
    const button = document.createElement('button');
    document.body.append(button);
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      button.dispatchEvent(new Event(type, { bubbles: true }));
    }
    expect(play).toHaveBeenCalledTimes(1);
    button.remove();
  });

  it('plays sounds for room transitions, staggering follow-ups', () => {
    roomStore.set(makeRoom({ match: { yourPick: null } }));
    expect(play).not.toHaveBeenCalled();
    roomStore.set(revealRoom('a0', 'a'));
    expect(play.mock.calls.map(([name]) => name)).toEqual(['lock', 'reveal', 'win']);
    const delays = play.mock.calls.map(([, delay]) => delay as number);
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBeCloseTo(0.2);
    expect(delays[2]).toBeCloseTo(0.9);
  });

  it('removes its listeners and subscription on stop', () => {
    stop();
    for (const type of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown']) {
      document.body.dispatchEvent(new Event(type, { bubbles: true }));
    }
    roomStore.set(makeRoom({ match: { yourPick: null } }));
    roomStore.set(revealRoom('a0', 'a'));
    expect(unlock).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(get(roomStore)).not.toBeNull();
    stop = startSfxBridge();
  });
});

describe('scheduleRoomSounds', () => {
  afterEach(() => {
    motion.countdownBeatMs = 0;
  });

  const plan = (prev: RoomView | null, next: RoomView | null) =>
    scheduleRoomSounds(prev, next).map(({ name, delay }) => ({ name, delay: Number(delay.toFixed(3)) }));

  it('holds the reveal sound back until the countdown ends', () => {
    motion.countdownBeatMs = 420;
    const prev = makeRoom({ match: { yourPick: 'rock' } });
    expect(plan(prev, revealRoom('a0', 'a'))).toEqual([
      { name: 'reveal', delay: 1.26 },
      { name: 'win', delay: 1.96 },
    ]);
  });

  it('keeps the lock sound at 0 and delays the reveal chain behind it', () => {
    motion.countdownBeatMs = 420;
    const prev = makeRoom({ match: { yourPick: null } });
    expect(plan(prev, revealRoom('a0', 'a'))).toEqual([
      { name: 'lock', delay: 0 },
      { name: 'reveal', delay: 1.26 },
      { name: 'win', delay: 1.96 },
    ]);
  });

  it('matches the old chain without a countdown', () => {
    motion.countdownBeatMs = 0;
    const prev = makeRoom({ match: { yourPick: null } });
    expect(plan(prev, revealRoom('a0', 'a'))).toEqual([
      { name: 'lock', delay: 0 },
      { name: 'reveal', delay: 0.2 },
      { name: 'win', delay: 0.9 },
    ]);
  });

  it('is empty without a previous state', () => {
    motion.countdownBeatMs = 420;
    expect(scheduleRoomSounds(null, revealRoom('a0', 'a'))).toEqual([]);
  });

  it('does not delay the transition to finished', () => {
    motion.countdownBeatMs = 420;
    const finished = makeRoom({ you: 'a0', match: { phase: 'finished', winner: 'a', yourPick: 'rock' } });
    expect(plan(revealRoom('a0', 'a'), finished)).toEqual([{ name: 'win', delay: 0 }]);
  });
});

describe('startSfxBridge with a countdown', () => {
  let stop: () => void;

  beforeEach(() => {
    play.mockClear();
    roomStore.set(null);
    motion.countdownBeatMs = 420;
    stop = startSfxBridge();
  });

  afterEach(() => {
    stop();
    motion.countdownBeatMs = 0;
  });

  it('plays the lock at once and the reveal chain when the countdown ends', () => {
    vi.useFakeTimers();
    try {
      roomStore.set(makeRoom({ match: { yourPick: null } }));
      roomStore.set(revealRoom('a0', 'a'));
      expect(play.mock.calls).toEqual([['lock', 0]]);
      vi.advanceTimersByTime(1259);
      expect(play).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(play.mock.calls.map(([name]) => name)).toEqual(['lock', 'reveal', 'win']);
      expect(play.mock.calls[1]![1]).toBeCloseTo(0);
      expect(play.mock.calls[2]![1]).toBeCloseTo(0.7);
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays the reveal chain right away when the countdown is skipped', () => {
    vi.useFakeTimers();
    try {
      roomStore.set(makeRoom({ match: { yourPick: 'rock' } }));
      roomStore.set(revealRoom('a0', 'b'));
      vi.advanceTimersByTime(200);
      expect(play).not.toHaveBeenCalled();
      emitCountdownEnded();
      expect(play.mock.calls.map(([name]) => name)).toEqual(['reveal', 'lose']);
      vi.advanceTimersByTime(5000);
      expect(play).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createRoomSoundPlayer', () => {
  const played: { name: string; delay: number; at: number }[] = [];
  let player: ReturnType<typeof createRoomSoundPlayer>;
  let t0 = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    t0 = Date.now();
    played.length = 0;
    motion.countdownBeatMs = 420;
    player = createRoomSoundPlayer((name, delay) =>
      played.push({ name, delay: Number(delay.toFixed(3)), at: Date.now() - t0 }),
    );
  });

  afterEach(() => {
    player.dispose();
    vi.useRealTimers();
    motion.countdownBeatMs = 0;
  });

  const picking = () => makeRoom({ match: { yourPick: 'rock' } });

  it('plays the reveal chain at the natural end of the countdown (1.26 s)', () => {
    player.update(picking(), revealRoom('a0', 'a'));
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([]);
    vi.advanceTimersByTime(260);
    player.countdownEnded(); // the Countdown's own end arrives just after the timer: no repeat
    expect(played).toEqual([
      { name: 'reveal', delay: 0, at: 1260 },
      { name: 'win', delay: 0.7, at: 1260 },
    ]);
  });

  it('plays the reveal chain at the skip (0.2 s), keeping its order and spacing', () => {
    player.update(picking(), revealRoom('a0', 'a'));
    vi.advanceTimersByTime(200);
    player.countdownEnded();
    vi.advanceTimersByTime(5000);
    expect(played).toEqual([
      { name: 'reveal', delay: 0, at: 200 },
      { name: 'win', delay: 0.7, at: 200 },
    ]);
  });

  it('falls back to a timer when nobody signals the end of the countdown', () => {
    player.update(picking(), revealRoom('a0', 'draw'));
    vi.advanceTimersByTime(1259);
    expect(played).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(played.map(({ name, at }) => [name, at])).toEqual([
      ['reveal', 1260],
      ['draw', 1260],
    ]);
  });

  it('plays the lock sound immediately and lets it finish before an early reveal', () => {
    player.update(makeRoom({ match: { yourPick: null } }), revealRoom('a0', 'a'));
    expect(played).toEqual([{ name: 'lock', delay: 0, at: 0 }]);
    vi.advanceTimersByTime(50);
    player.countdownEnded();
    expect(played).toEqual([
      { name: 'lock', delay: 0, at: 0 },
      { name: 'reveal', delay: 0.15, at: 50 },
      { name: 'win', delay: 0.85, at: 50 },
    ]);
  });

  it('drops the held reveal chain when the phase changes before the flush', () => {
    const reveal = revealRoom('a0', 'a');
    player.update(picking(), reveal);
    vi.advanceTimersByTime(200);
    const finished = makeRoom({ you: 'a0', match: { phase: 'finished', winner: 'a', yourPick: 'rock' } });
    player.update(reveal, finished);
    expect(played).toEqual([{ name: 'win', delay: 0, at: 200 }]);
    player.countdownEnded();
    vi.advanceTimersByTime(5000);
    expect(played).toEqual([{ name: 'win', delay: 0, at: 200 }]);
  });

  it('drops the held reveal chain when the next round starts after a skip and Next', () => {
    const reveal = revealRoom('a0', 'a');
    player.update(picking(), reveal);
    player.update(reveal, makeRoom({ match: { phase: 'pick', yourPick: null } }));
    player.countdownEnded();
    vi.advanceTimersByTime(5000);
    expect(played).toEqual([]);
  });

  it('keeps the held chain while the phase stays reveal', () => {
    const reveal = revealRoom('a0', 'a');
    player.update(picking(), reveal);
    player.update(reveal, makeRoom({ ...reveal, match: { ...reveal.match, lockedSeats: ['a0'] } }));
    player.countdownEnded();
    expect(played.map(({ name }) => name)).toEqual(['reveal', 'win']);
  });

  it('plays at once without a countdown (reduced motion or switched off) and nothing after a reconnect', () => {
    motion.countdownBeatMs = 0;
    player.update(picking(), revealRoom('a0', 'a'));
    expect(played).toEqual([
      { name: 'reveal', delay: 0, at: 0 },
      { name: 'win', delay: 0.7, at: 0 },
    ]);
    played.length = 0;
    motion.countdownBeatMs = 420;
    player.update(null, revealRoom('a0', 'a'));
    vi.advanceTimersByTime(5000);
    expect(played).toEqual([]);
  });

  it('plays at once under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query.includes('reduce'), media: query })),
    );
    try {
      player.update(makeRoom({ match: { yourPick: null } }), revealRoom('a0', 'b'));
      expect(played).toEqual([
        { name: 'lock', delay: 0, at: 0 },
        { name: 'reveal', delay: 0.2, at: 0 },
        { name: 'lose', delay: 0.9, at: 0 },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ignores an end signal without held sounds', () => {
    player.countdownEnded();
    expect(played).toEqual([]);
  });

  describe('for a spectator', () => {
    const lastRound = { picks: {}, duels: [], winner: 'a' as const };
    const pick = () => makeSpectatorRoom({ match: { phase: 'pick', lockedSeats: ['a0', 'b0'] } });
    const reveal = () => makeSpectatorRoom({ match: { phase: 'reveal', lastRound } });

    it('holds the reveal sound and plays it at the skip', () => {
      player.update(pick(), reveal());
      vi.advanceTimersByTime(300);
      expect(played).toEqual([]);
      player.countdownEnded();
      vi.advanceTimersByTime(5000);
      expect(played).toEqual([{ name: 'reveal', delay: 0, at: 300 }]);
    });

    it('falls back to the timer without a signal', () => {
      player.update(pick(), reveal());
      vi.advanceTimersByTime(1259);
      expect(played).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(played).toEqual([{ name: 'reveal', delay: 0, at: 1260 }]);
    });
  });
});

describe('diffRoomSounds for spectators', () => {
  const lastRound = { picks: {}, duels: [], winner: 'a' as const };

  it('plays only reveal on the transition pick -> reveal', () => {
    const prev = makeSpectatorRoom({ match: { phase: 'pick', lockedSeats: ['a0', 'b0'] } });
    const next = makeSpectatorRoom({ match: { phase: 'reveal', lastRound } });
    expect(diffRoomSounds(prev, next)).toEqual(['reveal']);
  });

  it('plays nothing on the first state (prev === null)', () => {
    const reveal = makeSpectatorRoom({ match: { phase: 'reveal', lastRound } });
    expect(diffRoomSounds(null, reveal)).toEqual([]);
    expect(diffRoomSounds(null, makeSpectatorRoom({ match: { phase: 'pick' } }))).toEqual([]);
  });

  it('never plays lock, win, lose or draw', () => {
    const pick = makeSpectatorRoom({ match: { phase: 'pick' } });
    const locked = makeSpectatorRoom({ match: { phase: 'pick', lockedSeats: ['a0'] } });
    expect(diffRoomSounds(pick, locked)).toEqual([]);
    for (const winner of ['a', 'b', 'draw'] as const) {
      const reveal = makeSpectatorRoom({ match: { phase: 'reveal', lastRound: { picks: {}, duels: [], winner } } });
      expect(diffRoomSounds(pick, reveal)).toEqual(['reveal']);
    }
    const reveal = makeSpectatorRoom({ match: { phase: 'reveal', lastRound } });
    const finished = makeSpectatorRoom({ match: { phase: 'finished', winner: 'a' } });
    expect(diffRoomSounds(reveal, finished)).toEqual([]);
  });
});

describe('revealSoundsFor', () => {
  const picking = (you: SeatId = 'a0') => makeRoom({ you, match: { yourPick: 'rock' } });

  it('plays the attack sound of the winning gesture, then the result', () => {
    expect(revealSoundsFor(picking(), duelRoom('a0', 'rock', 'scissors', 'a'))).toEqual(['attack-smash', 'win']);
    expect(revealSoundsFor(picking(), duelRoom('a0', 'rock', 'scissors', 'b'))).toEqual(['attack-slash', 'lose']);
  });

  it('uses the winner of the duel, not the viewer, for the attack', () => {
    expect(revealSoundsFor(picking(), duelRoom('a0', 'scissors', 'rock', 'b'))).toEqual(['attack-smash', 'lose']);
    expect(revealSoundsFor(picking('b0'), duelRoom('b0', 'scissors', 'rock', 'b'))).toEqual(['attack-smash', 'win']);
    expect(revealSoundsFor(picking(), duelRoom('a0', 'scissors', 'paper', 'a'))).toEqual(['attack-slash', 'win']);
  });

  it('follows the pair override and the gesture archetype', () => {
    expect(revealSoundsFor(picking(), duelRoom('a0', 'water', 'fire', 'a'))).toEqual(['attack-splash', 'win']);
    expect(revealSoundsFor(picking(), duelRoom('a0', 'lizard', 'spock', 'a'))).toEqual(['attack-poison', 'win']);
  });

  it('plays the clash for a draw', () => {
    expect(revealSoundsFor(picking(), duelRoom('a0', 'rock', 'rock', 'draw'))).toEqual(['clash', 'draw']);
  });

  it('falls back to the generic reveal sound without a known matchup', () => {
    expect(revealSoundsFor(picking(), revealRoom('a0', 'a'))).toEqual(['reveal', 'win']);
    // a missing pick (timeout)
    const timeout = makeRoom({
      match: {
        phase: 'reveal',
        lastRound: { picks: { a0: 'rock' }, duels: [{ seats: ['a0', 'b0'], result: 'a' }], winner: 'a' },
      },
    });
    expect(revealSoundsFor(picking(), timeout)).toEqual(['reveal', 'win']);
    // an unknown gesture id
    expect(revealSoundsFor(picking(), duelRoom('a0', 'mystery', 'rock', 'a'))).toEqual(['reveal', 'win']);
    // no round result at all
    const none = makeRoom({ match: { phase: 'reveal', lastRound: null } });
    expect(revealSoundsFor(picking(), none)).toEqual(['reveal']);
  });

  it('takes the first decided duel in a 2v2 round, also after a draw', () => {
    const draw: RoundResult['duels'][number] = { seats: ['a0', 'b0'], result: 'draw' };
    const decided: RoundResult['duels'][number] = { seats: ['a1', 'b1'], result: 'a' };
    const picks = { a0: 'rock', b0: 'rock', a1: 'fire', b1: 'paper' };
    const round = (duels: RoundResult['duels']) =>
      makeRoom({ you: 'a1', match: { phase: 'reveal', lastRound: { picks, duels, winner: 'a' } } });
    expect(revealSoundsFor(picking('a1'), round([draw, decided]))).toEqual(['attack-burn', 'win']);
    expect(revealSoundsFor(picking('a1'), round([decided, draw]))).toEqual(['attack-burn', 'win']);
    expect(revealSoundsFor(picking('a1'), round([draw]))).toEqual(['clash', 'win']);
  });

  it('gives a spectator the attack sound only', () => {
    const pick = makeSpectatorRoom({ match: { phase: 'pick', lockedSeats: ['a0', 'b0'] } });
    const lastRound: RoundResult = {
      picks: { a0: 'rock', b0: 'scissors' },
      duels: [{ seats: ['a0', 'b0'], result: 'a' }],
      winner: 'a',
    };
    expect(revealSoundsFor(pick, makeSpectatorRoom({ match: { phase: 'reveal', lastRound } }))).toEqual([
      'attack-smash',
    ]);
  });

  it('is empty for anything but the transition into a reveal', () => {
    const reveal = duelRoom('a0', 'rock', 'scissors', 'a');
    expect(revealSoundsFor(null, reveal)).toEqual([]);
    expect(revealSoundsFor(picking(), null)).toEqual([]);
    expect(revealSoundsFor(reveal, reveal)).toEqual([]);
    expect(revealSoundsFor(picking(), picking())).toEqual([]);
    expect(revealSoundsFor(picking(), makeRoom({ match: null }))).toEqual([]);
  });

  it('is pure: the same input gives the same output and nothing is mutated', () => {
    const prev = picking();
    const next = duelRoom('a0', 'rock', 'scissors', 'a');
    const snapshot = JSON.stringify([prev, next]);
    expect(revealSoundsFor(prev, next)).toEqual(revealSoundsFor(prev, next));
    expect(JSON.stringify([prev, next])).toBe(snapshot);
  });

  it('diffRoomSounds uses it: lock, attack, result', () => {
    const prev = makeRoom({ match: { yourPick: null } });
    expect(diffRoomSounds(prev, duelRoom('a0', 'rock', 'scissors', 'a'))).toEqual(['lock', 'attack-smash', 'win']);
  });

  it('keeps IMPACT_AT_S in step with --impact-at in tokens.css', () => {
    const css = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8');
    const match = /--impact-at:\s*(\d+)ms/.exec(css);
    expect(Number(match?.[1]) / 1000).toBeCloseTo(IMPACT_AT_S);
  });

  it('keeps FX_HIT_S and CONTACT_S in step with --fx-hit and --fx-delay in tokens.css', () => {
    const css = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8');
    const hit = /--fx-hit:\s*(\d+)ms/.exec(css);
    expect(Number(hit?.[1]) / 1000).toBeCloseTo(FX_HIT_S);
    // the scene starts at --fx-delay (the impact) and its graphics and reaction at delay + hit
    expect(/--fx-delay:\s*var\(--impact-at\)/.test(css)).toBe(true);
    expect(CONTACT_S).toBeCloseTo(IMPACT_AT_S + FX_HIT_S);
  });
});

describe('the attack sound at the impact', () => {
  const played: { name: string; delay: number; at: number }[] = [];
  let player: ReturnType<typeof createRoomSoundPlayer>;
  let t0 = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    t0 = Date.now();
    played.length = 0;
    motion.countdownBeatMs = 420;
    player = createRoomSoundPlayer((name, delay) =>
      played.push({ name, delay: Number(delay.toFixed(3)), at: Date.now() - t0 }),
    );
  });

  afterEach(() => {
    player.dispose();
    vi.useRealTimers();
    motion.countdownBeatMs = 0;
  });

  const picking = () => makeRoom({ match: { yourPick: 'rock' } });
  const smash = () => duelRoom('a0', 'rock', 'scissors', 'a');

  it('plans the hit on the contact, with the result after it and before the end of the attack sound', () => {
    const plan = scheduleRoomSounds(picking(), smash()).map(({ name, delay }) => [name, Number(delay.toFixed(3))]);
    // countdown end 1.26 s; smash hits with its first sample (hitAt 0) at the contact 0.70 s; the
    // result stays at its old place (impact + length = 0.84 s) but not before contact + 0.15 s
    expect(plan).toEqual([
      ['attack-smash', 1.96],
      ['win', 2.11],
    ]);
  });

  it('starts a sound with a lead-in earlier, so that its hit lands on the contact', () => {
    // slash: the first snip is at 0.17 s of the recipe
    const slash = duelRoom('a0', 'scissors', 'paper', 'a');
    const plan = scheduleRoomSounds(picking(), slash).map(({ name, delay }) => [name, Number(delay.toFixed(3))]);
    expect(plan[0]).toEqual(['attack-slash', Number((1.26 + CONTACT_S - 0.17).toFixed(3))]);
    // curse: the swell peaks at 0.12 s
    const curse = duelRoom('a0', 'devil', 'rock', 'a');
    expect(scheduleRoomSounds(picking(), curse)[0]?.delay).toBeCloseTo(1.26 + CONTACT_S - 0.12);
  });

  it('never starts a sound before the countdown end', () => {
    for (const [a, b] of [['rock', 'scissors'], ['scissors', 'paper'], ['devil', 'rock'], ['rock', 'rock']] as const) {
      const room = duelRoom('a0', a, b, a === b ? 'draw' : 'a');
      const first = scheduleRoomSounds(picking(), room)[0];
      expect(first?.delay, a).toBeGreaterThanOrEqual(1.26);
    }
  });

  it('keeps the result sound at its old place or earlier than the end of the attack sound', () => {
    // mocked attack sounds last 0.4 s; the old result time was impact + length after the countdown end
    for (const [a, b] of [['rock', 'scissors'], ['scissors', 'paper'], ['devil', 'rock'], ['paper', 'rock']] as const) {
      const [attack, result] = scheduleRoomSounds(picking(), duelRoom('a0', a, b, 'a'));
      if (!attack || !result) throw new Error('no plan');
      expect(result.delay, a).toBeLessThanOrEqual(attack.delay + 0.4 + 1e-9);
      expect(result.delay, a).toBeGreaterThanOrEqual(1.26 + CONTACT_S + RESULT_GAP_S - 1e-9);
      expect(result.delay, a).toBeLessThanOrEqual(1.26 + IMPACT_AT_S + 0.4 + RESULT_GAP_S + 1e-9);
    }
  });

  it('starts the hit on the contact after the natural end of the countdown, exactly once', () => {
    player.update(picking(), smash());
    vi.advanceTimersByTime(1259);
    expect(played).toEqual([]);
    vi.advanceTimersByTime(1);
    player.countdownEnded(); // the Countdown's own end arrives just after the timer: no repeat
    vi.advanceTimersByTime(5000);
    expect(played).toEqual([
      { name: 'attack-smash', delay: CONTACT_S, at: 1260 },
      { name: 'win', delay: 0.85, at: 1260 },
    ]);
  });

  it('starts the hit on the contact after a skip, exactly once', () => {
    player.update(picking(), smash());
    vi.advanceTimersByTime(200);
    player.countdownEnded();
    player.countdownEnded();
    vi.advanceTimersByTime(5000);
    expect(played).toEqual([
      { name: 'attack-smash', delay: CONTACT_S, at: 200 },
      { name: 'win', delay: 0.85, at: 200 },
    ]);
  });

  it('lets a lock sound that is still playing push the chain, but not delay it otherwise', () => {
    player.update(makeRoom({ match: { yourPick: null } }), smash());
    vi.advanceTimersByTime(50);
    player.countdownEnded();
    // the lock (0.2 s) has 0.15 s left, far less than the 0.70 s to the contact
    expect(played).toEqual([
      { name: 'lock', delay: 0, at: 0 },
      { name: 'attack-smash', delay: CONTACT_S, at: 50 },
      { name: 'win', delay: 0.85, at: 50 },
    ]);
  });

  it('plays the clash for a draw at the impact, where the stickers meet', () => {
    player.update(picking(), duelRoom('a0', 'rock', 'rock', 'draw'));
    vi.advanceTimersByTime(1260);
    expect(played.map(({ name, delay }) => [name, delay])).toEqual([
      ['clash', IMPACT_AT_S],
      ['draw', 0.84],
    ]);
  });

  it('keeps the generic reveal sound at the countdown end when no matchup is known', () => {
    player.update(picking(), revealRoom('a0', 'a'));
    vi.advanceTimersByTime(1260);
    expect(played.map(({ name, delay }) => [name, delay])).toEqual([
      ['reveal', 0],
      ['win', 0.7],
    ]);
  });

  it('drops the held attack sound when the phase changes before the flush', () => {
    const reveal = smash();
    player.update(picking(), reveal);
    player.update(reveal, makeRoom({ match: { phase: 'pick', yourPick: null } }));
    player.countdownEnded();
    vi.advanceTimersByTime(5000);
    expect(played).toEqual([]);
  });

  it('plays at once, with the offset to the contact, without a countdown', () => {
    motion.countdownBeatMs = 0;
    player.update(picking(), smash());
    expect(played).toEqual([
      { name: 'attack-smash', delay: CONTACT_S, at: 0 },
      { name: 'win', delay: 0.85, at: 0 },
    ]);
  });

  it('lets a lock sound only delay the attack when it is still playing, without a countdown', () => {
    motion.countdownBeatMs = 0;
    player.update(makeRoom({ match: { yourPick: null } }), smash());
    expect(played).toEqual([
      { name: 'lock', delay: 0, at: 0 },
      { name: 'attack-smash', delay: CONTACT_S, at: 0 },
      { name: 'win', delay: 0.85, at: 0 },
    ]);
  });
});
