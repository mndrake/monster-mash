import { Schema, type, MapSchema } from "@colyseus/schema";
import { Player } from "./Player";
import { Projectile } from "./Projectile";
import { PowerCube } from "./PowerCube";
import { Box } from "./Box";

/**
 * The whole shared state of one match. Colyseus automatically sends the
 * *changes* to this object to every connected client after each tick, so the
 * client can mirror it on screen.
 */
export class MatchState extends Schema {
  /**
   * Arena size in world units. The client reads these instead of hard-coding
   * them, which keeps the server as the single source of truth for the map.
   */
  @type("number") width = 0;
  @type("number") height = 0;

  /** The room code players typed to join (handy to display in the client). */
  @type("string") roomCode = "";

  /**
   * Which static terrain layout this room uses (see MAPS in config). Sent once
   * so the client can look up the same walls/bushes table and draw them.
   */
  @type("string") mapId = "";

  // ---- match flow ----
  /** "lobby" | "countdown" | "playing" | "roundover" (see PHASE in config). */
  @type("string") phase = "lobby";
  /**
   * sessionId of the host — the player who may start the round from the waiting
   * room. Set to the first player to join; reassigned to the oldest remaining
   * player if the host leaves; "" when the room is empty.
   */
  @type("string") hostId = "";
  /** Milliseconds left in the current phase (countdown / round-over banner). */
  @type("number") phaseTimeLeft = 0;
  /** How many monsters are still alive (drives the "X left" HUD). */
  @type("number") aliveCount = 0;
  /** Name of the last round's winner, shown on the round-over banner. */
  @type("string") winnerName = "";

  // ---- the closing poison zone (a shrinking safe rectangle) ----
  /** The safe rectangle's bounds in world units. Outside it = poison. */
  @type("number") safeMinX = 0;
  @type("number") safeMinY = 0;
  @type("number") safeMaxX = 0;
  @type("number") safeMaxY = 0;

  // ---- entities ----
  /** Every player currently in the match, keyed by their Colyseus sessionId. */
  @type({ map: Player }) players = new MapSchema<Player>();
  /** Live shots, keyed by a server-assigned id. */
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  /** Collectible power cubes, keyed by a server-assigned id. */
  @type({ map: PowerCube }) cubes = new MapSchema<PowerCube>();
  /** Breakable boxes (drop cubes when destroyed), keyed by a server id. */
  @type({ map: Box }) boxes = new MapSchema<Box>();
}
