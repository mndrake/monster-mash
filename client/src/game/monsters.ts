/**
 * How each monster LOOKS on the client, plus a few DISPLAY-ONLY stats for the
 * lobby picker. The server owns the real simulation values; the numbers here
 * mirror server/src/config.ts (same accepted duplication as maps.ts) and are
 * used for the aim indicator, movement prediction, and the picker's stat bars.
 *
 * Keep the ids and numbers in sync with server/src/config.ts MONSTERS.
 */
export interface MonsterLook {
  id: string;
  name: string;
  /** A big emoji we draw as the monster's body — instant character, no art. */
  emoji: string;
  /** Body radius in world units (matches the server's collision radius). */
  radius: number;
  /** Accent color, used by the lobby picker and the monster's ring. */
  accent: string;
  /** One-line description for the lobby picker. */
  blurb: string;
  /** Main-attack range in world units — sizes the aim indicator (mirrors `projectileRange`). */
  range: number;
  /** Move speed in world units/sec — used for local movement prediction (mirrors `speed`). */
  speed: number;
  /** Max health — DISPLAY ONLY, for the picker stat bar (mirrors `maxHealth`). */
  health: number;
  /** Effective burst damage (per-pellet × pellets) — DISPLAY ONLY, for the picker. */
  damage: number;
  /** The two gadget names (mirrors server `gadgets`) — for the lobby chooser. */
  gadgets: [string, string];
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
    health: 4400,
    damage: 920,
    gadgets: ["Dash", "Frenzy"],
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
    health: 3000,
    damage: 760,
    gadgets: ["Reload", "Caltrops"],
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
    health: 6200,
    damage: 1320,
    gadgets: ["Shield", "Slam"],
  },
  vex: {
    id: "vex",
    name: "Vex",
    emoji: "🦂",
    radius: 19,
    accent: "#ffd740",
    blurb: "Long-range sniper. Reaches anywhere, but fragile and slow to fire.",
    range: 900,
    speed: 300,
    health: 2800,
    damage: 1120,
    gadgets: ["Reload", "Adrenaline"],
  },
  spike: {
    id: "spike",
    name: "Spike",
    emoji: "🐡",
    radius: 24,
    accent: "#ff6e40",
    blurb: "Close-range shotgun. A wide pellet fan that shreds up close.",
    range: 300,
    speed: 300,
    health: 4800,
    damage: 1800,
    gadgets: ["Thorns", "Roll"],
  },
  wisp: {
    id: "wisp",
    name: "Wisp",
    emoji: "👻",
    radius: 18,
    accent: "#b2ff59",
    blurb: "Fast skirmisher. Rapid light shots and the quickest feet.",
    range: 520,
    speed: 380,
    health: 3200,
    damage: 480,
    gadgets: ["Blink", "Haste"],
  },
  ruby: {
    id: "ruby",
    name: "Ruby",
    emoji: "🌿",
    radius: 20,
    accent: "#66bb6a",
    blurb: "Plant biologist. Mid-range control — heals and tangles up foes.",
    range: 560,
    speed: 320,
    health: 3600,
    damage: 720,
    gadgets: ["Bloom", "Thornburst"],
  },
  asher: {
    id: "asher",
    name: "Asher",
    emoji: "🐌",
    radius: 24,
    accent: "#9ccc65",
    blurb: "Slow acid slug. Rages when hurt — his super is a speed frenzy.",
    range: 430,
    speed: 225,
    health: 5200,
    damage: 820,
    gadgets: ["Acid Puddle", "Caustic Shell"],
  },
  sam: {
    id: "sam",
    name: "Sam",
    emoji: "👴",
    radius: 23,
    accent: "#ff8a65",
    blurb: "Grumpy chainsaw bruiser. Tiny range, big bite; charges in on super.",
    range: 230,
    speed: 300,
    health: 5000,
    damage: 820,
    gadgets: ["Rev Up", "Oil Slick"],
  },
};

/** The order monsters appear in the lobby picker. */
export const MONSTER_ORDER = [
  "gnash",
  "spit",
  "brute",
  "vex",
  "spike",
  "wisp",
  "ruby",
  "asher",
  "sam",
];

export function lookOf(id: string): MonsterLook {
  return MONSTER_LOOKS[id] ?? MONSTER_LOOKS.gnash;
}
