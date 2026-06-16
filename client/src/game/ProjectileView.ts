import Phaser from "phaser";
import type { ProjectileSnapshot } from "../net/Network";

/**
 * A shot in flight. The server owns the physics — we glide the body toward the
 * latest position it reports (interpolation), the same trick the players use, so
 * fast shots don't look choppy at 30 ticks/sec.
 *
 * Each brawler gets a THEMED procedural shape (a leaf, an acid droplet, a sniper
 * bolt, a boulder…) drawn from `ownerMonster`, so a shot reads at a glance. The
 * shape carries the brawler identity; the fill keeps the owner's COLOR so you can
 * still tell whose shot it is. Shapes that benefit are oriented to their travel
 * direction (bolt, fang, droplet) or spun as they fly (leaf, boulder, tooth).
 */

/** Build the themed body for one projectile. Returns whether it orients/spins. */
function makeBody(
  scene: Phaser.Scene,
  proj: ProjectileSnapshot,
  color: number,
): { body: Phaser.GameObjects.Shape; oriented: boolean; spin: number } {
  const r = proj.radius;
  const x = proj.x;
  const y = proj.y;
  switch (proj.ownerMonster) {
    case "vex": // thin bright sniper bolt — points where it flies
      return { body: scene.add.rectangle(x, y, r * 4.6, r * 0.85, color), oriented: true, spin: 0 };
    case "asher": // acid droplet — elongated, points forward
      return { body: scene.add.ellipse(x, y, r * 2.5, r * 1.5, color), oriented: true, spin: 0 };
    case "gnash": // snapping fang — a sharp dart
      return {
        body: scene.add.triangle(x, y, -r, -r * 0.9, -r, r * 0.9, r * 1.9, 0, color),
        oriented: true,
        spin: 0,
      };
    case "ruby": // spinning leaf
      return { body: scene.add.ellipse(x, y, r * 2.6, r * 1.35, color), oriented: false, spin: 0.06 };
    case "sam": // chainsaw tooth / spark shard — spins fast
      return { body: scene.add.star(x, y, 3, r * 0.7, r * 1.7, color), oriented: false, spin: 0.11 };
    case "brute": // boulder — chunky, slow tumble
      return { body: scene.add.star(x, y, 6, r * 1.0, r * 1.3, color), oriented: false, spin: 0.025 };
    case "spike": // spiky pellet
      return { body: scene.add.star(x, y, 6, r * 0.55, r * 1.45, color), oriented: false, spin: 0.05 };
    case "wisp": // glowing mote — a tight bright dot (extra glow added below)
      return { body: scene.add.circle(x, y, r * 0.95, color), oriented: false, spin: 0 };
    case "spit": // slime glob — a plain round blob
    default:
      return { body: scene.add.circle(x, y, r, color), oriented: false, spin: 0 };
  }
}

export class ProjectileView {
  private body: Phaser.GameObjects.Shape;
  /** Additive halo behind the body so shots glow and pop off the grass. */
  private glow: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;
  /** Whether to face travel direction, and how much to spin per unit moved. */
  private readonly oriented: boolean;
  private readonly spin: number;
  private angle = 0;

  constructor(scene: Phaser.Scene, proj: ProjectileSnapshot) {
    this.targetX = proj.x;
    this.targetY = proj.y;
    const color = Phaser.Display.Color.HexStringToColor(proj.color).color;
    const big = proj.kind === "super";

    // Wisp's mote glows extra; everything else gets the standard halo.
    const glowScale = (big ? 2.6 : 2.1) * (proj.ownerMonster === "wisp" ? 1.35 : 1);
    this.glow = scene.add
      .circle(proj.x, proj.y, proj.radius * glowScale, color, 0.45)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(5);

    const made = makeBody(scene, proj, color);
    this.body = made.body
      // Supers get a bright thick white outline so they read as the "big" attack.
      .setStrokeStyle(big ? 3 : 2, 0xffffff, big ? 0.95 : 0.6)
      .setDepth(6);
    this.oriented = made.oriented;
    this.spin = made.spin;
  }

  setTarget(proj: ProjectileSnapshot): void {
    this.targetX = proj.x;
    this.targetY = proj.y;
  }

  interpolate(smoothing: number): void {
    const px = this.body.x;
    const py = this.body.y;
    const x = Phaser.Math.Linear(px, this.targetX, smoothing);
    const y = Phaser.Math.Linear(py, this.targetY, smoothing);
    const dx = x - px;
    const dy = y - py;
    this.body.setPosition(x, y);
    this.glow.setPosition(x, y);

    const dist = Math.hypot(dx, dy);
    if (this.oriented) {
      // Face travel direction; keep the last angle when momentarily still.
      if (dist > 0.05) this.angle = Math.atan2(dy, dx);
      this.body.setRotation(this.angle);
    } else if (this.spin) {
      this.angle += this.spin * dist;
      this.body.setRotation(this.angle);
    }
  }

  destroy(): void {
    this.body.destroy();
    this.glow.destroy();
  }
}
