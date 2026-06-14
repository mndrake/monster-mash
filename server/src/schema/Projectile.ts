import { Schema, type } from "@colyseus/schema";

/**
 * One shot in flight (a bite, a glob of spit, a thrown boulder...).
 *
 * The server owns all the physics: it moves projectiles every tick, checks who
 * they hit, and deletes them when they expire. Clients just draw a little
 * colored circle wherever the server says — the synced fields below are exactly
 * what's needed for that, nothing more.
 */
export class Projectile extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  /** Drawn radius (also the hit radius). */
  @type("number") radius = 8;
  /** Color (matches the owner's color so you can tell whose shot it is). */
  @type("string") color = "#ffffff";
  /** "main" or "super" — lets the client make supers look beefier. */
  @type("string") kind = "main";

  // ---- server-only (NOT synced) ----
  /** sessionId of the monster that fired this — it can't hit its owner. */
  ownerId = "";
  /** Velocity in world units / second. */
  vx = 0;
  vy = 0;
  /** Damage dealt on hit (already includes the owner's cube bonus). */
  damage = 0;
  /** Seconds of life left before it fizzles (derived from range / speed). */
  life = 1;
}
