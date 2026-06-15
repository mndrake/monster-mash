import { Schema, type } from "@colyseus/schema";

/**
 * One player's state (a monster in the arena).
 *
 * Only the fields marked with `@type(...)` are SYNCED to every client over the
 * network. The plain fields below them stay on the server only — clients never
 * see another player's raw input or internal timers, just the visible results
 * (position, health, ammo, etc.).
 */
export class Player extends Schema {
  // ---- identity (synced) ----
  @type("string") name = "";
  @type("string") color = "#ffffff";
  /** Which monster this player chose: "gnash" | "spit" | "brute". */
  @type("string") monster = "gnash";

  // ---- body (synced) ----
  @type("number") x = 0;
  @type("number") y = 0;
  /** Facing angle in radians (where the monster is aiming). For rendering. */
  @type("number") facing = 0;

  // ---- combat (synced) ----
  @type("number") health = 0;
  @type("number") maxHealth = 0;
  /** Ammo as a float in [0, ammoMax]; the client draws partial bars from it. */
  @type("number") ammo = 0;
  @type("number") ammoMax = 3;
  /** Super meter in [0, 1]; 1 means the super is ready to fire. */
  @type("number") super = 0;
  /** Power cubes collected this round (raises health + damage). */
  @type("number") cubes = 0;
  /** False once defeated — the client draws them as a faded ghost / spectator. */
  @type("boolean") alive = true;

  /**
   * True when this monster is hidden in a bush (standing in one and not having
   * fired or taken damage recently). Other clients dim them; the local client
   * always shows itself. Gameplay truth, so it lives on the server.
   */
  @type("boolean") hidden = false;

  // ---- round results (synced, for the end-of-round banner) ----
  /** Final placement once defeated (1 = winner). 0 while still alive. */
  @type("number") rank = 0;
  /** How many other monsters this player defeated this round. */
  @type("number") kills = 0;

  // ---- session totals (synced, for the waiting-room leaderboard) ----
  // These persist across rounds for the whole session — respawn() must NOT
  // reset them (unlike the per-round `kills`/`rank` above).
  /** Rounds won this session (placed 1st). */
  @type("number") wins = 0;
  /** Total monsters defeated across all rounds this session. */
  @type("number") totalKills = 0;

  // ---- server-only (NOT synced) ----
  /** Latest movement input vector, each component in [-1, 1]. */
  inputX = 0;
  inputY = 0;
  /** Latest aim direction (normalized). Defaults to facing when zero. */
  aimX = 1;
  aimY = 0;
  /** Pending action requests, consumed by the tick. */
  wantFire = false;
  wantSuper = false;
  fireDirX = 0;
  fireDirY = 0;
  superDirX = 0;
  superDirY = 0;
  /** Timestamps (server clock, ms) used for cadence + regen. */
  lastFireAt = -100000;
  lastDamageAt = -100000;
}
