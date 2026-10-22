/** Room code alphabet: no 0/O, 1/I/L to avoid look-alikes when read aloud or typed. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

/** Canonical form of a user-typed room code. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Generates a random room code; `rng` must return values in [0, 1). */
export function generateCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const index = Math.min(Math.floor(rng() * CODE_ALPHABET.length), CODE_ALPHABET.length - 1);
    code += CODE_ALPHABET[index];
  }
  return code;
}
