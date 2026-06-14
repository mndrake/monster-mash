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
