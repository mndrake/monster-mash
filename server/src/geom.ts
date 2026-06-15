/**
 * Pure collision geometry for the static terrain (Milestone 3).
 *
 * These functions have no game state — they take plain numbers and rects — so
 * they're easy to reason about and to test in isolation (see geom.test.ts). The
 * authoritative simulation in MatchRoom.ts calls them for player movement,
 * projectile sweeps, and bush/cube placement.
 */

import type { Rect } from "./config";

/** Keep a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Is the point (x, y) inside the rect, grown by `pad` on every side? */
export function pointInRect(x: number, y: number, rect: Rect, pad = 0): boolean {
  return (
    x >= rect.x - pad &&
    x <= rect.x + rect.w + pad &&
    y >= rect.y - pad &&
    y <= rect.y + rect.h + pad
  );
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
 * resolving against walls ONE AXIS AT A TIME so it slides along a wall face
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
  // X axis first, against the current y.
  let nx = clamp(x + mx, r, width - r);
  for (const w of walls) {
    if (circleRectOverlap(nx, y, r, w)) {
      nx = mx > 0 ? w.x - r : w.x + w.w + r;
    }
  }
  // Then Y axis, against the already-resolved x.
  let ny = clamp(y + my, r, height - r);
  for (const w of walls) {
    if (circleRectOverlap(nx, ny, r, w)) {
      ny = my > 0 ? w.y - r : w.y + w.h + r;
    }
  }
  return { x: nx, y: ny };
}

/**
 * Swept segment (x0,y0)->(x1,y1) vs an axis-aligned rect grown by `pad` (e.g. a
 * shot's radius). Returns the entry fraction t in [0,1] of the first contact, or
 * null if the segment misses. Classic slab clip — this is what stops fast supers
 * from tunnelling through thin choke walls in a single tick.
 */
export function segmentRectHit(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: Rect,
  pad = 0,
): number | null {
  const minX = rect.x - pad;
  const minY = rect.y - pad;
  const maxX = rect.x + rect.w + pad;
  const maxY = rect.y + rect.h + pad;
  const dx = x1 - x0;
  const dy = y1 - y0;

  let tmin = 0;
  let tmax = 1;

  // X slab.
  if (dx === 0) {
    if (x0 < minX || x0 > maxX) return null;
  } else {
    let t1 = (minX - x0) / dx;
    let t2 = (maxX - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  // Y slab.
  if (dy === 0) {
    if (y0 < minY || y0 > maxY) return null;
  } else {
    let t1 = (minY - y0) / dy;
    let t2 = (maxY - y0) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  return tmin <= tmax ? tmin : null;
}
