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
  /** Flat player-colored ring at the feet — the per-player ID under the sprite. */
  private groundRing: Phaser.GameObjects.Ellipse;
  /** The creature: a generated sprite if loaded, else an emoji fallback. */
  private avatar: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  /** The avatar's natural (rest) scale — sprites are scaled to the body radius. */
  private baseScale = 1;
  /** Sprite-only horizontal facing (with a deadzone), so it turns with movement. */
  private faceLeft = false;
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

  // ---- procedural animation (PR-G) ----
  // attach() is the SINGLE owner of the emoji/disc transform, driven by these
  // decaying impulses + smoothed movement, so nothing fights a tween.
  /** One-shot impulses (0..1), decayed each frame: fire recoil / super pop / hurt punch. */
  private recoil = 0;
  private pop = 0;
  private hitPunch = 0;
  /** Smoothed normalized move speed [0..1] and the horizontal lean angle. */
  private speedNorm = 0;
  private lean = 0;
  /** Walk-cycle phase — advances only while moving, drives the hop + waddle. */
  private walkPhase = 0;
  /** Edge-detect baselines for firing (ammo drop) and super cast (meter drop). */
  private prevAmmo: number;
  private prevSuper: number;
  /** While `now < spawnUntil` the spawn-in tween owns scale — attach() won't fight it. */
  private spawnUntil = 0;
  /** Monster top speed (u/s), to normalize movement for lean + squash. */
  private readonly maxSpeed: number;
  /** Clock of the last attach(), for framerate-independent decay/smoothing. */
  private lastNow = 0;

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
    this.prevAmmo = player.ammo;
    this.prevSuper = player.super;
    this.lastNow = performance.now();
    this.bobPhase = (player.id.charCodeAt(0) || 0) * 0.7;

    const look = lookOf(player.monster);
    this.radius = look.radius;
    this.maxSpeed = look.speed;
    this.colorNum = Phaser.Display.Color.HexStringToColor(player.color).color;

    // Soft contact shadow on the ground beneath the monster.
    this.shadow = scene.add
      .ellipse(player.x, player.y + this.radius * 0.62, this.radius * 1.9, this.radius * 0.85, SHADOW, 0.32)
      .setDepth(1);

    // Flat player-colored ground ring under the sprite (the per-player ID — the
    // creature sprite hides the body disc, so identity lives here + the name tag).
    this.groundRing = scene.add
      .ellipse(player.x, player.y + this.radius * 0.78, this.radius * 2.5, this.radius * 1.05, this.colorNum, 0.16)
      .setStrokeStyle(3, this.colorNum, 0.95)
      .setDepth(1);

    // A dark disc just larger than the body gives a clean, bold outline rim.
    this.rim = scene.add.circle(player.x, player.y, this.radius + 4, OUTLINE, 1).setDepth(1);

    // Colored ring (fill faint, stroke bold) so each player is identifiable.
    this.body = scene.add
      .circle(player.x, player.y, this.radius, this.colorNum, 0.3)
      .setStrokeStyle(isLocal ? 4 : 3, this.colorNum, 1)
      .setDepth(2);

    // The monster itself: a generated creature sprite if its texture loaded,
    // otherwise the original emoji body (graceful fallback). The sprite is scaled
    // so its drawn height tracks the body radius.
    const spriteKey = `brawler-${player.monster}`;
    if (scene.textures.exists(spriteKey)) {
      const img = scene.add.image(player.x, player.y, spriteKey).setOrigin(0.5).setDepth(3);
      this.baseScale = (this.radius * 3.8) / img.height;
      img.setScale(this.baseScale);
      this.avatar = img;
    } else {
      this.avatar = scene.add
        .text(player.x, player.y, look.emoji, { fontSize: `${Math.round(this.radius * 1.7)}px` })
        .setOrigin(0.5)
        .setDepth(3);
      this.baseScale = 1;
    }

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
    // Hand scale to this tween for its duration; attach() backs off until then.
    this.spawnUntil = performance.now() + 340;
    // Each object pops to its NATURAL scale (1 for the discs, baseScale for a
    // sprite avatar — tweening it to 1 would briefly balloon the full texture).
    const items: [Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, number][] = [
      [this.shadow, 1],
      [this.groundRing, 1],
      [this.rim, 1],
      [this.body, 1],
      [this.avatar, this.baseScale],
    ];
    for (const [obj, target] of items) {
      obj.setScale(0);
      this.scene.tweens.add({ targets: obj, scale: target, duration: 320, ease: "Back.easeOut" });
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
      this.avatar.setTint(0xff5252);
      this.hitPunch = 1; // scale punch (driven in attach, not a tween)
    }
    this.prevHealth = player.health;

    // Fired a shot: ammo stepped down (a reload/respawn is an INCREASE → no recoil).
    if (player.alive && player.ammo < this.prevAmmo - 0.5) this.recoil = 1;
    // Cast the super: the meter dropped from full while alive.
    if (player.alive && this.prevSuper >= 1 && player.super < 1) this.pop = 1;
    // Update the edge-detect baselines UNCONDITIONALLY — this view persists across
    // rounds, so a stale prevSuper would mis-fire a super pop on the next spawn.
    this.prevAmmo = player.ammo;
    this.prevSuper = player.super;
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

    // Active status effect (gadget/super): recolor the ring as a tell.
    // shield=blue, rage=orange, slow=cyan, heal=green, root=purple.
    const statusColors: Record<string, number> = {
      shield: 0x59b0ff,
      rage: 0xff7043,
      slow: 0x80deea,
      heal: 0x66bb6a,
      root: 0xab47bc,
    };
    const sc = player.alive ? statusColors[player.statusFx] : undefined;
    if (sc !== undefined) this.body.setStrokeStyle(this.isLocal ? 5 : 4, sc, 1);

    // Defeated monsters fade to a faint ghost and hide their health bar.
    const dead = !player.alive;
    // A remote monster hidden in a bush nearly vanishes (ambush). We never hide
    // ourselves — the local player must always see their own monster.
    const lurking = player.hidden && !this.isLocal && !dead;
    const bodyAlpha = dead ? 0.25 : lurking ? 0.12 : 1;
    this.body.setAlpha(bodyAlpha);
    this.rim.setAlpha(dead ? 0.2 : lurking ? 0.1 : 1);
    this.shadow.setAlpha(dead || lurking ? 0 : 0.32);
    this.avatar.setAlpha(dead ? 0.35 : lurking ? 0.12 : 1);
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
    this.attach(x, y);
  }

  /**
   * Place the body at an EXACT position — used for the local player, whose
   * position is predicted client-side (see GameScene) for instant response
   * rather than glided toward the laggy server position.
   */
  placeAt(x: number, y: number): void {
    this.attach(x, y);
  }

  /** Move the body to (x, y) and bring every attached bit along with it. */
  private attach(x: number, y: number): void {
    const now = performance.now();
    let dt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    if (!(dt > 0) || dt > 0.1) dt = 1 / 60; // guard first frame / tab-refocus hitch
    const alive = this.snap.alive;

    // Per-frame movement (drawn-position delta) → a smoothed speed [0..1] and a
    // horizontal lean. BOTH are clamped against the monster's top speed, so the
    // local player's predicted SNAP (super dash / respawn) can't pop a one-frame
    // distortion — the spike just clips to "max" and is invisible.
    const vx = (x - this.body.x) / dt;
    const speed = alive ? Phaser.Math.Clamp(Math.hypot(x - this.body.x, y - this.body.y) / dt / this.maxSpeed, 0, 1) : 0;
    const leanTarget = alive ? Phaser.Math.Clamp(vx / this.maxSpeed, -1, 1) * 0.16 : 0;
    const k = Math.min(1, dt * 12); // smoothing toward the targets
    this.speedNorm += (speed - this.speedNorm) * k;
    this.lean += (leanTarget - this.lean) * k;

    // Decay the one-shot impulses (framerate-independent).
    const decay = Math.exp(-9 * dt);
    this.recoil *= decay;
    this.pop *= decay;
    this.hitPunch *= decay;

    this.body.setPosition(x, y);
    this.rim.setPosition(x, y);

    // Walk cycle: the phase only advances while actually moving (so an idle
    // monster doesn't waddle), faster the quicker it goes. `hop` is 0 on the
    // ground, 1 at the top of each stride.
    const f = this.snap.facing;
    if (alive) this.walkPhase += this.speedNorm * dt * 17;
    const hop = Math.abs(Math.sin(this.walkPhase));
    const grounded = 1 - hop;

    // Vertical: a gentle idle hover always, plus a bigger bounce while moving.
    const idle = alive ? Math.sin(now / 420 + this.bobPhase) * 2.5 : 0;
    const bob = idle - (alive ? hop * this.speedNorm * 8 : 0);

    // Shadow + ground ring stay on the ground (no bob). The ring shows for a
    // visible, non-lurking living player (matches the sprite's own visibility).
    this.shadow.setPosition(x, y + this.radius * 0.62);
    this.groundRing.setPosition(x, y + this.radius * 0.78);
    this.groundRing.setVisible(alive && !(this.snap.hidden && !this.isLocal));

    // A fresh shot kicks the body back opposite its facing for a beat (recoil).
    const kick = this.recoil * 8;
    this.avatar.setPosition(x - Math.cos(f) * kick, y + bob - Math.sin(f) * kick);
    // Waddle: a rotation wobble while moving, composed with (never overwriting)
    // the movement lean.
    const wobble = Math.sin(this.walkPhase) * this.speedNorm * 0.1;
    this.avatar.setRotation(this.lean + wobble);
    // A sprite turns to face its aim/movement (with a deadzone so a near-vertical
    // aim doesn't flip-flop); the emoji fallback has no flip.
    if ("setFlipX" in this.avatar) {
      const cx = Math.cos(f);
      if (cx > 0.25) this.faceLeft = false;
      else if (cx < -0.25) this.faceLeft = true;
      this.avatar.setFlipX(this.faceLeft);
    }

    // Scale: super POP + hurt PUNCH (one-shots) plus a hop-synced squash &
    // stretch — stretch tall at the top of a stride, squash wide on the landing.
    // The spawn-in tween owns scale during its window, so back off then.
    if (now >= this.spawnUntil) {
      const grow = 1 + this.pop * 0.4 + this.hitPunch * 0.25;
      // Squash/stretch on top of the avatar's natural baseScale. Flip mirrors X
      // via setFlipX (above), so scaleX stays positive here.
      const sx = 1 + (grounded - 0.4) * this.speedNorm * 0.18;
      const sy = 1 + (hop - 0.4) * this.speedNorm * 0.22;
      this.avatar.setScale(this.baseScale * grow * sx, this.baseScale * grow * sy);
      // The collision ring stays honest (no walk-squash) — only the super pop.
      const discPop = 1 + this.pop * 0.32;
      this.body.setScale(discPop);
      this.rim.setScale(discPop);
      // Shadow swells as the monster lands (sells the hop).
      this.shadow.setScale(1 + grounded * this.speedNorm * 0.2);
    }

    // Clear the hit-flash tint once it has elapsed.
    if (this.flashUntil && now > this.flashUntil) {
      this.avatar.clearTint();
      this.flashUntil = 0;
    }

    // Aim wedge sits on the rim in the facing direction.
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
    this.avatar.destroy();
    this.groundRing.destroy();
    this.pointer.destroy();
    this.label.destroy();
    this.healthBg.destroy();
    this.healthFill.destroy();
    this.selfHud?.destroy();
  }
}
