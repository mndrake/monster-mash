/**
 * Generates a short, easy-to-read room code.
 * We skip characters that look alike (0/O, 1/I) so codes are easy to read out
 * loud and type on a phone.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomRoomCode(length = 4): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/**
 * Normalize a code supplied by a human or a shared URL: uppercase it and keep
 * only valid (non-look-alike) characters, up to `maxLen`. Returns null when
 * there's nothing usable, so callers can fall back to a random code.
 */
export function normalizeRoomCode(raw: string | null | undefined, maxLen = 6): string | null {
  if (!raw) return null;
  let out = "";
  for (const ch of raw.toUpperCase()) {
    if (ALPHABET.includes(ch) && out.length < maxLen) out += ch;
  }
  return out.length >= 1 ? out : null;
}
