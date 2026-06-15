/**
 * Standalone assertions for the collision geometry. No test runner is wired up,
 * so this is a plain script: run with `npx tsx src/geom.test.ts` from the server
 * workspace. It exits non-zero on the first failure.
 */

import { pointInRect, circleRectOverlap, resolveMove, segmentRectHit } from "./geom";
import type { Rect } from "./config";

let failures = 0;
function ok(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    console.error(`FAIL  ${msg}`);
    failures++;
  }
}
function near(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

// A single wall to test against: the N choke A9 from "Crossroads".
const wall: Rect = { x: 900, y: 560, w: 200, h: 80 }; // x 900..1100, y 560..640

console.log("pointInRect");
ok(pointInRect(1000, 600, wall), "center is inside");
ok(!pointInRect(1000, 700, wall), "below is outside");
ok(pointInRect(1110, 600, wall, 20), "just outside is inside with pad 20");

console.log("circleRectOverlap");
ok(circleRectOverlap(1000, 650, 28, wall), "circle just below face overlaps (within radius)");
ok(!circleRectOverlap(1000, 680, 28, wall), "circle far below does not overlap");
ok(circleRectOverlap(890, 600, 20, wall), "circle left of face overlaps within radius");
ok(!circleRectOverlap(870, 600, 20, wall), "circle far left does not overlap");

console.log("resolveMove (player slides / stops at wall, radius 22)");
const W = 2000, H = 2000, r = 22, walls = [wall];
// Approaching the wall's top face from above, moving down: should stop at y = 560 - r.
let m = resolveMove(1000, 500, 0, 100, r, W, H, walls);
ok(near(m.y, wall.y - r), `stops above top face (y=${m.y}, want ${wall.y - r})`);
ok(near(m.x, 1000), "x unchanged when only moving on y");
// Moving diagonally into the top face: y blocked, x still slides.
m = resolveMove(1000, 500, 60, 100, r, W, H, walls);
ok(near(m.y, wall.y - r), `diagonal: y still stops at face (y=${m.y})`);
ok(m.x > 1000, `diagonal: x slides along the face (x=${m.x})`);
// Far from any wall: free movement, just clamped to arena.
m = resolveMove(200, 200, 30, 0, r, W, H, walls);
ok(near(m.x, 230) && near(m.y, 200), "free move when clear of walls");
// Arena edge clamp still works.
m = resolveMove(30, 1000, -100, 0, r, W, H, walls);
ok(near(m.x, r), "clamped to left arena edge");

console.log("segmentRectHit (projectile sweep vs wall)");
// A shot crossing the wall top-to-bottom should hit, entering at the top face.
let t = segmentRectHit(1000, 500, 1000, 700, wall);
ok(t !== null && near(t!, (560 - 500) / 200), `vertical shot hits top face (t=${t})`);
// A shot passing well to the side misses.
t = segmentRectHit(700, 500, 700, 700, wall);
ok(t === null, "shot to the left of the wall misses");
// A fast shot that would tunnel past in one step is still caught (segment, not point).
t = segmentRectHit(1000, 400, 1000, 900, wall);
ok(t !== null, "fast shot spanning the whole wall is caught (no tunnelling)");
// Radius padding: a fat shot grazing just outside the face still connects.
t = segmentRectHit(1115, 400, 1115, 900, wall, 20);
ok(t !== null, "fat shot within pad of the right face connects");
t = segmentRectHit(1130, 400, 1130, 900, wall, 20);
ok(t === null, "shot beyond pad of the face misses");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nall geometry assertions passed");
