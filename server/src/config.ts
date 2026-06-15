/**
 * Tweakable knobs for the match simulation.
 *
 * The SERVER is the single source of truth, so these values live here. The
 * arena size is also copied into the synced state (see MatchState) so the
 * client can read it instead of hard-coding its own copy.
 *
 * Milestone 2 turns the shared sandbox into a SHOWDOWN brawler: pick a monster,
 * shoot the others, grab power cubes, and survive the closing poison until you
 * are the last monster standing.
 */

/** How many times per second the server simulates the world (the "tick"). */
export const TICK_RATE = 20;

/** Arena size in world units. We treat 1 world unit = 1 pixel on the client. */
export const ARENA_WIDTH = 2000;
export const ARENA_HEIGHT = 2000;

/** Safety cap on how many players share one arena. */
export const MAX_PLAYERS = 10;

/** TCP port the game server listens on. */
export const PORT = Number(process.env.PORT) || 2567;

// ---------------------------------------------------------------------------
//  Match flow (a continuous series of short Showdown rounds)
// ---------------------------------------------------------------------------

/** Phases a match cycles through. Kept as plain strings for the synced state. */
export const PHASE = {
  COUNTDOWN: "countdown",
  PLAYING: "playing",
  ROUNDOVER: "roundover",
} as const;

/** "3… 2… 1… Brawl!" before a round begins. */
export const COUNTDOWN_MS = 3000;

/** How long the winner banner shows before the next round resets and starts. */
export const ROUNDOVER_MS = 5000;

// ---------------------------------------------------------------------------
//  Health regeneration (Brawl-Stars style: heal if you avoid damage a moment)
// ---------------------------------------------------------------------------

/** You must avoid taking damage this long before health starts regenerating. */
export const REGEN_DELAY_MS = 3500;

/** Fraction of max health regenerated per second once regen kicks in. */
export const REGEN_FRACTION_PER_SEC = 0.09;

// ---------------------------------------------------------------------------
//  Power cubes (collectible buffs scattered around the arena)
// ---------------------------------------------------------------------------

/** How many cubes are scattered when a round starts. */
export const POWER_CUBE_COUNT = 8;

/** Each cube adds this fraction of BASE max-health and base damage. */
export const CUBE_HEALTH_BONUS = 0.1; // +10% max health per cube
export const CUBE_DAMAGE_BONUS = 0.12; // +12% damage per cube

/** A monster picks up a cube when within this distance (world units). */
export const CUBE_PICKUP_RADIUS = 34;

// ---------------------------------------------------------------------------
//  Breakable boxes (Brawl-Stars-style cube crates)
// ---------------------------------------------------------------------------
//
// In Showdown, cubes come from BREAKING BOXES and from kills — not a free
// scatter. Boxes block movement + shots like a wall until destroyed, then drop
// power cubes. They're dynamic (they take damage and vanish), so unlike the
// static MAP walls/bushes they're synced as entities.

/** How many breakable boxes are placed when a round starts. */
export const BOX_COUNT = 10;

/** A box's health. Damage from any shot whittles it down. */
export const BOX_HP = 1600;

/** Box edge length (world units) — square, smaller than the static walls. */
export const BOX_SIZE = 72;

/** How many power cubes a box drops when it breaks. */
export const BOX_CUBES = 1;

// ---------------------------------------------------------------------------
//  Poison zone (the safe area shrinks; standing outside hurts)
// ---------------------------------------------------------------------------

/** Grace period at round start before the safe zone begins to close. */
export const ZONE_GRACE_MS = 9000;

/** How fast each edge of the safe rectangle moves inward (world units/sec). */
export const ZONE_SHRINK_SPEED = 26;

/** The safe rectangle never shrinks smaller than this half-size (world units). */
export const ZONE_MIN_HALF = 180;

/** Poison damage per second when the zone has just begun closing... */
export const POISON_BASE_DPS = 260;

/** ...growing by this much for every second the zone has been closing. */
export const POISON_RAMP_DPS_PER_SEC = 14;

// ---------------------------------------------------------------------------
//  Monsters — three distinct types, the heart of the brawler
// ---------------------------------------------------------------------------

/** Everything the simulation needs to know about one kind of monster. */
export interface MonsterType {
  /** Stable id, also used by the client to pick the right look. */
  id: string;
  /** Friendly display name. */
  name: string;
  /** Accent color the client uses for this monster's projectiles/aim. */
  accent: string;

  // ---- body ----
  maxHealth: number;
  speed: number; // world units / second
  radius: number; // collision radius

  // ---- ammo / cadence ----
  ammoMax: number;
  reloadMs: number; // time to regenerate ONE ammo bar
  attackCooldownMs: number; // minimum spacing between shots

