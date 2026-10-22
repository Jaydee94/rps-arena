import type { RoomView } from '@rps/shared';
import { audio, SOUND_LENGTH, type SoundName } from './audio';
import { room } from './connection';
import { shouldCountDown } from './countdown';
import { countdownMs } from './motion';

/** Which team a seat belongs to ("a0" -> "a"). */
const teamOf = (seat: string): string => seat.charAt(0);

/**
 * Sounds for the transition between two room states. Pure: the first state after a load or
 * reconnect (prev === null) is silent, and an unchanged state never repeats a sound.
 */
export function diffRoomSounds(prev: RoomView | null, next: RoomView | null): SoundName[] {
  const before = prev?.match;
  const after = next?.match;
  if (!prev || !next || !before || !after) return [];

  const sounds: SoundName[] = [];
  if (before.yourPick === null && after.yourPick !== null) sounds.push('lock');

  if (before.phase !== 'reveal' && after.phase === 'reveal') {
    sounds.push('reveal');
    const winner = after.lastRound?.winner;
    if (winner) sounds.push(winner === 'draw' ? 'draw' : winner === teamOf(next.you) ? 'win' : 'lose');
  }

  if (before.phase !== 'finished' && after.phase === 'finished' && after.winner) {
    sounds.push(after.winner === teamOf(next.you) ? 'win' : 'lose');
  }
  return sounds;
}

/**
 * Sounds with their start delay in seconds (as in `audio.play(name, delay)`). Follow-ups start
 * when the previous sound has finished; the reveal sound additionally waits for the countdown
 * when one introduces the reveal.
 */
export function scheduleRoomSounds(
  prev: RoomView | null,
  next: RoomView | null,
): { name: SoundName; delay: number }[] {
  const countdown = shouldCountDown(prev, next);
  const countdownSeconds = countdownMs() / 1000;
  let delay = 0;
  return diffRoomSounds(prev, next).map((name) => {
    if (countdown && name === 'reveal') delay = Math.max(delay, countdownSeconds);
    const entry = { name, delay };
    delay += SOUND_LENGTH[name];
    return entry;
  });
}

/**
 * Wires the sounds to the app: unlocks audio on the first user gesture, clicks on buttons and
 * the room-state sounds. Returns a cleanup function.
 */
export function startSfxBridge(): () => void {
  const onPointerDown = (event: Event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest('button') : null;
    if (button && !button.disabled) audio.play('click');
  };
  // Engines disagree on which events count as a user activation (touch pointerdown does not on
  // WebKit; click/pointerup/touchend/keydown do), so every one of them tries to unlock. unlock()
  // is idempotent and cheap once the context runs, and re-resumes a suspended/interrupted one.
  const onGesture = () => audio.unlock();
  const GESTURES = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
  for (const type of GESTURES) document.addEventListener(type, onGesture, true);
  // Registered after the unlock listener, so the click can already sound on a fresh context.
  document.addEventListener('pointerdown', onPointerDown, true);

  let prev: RoomView | null = null;
  const unsubscribe = room.subscribe((next) => {
    for (const { name, delay } of scheduleRoomSounds(prev, next)) audio.play(name, delay);
    prev = next;
  });

  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    for (const type of GESTURES) document.removeEventListener(type, onGesture, true);
    unsubscribe();
  };
}
