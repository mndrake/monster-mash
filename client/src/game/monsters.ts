/**
 * How each monster LOOKS on the client. The server owns all the stats (health,
 * speed, damage); here we only care about drawing. The `radius` matches the
 * server's collision radius so the body and hit area line up.
 *
 * Keep the ids in sync with server/src/config.ts MONSTERS.
 */
export interface MonsterLook {
  id: string;
  name: string;
  /** A big emoji we draw as the monster's body — instant character, no art. */
  emoji: string;
  /** Body radius in world units (matches the server's collision radius). */
  radius: number;
  /** Accent color, used by the lobby picker. */
  accent: string;
  /** One-line description for the lobby picker. */
  blurb: string;
  /**
   * Main-attack travel range in world units — DISPLAY ONLY, used to size the aim
   * indicator. This mirrors `projectileRange` in server/src/config.ts (same
   * accepted duplication as maps.ts); keep it roughly in sync. The server still
   * owns the real range.
   */
  range: number;
  /**
   * Move speed in world units/sec — mirrors `speed` in server/src/config.ts.
   * Used ONLY for local-player movement prediction (see collision.ts); the
   * server stays authoritative. Keep in sync with the server value.
   */
  speed: number;
}

export const MONSTER_LOOKS: Record<string, MonsterLook> = {
  gnash: {
    id: "gnash",
    name: "Gnash",
    emoji: "👹",
    radius: 22,
    accent: "#ff5252",
    blurb: "Fast melee biter. Fragile — dash in, chomp, dash out.",
    range: 250,
    speed: 360,
  },
  spit: {
    id: "spit",
    name: "Spit",
    emoji: "👾",
    radius: 19,
    accent: "#40c4ff",
    blurb: "Mid-range marksman. Super sprays a five-glob fan.",
    range: 640,
    speed: 320,
  },
  brute: {
    id: "brute",
    name: "Brute",
    emoji: "🐲",
    radius: 28,
    accent: "#69f0ae",
    blurb: "Slow tank. Huge health, heavy boulders that hit hard.",
    range: 400,
    speed: 250,
  },
};

/** The order monsters appear in the lobby picker. */
export const MONSTER_ORDER = ["gnash", "spit", "brute"];

export function lookOf(id: string): MonsterLook {
  return MONSTER_LOOKS[id] ?? MONSTER_LOOKS.gnash;
}
