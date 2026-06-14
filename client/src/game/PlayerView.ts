import Phaser from "phaser";
import type { PlayerSnapshot } from "../net/Network";
import { lookOf } from "./monsters";

/**
 * The on-screen representation of one monster: an emoji body inside a colored
 * ring, with a name tag, a health bar, and an aim pointer.
 *
 * THE KEY IDEA FOR SMOOTH MOVEMENT (interpolation):
 * We keep two positions apart — the DRAWN position (where the body currently
 * is) and the TARGET position (the latest the server told us). The server only
 * sends ~20 updates a second; snapping to each would look choppy. Instead, every
 * frame (~60/sec) we glide the drawn position a little toward the target.
 */
export class PlayerView {
  /** The body the camera follows for the local player. */
  body: Phaser.GameObjects.Arc;
  private emoji: Phaser.GameObjects.Text;
  private label: Phaser.GameObjects.Text;
  private pointer: Phaser.GameObjects.Triangle;
  private healthBg: Phaser.GameObjects.Rectangle;
  private healthFill: Phaser.GameObjects.Rectangle;

  private readonly radius: number;
  private readonly isLocal: boolean;
  private readonly colorNum: number;

  private targetX: number;
  private targetY: number;
  private snap: PlayerSnapshot;

  constructor(scene: Phaser.Scene, player: PlayerSnapshot, isLocal: boolean) {
    this.snap = player;
    this.isLocal = isLocal;
    this.targetX = player.x;
    this.targetY = player.y;

    const look = lookOf(player.monster);
    this.radius = look.radius;
    this.colorNum = Phaser.Display.Color.HexStringToColor(player.color).color;

    // Colored ring (fill faint, stroke bold) so each player is identifiable.
    this.body = scene.add
      .circle(player.x, player.y, this.radius, this.colorNum, 0.22)
      .setStrokeStyle(isLocal ? 4 : 3, this.colorNum, 1)
      .setDepth(2);

    // The monster itself, drawn as a big emoji.
    this.emoji = scene.add
      .text(player.x, player.y, look.emoji, { fontSize: `${Math.round(this.radius * 1.7)}px` })
      .setOrigin(0.5)
      .setDepth(3);

    // A little wedge pointing where the monster is aiming.
    this.pointer = scene.add
      .triangle(player.x, player.y, 0, -6, 0, 6, 14, 0, this.colorNum)
      .setDepth(2);

    // Name tag.
    this.label = scene.add
      .text(player.x, player.y - this.radius - 26, player.name, {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: isLocal ? "#ffffff" : "#d7d7ea",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(4);

    // Health bar (background + fill) floating above the monster.
    const barW = this.radius * 2.4;
    this.healthBg = scene.add
      .rectangle(player.x, player.y - this.radius - 12, barW, 7, 0x000000, 0.55)
      .setDepth(3);
    this.healthFill = scene.add
      .rectangle(player.x - barW / 2, player.y - this.radius - 12, barW, 7, 0x4caf50)
      .setOrigin(0, 0.5)
      .setDepth(4);

    this.applySnap(player);
  }

  /** Remember the newest server state for this player. */
  update(player: PlayerSnapshot): void {
    this.targetX = player.x;
    this.targetY = player.y;
    this.applySnap(player);
  }

  /** Apply the non-positional bits (health, alive, super, facing) immediately. */
  private applySnap(player: PlayerSnapshot): void {
    this.snap = player;

    // Health bar width + color (green -> orange -> red as it drops).
    const frac = player.maxHealth > 0 ? Phaser.Math.Clamp(player.health / player.maxHealth, 0, 1) : 0;
    const barW = this.radius * 2.4;
    this.healthFill.width = barW * frac;
    this.healthFill.fillColor = frac > 0.5 ? 0x4caf50 : frac > 0.25 ? 0xffb300 : 0xe53935;

    // Super-ready monsters get a bright, thick ring so you can see it's charged.
    if (player.alive && player.super >= 1) {
      this.body.setStrokeStyle(5, 0xffffff, 1);
    } else {
      this.body.setStrokeStyle(this.isLocal ? 4 : 3, this.colorNum, 1);
    }

    // Defeated monsters fade to a faint ghost and hide their health bar.
    const dead = !player.alive;
    const alpha = dead ? 0.25 : 1;
    this.body.setAlpha(alpha);
    this.emoji.setAlpha(dead ? 0.35 : 1);
    this.label.setAlpha(dead ? 0.4 : 1);
    this.healthBg.setVisible(!dead);
    this.healthFill.setVisible(!dead);
    this.pointer.setVisible(!dead);
    this.pointer.setRotation(player.facing);
  }

  /**
   * Glide the drawn position toward the target and keep all the bits attached.
   * `smoothing` is in [0, 1]; bigger = snappier, smaller = floatier.
   */
  interpolate(smoothing: number): void {
    const x = Phaser.Math.Linear(this.body.x, this.targetX, smoothing);
    const y = Phaser.Math.Linear(this.body.y, this.targetY, smoothing);
    this.body.setPosition(x, y);
    this.emoji.setPosition(x, y);

    // Aim wedge sits on the rim in the facing direction.
    const f = this.snap.facing;
    this.pointer.setPosition(x + Math.cos(f) * (this.radius + 6), y + Math.sin(f) * (this.radius + 6));

    this.label.setPosition(x, y - this.radius - 26);
    this.healthBg.setPosition(x, y - this.radius - 12);
    this.healthFill.setPosition(x - (this.radius * 2.4) / 2, y - this.radius - 12);
  }

  destroy(): void {
    this.body.destroy();
    this.emoji.destroy();
    this.pointer.destroy();
    this.label.destroy();
    this.healthBg.destroy();
    this.healthFill.destroy();
  }
}
