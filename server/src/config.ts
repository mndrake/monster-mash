/**
 * Tweakable knobs for the match simulation.
 *
 * The SERVER is the single source of truth, so these values live here. The
 * arena size is also copied into the synced state (see MatchState) so the
 * client can read it instead of hard-coding its own copy.
 */

/** How many times per second the server simulates the world (the "tick"). */
export const TICK_RATE = 20;

/** Arena size in world units. We treat 1 world unit = 1 pixel on the client. */
export const ARENA_WIDTH = 1600;
export const ARENA_HEIGHT = 1200;

/** How fast a player moves, in world units per second. */
export const PLAYER_SPEED = 320;

/** Safety cap on how many players share one arena. */
export const MAX_PLAYERS = 16;

/** TCP port the game server listens on. */
export const PORT = Number(process.env.PORT) || 2567;

/**
 * Distinct, friendly colors handed out to players in join order so everyone
 * can tell each other apart. (Hex strings; the client parses them.)
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
];
