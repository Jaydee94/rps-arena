import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import type { RoomView, SeatId } from '@rps/shared';
import { makeMatch, makeRoom } from '../test/fixtures';

const play = vi.fn();
const unlock = vi.fn();
const roomStore = writable<RoomView | null>(null);

vi.mock('./audio', () => ({
  audio: { play: (...args: unknown[]) => play(...args), unlock: () => unlock() },
  SOUND_LENGTH: { click: 0.1, lock: 0.2, reveal: 0.7, win: 0.6, lose: 0.9, draw: 0.4 },
}));
vi.mock('./connection', () => ({ room: roomStore }));

const { diffRoomSounds, scheduleRoomSounds, startSfxBridge } = await import('./sfx-bridge');
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

  it('plays the reveal chain with the countdown delays', () => {
    roomStore.set(makeRoom({ match: { yourPick: null } }));
    roomStore.set(revealRoom('a0', 'a'));
    expect(play.mock.calls.map(([name]) => name)).toEqual(['lock', 'reveal', 'win']);
    const delays = play.mock.calls.map(([, delay]) => delay as number);
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBeCloseTo(1.26);
    expect(delays[2]).toBeCloseTo(1.96);
  });
});
