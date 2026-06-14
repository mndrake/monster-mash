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
