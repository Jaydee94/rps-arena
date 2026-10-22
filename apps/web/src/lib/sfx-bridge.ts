import type { RoomView } from '@rps/shared';
import { audio, SOUND_LENGTH, type SoundName } from './audio';
import { room } from './connection';

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
 * Wires the sounds to the app: unlocks audio on the first user gesture, clicks on buttons and
 * the room-state sounds. Returns a cleanup function.
 */
export function startSfxBridge(): () => void {
  const onPointerDown = (event: Event) => {
    audio.unlock();
    const target = event.target;
    const button = target instanceof Element ? target.closest('button') : null;
    if (button && !button.disabled) audio.play('click');
  };
  const onKeyDown = () => audio.unlock();
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);

  let prev: RoomView | null = null;
  const unsubscribe = room.subscribe((next) => {
    // Follow-up sounds start when the previous one has finished.
    let delay = 0;
    for (const name of diffRoomSounds(prev, next)) {
      audio.play(name, delay);
      delay += SOUND_LENGTH[name];
    }
    prev = next;
  });

  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    unsubscribe();
  };
}
