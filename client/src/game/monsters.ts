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
}

export const MONSTER_LOOKS: Record<string, MonsterLook> = {
  gnash: {
    id: "gnash",
    name: "Gnash",
    emoji: "👹",
    radius: 22,
    accent: "#ff5252",
    blurb: "Fast melee biter. Fragile — dash in, chomp, dash out.",
  },
  spit: {
    id: "spit",
    name: "Spit",
    emoji: "👾",
    radius: 19,
    accent: "#40c4ff",
    blurb: "Mid-range marksman. Super sprays a five-glob fan.",
  },
  brute: {
    id: "brute",
    name: "Brute",
    emoji: "🐲",
    radius: 28,
    accent: "#69f0ae",
    blurb: "Slow tank. Huge health, heavy boulders that hit hard.",
  },
};

/** The order monsters appear in the lobby picker. */
export const MONSTER_ORDER = ["gnash", "spit", "brute"];

export function lookOf(id: string): MonsterLook {
  return MONSTER_LOOKS[id] ?? MONSTER_LOOKS.gnash;
}