  // ---- main attack (one or more projectiles) ----
  projectileSpeed: number; // world units / second
  projectileRange: number; // units travelled before it fizzles
  projectileRadius: number;
  projectileDamage: number;
  projectileCount: number; // pellets per shot
  spreadDeg: number; // total fan angle for multi-pellet shots

  // ---- super (charges by landing hits) ----
  superChargePerHit: number; // 0..1 added to the super meter per hit landed
  superSpeed: number;
  superRange: number;
  superRadius: number;
  superDamage: number;
  superCount: number;
  superSpreadDeg: number;
  superDashUnits: number; // forward lunge when the super fires (0 = none)
}

/**
 * The three starter monsters. Numbers are on a "thousands of HP" scale like
 * Brawl Stars so the trade-offs read clearly:
 *   - GNASH  : a fast, fragile melee biter — get in, burst, get out.
 *   - SPIT   : a mid-range marksman — three pellets, then a five-pellet fan super.
 *   - BRUTE  : a slow tank — huge health and a heavy, hard-hitting boulder.
 */
export const MONSTERS: MonsterType[] = [
  {
    id: "gnash",
    name: "Gnash",
    accent: "#ff5252",
    maxHealth: 4400,
    speed: 360,
    radius: 22,
    ammoMax: 3,
    reloadMs: 1100,
    attackCooldownMs: 240,
    projectileSpeed: 920,
    projectileRange: 250, // short — it's a melee bite
    projectileRadius: 26,
    projectileDamage: 920,
    projectileCount: 1,
    spreadDeg: 0,
    superChargePerHit: 0.34, // ~3 hits
    superSpeed: 1000,
    superRange: 300,
    superRadius: 32,
    superDamage: 1500,
    superCount: 3,
    superSpreadDeg: 60,
    superDashUnits: 300, // lunge forward on super
  },
  {
    id: "spit",
    name: "Spit",
    accent: "#40c4ff",
    maxHealth: 3000,
    speed: 320,
    radius: 19,
    ammoMax: 3,
    reloadMs: 1500,
    attackCooldownMs: 300,
    projectileSpeed: 720,
    projectileRange: 640,
    projectileRadius: 12,
    projectileDamage: 760,
    projectileCount: 1,
    spreadDeg: 0,
    superChargePerHit: 0.2, // ~5 hits
    superSpeed: 760,
    superRange: 660,
    superRadius: 13,
    superDamage: 600,
    superCount: 5,
    superSpreadDeg: 52,
    superDashUnits: 0,
  },
  {
    id: "brute",
    name: "Brute",
    accent: "#69f0ae",
    maxHealth: 6200,
    speed: 250,
    radius: 28,
    ammoMax: 2,
    reloadMs: 2200,
    attackCooldownMs: 560,
    projectileSpeed: 540,
    projectileRange: 400,
    projectileRadius: 22,
    projectileDamage: 1320,
    projectileCount: 1,
    spreadDeg: 0,
    superChargePerHit: 0.25, // ~4 hits
    superSpeed: 580,
    superRange: 440,
    superRadius: 42,
    superDamage: 2600,
    superCount: 1,
    superSpreadDeg: 0,
    superDashUnits: 0,
  },
];

/** Look one up by id (falls back to the first monster if an id is unknown). */
export function monsterById(id: string): MonsterType {
  return MONSTERS.find((m) => m.id === id) ?? MONSTERS[0];
}

// ---------------------------------------------------------------------------
//  Static terrain (Milestone 3) — walls + bushes
// ---------------------------------------------------------------------------
//
// Walls block BOTH movement and projectiles (hard cover). Bushes are walked
// through; standing in one (and not firing / not recently hit) hides you from
// other players (soft cover / ambush). All geometry is axis-aligned rectangles
// in world units — top-left corner + size — which maps cleanly onto the
// server's collision model (circle-vs-AABB for players, segment-vs-AABB for
// shots). See docs/m3-maps.md for the design rationale and the per-rect checks
// against the endgame core box. Terrain is STATIC, so it is chosen once per
// room and sent to the client via MatchState.mapId (the client holds the same
// table and looks it up — no per-tick sync cost).

/** An axis-aligned rectangle in world units: top-left corner + size. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** One arena layout: its blocking walls, its hiding bushes, suggested cubes. */
export interface GameMap {
  id: string;
  name: string;
  walls: Rect[];
  bushes: Rect[];
  /** Suggested deterministic cube spots (currently unused — spawns are random). */
  cubeAnchors?: Vec2[];
}

/**
 * Firing or taking damage reveals you from a bush for this long (ms). You only
 * count as hidden once you've been quiet AND unhurt for at least this window.
 */
export const BUSH_REVEAL_MS = 1000;

