import Phaser from "phaser";
import { PLAYER_RADIUS } from "../config";

/**
 * The on-screen representation of one player: a colored circle with a name tag.
 *
 * THE KEY IDEA FOR SMOOTH MOVEMENT (interpolation):
 * We keep two positions apart —
 *   - the DRAWN position (where the circle currently is on screen), and
 *   - the TARGET position (the latest position the server told us about).
 * The server only sends updates ~20 times a second, which would look choppy if
 * we snapped straight to each one. Instead, every frame (~60 times a second) we
 * glide the drawn position a little closer to the target. That smooth gliding
 * is the interpolation — no teleporting, no jitter.
 */
export class PlayerView {
  body: Phaser.GameObjects.Arc;
  private label: Phaser.GameObjects.Text;
  private targetX: number;
  private targetY: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    color: string,
    name: string,
    isLocal: boolean,
  ) {
    // Start the target where the player first appears.
    this.targetX = x;
    this.targetY = y;

    const colorNumber = Phaser.Display.Color.HexStringToColor(color).color;
    this.body = scene.add.circle(x, y, PLAYER_RADIUS, colorNumber);

    // Outline our own player more boldly so it's easy to find yourself.
    if (isLocal) {
      this.body.setStrokeStyle(4, 0xffffff, 1);
    } else {
      this.body.setStrokeStyle(2, 0x000000, 0.4);
    }

    this.label = scene.add
      .text(x, y - PLAYER_RADIUS - 14, name, {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }

  /** Remember the newest position the server sent for this player. */
  setTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  /**
   * Glide the drawn position toward the target. Called every frame.
   * `smoothing` is in [0, 1]; bigger = snappier, smaller = floatier.
   */
  interpolate(smoothing: number): void {
    this.body.x = Phaser.Math.Linear(this.body.x, this.targetX, smoothing);
    this.body.y = Phaser.Math.Linear(this.body.y, this.targetY, smoothing);
    // Keep the name tag floating above the circle.
    this.label.setPosition(this.body.x, this.body.y - PLAYER_RADIUS - 14);
  }

  destroy(): void {
    this.body.destroy();
    this.label.destroy();
  }
}
