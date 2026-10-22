export type Pose = 'rock' | 'paper' | 'scissors';

const POSES: Record<string, Pose> = {
  Closed_Fist: 'rock',
  Open_Palm: 'paper',
  Victory: 'scissors',
};

/** Maps a MediaPipe gesture name to a classic pose; everything else (incl. 'None' and '') is `null`. */
export function mapGesture(name: string): Pose | null {
  return Object.hasOwn(POSES, name) ? (POSES[name] ?? null) : null;
}
