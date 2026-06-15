import type { Rect } from "./maps";

/**
 * Client-side collision — a DELIBERATE mirror of the pure parts of the server's
 * `server/src/geom.ts`, used only for LOCAL-PLAYER MOVEMENT PREDICTION so your
 * own monster can move the instant you press a direction (instead of waiting a
 * network round-trip) while still sliding along the same walls/boxes the server
 * enforces. The server stays authoritative; this just has to agree with it, so
 * keep these in sync with `geom.ts`.
 */

/** Keep a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Does a circle (center cx,cy, radius r) overlap the rect? */
export function circleRectOverlap(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < r * r;
}

/**
 * Move a circle (center x,y, radius r) by (mx, my) inside [0,width]×[0,height],
 * resolving against obstacles ONE AXIS AT A TIME so it slides along a face
 * instead of sticking. Returns the new center. Pure — no mutation.
 */
export function resolveMove(
  x: number,
  y: number,
  mx: number,
  my: number,
  r: number,
  width: number,
  height: number,
  walls: Rect[],
): { x: number; y: number } {
  let nx = clamp(x + mx, r, width - r);
  for (const w of walls) {
    if (circleRectOverlap(nx, y, r, w)) {
      nx = mx > 0 ? w.x - r : w.x + w.w + r;
    }
  }
  let ny = clamp(y + my, r, height - r);
  for (const w of walls) {
    if (circleRectOverlap(nx, ny, r, w)) {
      ny = my > 0 ? w.y - r : w.y + w.h + r;
    }
  }
  return { x: nx, y: ny };
}
