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

/** Touch device? (iPads report maxTouchPoints > 0.) */
const IS_TOUCH =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0);

/**
 * Brawl-Stars-style twin-stick controls.
 *
 * ON TOUCH: the LEFT half of the screen = move, the RIGHT half = aim (release to
 * FIRE; a quick tap fires at the nearest enemy). Each stick floats under your
 * thumb. Crucially each stick gets its OWN half-screen zone — two sticks sharing
 * one zone fight over touches (the right one goes dead and you can't move + aim
 * at once), which is the bug this fixes.
 *
 * ON DESKTOP: we DON'T create the touch zones (they'd cover the canvas and block
 * the mouse). GameScene handles mouse aim + click-to-fire there instead; here we
 * just provide WASD/arrow movement. The SUPER button works on both.
 */
export class Controls {
  private moveStick?: Joystick;
  private aimStick?: Joystick;
  private leftZone?: HTMLDivElement;
  private rightZone?: HTMLDivElement;
  private superButton: HTMLButtonElement;

  private joyX = 0;
  private joyY = 0;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  /** Last aimed direction (kept so the Super fires where you last pointed). */
  private lastAim: Dir = { x: 1, y: 0 };
  private aimMoved = false;
  private lastAimSent = 0;

  constructor(scene: Phaser.Scene, private events: ControlEvents) {
    const gameEl = document.getElementById("game")!;

    // ---- Keyboard (desktop) ----
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

    if (IS_TOUCH) this.createTouchSticks(gameEl);

    // ---- SUPER button (both platforms; on top of the right zone) ----
    this.superButton = document.createElement("button");
    this.superButton.id = "super-btn";
    this.superButton.textContent = "SUPER";
    this.superButton.className = "super-btn";
    gameEl.appendChild(this.superButton);
    this.superButton.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.events.onSuper(this.lastAim);
    });

    // No right-click menu over the play area (right-click = super on desktop).
    gameEl.addEventListener("contextmenu", this.blockContext);
  }

  /** Build the two floating joysticks, each in its own half-screen zone. */
  private createTouchSticks(gameEl: HTMLElement) {
    this.leftZone = document.createElement("div");
    this.leftZone.className = "joy-zone left";
    this.rightZone = document.createElement("div");
    this.rightZone.className = "joy-zone right";
    gameEl.appendChild(this.leftZone);
    gameEl.appendChild(this.rightZone);

    // LEFT: movement.
    this.moveStick = nipplejs.create({
      zone: this.leftZone,
      mode: "dynamic",
      color: "white",
      size: 120,
      restJoystick: true,
    });
    this.moveStick.on("move", (event) => {
      this.joyX = event.data.vector.x;
      this.joyY = -event.data.vector.y; // nipplejs y points up; screen y points down
    });
    this.moveStick.on("end", () => {
      this.joyX = 0;
      this.joyY = 0;
    });

    // RIGHT: aim + fire.
    this.aimStick = nipplejs.create({
      zone: this.rightZone,
      mode: "dynamic",
      color: "#ff5252",
      size: 120,
      restJoystick: true,
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

  /** Remove the joysticks + zones + button (called when leaving the game). */
  destroy(): void {
    this.moveStick?.destroy();
    this.aimStick?.destroy();
    this.superButton.remove();
    this.leftZone?.remove();
    this.rightZone?.remove();
    document.getElementById("game")?.removeEventListener("contextmenu", this.blockContext);
  }
}
