import Phaser from "phaser";
import {
  Network,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type CubeSnapshot,
  type HitEvent,
  type KOEvent,
  type BoxSnapshot,
} from "../net/Network";
import { PlayerView } from "./PlayerView";
import { ProjectileView } from "./ProjectileView";
import { PowerCubeView } from "./PowerCubeView";
import { BoxView } from "./BoxView";
import { Controls, type Dir } from "../input/Controls";
import {
  PROJECTILE_LERP_RATE,
  CAMERA_FOLLOW_LERP,
  PRED_CORRECTION_RATE,
  PRED_SNAP_DIST,
  AIM_SEND_INTERVAL,
  FIRE_REPEAT_INTERVAL,
  SERVER_URL,
  CONNECT_TIMEOUT_MS,
} from "../config";
import { mapById, type Rect } from "./maps";
import { lookOf } from "./monsters";
import { Sfx } from "../audio/Sfx";
import { resolveMove, clamp } from "./collision";

/** Data passed in when we start this scene from the lobby. */
interface SceneData {
  roomCode: string;
  name: string;
  monster: string;
}

/**
 * The arena palette — a bright, sunny Brawl-Stars "Showdown" look. Everything
 * here is drawn procedurally (no photo textures): flat saturated fills, bold
 * dark outlines, and a little fake 3D on the walls. The dark `VOID` is the
 * out-of-bounds area framing the grassy playfield.
 */
const PALETTE = {
  void: 0x1d3318, // dark grass shadow framing the field
  grassA: 0x5aa84a, // checker tone A
  grassB: 0x4f9d42, // checker tone B
  grassBlade: [0x66b455, 0x498f3a], // subtle speckle shades baked into the floor
  borderDark: 0x2c5e22,
  borderLight: 0x76c95a,
  wallTop: 0xc08a4e, // lit top face of a crate
  wallSide: 0x7c552e, // shaded front face
  wallSeam: 0x9c6a3c, // plank seams on the top
  wallEdge: 0x3a2614, // outline
  bushBase: 0x3f9a32,
  bushDark: 0x368a2c,
  bushLight: 0x7fd44a,
  bushHi: 0xa6ec63,
  bushEdge: 0x215c1a,
  shadow: 0x07140a, // contact / drop shadow color (dark green-black)
} as const;

/** How tall (px) walls appear to be extruded toward the camera. */
const WALL_EXTRUDE = 16;

/** How zoomed-in the camera sits — bigger monsters, Brawl-Stars framing. */
const CAMERA_ZOOM = 1.6;

/** Gestures we listen for to unlock suspended audio (iOS prefers touchend/click). */
const AUDIO_UNLOCK_EVENTS = ["pointerdown", "touchstart", "touchend", "mousedown", "click", "keydown"];

/**
 * The one and only gameplay scene. Each frame it:
 *   1. Reads our input (move + aim/fire/super) and sends the INTENT to the server.
 *   2. Glides every monster, shot, and cube toward its latest server state.
 *   3. Draws the closing poison zone and updates the HUD + round banner.
 *
 * Where things actually are, who got hit, who won — all decided by the server.
 */
export class GameScene extends Phaser.Scene {
  private net!: Network;
  private controls!: Controls;

  private players = new Map<string, PlayerView>();
  private projectiles = new Map<string, ProjectileView>();
  private cubes = new Map<string, PowerCubeView>();
  private boxes = new Map<string, BoxView>();

  // Local-player movement prediction.
  private arenaW = 0;
  private arenaH = 0;
  private walls: Rect[] = [];
  /** Live box footprints (boxes block movement; they're dynamic, so kept here). */
  private boxRects = new Map<string, Rect>();
  private predX = 0;
  private predY = 0;
  private predReady = false;

  private roomCode = "";
  private monster = "gnash";

  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private poison!: Phaser.GameObjects.Graphics;
  /** The local player's aim indicator (a dotted line along their facing). */
  private aimLine!: Phaser.GameObjects.Graphics;

  /** Zero-asset sound effects. */
  private sfx = new Sfx();
  /** Top-right kill-feed lines, with their expiry times. */
  private killFeed: { text: Phaser.GameObjects.Text; expireAt: number }[] = [];
  // Edge-detection state for sound triggers (compared each frame).
  private prevSuperReady = false;
  private prevCubes = 0;
  private prevCountdown = -1;
  private prevPhase = "";

  // A DOM overlay shown while connecting (robust on mobile, no canvas needed).
  private statusEl?: HTMLElement;
  private connectTimer?: number;
  /** The sound on/off button (DOM, top-right). */
  private muteBtn?: HTMLButtonElement;
  /** Document-level handler that resumes audio on the first user gesture. */
  private audioUnlock?: () => void;

