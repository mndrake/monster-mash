import Phaser from "phaser";
import type { CubeSnapshot } from "../net/Network";

/**
 * A power cube sitting in the arena. Walk over it to collect it (the server
 * decides the pickup and removes it). We draw a small glowing diamond that
 * bobs gently so it catches the eye.
 */
export class PowerCubeView {
  private cube: Phaser.GameObjects.Rectangle;
  private glow: Phaser.GameObjects.Arc;
  private baseY: number;
  private t = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, cube: CubeSnapshot) {
    this.baseY = cube.y;
    this.glow = scene.add.circle(cube.x, cube.y, 16, 0x9b5cff, 0.25).setDepth(0);
    this.cube = scene.add
      .rectangle(cube.x, cube.y, 16, 16, 0xb388ff)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setAngle(45)
      .setDepth(1);
  }

  /** Called each frame just to bob — cubes never move position. */
  bob(dt: number): void {
    this.t += dt * 3;
    this.cube.y = this.baseY + Math.sin(this.t) * 3;
    this.cube.setAngle(45 + Math.sin(this.t) * 8);
  }

  destroy(): void {
    this.cube.destroy();
    this.glow.destroy();
  }
}
