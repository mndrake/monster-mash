import Phaser from "phaser";
import type { CubeSnapshot } from "../net/Network";

/**
 * A power cube sitting in the arena. Walk over it to collect it (the server
 * decides the pickup and removes it). We draw a bright glowing cube that bobs
 * and pulses so it reads as loot worth chasing across the grass.
 */
export class PowerCubeView {
  private cube: Phaser.GameObjects.Rectangle;
  private glow: Phaser.GameObjects.Arc;
  private shadow: Phaser.GameObjects.Ellipse;
  private baseY: number;
  private t = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, cube: CubeSnapshot) {
    this.baseY = cube.y;
    this.shadow = scene.add.ellipse(cube.x, cube.y + 12, 26, 11, 0x07140a, 0.3).setDepth(0);
    this.glow = scene.add
      .circle(cube.x, cube.y, 22, 0x4dd0ff, 0.4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(0);
    this.cube = scene.add
      .rectangle(cube.x, cube.y, 18, 18, 0x7be0ff)
      .setStrokeStyle(2.5, 0xffffff, 0.95)
      .setAngle(45)
      .setDepth(1);
  }

  /** Called each frame to bob + pulse — cubes never change position. */
  bob(dt: number): void {
    this.t += dt * 3;
    this.cube.y = this.baseY + Math.sin(this.t) * 3;
    this.cube.setAngle(45 + Math.sin(this.t) * 8);
    // Breathing glow.
    const pulse = 0.4 + (Math.sin(this.t * 1.4) + 1) * 0.18;
    this.glow.setAlpha(pulse);
    this.glow.setScale(1 + (Math.sin(this.t * 1.4) + 1) * 0.07);
  }

  destroy(): void {
    this.cube.destroy();
    this.glow.destroy();
    this.shadow.destroy();
  }
}
