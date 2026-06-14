import { Schema, type, MapSchema } from "@colyseus/schema";
import { Player } from "./Player";

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

  /** Every player currently in the match, keyed by their Colyseus sessionId. */
  @type({ map: Player }) players = new MapSchema<Player>();
}
