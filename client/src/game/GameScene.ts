import Phaser from "phaser";
import {
  Network,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type CubeSnapshot,
} from "../net/Network";
import { PlayerView } from "./PlayerView";
import { ProjectileView } from "./ProjectileView";
import { PowerCubeView } from "./PowerCubeView";
import { Controls, type Dir } from "../input/Controls";
import {
  INTERPOLATION_SMOOTHING,
  PROJECTILE_SMOOTHING,
  AIM_SEND_INTERVAL,
  FIRE_REPEAT_INTERVAL,
} from "../config";
import { lookOf } from "./monsters";

/** Data passed in when we start this scene from the lobby. */
interface SceneData {
  roomCode: string;
  name: string;
  monster: string;
}

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

  private roomCode = "";
  private monster = "gnash";

  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private poison!: Phaser.GameObjects.Graphics;

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
    this.cameras.main.setBackgroundColor("#10101a");

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

    // Above the floor/grid, below the monsters — a tinted hazard on the ground.
    this.poison = this.add.graphics().setDepth(-5);

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

    // Connect and hook the server's state up to our render callbacks.
    this.net = new Network();
    this.net
      .join(data.roomCode, data.name, data.monster, {
        onJoin: (w, h) => this.setupArena(w, h),
        onPlayerAdd: (p) => this.addPlayer(p),
        onPlayerChange: (p) => this.players.get(p.id)?.update(p),
        onPlayerRemove: (id) => this.removePlayer(id),
        onProjectileAdd: (p) => this.addProjectile(p),
        onProjectileMove: (p) => this.projectiles.get(p.id)?.setTarget(p),
        onProjectileRemove: (id) => this.removeProjectile(id),
        onCubeAdd: (c) => this.addCube(c),
        onCubeRemove: (id) => this.removeCube(id),
      })
      .catch((error) => {
        console.error("Failed to join:", error);
        this.game.events.emit("join-error", "Could not reach the server. Is it running?");
      });

    this.events.once("shutdown", () => {
      this.controls.destroy();
      this.net.leave();
    });
  }

  /** Draw the arena once we know its size (from the server). */
  private setupArena(width: number, height: number) {
    this.add
      .rectangle(0, 0, width, height, 0x1b1b2f)
      .setOrigin(0, 0)
      .setStrokeStyle(4, 0x44446a)
      .setDepth(-10);

    const grid = this.add.graphics().setDepth(-9);
    grid.lineStyle(1, 0x2a2a4a, 1);
    for (let x = 0; x <= width; x += 100) grid.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += 100) grid.lineBetween(0, y, width, y);

    this.cameras.main.setBounds(0, 0, width, height);
    const me = this.players.get(this.net.selfId);
    if (me) this.cameras.main.startFollow(me.body, true, 0.15, 0.15);
  }

  private addPlayer(p: PlayerSnapshot) {
    const isLocal = p.id === this.net.selfId;
    const view = new PlayerView(this, p, isLocal);
    this.players.set(p.id, view);
    if (isLocal) this.cameras.main.startFollow(view.body, true, 0.15, 0.15);
  }

  private removePlayer(id: string) {
    this.players.get(id)?.destroy();
    this.players.delete(id);
  }

  private addProjectile(p: ProjectileSnapshot) {
    this.projectiles.set(p.id, new ProjectileView(this, p));
  }
  private removeProjectile(id: string) {
    this.projectiles.get(id)?.destroy();
    this.projectiles.delete(id);
  }

  private addCube(c: CubeSnapshot) {
    this.cubes.set(c.id, new PowerCubeView(this, c));
  }
  private removeCube(id: string) {
    this.cubes.get(id)?.destroy();
    this.cubes.delete(id);
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

    const dt = delta / 1000;
    this.players.forEach((v) => v.interpolate(INTERPOLATION_SMOOTHING));
    this.projectiles.forEach((v) => v.interpolate(PROJECTILE_SMOOTHING));
    this.cubes.forEach((v) => v.bob(dt));

    this.drawPoison();
    this.updateHud();
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

    // Translucent danger bands covering the unsafe edges.
    this.poison.fillStyle(0xb02a8f, 0.22);
    // top, bottom, left, right
    this.poison.fillRect(0, 0, w, m.safeMinY);
    this.poison.fillRect(0, m.safeMaxY, w, h - m.safeMaxY);
    this.poison.fillRect(0, m.safeMinY, m.safeMinX, m.safeMaxY - m.safeMinY);
    this.poison.fillRect(m.safeMaxX, m.safeMinY, w - m.safeMaxX, m.safeMaxY - m.safeMinY);
  }

  /** Top-left status text, the centered round banner, and the Super-ready glow. */
  private updateHud() {
    const m = this.net.match;
    const me = this.net.self;

    // ---- HUD ----
    if (m) {
      const lines = [`Room ${this.roomCode}   ·   ${m.aliveCount} left`];
      if (me) {
        const ammo = "●".repeat(Math.floor(me.ammo)) + "○".repeat(Math.max(0, me.ammoMax - Math.floor(me.ammo)));
        const sup = Math.round(me.super * 100);
        lines.push(
          `${lookOf(me.monster).name}  HP ${Math.ceil(me.health)}/${me.maxHealth}`,
          `Ammo ${ammo}   Super ${me.super >= 1 ? "READY" : sup + "%"}   Cubes ${me.cubes}   Kills ${me.kills}`,
        );
      }
      this.hud.setText(lines.join("\n"));
    }

    // ---- Super button glow ----
    this.controls.setSuperReady((me?.alive ?? false) && (me?.super ?? 0) >= 1);

    // ---- centered banner ----
    const cam = this.cameras.main;
    this.banner.setPosition(cam.width / 2, cam.height / 2 - 40);
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
}
