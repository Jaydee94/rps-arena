/** Placeholder icons (emoji) until the real SVG art arrives; ids match @rps/shared. */
const GESTURE_EMOJI: Record<string, string> = {
  rock: '🪨',
  fire: '🔥',
  scissors: '✂️',
  snake: '🐍',
  human: '🧍',
  tree: '🌳',
  wolf: '🐺',
  sponge: '🧽',
  paper: '📄',
  air: '💨',
  water: '💧',
  dragon: '🐉',
  devil: '😈',
  lightning: '⚡',
  gun: '🔫',
  lizard: '🦎',
  spock: '🖖',
};

const AVATAR_EMOJI: Record<string, string> = {
  fox: '🦊',
  robot: '🤖',
  cat: '🐱',
  owl: '🦉',
  panda: '🐼',
  dino: '🦖',
  alien: '👽',
  ghost: '👻',
};

const UNKNOWN = '❓';

export const gestureEmoji = (id: string): string => GESTURE_EMOJI[id] ?? UNKNOWN;
export const gestureKey = (id: string): string => `gesture.${id}`;
export const avatarEmoji = (id: string): string => AVATAR_EMOJI[id] ?? UNKNOWN;
