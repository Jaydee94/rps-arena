import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import type { RoomView, SeatId } from '@rps/shared';
import { makeMatch, makeRoom, makeSpectatorRoom } from '../test/fixtures';

const play = vi.fn();
const unlock = vi.fn();
const roomStore = writable<RoomView | null>(null);

vi.mock('./audio', () => ({
  audio: { play: (...args: unknown[]) => play(...args), unlock: () => unlock() },
  SOUND_LENGTH: { click: 0.1, lock: 0.2, reveal: 0.7, win: 0.6, lose: 0.9, draw: 0.4 },
}));
vi.mock('./connection', () => ({ room: roomStore }));

const { createRoomSoundPlayer, diffRoomSounds, scheduleRoomSounds, startSfxBridge } = await import('./sfx-bridge');
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