  // Movement: only send when it actually changes.
  private lastMoveX = 0;
  private lastMoveY = 0;

  // Desktop mouse state.
  private mouseMoved = false;
  private lastMouseAimSent = 0;
  private lastFireAt = 0;
  private superKey!: Phaser.Input.Keyboard.Key;
  private prevRightDown = false;
  private prevSpaceDown = false;

  constructor() {
    super("GameScene");
  }

  create(data: SceneData) {
    this.roomCode = data.roomCode;
    this.monster = data.monster;
    // Out-of-bounds is a dark grassy void; the playfield is painted in setupArena.
    this.cameras.main.setBackgroundColor("#1d3318");
    this.makeGrassTexture();

    // Twin-stick touch controls. Their callbacks forward intent to the server.
    this.controls = new Controls(this, {
      onAim: (d) => this.aliveSelf() && this.net.sendAim(d.x, d.y),
      onFire: (d) => this.aliveSelf() && this.net.sendFire(d.x, d.y),
      onSuper: (d) => this.aliveSelf() && this.net.sendSuper(d.x, d.y),
    });

    this.superKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) this.mouseMoved = true;
    });

    // Browsers start audio SUSPENDED until a user gesture. We can't rely on
    // Phaser's canvas input here: on touch, the nipplejs joystick zones are DOM
    // overlays ABOVE the canvas, so the canvas never sees the touch and audio
    // would stay muted forever. Listen at the document in the CAPTURE phase so
    // ANY gesture (joystick touch, button tap, key) unlocks it. resume() is
    // idempotent, so leaving these attached is harmless.
    this.audioUnlock = () => this.sfx.resume();
    for (const ev of AUDIO_UNLOCK_EVENTS) {
      document.addEventListener(ev, this.audioUnlock, { capture: true, passive: true });
    }

    // Sound on/off (persisted). A small button for touch, plus the M key.
    this.sfx.setEnabled(localStorage.getItem("mm-muted") !== "1");
    this.createMuteButton();
    this.input.keyboard!.addKey("M").on("down", () => this.toggleMute());

    // Above the floor/grid, below the monsters — a tinted hazard on the ground.
    this.poison = this.add.graphics().setDepth(-5);
    // Aim indicator sits on the ground (above the floor, below the monsters).
    this.aimLine = this.add.graphics().setDepth(0);

    this.hud = this.add
      .text(12, 12, "", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "#00000080",
      })
      .setPadding(8, 6, 8, 6)
      .setScrollFactor(0)
      .setDepth(100);

    this.banner = this.add
      .text(0, 0, "", {
        fontFamily: "sans-serif",
        fontSize: "44px",
        color: "#ffffff",
        align: "center",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(110);

    // Show a visible "Connecting…" overlay until the first server state arrives.
    this.showStatus(`Connecting to server…\n${SERVER_URL}`);

    // A stuck connection often HANGS instead of erroring, so we time out
    // ourselves and show what stage we got stuck at.
    this.connectTimer = window.setTimeout(() => {
      if (!this.net.connected) {
        this.failToLobby(
          `Timed out connecting to ${SERVER_URL}. The server page loads, but the ` +
            `realtime connection didn't complete.`,
        );
      }
    }, CONNECT_TIMEOUT_MS);

    // Connect and hook the server's state up to our render callbacks.
    this.net = new Network();
    this.net
      .join(data.roomCode, data.name, data.monster, {
        onJoin: (w, h, mapId) => {
          this.onConnected();
          this.setupArena(w, h, mapId);
        },
        onPlayerAdd: (p) => this.addPlayer(p),
        onPlayerChange: (p) => this.players.get(p.id)?.update(p),
        onPlayerRemove: (id) => this.removePlayer(id),
        onProjectileAdd: (p) => this.addProjectile(p),
        onProjectileMove: (p) => this.projectiles.get(p.id)?.setTarget(p),
        onProjectileRemove: (id) => this.removeProjectile(id),
        onCubeAdd: (c) => this.addCube(c),
        onCubeRemove: (id) => this.removeCube(id),
        onBoxAdd: (b) => this.addBox(b),
        onBoxChange: (b) => this.boxes.get(b.id)?.update(b),
        onBoxRemove: (id) => this.removeBox(id),
        onHit: (h) => this.onHit(h),
        onKO: (k) => this.onKO(k),
      })
      .catch((error) => {
        console.error("Failed to join:", error);
        const detail = error?.message ? ` (${error.message})` : "";
        this.failToLobby(`Couldn't join the game at ${SERVER_URL}${detail}.`);
      });

    this.events.once("shutdown", () => {
      if (this.connectTimer) window.clearTimeout(this.connectTimer);
      this.hideStatus();
      this.controls.destroy();
      this.net.leave();
      this.sfx.close();
      this.muteBtn?.remove();
      if (this.audioUnlock) {
        for (const ev of AUDIO_UNLOCK_EVENTS) {
          document.removeEventListener(ev, this.audioUnlock, { capture: true });
        }
      }
    });
  }

  /** We're connected: drop the timeout + overlay. */
  private onConnected() {
    if (this.connectTimer) window.clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
    this.hideStatus();
  }

  /**
   * Give up. Show the reason full-screen (easy to read / screenshot) for a
   * couple of seconds, then return to the lobby (main.ts handles the swap).
   */
  private failToLobby(message: string) {
    if (this.connectTimer) window.clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
    this.showStatus(`⚠️ ${message}`);
    window.setTimeout(() => this.game.events.emit("join-error", message), 2500);
  }

  private showStatus(text: string) {
    // Reuse the overlay if it already exists (e.g. connecting -> error).
    if (!this.statusEl) {
      this.statusEl = document.createElement("div");
      this.statusEl.className = "net-status";
      document.getElementById("game")!.appendChild(this.statusEl);
    }
    this.statusEl.textContent = text;
  }

  private hideStatus() {
    this.statusEl?.remove();
    this.statusEl = undefined;
  }

  /** A small sound on/off button in the top-right corner. */
  private createMuteButton() {
    const btn = document.createElement("button");
    btn.className = "mute-btn";
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.sfx.resume(); // counts as the unlock gesture too
      this.toggleMute();
    });
    document.getElementById("game")!.appendChild(btn);
    this.muteBtn = btn;
    this.refreshMuteButton();
  }

  private toggleMute() {
    const muted = this.sfx.isEnabled(); // about to flip
    this.sfx.setEnabled(!this.sfx.isEnabled());
    localStorage.setItem("mm-muted", muted ? "1" : "0");
    this.refreshMuteButton();
  }

  private refreshMuteButton() {
    if (this.muteBtn) this.muteBtn.textContent = this.sfx.isEnabled() ? "🔊" : "🔇";
  }

  /**
   * Build a small, seamless grass texture once (a 2-tone checker plus faint
   * blade speckles) and register it as "grass" so the floor can tile it cheaply.
   * Procedural keeps it crisp at any zoom and matches the flat Brawl-Stars look.
   */
  private makeGrassTexture() {
    if (this.textures.exists("grass")) return;
    const cell = 96; // one checker square in world px
    const size = cell * 2; // 2×2 = a seamlessly repeating block
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    g.fillStyle(PALETTE.grassA);
    g.fillRect(0, 0, cell, cell);
    g.fillRect(cell, cell, cell, cell);
    g.fillStyle(PALETTE.grassB);
    g.fillRect(cell, 0, cell, cell);
    g.fillRect(0, cell, cell, cell);

    // Scatter tiny blades so the flat checker isn't sterile.
    for (let i = 0; i < 320; i++) {
      const shade = PALETTE.grassBlade[i % 2];
      g.fillStyle(shade, 0.45);
      g.fillRect(Math.random() * size, Math.random() * size, 2, 4);
    }

    g.generateTexture("grass", size, size);
    g.destroy();
  }

  /**
   * Draw the arena once we know its size + terrain layout (from the server).
   * It's all painted procedurally between the camera background and the
   * monsters. Walls block movement + shots (server-side); here they're just the
   * picture — drawn as raised crates with a top face, a front face, and a soft
   * drop shadow for a Brawl-Stars sense of depth. Depth order: grass (-20) <
   * border (-19) < wall shadow (-14) < wall (-12) < bush (-10) < poison (-5) <
   * monsters (1+).
   */
  private setupArena(width: number, height: number, mapId: string) {
    // Grass field across the whole arena.
    this.add.tileSprite(0, 0, width, height, "grass").setOrigin(0, 0).setDepth(-20);

    // A chunky framed border so the playfield reads as a raised stage.
    const border = this.add.graphics().setDepth(-19);
    border.lineStyle(10, PALETTE.borderDark, 1);
    border.strokeRect(5, 5, width - 10, height - 10);
    border.lineStyle(3, PALETTE.borderLight, 0.6);
    border.strokeRect(12, 12, width - 24, height - 24);

    const map = mapById(mapId);

    // Remember the arena bounds + walls for local-player movement prediction.
    this.arenaW = width;
    this.arenaH = height;
    this.walls = map.walls;

    // Bushes (walk-through cover). Drawn below the monsters; hidden remote
    // players are dimmed by PlayerView, so z-order doesn't need to occlude.
    const bushG = this.add.graphics().setDepth(-10);
    const bushShadowG = this.add.graphics().setDepth(-11);
    for (const b of map.bushes) this.drawBush(bushG, bushShadowG, b);

    // Walls (hard cover) — raised crates with fake 3D and a drop shadow.
    const wallShadowG = this.add.graphics().setDepth(-14);
    const wallG = this.add.graphics().setDepth(-12);
    for (const w of map.walls) this.drawWall(wallG, wallShadowG, w);

    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.setZoom(CAMERA_ZOOM);
    const me = this.players.get(this.net.selfId);
    if (me) this.cameras.main.startFollow(me.body, true, CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_LERP);
  }

  /** Paint one wall AABB as a raised wooden crate (shadow + side + top). */
  private drawWall(
    g: Phaser.GameObjects.Graphics,
    shadow: Phaser.GameObjects.Graphics,
    w: { x: number; y: number; w: number; h: number },
  ) {
    const r = Math.min(12, w.w / 2, w.h / 2);
    const e = WALL_EXTRUDE;

    // Soft drop shadow, offset down-right onto the grass.
    shadow.fillStyle(PALETTE.shadow, 0.28);
    shadow.fillRoundedRect(w.x + 10, w.y + e + 8, w.w, w.h, r);

    // Front/side face: the whole block extruded downward by `e`.
    g.fillStyle(PALETTE.wallSide, 1);
    g.fillRoundedRect(w.x, w.y, w.w, w.h + e, r);

    // Lit top face sitting on the side block.
    g.fillStyle(PALETTE.wallTop, 1);
    g.fillRoundedRect(w.x, w.y, w.w, w.h, r);

    // Plank seams across the top for a crate-y read.
    g.lineStyle(2, PALETTE.wallSeam, 0.8);
    const planks = Math.max(1, Math.round(w.h / 38));
    for (let i = 1; i < planks; i++) {
      const yy = w.y + (w.h * i) / planks;
      g.lineBetween(w.x + 6, yy, w.x + w.w - 6, yy);
    }

    // Outlines: silhouette of the whole block, then the top-face seam.
    g.lineStyle(3, PALETTE.wallEdge, 0.95);
    g.strokeRoundedRect(w.x, w.y, w.w, w.h + e, r);
    g.lineStyle(2, PALETTE.wallEdge, 0.55);
    g.strokeRoundedRect(w.x, w.y, w.w, w.h, r);
  }

  /** Paint one bush AABB as a bumpy lime clump with a soft shadow. */
  private drawBush(
    g: Phaser.GameObjects.Graphics,
    shadow: Phaser.GameObjects.Graphics,
    b: { x: number; y: number; w: number; h: number },
  ) {
    const r = 24;
    shadow.fillStyle(PALETTE.shadow, 0.22);
    shadow.fillRoundedRect(b.x + 6, b.y + 10, b.w, b.h, r);

    // Solid rounded base so there are no gaps between the lobes.
    g.fillStyle(PALETTE.bushBase, 1);
    g.fillRoundedRect(b.x, b.y, b.w, b.h, r);
    g.lineStyle(3, PALETTE.bushEdge, 0.7);
    g.strokeRoundedRect(b.x, b.y, b.w, b.h, r);

    // Bumpy canopy: overlapping blobs on a jittered grid, brighter toward the
    // top-left where the "light" comes from.
    const step = 34;
    for (let cy = b.y + 14; cy <= b.y + b.h - 6; cy += step) {
      for (let cx = b.x + 14; cx <= b.x + b.w - 6; cx += step) {
        const jx = (Math.random() - 0.5) * 12;
        const jy = (Math.random() - 0.5) * 12;
        const rad = 18 + Math.random() * 8;
        g.fillStyle(Math.random() < 0.5 ? PALETTE.bushDark : PALETTE.bushLight, 1);
        g.fillCircle(cx + jx, cy + jy, rad);
        g.fillStyle(PALETTE.bushHi, 0.6);
        g.fillCircle(cx + jx - rad * 0.3, cy + jy - rad * 0.3, rad * 0.4);
      }
    }
  }

  private addPlayer(p: PlayerSnapshot) {
    const isLocal = p.id === this.net.selfId;
    const view = new PlayerView(this, p, isLocal);
    this.players.set(p.id, view);
    if (isLocal) this.cameras.main.startFollow(view.body, true, CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_LERP);
  }

  private removePlayer(id: string) {
    this.players.get(id)?.destroy();
    this.players.delete(id);
  }

  private addProjectile(p: ProjectileSnapshot) {
    this.projectiles.set(p.id, new ProjectileView(this, p));
    this.spawnMuzzleFlash(p);
    // Supers feel weighty — a quick, light camera kick when one goes off.
    if (p.kind === "super") this.cameras.main.shake(120, 0.0035);
    // Shot sound, but only for shots near you (the snapshot has no owner id, so
    // proximity stands in for "mine / worth hearing") to avoid a wall of noise.
    if (this.nearSelf(p.x, p.y, 620)) this.sfx.shoot(p.kind);
  }

  /** True if a world point is within `r` of the local monster (for audio gating). */
  private nearSelf(x: number, y: number, r: number): boolean {
    const me = this.players.get(this.net.selfId);
    return !!me && Math.hypot(me.body.x - x, me.body.y - y) <= r;
  }

  /** A brief expanding ring where a shot appears, tinted to its color. */
  private spawnMuzzleFlash(p: ProjectileSnapshot) {
    const color = Phaser.Display.Color.HexStringToColor(p.color).color;
    const ring = this.add
      .circle(p.x, p.y, p.kind === "super" ? 20 : 12, color, 0.85)
      .setDepth(5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }
  private removeProjectile(id: string) {
    this.projectiles.get(id)?.destroy();
    this.projectiles.delete(id);
  }

  // ---- Combat juice (driven by the server's "fx" events) ----------------

  /** A shot landed: pop a damage number + a spark at the impact point. */
  private onHit(h: HitEvent) {
    const isSelf = h.targetId === this.net.selfId;
    // Damage to you reads red + bigger; super hits gold; normal hits white.
    const color = isSelf ? "#ff5252" : h.kind === "super" ? "#ffd740" : "#ffffff";
    const size = (isSelf ? 26 : 20) + Math.min(14, h.amount / 160);
    this.spawnDamageNumber(h.x, h.y, h.amount, color, Math.round(size));
    this.spawnBurst(h.x, h.y, Phaser.Display.Color.HexStringToColor(color).color, h.kind === "super" ? 18 : 12);
    if (isSelf || this.nearSelf(h.x, h.y, 620)) this.sfx.hit(isSelf);
  }

  /** Someone was defeated: a burst of debris where they fell, in their color. */
  private onKO(k: KOEvent) {
    const selfInvolved = k.victimId === this.net.selfId || k.killerId === this.net.selfId;
    if (selfInvolved || this.nearSelf(k.x, k.y, 700)) this.sfx.defeat(k.victimId === this.net.selfId);
    this.addKillFeed(k);

    const color = this.players.get(k.victimId)?.tintColor ?? 0xffffff;
    // Central flash.
    this.spawnBurst(k.x, k.y, 0xffffff, 26);
    // A ring of debris fanning out.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 30 + Math.random() * 40;
      const bit = this.add
        .circle(k.x, k.y, 4 + Math.random() * 3, color, 1)
        .setStrokeStyle(1.5, 0x000000, 0.4)
        .setDepth(7);
      this.tweens.add({
        targets: bit,
        x: k.x + Math.cos(a) * dist,
        y: k.y + Math.sin(a) * dist,
        alpha: 0,
        scale: 0.3,
        duration: 420 + Math.random() * 160,
        ease: "Quad.easeOut",
        onComplete: () => bit.destroy(),
      });
    }
  }

  /** A floating, rising damage number that fades out. */
  private spawnDamageNumber(x: number, y: number, amount: number, color: string, fontSize: number) {
    const txt = this.add
      .text(x + (Math.random() - 0.5) * 14, y - 8, String(amount), {
        fontFamily: "sans-serif",
        fontStyle: "bold",
        fontSize: `${fontSize}px`,
        color,
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(9);
    this.tweens.add({
      targets: txt,
      y: y - 44,
      alpha: { from: 1, to: 0 },
      scale: { from: 1.15, to: 0.9 },
      duration: 650,
      ease: "Quad.easeOut",
      onComplete: () => txt.destroy(),
    });
  }

  /** A quick additive flash that expands and fades (impact spark). */
  private spawnBurst(x: number, y: number, color: number, radius: number) {
    const ring = this.add
      .circle(x, y, radius, color, 0.85)
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 200,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  private addCube(c: CubeSnapshot) {
    this.cubes.set(c.id, new PowerCubeView(this, c));
  }
  private removeCube(id: string) {
    this.cubes.get(id)?.destroy();
    this.cubes.delete(id);
  }

  private addBox(b: BoxSnapshot) {
    this.boxes.set(b.id, new BoxView(this, b));
    this.boxRects.set(b.id, { x: b.x, y: b.y, w: b.w, h: b.h });
  }
  /** A box was destroyed: pop a woody break burst where it stood. */
  private removeBox(id: string) {
    const view = this.boxes.get(id);
    if (!view) return;
    // Only burst for an in-play break, not the bulk clear at round reset.
    if (this.net.match?.phase === "playing") {
      const c = view.center;
      this.spawnBurst(c.x, c.y, 0xd9a066, 22);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 24 + Math.random() * 34;
        const bit = this.add
          .rectangle(c.x, c.y, 6 + Math.random() * 4, 6 + Math.random() * 4, 0x9c6a3c, 1)
          .setStrokeStyle(1.5, 0x3a2614, 0.6)
          .setAngle(Math.random() * 90)
          .setDepth(7);
        this.tweens.add({
          targets: bit,
          x: c.x + Math.cos(a) * dist,
          y: c.y + Math.sin(a) * dist,
          angle: bit.angle + 120,
          alpha: 0,
          scale: 0.3,
          duration: 380 + Math.random() * 160,
          ease: "Quad.easeOut",
          onComplete: () => bit.destroy(),
        });
      }
    }
    view.destroy();
    this.boxes.delete(id);
    this.boxRects.delete(id);
  }

  /** Is our own monster currently alive? (Gate sending attack intent.) */
  private aliveSelf(): boolean {
    return this.net.connected && (this.net.self?.alive ?? false);
  }

  /** Phaser calls this every frame (~60/sec). */
  update(_time: number, delta: number) {
    if (!this.net.connected) return;

    this.sendMovement();
    this.handleDesktopAim();

    // Clamp dt so a frame hitch (e.g. tab refocus) doesn't snap everything.
    const dt = Math.min(delta / 1000, 0.1);
    const projT = 1 - Math.exp(-PROJECTILE_LERP_RATE * dt);
    // Other players glide toward their latest server position; OUR monster is
    // predicted locally for instant response (predictLocal handles it).
    const selfId = this.net.selfId;
    this.players.forEach((v, id) => {
      if (id !== selfId) v.interpolate(dt);
    });
    this.predictLocal(dt);
    this.projectiles.forEach((v) => v.interpolate(projT));
    this.cubes.forEach((v) => v.bob(dt));

    this.drawAim();
    this.drawPoison();
    this.updateHud();
  }

  /**
   * Move OUR monster from local input the instant a key/stick moves, using the
   * same collision the server runs, then reconcile to the authoritative server
   * position underneath. This hides the network round-trip so your own movement
   * feels immediate. Active only while playing + alive; otherwise we just glide
   * toward the server (spawn-in, countdown freeze, dead/spectating).
   */
  private predictLocal(dt: number) {
    const view = this.players.get(this.net.selfId);
    const me = this.net.self;
    if (!view || !me) return;

    const playing = this.net.match?.phase === "playing";
    if (!playing || !me.alive) {
      this.predReady = false;
      view.interpolate(dt); // fall back to gliding toward the server position
      return;
    }

    // Seed the prediction from the server on the first predicted frame.
    if (!this.predReady) {
      this.predX = me.x;
      this.predY = me.y;
      this.predReady = true;
    }

    // Reconcile: snap on a big jump (super dash / respawn / desync), else ease.
    const ex = me.x - this.predX;
    const ey = me.y - this.predY;
    if (Math.hypot(ex, ey) > PRED_SNAP_DIST) {
      this.predX = me.x;
      this.predY = me.y;
    } else {
      const c = 1 - Math.exp(-PRED_CORRECTION_RATE * dt);
      this.predX += ex * c;
      this.predY += ey * c;
    }

    // Apply this frame's input the way the server does (clamp, then normalize).
    const look = lookOf(me.monster);
    const v = this.controls.getMove();
    let vx = clamp(v.x, -1, 1);
    let vy = clamp(v.y, -1, 1);
    const len = Math.hypot(vx, vy);
    if (len > 1) {
      vx /= len;
      vy /= len;
    }
    const obstacles = [...this.walls, ...this.boxRects.values()];
    const next = resolveMove(
      this.predX,
      this.predY,
      vx * look.speed * dt,
      vy * look.speed * dt,
      look.radius,
      this.arenaW,
      this.arenaH,
      obstacles,
    );
    this.predX = next.x;
    this.predY = next.y;
    view.placeAt(this.predX, this.predY);
  }

  /** Send the movement vector, but only when it has changed. */
  private sendMovement() {
    const v = this.controls.getMove();
    if (Math.abs(v.x - this.lastMoveX) > 0.02 || Math.abs(v.y - this.lastMoveY) > 0.02) {
      this.net.sendInput(v.x, v.y);
      this.lastMoveX = v.x;
      this.lastMoveY = v.y;
    }
  }

  /** Desktop: aim with the mouse, fire with left click, super with right click / Space. */
  private handleDesktopAim() {
    if (!this.mouseMoved || !this.aliveSelf()) {
      // Still let Space trigger the super even without mouse movement.
      this.handleSuperKeys({ x: 1, y: 0 });
      return;
    }
    const me = this.players.get(this.net.selfId);
    if (!me) return;

    const pointer = this.input.mousePointer;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const dir: Dir = { x: world.x - me.body.x, y: world.y - me.body.y };
    const len = Math.hypot(dir.x, dir.y) || 1;
    dir.x /= len;
    dir.y /= len;

    const now = performance.now();
    if (now - this.lastMouseAimSent >= AIM_SEND_INTERVAL) {
      this.lastMouseAimSent = now;
      this.net.sendAim(dir.x, dir.y);
    }

    // Left button held = fire (repeated, the server rate-limits to the cadence).
    if (pointer.leftButtonDown() && now - this.lastFireAt >= FIRE_REPEAT_INTERVAL) {
      this.lastFireAt = now;
      this.net.sendFire(dir.x, dir.y);
    }

    this.handleSuperKeys(dir);
  }

  /** Right-click or Space fires the super (edge-triggered). */
  private handleSuperKeys(dir: Dir) {
    if (!this.aliveSelf()) return;
    const rightDown = this.input.mousePointer.rightButtonDown();
    if (rightDown && !this.prevRightDown) this.net.sendSuper(dir.x, dir.y);
    this.prevRightDown = rightDown;

    const spaceDown = this.superKey.isDown;
    if (spaceDown && !this.prevSpaceDown) this.net.sendSuper(dir.x, dir.y);
    this.prevSpaceDown = spaceDown;
  }

  /**
   * Draw the local player's aim indicator: a dotted line from the monster along
   * its facing, as long as the weapon's range, ending in a small reticle. It
   * turns red when you're out of ammo (can't fire) — mirrors Brawl Stars. Shown
   * while you're actively aiming (touch) or whenever the mouse is in play.
   */
  private drawAim() {
    this.aimLine.clear();
    const me = this.players.get(this.net.selfId);
    const self = this.net.self;
    const playing = this.net.match?.phase === "playing";
    if (!me || !self || !self.alive || !playing) return;
    if (!(this.controls.isAiming() || this.mouseMoved)) return;

    const range = lookOf(self.monster).range;
    const f = self.facing;
    const bx = me.body.x;
    const by = me.body.y;
    const canFire = self.ammo >= 1;
    const color = canFire ? 0xffffff : 0xff5252;

    // Start a little outside the body so the line doesn't sit under the monster.
    const start = 28;
    const dashes = 14;
    this.aimLine.lineStyle(3, color, 0.5);
    for (let i = 0; i < dashes; i++) {
      const d0 = start + ((range - start) * i) / dashes;
      const d1 = start + ((range - start) * (i + 0.55)) / dashes;
      this.aimLine.beginPath();
      this.aimLine.moveTo(bx + Math.cos(f) * d0, by + Math.sin(f) * d0);
      this.aimLine.lineTo(bx + Math.cos(f) * d1, by + Math.sin(f) * d1);
      this.aimLine.strokePath();
    }
    // Reticle at the far end of the range.
    this.aimLine.lineStyle(2, color, 0.85);
    this.aimLine.strokeCircle(bx + Math.cos(f) * range, by + Math.sin(f) * range, 7);
  }

  /** Paint the poison region (everything outside the shrinking safe rectangle). */
  private drawPoison() {
    const m = this.net.match;
    this.poison.clear();
    if (!m) return;

    const w = (this.cameras.main.getBounds().width) || 0;
    const h = (this.cameras.main.getBounds().height) || 0;
    if (w === 0 || h === 0) return;

    // Bright outline around the safe area.
    this.poison.lineStyle(3, 0x66e0ff, 0.8);
    this.poison.strokeRect(m.safeMinX, m.safeMinY, m.safeMaxX - m.safeMinX, m.safeMaxY - m.safeMinY);

    // Translucent danger bands covering the unsafe edges. Punchy enough to read
    // clearly over the bright grass (a weak tint vanishes against green).
    this.poison.fillStyle(0x7b1fa2, 0.42);
    // top, bottom, left, right
    this.poison.fillRect(0, 0, w, m.safeMinY);
    this.poison.fillRect(0, m.safeMaxY, w, h - m.safeMaxY);
    this.poison.fillRect(0, m.safeMinY, m.safeMinX, m.safeMaxY - m.safeMinY);
    this.poison.fillRect(m.safeMaxX, m.safeMinY, w - m.safeMaxX, m.safeMaxY - m.safeMinY);
  }

  /**
   * Place a `scrollFactor(0)` UI object at screen pixel (sx, sy) at its intended
   * size. The camera zoom (CAMERA_ZOOM) also scales + offsets fixed UI, which
   * would shove the HUD off-screen and oversize the banner — this counter-acts
   * it so the overlay is independent of the world zoom (and resize-proof).
   */
  private placeUi(obj: Phaser.GameObjects.Text, sx: number, sy: number) {
    const cam = this.cameras.main;
    const z = cam.zoom || 1;
    const mx = cam.width / 2;
    const my = cam.height / 2;
    obj.setScale(1 / z);
    obj.setPosition((sx - mx) / z + mx, (sy - my) / z + my);
  }

  /** Top-left status text, the centered round banner, and the Super-ready glow. */
  private updateHud() {
    const m = this.net.match;
    const me = this.net.self;

    this.updateSoundTriggers();
    this.updateKillFeed();

    // ---- HUD ----
    this.placeUi(this.hud, 12, 12);
    if (m) {
      // HP, ammo, and super now live on the monster itself (health bar + the
      // on-character ring/pips), so the corner only carries match + score info.
      const lines = [`Room ${this.roomCode}   ·   ${m.aliveCount} left`];
      if (me) lines.push(`Cubes ${me.cubes}   ·   Kills ${me.kills}`);
      this.hud.setText(lines.join("\n"));
    }

    // ---- Super button glow ----
    this.controls.setSuperReady((me?.alive ?? false) && (me?.super ?? 0) >= 1);

    // ---- centered banner ----
    const cam = this.cameras.main;
    this.placeUi(this.banner, cam.width / 2, cam.height / 2 - 40);
    if (!m) {
      this.banner.setText("");
      return;
    }

    if (m.phase === "countdown") {
      const n = Math.ceil(m.phaseTimeLeft / 1000);
      this.banner.setFontSize(80).setText(n > 0 ? String(n) : "BRAWL!");
    } else if (m.phase === "roundover") {
      const title = m.winnerName ? `🏆 ${m.winnerName} wins!` : "Round over";
      const mine = me ? `\nYou placed #${me.rank || "-"}  ·  ${me.kills} KO` : "";
      this.banner.setFontSize(40).setText(title + mine);
    } else {
      // playing
      this.banner.setText(me && !me.alive ? "Defeated — spectating" : "");
      if (me && !me.alive) this.banner.setFontSize(28);
    }
  }

  /** Edge-detected, state-driven sounds: super-ready, cube, countdown, sting. */
  private updateSoundTriggers() {
    const m = this.net.match;
    const me = this.net.self;
    if (!m) return;

    // Super just finished charging.
    const ready = !!me?.alive && (me?.super ?? 0) >= 1;
    if (ready && !this.prevSuperReady) this.sfx.superReady();
    this.prevSuperReady = ready;

    // We picked up a power cube (our own count went up).
    const cubes = me?.cubes ?? 0;
    if (cubes > this.prevCubes) this.sfx.cube();
    this.prevCubes = cubes;

    // Countdown ticks (3… 2… 1…) and the "BRAWL!" accent on zero.
    if (m.phase === "countdown") {
      const n = Math.max(0, Math.ceil(m.phaseTimeLeft / 1000));
      if (n !== this.prevCountdown) {
        this.sfx.countdown(n === 0);
        this.prevCountdown = n;
      }
    } else {
      this.prevCountdown = -1;
    }

    // On a phase change: win/lose sting, and run the music bed during PLAYING.
    if (m.phase !== this.prevPhase) {
      if (m.phase === "roundover") this.sfx.sting(!!me && me.rank === 1);
      if (m.phase === "playing") this.sfx.startMusic();
      else this.sfx.stopMusic();
      this.prevPhase = m.phase;
    }
  }

  /** Add one line to the top-right kill feed (worded from your perspective). */
  private addKillFeed(k: KOEvent) {
    const self = this.net.selfId;
    let msg: string;
    let color: string;
    if (k.killerId === "") {
      msg = `${k.victimName} succumbed to the gas`;
      color = "#c9a0ff";
    } else if (k.killerId === self) {
      msg = `You KO'd ${k.victimName}!`;
      color = "#9cffb0";
    } else if (k.victimId === self) {
      msg = `${k.killerName} KO'd you`;
      color = "#ff9a9a";
    } else {
      msg = `${k.killerName} KO'd ${k.victimName}`;
      color = "#f0f0f0";
    }

    const text = this.add
      .text(0, 0, msg, {
        fontFamily: "sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color,
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(101);

    this.killFeed.push({ text, expireAt: performance.now() + 3500 });
    while (this.killFeed.length > 4) this.killFeed.shift()!.text.destroy();
  }

  /** Expire + re-stack the kill-feed lines at top-right (zoom-corrected). */
  private updateKillFeed() {
    const now = performance.now();
    for (let i = this.killFeed.length - 1; i >= 0; i--) {
      if (now >= this.killFeed[i].expireAt) {
        this.killFeed[i].text.destroy();
        this.killFeed.splice(i, 1);
      }
    }
    const cam = this.cameras.main;
    this.killFeed.forEach((e, i) => {
      // Start below the top-right mute button so they don't overlap.
      this.placeUi(e.text, cam.width - 12, 46 + i * 24);
      const left = e.expireAt - now;
      e.text.setAlpha(left < 400 ? Math.max(0, left / 400) : 1);
    });
  }
}
