import { matchupFor, type RoomView } from '@rps/shared';
import { audio, SOUND_LENGTH, type SoundName } from './audio';
import { room } from './connection';
import { onCountdownEnded, shouldCountDown } from './countdown';
import { countdownMs } from './motion';

/** Which team a seat belongs to ("a0" -> "a"). */
const teamOf = (seat: string): string => seat.charAt(0);

/** Moment of impact after the reveal starts in seconds. Must equal --impact-at in styles/tokens.css. */
export const IMPACT_AT_S = 0.44;

/** The sound that introduces the reveal: an attack sound, the clash or the generic reveal. */
const isRevealSound = (name: SoundName): boolean =>
  name === 'reveal' || name === 'clash' || name.startsWith('attack-');

/**
 * The attack and clash sounds are built to start at the impact of the scene; the generic reveal
 * sound brings its own lead-in (a whoosh) and starts with the reveal.
 */
const impactOffset = (name: SoundName): number => (name === 'reveal' ? 0 : IMPACT_AT_S);

/**
 * Sounds of the transition into a reveal (pure): the sound of the first decided duel's attack, or
 * `clash` when every duel with both picks is a draw, followed by the round-result sound for a
 * player. The generic `reveal` sound stays as fallback while no matchup is known (a missing pick
 * or an unknown gesture). Empty for any other transition.
 */
export function revealSoundsFor(prev: RoomView | null, next: RoomView | null): SoundName[] {
  const before = prev?.match;
  const after = next?.match;
  if (!prev || !next || !before || !after) return [];
  if (before.phase === 'reveal' || after.phase !== 'reveal') return [];

  const round = after.lastRound;
  let intro: SoundName = 'reveal';
  let sawDraw = false;
  for (const { seats, result } of round?.duels ?? []) {
    const [x, y] = seats;
    const gx = round?.picks[x];
    const gy = round?.picks[y];
    if (!gx || !gy) continue;
    if (result === 'draw') {
      sawDraw = true;
      continue;
    }
    try {
      intro = `attack-${matchupFor(result === 'a' ? gx : gy, result === 'a' ? gy : gx).attack}`;
      sawDraw = false;
      break;
    } catch {
      // unknown gesture: no matchup for this duel
    }
  }
  if (sawDraw) intro = 'clash';

  const sounds: SoundName[] = [intro];
  // A spectator takes no side: only the reveal sound, never win/lose/draw.
  const you = next.role === 'player' ? next.you : null;
  const winner = round?.winner;
  if (you && winner) sounds.push(winner === 'draw' ? 'draw' : winner === teamOf(you) ? 'win' : 'lose');
  return sounds;
}

/**
 * Sounds for the transition between two room states. Pure: the first state after a load or
 * reconnect (prev === null) is silent, and an unchanged state never repeats a sound.
 */
export function diffRoomSounds(prev: RoomView | null, next: RoomView | null): SoundName[] {
  const before = prev?.match;
  const after = next?.match;
  if (!prev || !next || !before || !after) return [];

  const you = next.role === 'player' ? next.you : null;

  const sounds: SoundName[] = [];
  if (you && before.yourPick === null && after.yourPick !== null) sounds.push('lock');

  sounds.push(...revealSoundsFor(prev, next));

  if (you && before.phase !== 'finished' && after.phase === 'finished' && after.winner) {
    sounds.push(after.winner === teamOf(you) ? 'win' : 'lose');
  }
  return sounds;
}

/**
 * Sounds with their start delay in seconds (as in `audio.play(name, delay)`). Follow-ups start
 * when the previous sound has finished; the reveal sound additionally waits for the countdown
 * when one introduces the reveal, and an attack or clash sound lands `IMPACT_AT_S` after that.
 */
export function scheduleRoomSounds(
  prev: RoomView | null,
  next: RoomView | null,
): { name: SoundName; delay: number }[] {
  const countdown = shouldCountDown(prev, next);
  const countdownSeconds = countdownMs() / 1000;
  let delay = 0;
  return diffRoomSounds(prev, next).map((name) => {
    if (isRevealSound(name)) {
      if (countdown) delay = Math.max(delay, countdownSeconds);
      delay += impactOffset(name);
    }
    const entry = { name, delay };
    delay += SOUND_LENGTH[name];
    return entry;
  });
}

type PlannedSound = { name: SoundName; delay: number };

/**
 * Plays the room-state sounds. Sounds that wait for the reveal countdown are held back and played
 * when the countdown ends: on `countdownEnded()` (its last beat or a skip) or, if nobody signals,
 * after `countdownMs()`. A newer state with a different phase drops the held sounds, so a stale
 * reveal never plays late or after the match-end sound.
 */
export function createRoomSoundPlayer(play: (name: SoundName, delay: number) => void) {
  let pending: { phase: string; sounds: PlannedSound[]; leadUntil: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const drop = () => {
    clearTimeout(timer);
    timer = undefined;
    pending = null;
  };

  const countdownEnded = () => {
    if (!pending) return;
    const { sounds, leadUntil } = pending;
    drop();
    // Sounds already started (lock) still finish before the reveal chain begins.
    const lead = Math.max(0, (leadUntil - Date.now()) / 1000);
    for (const { name, delay } of sounds) play(name, lead + delay);
  };

  const update = (prev: RoomView | null, next: RoomView | null) => {
    if (pending && next?.match?.phase !== pending.phase) drop();
    const planned = scheduleRoomSounds(prev, next);
    const phase = next?.match?.phase;
    const gate = shouldCountDown(prev, next) ? planned.findIndex(({ name }) => isRevealSound(name)) : -1;
    const reveal = planned[gate];
    if (!reveal || !phase) {
      for (const { name, delay } of planned) play(name, delay);
      return;
    }
    const revealStart = reveal.delay - impactOffset(reveal.name);
    const now = planned.slice(0, gate);
    for (const { name, delay } of now) play(name, delay);
    const last = now.at(-1);
    const leadSeconds = last ? last.delay + SOUND_LENGTH[last.name] : 0;
    drop();
    pending = {
      phase,
      // Relative to the end of the countdown, so an attack sound keeps its impact offset.
      sounds: planned.slice(gate).map(({ name, delay }) => ({ name, delay: delay - revealStart })),
      leadUntil: Date.now() + leadSeconds * 1000,
    };
    timer = setTimeout(countdownEnded, countdownMs());
  };

  return { update, countdownEnded, dispose: drop };
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

  const player = createRoomSoundPlayer((name, delay) => audio.play(name, delay));
  const unsubscribeCountdown = onCountdownEnded(player.countdownEnded);
  let prev: RoomView | null = null;
  const unsubscribe = room.subscribe((next) => {
    player.update(prev, next);
    prev = next;
  });

  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    for (const type of GESTURES) document.removeEventListener(type, onGesture, true);
    unsubscribe();
    unsubscribeCountdown();
    player.dispose();
  };
}
