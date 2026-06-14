import Phaser from "phaser";
import type { ProjectileSnapshot } from "../net/Network";

/**
 * A shot in flight: just a glowing colored dot. The server owns the physics —
 * we glide the dot toward the latest position it reports (interpolation), the
 * same trick the players use, so fast shots don't look choppy at 20 ticks/sec.
 */
export class ProjectileView {
  private dot: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, proj: ProjectileSnapshot) {
    this.targetX = proj.x;
    this.targetY = proj.y;
    const color = Phaser.Display.Color.HexStringToColor(proj.color).color;
    this.dot = scene.add
      .circle(proj.x, proj.y, proj.radius, color, 1)
      // Supers get a bright white outline so they read as the "big" attack.
      .setStrokeStyle(proj.kind === "super" ? 3 : 2, 0xffffff, proj.kind === "super" ? 0.9 : 0.5)
      .setDepth(6);
  }

  setTarget(proj: ProjectileSnapshot): void {
    this.targetX = proj.x;
    this.targetY = proj.y;
  }

  interpolate(smoothing: number): void {
    this.dot.setPosition(
      Phaser.Math.Linear(this.dot.x, this.targetX, smoothing),
      Phaser.Math.Linear(this.dot.y, this.targetY, smoothing),
    );
  }

  destroy(): void {
    this.dot.destroy();
  }
}
