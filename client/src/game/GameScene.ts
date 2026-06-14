import Phaser from "phaser";
import { Network, type PlayerSnapshot } from "../net/Network";
import { PlayerView } from "./PlayerView";
import { Controls } from "../input/Controls";
import { INTERPOLATION_SMOOTHING } from "../config";

/** Data passed in when we start this scene from the lobby. */
interface SceneData {
  roomCode: string;
  name: string;
}

/**
 * The one and only gameplay scene. Its job each frame is small and clear:
 *   1. Read our input and send it to the server (only when it changes).
 *   2. Glide every player's sprite toward the latest server position.
 *   3. Update the heads-up display (room code + player count).
 *
 * Everything about *where players actually are* comes from the server via the
 * Network wrapper — this scene never decides positions itself.
 */
export class GameScene extends Phaser.Scene {
  private net!: Network;
  private controls!: Controls;

  /** All player sprites on screen, keyed by player id. */
  private views = new Map<string, PlayerView>();

  private roomCode = "";
  private hud?: Phaser.GameObjects.Text;

  // Remember the last input we sent so we only send when it actually changes.
  private lastSentX = 0;
  private lastSentY = 0;

  constructor() {
    super("GameScene");
  }

  create(data: SceneData) {
    this.roomCode = data.roomCode;
    this.cameras.main.setBackgroundColor("#10101a");

    this.controls = new Controls(this);

    // A simple heads-up display pinned to the corner of the screen.
    this.hud = this.add
      .text(12, 12, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ffffff",
        backgroundColor: "#00000080",
      })
      .setPadding(8, 6, 8, 6)
      .setScrollFactor(0) // stays put as the camera moves
      .setDepth(100);

    // Connect and hook the server's state up to our render callbacks.
    this.net = new Network();
    this.net
      .join(data.roomCode, data.name, {
        onJoin: (w, h) => this.setupArena(w, h),
        onPlayerAdd: (player) => this.addPlayer(player),
        onPlayerChange: (player) => this.movePlayer(player),
        onPlayerRemove: (id) => this.removePlayer(id),
      })
      .catch((error) => {
        console.error("Failed to join:", error);
        // Tell main.ts to show the lobby again with a friendly message.
        this.game.events.emit(
          "join-error",
          "Could not reach the server. Is it running?",
        );
      });

    // Clean up the connection and joystick if this scene shuts down.
    this.events.once("shutdown", () => {
      this.controls.destroy();
      this.net.leave();
    });
  }

  /** Draw the arena once we know its size (from the server). */
  private setupArena(width: number, height: number) {
    // Arena floor.
    this.add
      .rectangle(0, 0, width, height, 0x1b1b2f)
      .setOrigin(0, 0)
      .setStrokeStyle(3, 0x44446a)
      .setDepth(-10);

    // A faint grid so motion is easy to see.
    const grid = this.add.graphics().setDepth(-9);
    grid.lineStyle(1, 0x2a2a4a, 1);
    for (let x = 0; x <= width; x += 100) {
      grid.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += 100) {
      grid.lineBetween(0, y, width, y);
    }

    // Keep the camera inside the arena and follow our own player.
    this.cameras.main.setBounds(0, 0, width, height);
    const me = this.views.get(this.net.selfId);
    if (me) {
      this.cameras.main.startFollow(me.body, true, 0.15, 0.15);
    }
  }

  /** A player appeared: create a sprite for them. */
  private addPlayer(player: PlayerSnapshot) {
    const isLocal = player.id === this.net.selfId;
    const view = new PlayerView(
      this,
      player.x,
      player.y,
      player.color,
      player.name,
      isLocal,
    );
    this.views.set(player.id, view);

    // If our own player just appeared and the arena is already set up, follow it.
    if (isLocal) {
      this.cameras.main.startFollow(view.body, true, 0.15, 0.15);
    }
  }

  /** A player moved on the server: aim their sprite at the new position. */
  private movePlayer(player: PlayerSnapshot) {
    this.views.get(player.id)?.setTarget(player.x, player.y);
  }

  /** A player left: remove their sprite. */
  private removePlayer(id: string) {
    this.views.get(id)?.destroy();
    this.views.delete(id);
  }

  /** Phaser calls this every frame (~60 times a second). */
  update() {
    // 1. Send our input — but only when it has changed, to avoid spamming.
    if (this.net.connected) {
      const v = this.controls.getVector();
      if (
        Math.abs(v.x - this.lastSentX) > 0.02 ||
        Math.abs(v.y - this.lastSentY) > 0.02
      ) {
        this.net.sendInput(v.x, v.y);
        this.lastSentX = v.x;
        this.lastSentY = v.y;
      }
    }

    // 2. Smoothly glide every sprite toward its latest server position.
    this.views.forEach((view) => view.interpolate(INTERPOLATION_SMOOTHING));

    // 3. Refresh the HUD.
    if (this.hud) {
      this.hud.setText(`Room ${this.roomCode}    Players: ${this.net.playerCount}`);
    }
  }
}
