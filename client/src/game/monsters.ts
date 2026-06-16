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
  /** The two gadgets the player picks between (mirrors server `gadgets`). */
  gadgets: [GadgetLook, GadgetLook];
}

/**
 * Display info for one gadget in the lobby chooser + the in-game GADGET button.
 * `id` matches the server `GadgetDef.id` (and the icon at
 * `client/public/gadgets/<id>.png`); `desc` is client-only display text, like
 * `blurb` — the server never needs it.
 */
export interface GadgetLook {
  id: string;
  name: string;
  desc: string;
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
    gadgets: [
      { id: "dash", name: "Dash", desc: "Burst forward with a quick speed boost to close or escape." },
      { id: "frenzy", name: "Frenzy", desc: "Your bites heal you (lifesteal) for a few seconds." },
    ],
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
    gadgets: [
      { id: "reload", name: "Reload", desc: "Instantly refill all ammo." },
      { id: "caltrops", name: "Caltrops", desc: "Scatter spikes that slow nearby enemies." },
    ],
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
    gadgets: [
      { id: "shield", name: "Shield", desc: "Brace: take greatly reduced damage for ~2.5s." },
      { id: "slam", name: "Slam", desc: "Pound the ground — damage + knock back nearby enemies." },
    ],
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
    gadgets: [
      { id: "reload", name: "Reload", desc: "Instantly refill all ammo." },
      { id: "adrenaline", name: "Adrenaline", desc: "A surge of speed to reposition the sniper." },
    ],
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
    gadgets: [
      { id: "thorns", name: "Thorns", desc: "Erupt a ring of thorns — damage + slow nearby enemies." },
      { id: "roll", name: "Roll", desc: "Evasive roll: a quick burst of speed." },
    ],
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
    gadgets: [
      { id: "blink", name: "Blink", desc: "Dash a short distance almost instantly." },
      { id: "haste", name: "Haste", desc: "Sustained speed boost for hit-and-run." },
    ],
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
    gadgets: [
      { id: "bloom", name: "Bloom", desc: "Sprout a plant that heals you over a moment." },
      { id: "thornburst", name: "Thornburst", desc: "Lash vines around you — slow + hurt nearby foes." },
    ],
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
    gadgets: [
      { id: "acidpuddle", name: "Acid Puddle", desc: "Spew acid underfoot — slow + burn nearby enemies." },
      { id: "caustic", name: "Caustic Shell", desc: "Harden your shell to briefly reduce incoming damage." },
    ],
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
    gadgets: [
      { id: "revup", name: "Rev Up", desc: "Rev the chainsaw: gain lifesteal and a speed boost." },
      { id: "oilslick", name: "Oil Slick", desc: "Drop a slick that slows anyone who steps in it." },
    ],
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
