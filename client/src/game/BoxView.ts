import Phaser from "phaser";
import type { BoxSnapshot } from "../net/Network";

/**
 * A breakable box (power-cube crate). Drawn as a small raised wooden crate with
 * a glowing cube emblem on top, plus a crack overlay that deepens as the box
 * takes damage. The server owns its health and decides when it breaks; this is
 * just the picture. Boxes never move, so we only redraw when health changes.
 */
export class BoxView {
  private g: Phaser.GameObjects.Graphics;
  private emblem: Phaser.GameObjects.Rectangle;
  private maxHp: number;
  private cx: number;
  private cy: number;
  /** Pre-rolled crack segments, revealed progressively as the box is damaged. */
  private cracks: { x1: number; y1: number; x2: number; y2: number }[] = [];

  /** World-space center of the box (used for the break burst). */
  get center(): { x: number; y: number } {
    return { x: this.cx, y: this.cy };
  }

  constructor(scene: Phaser.Scene, box: BoxSnapshot) {
    this.maxHp = box.maxHp || 1;
    this.g = scene.add.graphics().setDepth(-11);

    // Pre-roll crack lines (deterministic-ish per box; they never move).
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    this.cx = cx;
    this.cy = cy;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const len = box.w * (0.2 + Math.random() * 0.3);
      this.cracks.push({
        x1: cx + Math.cos(a) * len * -0.4,
        y1: cy + Math.sin(a) * len * -0.4,
        x2: cx + Math.cos(a) * len * 0.6,
        y2: cy + Math.sin(a) * len * 0.6,
      });
    }

    // A glowing cube emblem on top — signals there's a power cube inside.
    this.emblem = scene.add
      .rectangle(cx, cy, box.w * 0.32, box.w * 0.32, 0x7be0ff)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setAngle(45)
      .setDepth(-10);

    this.draw(box);
  }

  update(box: BoxSnapshot): void {
    this.draw(box);
  }

  /** Repaint the crate + the crack overlay for the current health. */
  private draw(box: BoxSnapshot): void {
    const { x, y, w, h } = box;
    const r = 9;
    const e = 12; // extrusion toward the camera
    const g = this.g;
    g.clear();

    // Drop shadow.
    g.fillStyle(0x07140a, 0.28);
    g.fillRoundedRect(x + 8, y + e + 6, w, h, r);
    // Side face (extruded down).
    g.fillStyle(0x6b4a2a, 1);
    g.fillRoundedRect(x, y, w, h + e, r);
    // Lit top face.
    g.fillStyle(0xb5783c, 1);
    g.fillRoundedRect(x, y, w, h, r);
    // Plank bands.
    g.lineStyle(2, 0x8a5a2a, 0.9);
    g.lineBetween(x + 6, y + h / 2, x + w - 6, y + h / 2);
    // Outlines.
    g.lineStyle(3, 0x3a2614, 0.95);
    g.strokeRoundedRect(x, y, w, h + e, r);
    g.lineStyle(2, 0x3a2614, 0.5);
    g.strokeRoundedRect(x, y, w, h, r);

    // Cracks: reveal more of the pre-rolled set as health drops.
    const frac = Phaser.Math.Clamp(box.hp / this.maxHp, 0, 1);
    const shown = Math.floor((1 - frac) * this.cracks.length);
    g.lineStyle(2.5, 0x2a1a0c, 0.85);
    for (let i = 0; i < shown; i++) {
      const c = this.cracks[i];
      g.lineBetween(c.x1, c.y1, c.x2, c.y2);
    }
  }

  destroy(): void {
    this.g.destroy();
    this.emblem.destroy();
  }
}
