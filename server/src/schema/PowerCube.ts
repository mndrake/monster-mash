import { Schema, type } from "@colyseus/schema";

/**
 * A power cube sitting in the arena. Walk over one to collect it: your max
 * health and damage go up a little (see CUBE_*_BONUS in config). Defeated
 * monsters drop their cubes where they fall, so a big lead can be looted.
 *
 * Only position is synced — the client draws a glowing cube at (x, y).
 */
export class PowerCube extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
}
