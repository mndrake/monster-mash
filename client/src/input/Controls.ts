import Phaser from "phaser";
import nipplejs from "nipplejs";
import { AIM_SEND_INTERVAL } from "../config";

/** The joystick manager type (nipplejs doesn't export it by name). */
type Joystick = ReturnType<typeof nipplejs.create>;

/** A normalized direction. */
export interface Dir {
  x: number;
  y: number;
}

/** The game hooks these so it can forward intent to the server. */
export interface ControlEvents {
  /** Aim direction changed (throttled) — update facing on the server. */
  onAim: (dir: Dir) => void;
  /** Fire the main attack. {0,0} means "quick fire" (server auto-aims). */
  onFire: (dir: Dir) => void;
  /** Use the super in the given direction. */
  onSuper: (dir: Dir) => void;
}

/**
 * Brawl-Stars-style twin-stick controls:
 *   - LEFT joystick (or WASD/arrows) = move.
 *   - RIGHT joystick = aim; releasing it FIRES in that direction. A quick tap
 *     (barely dragged) fires at the nearest enemy.
 *   - SUPER button (bottom-right) = unleash the special in your last aim.
 *
 * Desktop mouse/keyboard for aim, fire, and super is handled in GameScene,
 * which knows the player's on-screen position; this class owns the touch UI.
 */
export class Controls {
  private moveStick: Joystick;
  private aimStick: Joystick;
  private superButton: HTMLButtonElement;

  private joyX = 0;
  private joyY = 0;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  /** Last aimed direction (kept so the Super fires where you last pointed). */
  private lastAim: Dir = { x: 1, y: 0 };
  private aimMoved = false;
  private lastAimSent = 0;

  constructor(scene: Phaser.Scene, private events: ControlEvents) {
    const zone = document.getElementById("game")!;

    // ---- Keyboard (desktop dev) ----
    const keyboard = scene.input.keyboard!;
    const Codes = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: keyboard.addKey("W"),
      down: keyboard.addKey("S"),
      left: keyboard.addKey("A"),
      right: keyboard.addKey("D"),
      upArrow: keyboard.addKey(Codes.UP),
      downArrow: keyboard.addKey(Codes.DOWN),
      leftArrow: keyboard.addKey(Codes.LEFT),
      rightArrow: keyboard.addKey(Codes.RIGHT),
    };

    // ---- LEFT: movement joystick ----
    this.moveStick = nipplejs.create({
      zone,
      mode: "static",
      position: { left: "20%", bottom: "22%" },
      color: "white",
      size: 120,
    });
    this.moveStick.on("move", (event) => {
      this.joyX = event.data.vector.x;
      this.joyY = -event.data.vector.y; // nipplejs y points up; screen y points down
    });
    this.moveStick.on("end", () => {
      this.joyX = 0;
      this.joyY = 0;
    });

    // ---- RIGHT: aim + fire joystick ----
    this.aimStick = nipplejs.create({
      zone,
      mode: "static",
      position: { right: "20%", bottom: "22%" },
      color: "#ff5252",
      size: 120,
    });
    this.aimStick.on("move", (event) => {
      const x = event.data.vector.x;
      const y = -event.data.vector.y;
      this.lastAim = { x, y };
      if (event.data.force > 0.35) this.aimMoved = true;
      // Throttle the aim updates we send so we don't flood the socket.
      const now = performance.now();
      if (now - this.lastAimSent >= AIM_SEND_INTERVAL) {
        this.lastAimSent = now;
        this.events.onAim({ x, y });
      }
    });
    this.aimStick.on("end", () => {
      // Dragged out = aimed shot; barely moved = quick fire (auto-aim).
      this.events.onFire(this.aimMoved ? this.lastAim : { x: 0, y: 0 });
      this.aimMoved = false;
    });

    // ---- SUPER button (created dynamically so the lobby stays clean) ----
    this.superButton = document.createElement("button");
    this.superButton.id = "super-btn";
    this.superButton.textContent = "SUPER";
    this.superButton.className = "super-btn";
    zone.appendChild(this.superButton);
    this.superButton.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      this.events.onSuper(this.lastAim);
    });

    // No right-click menu over the play area (right-click = super on desktop).
    zone.addEventListener("contextmenu", this.blockContext);
  }

  private blockContext = (e: Event) => e.preventDefault();

  /** The current movement input, blended from joystick + keyboard. */
  getMove(): Dir {
    let x = this.joyX;
    let y = this.joyY;
    if (this.keys.left.isDown || this.keys.leftArrow.isDown) x = -1;
    if (this.keys.right.isDown || this.keys.rightArrow.isDown) x = 1;
    if (this.keys.up.isDown || this.keys.upArrow.isDown) y = -1;
    if (this.keys.down.isDown || this.keys.downArrow.isDown) y = 1;
    return { x, y };
  }

  /** Let GameScene light up the Super button when it's charged. */
  setSuperReady(ready: boolean): void {
    this.superButton.classList.toggle("ready", ready);
  }

  /** Remove the joysticks + button (called when leaving the game). */
  destroy(): void {
    this.moveStick.destroy();
    this.aimStick.destroy();
    this.superButton.remove();
    document.getElementById("game")?.removeEventListener("contextmenu", this.blockContext);
  }
}
