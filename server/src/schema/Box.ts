import { Schema, type } from "@colyseus/schema";

/**
 * A breakable box (a power-cube crate). Unlike the static walls/bushes baked
 * into a MAP, boxes are DYNAMIC: they take damage and disappear, so they're
 * synced as entities. While alive a box blocks movement and shots like a wall;
 * when its health hits zero the server removes it and drops power cubes.
 *
 * `hp`/`maxHp` are synced so the client can crack the crate as it's whittled
 * down. Size is square (w === h) but kept as both for a uniform AABB shape.
 */
export class Box extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") w = 0;
  @type("number") h = 0;
  @type("number") hp = 0;
  @type("number") maxHp = 0;
}
