import { Schema, type } from "@colyseus/schema";

/**
 * One player's state.
 *
 * Only the fields marked with `@type(...)` are SYNCED to every client over the
 * network. The plain fields below them (inputX/inputY) stay on the server only
 * — clients never see another player's raw input, just the resulting position.
 */
export class Player extends Schema {
  // ---- synced to clients ----
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") name = "";
  @type("string") color = "#ffffff";

  // ---- server-only (NOT synced) ----
  /**
   * The latest movement input we received from this player's client, as a
   * vector. Each component is in [-1, 1]: x is left/right, y is up/down.
   * The simulation tick reads this every frame to move the player.
   */
  inputX = 0;
  inputY = 0;
}