/**
 * The arena layouts. Both are fully specced in docs/m3-maps.md and validated so
 * no wall sits inside the endgame core box ([820,1180]²). "Crossroads" is the
 * default/ranked map; "Fang Hollow" is included for variety but not yet wired.
 */
export const MAPS: GameMap[] = [
  {
    id: "crossroads",
    name: "The Crossroads",
    walls: [
      // Corner L-bunkers (open side faces the plaza).
      { x: 240, y: 240, w: 300, h: 90 }, // A1 TL top arm
      { x: 240, y: 240, w: 90, h: 300 }, // A2 TL side arm
      { x: 1460, y: 240, w: 300, h: 90 }, // A3 TR
      { x: 1670, y: 240, w: 90, h: 300 }, // A4 TR
      { x: 240, y: 1670, w: 300, h: 90 }, // A5 BL
      { x: 240, y: 1460, w: 90, h: 300 }, // A6 BL
      { x: 1460, y: 1670, w: 300, h: 90 }, // A7 BR
      { x: 1670, y: 1460, w: 90, h: 300 }, // A8 BR
      // Pinwheel chokes around the plaza mouths (all outside the core).
      { x: 900, y: 560, w: 200, h: 80 }, // A9 N
      { x: 1360, y: 900, w: 80, h: 200 }, // A10 E
      { x: 900, y: 1360, w: 200, h: 80 }, // A11 S
      { x: 560, y: 900, w: 80, h: 200 }, // A12 W
    ],
    bushes: [
      { x: 820, y: 140, w: 360, h: 180 }, // B1 N edge belt
      { x: 820, y: 1680, w: 360, h: 180 }, // B2 S edge belt
      { x: 140, y: 820, w: 180, h: 360 }, // B3 W edge belt
      { x: 1680, y: 820, w: 180, h: 360 }, // B4 E edge belt
      { x: 620, y: 620, w: 180, h: 180 }, // B5 TL diagonal
      { x: 1200, y: 620, w: 180, h: 180 }, // B6 TR diagonal
      { x: 620, y: 1200, w: 180, h: 180 }, // B7 BL diagonal
      { x: 1200, y: 1200, w: 180, h: 180 }, // B8 BR diagonal
    ],
    cubeAnchors: [
      { x: 450, y: 450 }, { x: 1550, y: 450 }, { x: 450, y: 1550 }, { x: 1550, y: 1550 },
      { x: 1000, y: 400 }, { x: 1000, y: 1600 }, { x: 400, y: 1000 }, { x: 1600, y: 1000 },
    ],
  },
  {
    id: "fanghollow",
    name: "Fang Hollow",
    walls: [
      // Fang 1 (hooks in from the top-left).
      { x: 300, y: 520, w: 90, h: 360 }, // F1 shaft
      { x: 300, y: 520, w: 420, h: 90 }, // F2 top bar
      { x: 630, y: 610, w: 90, h: 300 }, // F3 tooth
      // Fang 2 = Fang 1 rotated 180° about (1000,1000).
      { x: 1610, y: 1120, w: 90, h: 360 }, // F4 shaft
      { x: 1280, y: 1390, w: 420, h: 90 }, // F5 bottom bar
      { x: 1280, y: 1090, w: 90, h: 300 }, // F6 tooth
    ],
    bushes: [
      { x: 360, y: 200, w: 1280, h: 160 }, // G1 top belt
      { x: 360, y: 1640, w: 1280, h: 160 }, // G2 bottom belt
      { x: 760, y: 600, w: 280, h: 160 }, // G3 N-of-core peek
      { x: 960, y: 1240, w: 280, h: 160 }, // G4 S-of-core peek
      { x: 540, y: 940, w: 180, h: 220 }, // G5 west gallery
      { x: 1280, y: 840, w: 180, h: 220 }, // G6 east gallery
    ],
    cubeAnchors: [
      { x: 450, y: 700 }, { x: 450, y: 1000 }, { x: 1550, y: 1000 }, { x: 1550, y: 1300 },
      { x: 900, y: 300 }, { x: 1100, y: 1700 }, { x: 800, y: 1000 }, { x: 1200, y: 1000 },
    ],
  },
];

/** Which layout new rooms use. */
export const DEFAULT_MAP_ID = "crossroads";

/** Look up a layout by id (falls back to the default map if unknown). */
export function mapById(id: string): GameMap {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

/**
 * Distinct, friendly colors handed out to players in join order so everyone
 * can tell each other apart even when two pick the same monster type.
 */
export const PLAYER_COLORS = [
  "#ff5252", // red
  "#40c4ff", // blue
  "#69f0ae", // green
  "#ffd740", // yellow
  "#e040fb", // purple
  "#ff6e40", // orange
  "#18ffff", // cyan
  "#b2ff59", // lime
  "#ff80ab", // pink
  "#eeeeee", // white
];
