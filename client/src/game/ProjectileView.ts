import Phaser from "phaser";
import type { ProjectileSnapshot } from "../net/Network";

/**
 * A shot in flight: just a glowing colored dot. The server owns the physics —
 * we glide the dot toward the latest position it reports (interpolation), the
 * same trick the players use, so fast shots don't look choppy at 20 ticks/sec.
 */
export class ProjectileView {
  private dot: Phaser.GameObjects.Arc;
  /** Additive halo behind the dot so shots glow and pop off the grass. */
  private glow: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, proj: ProjectileSnapshot) {
    this.targetX = proj.x;
    this.targetY = proj.y;
    const color = Phaser.Display.Color.HexStringToColor(proj.color).color;

    this.glow = scene.add
      .circle(proj.x, proj.y, proj.radius * (proj.kind === "super" ? 2.6 : 2.1), color, 0.45)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(5);

    this.dot = scene.add
      .circle(proj.x, proj.y, proj.radius, color, 1)
      // Supers get a bright white outline so they read as the "big" attack.
      .setStrokeStyle(proj.kind === "super" ? 3 : 2, 0xffffff, proj.kind === "super" ? 0.95 : 0.6)
      .setDepth(6);
  }

  setTarget(proj: ProjectileSnapshot): void {
    this.targetX = proj.x;
    this.targetY = proj.y;
  }

  interpolate(smoothing: number): void {
    const x = Phaser.Math.Linear(this.dot.x, this.targetX, smoothing);
    const y = Phaser.Math.Linear(this.dot.y, this.targetY, smoothing);
    this.dot.setPosition(x, y);
    this.glow.setPosition(x, y);
  }

  destroy(): void {
    this.dot.destroy();
    this.glow.destroy();
  }
}
