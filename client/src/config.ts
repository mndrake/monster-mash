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
 * How quickly a sprite glides toward the latest position the server sent.
 *   0 = never moves, 1 = snaps instantly (looks jittery).
 * This is our interpolation: instead of teleporting to each new server
 * position, sprites ease toward it a little each frame.
 */
export const INTERPOLATION_SMOOTHING = 0.25;

/** Projectiles are fast, so they chase their target a bit harder than players. */
export const PROJECTILE_SMOOTHING = 0.5;

/** How often (ms) the client re-sends its aim direction while it's changing. */
export const AIM_SEND_INTERVAL = 80;

/** On desktop, how often (ms) a held fire button repeats. */
export const FIRE_REPEAT_INTERVAL = 110;
