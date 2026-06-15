import Phaser from "phaser";
import type { PlayerSnapshot } from "../net/Network";
import { lookOf } from "./monsters";
import { LOCAL_LERP_RATE, REMOTE_LERP_RATE } from "../config";

/** Dark green-black used for the soft contact shadow and the bold outline rim. */
const SHADOW = 0x07140a;
const OUTLINE = 0x14181f;

/**
 * The on-screen representation of one monster: an emoji body in a colored disc
 * with a bold dark rim, sitting on a soft contact shadow, with a name tag, a
 * health bar, and an aim pointer. The emoji hovers/bobs and flashes when hit —
 * the Brawl-Stars-style juice that makes a hit *read*.
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
  private shadow: Phaser.GameObjects.Ellipse;
  private rim: Phaser.GameObjects.Arc;
  private emoji: Phaser.GameObjects.Text;
  private label: Phaser.GameObjects.Text;
  private pointer: Phaser.GameObjects.Triangle;
  private healthBg: Phaser.GameObjects.Rectangle;
  private healthFill: Phaser.GameObjects.Rectangle;
  /** Local player only: the super charge ring + ammo pips, redrawn each frame. */
  private selfHud?: Phaser.GameObjects.Graphics;

  private readonly scene: Phaser.Scene;
  private readonly radius: number;
  private readonly isLocal: boolean;
  private readonly colorNum: number;
  /** A per-monster phase offset so they don't all bob in lock-step. */
  private readonly bobPhase: number;

  private targetX: number;
  private targetY: number;
  private snap: PlayerSnapshot;
  private prevHealth: number;
  private prevAlive: boolean;
  /** Counts down while the hit-flash tint is showing. */
  private flashUntil = 0;

  /** This monster's accent color as a number (for explosions etc.). */
  get tintColor(): number {
    return this.colorNum;
  }

  constructor(scene: Phaser.Scene, player: PlayerSnapshot, isLocal: boolean) {
    this.scene = scene;
    this.snap = player;
    this.isLocal = isLocal;
    this.targetX = player.x;
    this.targetY = player.y;
    this.prevHealth = player.health;
    this.prevAlive = player.alive;
    this.bobPhase = (player.id.charCodeAt(0) || 0) * 0.7;

    const look = lookOf(player.monster);
    this.radius = look.radius;
    this.colorNum = Phaser.Display.Color.HexStringToColor(player.color).color;

    // Soft contact shadow on the ground beneath the monster.
    this.shadow = scene.add
      .ellipse(player.x, player.y + this.radius * 0.62, this.radius * 1.9, this.radius * 0.85, SHADOW, 0.32)
      .setDepth(1);

    // A dark disc just larger than the body gives a clean, bold outline rim.
    this.rim = scene.add.circle(player.x, player.y, this.radius + 4, OUTLINE, 1).setDepth(1);

    // Colored ring (fill faint, stroke bold) so each player is identifiable.
    this.body = scene.add
      .circle(player.x, player.y, this.radius, this.colorNum, 0.3)
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

    // Brawl-Stars-style on-character HUD for your OWN monster: a super charge
    // ring around the body and ammo pips beneath it (enemies don't show these).
    if (isLocal) this.selfHud = scene.add.graphics().setDepth(4);

    this.applySnap(player);
    // Pop in on first appearance (joining alive / round start).
    if (player.alive) this.playSpawnIn();
  }

  /** Quick scale-up "drop in" when a monster (re)spawns. */
  private playSpawnIn(): void {
    for (const obj of [this.shadow, this.rim, this.body, this.emoji]) {
      obj.setScale(0);
      this.scene.tweens.add({ targets: obj, scale: 1, duration: 320, ease: "Back.easeOut" });
    }
  }

  /** Remember the newest server state for this player. */
  update(player: PlayerSnapshot): void {
    this.targetX = player.x;
    this.targetY = player.y;
    this.applySnap(player);
  }

  /** Apply the non-positional bits (health, alive, super, facing) immediately. */
  private applySnap(player: PlayerSnapshot): void {
    // Flash red when we just lost health (and aren't being newly spawned).
    if (player.alive && player.health < this.prevHealth - 1) {
      this.flashUntil = performance.now() + 130;
      this.emoji.setTint(0xff5252);
      this.scene.tweens.add({
        targets: this.emoji,
        scale: { from: 1.25, to: 1 },
        duration: 160,
        ease: "Quad.easeOut",
      });
    }
    this.prevHealth = player.health;
    // Respawn (defeated -> alive again at round start): pop back in.
    if (player.alive && !this.prevAlive) this.playSpawnIn();
    this.prevAlive = player.alive;
    this.snap = player;

    // Health bar width + color (green -> orange -> red as it drops).
    const frac = player.maxHealth > 0 ? Phaser.Math.Clamp(player.health / player.maxHealth, 0, 1) : 0;
    const barW = this.radius * 2.4;
    this.healthFill.width = barW * frac;
    this.healthFill.fillColor = frac > 0.5 ? 0x4caf50 : frac > 0.25 ? 0xffb300 : 0xe53935;

    // A charged ENEMY gets a bright white ring as a tell. Your own super is
    // shown by the on-character ring (drawSelfHud), so skip the recolor locally.
    if (player.alive && player.super >= 1 && !this.isLocal) {
      this.body.setStrokeStyle(4, 0xffffff, 1);
    } else {
      this.body.setStrokeStyle(this.isLocal ? 4 : 3, this.colorNum, 1);
    }

    // Defeated monsters fade to a faint ghost and hide their health bar.
    const dead = !player.alive;
    // A remote monster hidden in a bush nearly vanishes (ambush). We never hide
    // ourselves — the local player must always see their own monster.
    const lurking = player.hidden && !this.isLocal && !dead;
    const bodyAlpha = dead ? 0.25 : lurking ? 0.12 : 1;
    this.body.setAlpha(bodyAlpha);
    this.rim.setAlpha(dead ? 0.2 : lurking ? 0.1 : 1);
    this.shadow.setAlpha(dead || lurking ? 0 : 0.32);
    this.emoji.setAlpha(dead ? 0.35 : lurking ? 0.12 : 1);
    this.label.setAlpha(dead ? 0.4 : lurking ? 0 : 1);
    this.healthBg.setVisible(!dead && !lurking);
    this.healthFill.setVisible(!dead && !lurking);
    this.pointer.setVisible(!dead && !lurking);
    this.pointer.setRotation(player.facing);
  }

  /**
   * Glide the drawn position toward the target and keep all the bits attached.
   * `dt` is the frame time in seconds; we convert a per-second rate into a
   * framerate-independent step. Your own monster tracks harder (snappier) than
   * other players.
   */
  interpolate(dt: number): void {
    const rate = this.isLocal ? LOCAL_LERP_RATE : REMOTE_LERP_RATE;
    const smoothing = 1 - Math.exp(-rate * dt);
    const x = Phaser.Math.Linear(this.body.x, this.targetX, smoothing);
    const y = Phaser.Math.Linear(this.body.y, this.targetY, smoothing);
    this.body.setPosition(x, y);
    this.rim.setPosition(x, y);
    this.shadow.setPosition(x, y + this.radius * 0.62);

    // The emoji hovers above the ring with a gentle bob — the shadow stays put,
    // selling a little bit of lift. Living monsters only.
    const bob = this.snap.alive ? Math.sin(performance.now() / 320 + this.bobPhase) * 3 : 0;
    this.emoji.setPosition(x, y + bob);

    // Clear the hit-flash tint once it has elapsed.
    if (this.flashUntil && performance.now() > this.flashUntil) {
      this.emoji.clearTint();
      this.flashUntil = 0;
    }

    // Aim wedge sits on the rim in the facing direction.
    const f = this.snap.facing;
    this.pointer.setPosition(x + Math.cos(f) * (this.radius + 6), y + Math.sin(f) * (this.radius + 6));

    this.label.setPosition(x, y - this.radius - 26);
    this.healthBg.setPosition(x, y - this.radius - 12);
    this.healthFill.setPosition(x - (this.radius * 2.4) / 2, y - this.radius - 12);

    if (this.selfHud) this.drawSelfHud(x, y);
  }

  /**
   * Draw the local player's super ring + ammo pips (Brawl-Stars-style readout on
   * the character itself). Cleared while dead.
   */
  private drawSelfHud(x: number, y: number): void {
    const g = this.selfHud!;
    g.clear();
    if (!this.snap.alive) return;

    // ---- super charge ring around the body ----
    const r = this.radius + 8;
    const sup = Phaser.Math.Clamp(this.snap.super, 0, 1);
    g.lineStyle(4, 0x000000, 0.3); // faint track
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.strokePath();
    if (sup > 0) {
      const ready = sup >= 1;
      // Charging = cyan; ready = white with a gentle pulse in width.
      const pulse = ready ? 5 + Math.sin(performance.now() / 140) * 1.2 : 4;
      g.lineStyle(pulse, ready ? 0xffffff : 0x4dd0ff, 1);
      g.beginPath();
      g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + sup * Math.PI * 2);
      g.strokePath();
    }

    // ---- ammo pips: a row of capsules beneath the body ----
    const n = this.snap.ammoMax;
    if (n > 0) {
      const totalW = this.radius * 1.9;
      const gap = 3;
      const segW = (totalW - gap * (n - 1)) / n;
      const segH = 5;
      const py = y + this.radius + 12;
      let sx = x - totalW / 2;
      for (let i = 0; i < n; i++) {
        const frac = Phaser.Math.Clamp(this.snap.ammo - i, 0, 1);
        g.fillStyle(0x000000, 0.5);
        g.fillRoundedRect(sx, py, segW, segH, 2);
        if (frac > 0) {
          g.fillStyle(frac >= 1 ? 0xffffff : 0xbfd8ff, frac >= 1 ? 1 : 0.85);
          g.fillRoundedRect(sx, py, segW * frac, segH, 2);
        }
        sx += segW + gap;
      }
    }
  }

  destroy(): void {
    this.body.destroy();
    this.shadow.destroy();
    this.rim.destroy();
    this.emoji.destroy();
    this.pointer.destroy();
    this.label.destroy();
    this.healthBg.destroy();
    this.healthFill.destroy();
    this.selfHud?.destroy();
  }
}
