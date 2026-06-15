/**
 * Client-side settings. Note how little is here: the SERVER is the source of
 * truth for arena size, monster stats, health, and damage, so the client
 * doesn't duplicate them. We mostly just need to know where the server is and
 * how to draw smoothly.
 */

/** The port the Colyseus server listens on (see server/src/config.ts). */
const SERVER_PORT = 2567;

/**
 * Where to reach the game server.
 *
 * By default we talk to the SAME host that served this web page, on the
 * server's port. So if you open the game on a phone at
 *   http://192.168.1.50:5173
 * it automatically connects to
 *   ws://192.168.1.50:2567
 * with no editing required. You can override this with a VITE_SERVER_URL env
 * var if you ever run the server somewhere else.
 */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:${SERVER_PORT}`;

/** The room type name registered on the server. */
export const ROOM_NAME = "match";

/**
 * Interpolation rates (per SECOND), used as `t = 1 - exp(-rate * dt)` so the
 * smoothing is framerate-independent (the old per-frame lerp moved faster at
 * higher frame rates). Bigger = snappier / tracks the server more tightly;
 * smaller = floatier.
 *
 * Your OWN monster tracks harder so it feels responsive; other players stay a
 * touch floatier to hide the small jitter between server updates.
 */
export const LOCAL_LERP_RATE = 30;
export const REMOTE_LERP_RATE = 16;

/** Projectiles are fast, so they chase their target hardest. */
export const PROJECTILE_LERP_RATE = 45;

/** How tightly the camera follows your monster (Phaser follow lerp, per frame). */
export const CAMERA_FOLLOW_LERP = 0.25;

/** How often (ms) the client re-sends its aim direction while it's changing. */
export const AIM_SEND_INTERVAL = 80;

/** On desktop, how often (ms) a held fire button repeats. */
export const FIRE_REPEAT_INTERVAL = 110;

/**
 * How long to wait for the server connection before giving up. A blocked port
 * makes the connection HANG (no error) rather than fail fast, so we surface our
 * own timeout instead of leaving the player on a blank screen.
 */
export const CONNECT_TIMEOUT_MS = 9000;
