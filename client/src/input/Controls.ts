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
  /** Use the chosen gadget in the given direction. */
  onGadget: (dir: Dir) => void;
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
  private gadgetButton: HTMLButtonElement;
  private gameEl: HTMLElement;

  private joyX = 0;
  private joyY = 0;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  /** Last aimed direction (kept so the Super fires where you last pointed). */
  private lastAim: Dir = { x: 1, y: 0 };
  private aimMoved = false;
  private lastAimSent = 0;
  /** True while a stick is being held. If one of these is still set once every
   *  finger is off the screen, nipplejs missed its `end` (the stuck-stick bug)
   *  and the watchdog rebuilds the sticks. */
  private aimActive = false;
  private moveActive = false;

  constructor(scene: Phaser.Scene, private events: ControlEvents) {
    const gameEl = document.getElementById("game")!;
    this.gameEl = gameEl;

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

    if (IS_TOUCH) {
      this.createTouchSticks(gameEl);
      // Self-healing watchdog for nipplejs's occasional missed `end` (a touch
      // cancelled/stolen without a clean touchend leaves the nipple stuck on
      // screen and dead). When every finger is up — or the app loses focus —
      // but a stick still reads active, rebuild the sticks from scratch.
      document.addEventListener("touchend", this.onTouchRelease, true);
      document.addEventListener("touchcancel", this.onTouchRelease, true);
      document.addEventListener("visibilitychange", this.onAppBlur);
      window.addEventListener("blur", this.onAppBlur);
    }

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

    // ---- GADGET button (below the super button) ----
    this.gadgetButton = document.createElement("button");
    this.gadgetButton.id = "gadget-btn";
    this.gadgetButton.textContent = "GADGET";
    this.gadgetButton.className = "gadget-btn";
    gameEl.appendChild(this.gadgetButton);
    this.gadgetButton.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.events.onGadget(this.lastAim);
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
      // One stick per zone — a stray second finger must not spawn a ghost
      // joystick that lingers after the real one is released.
      maxNumberOfJoysticks: 1,
    });
    this.moveStick.on("start", () => {
      this.moveActive = true;
    });
    this.moveStick.on("move", (event) => {
      this.joyX = event.data.vector.x;
      this.joyY = -event.data.vector.y; // nipplejs y points up; screen y points down
    });
    this.moveStick.on("end", () => {
      this.joyX = 0;
      this.joyY = 0;
      this.moveActive = false;
    });

    // RIGHT: aim + fire.
    this.aimStick = nipplejs.create({
      zone: this.rightZone,
      mode: "dynamic",
      color: "#ff5252",
      size: 120,
      restJoystick: true,
      maxNumberOfJoysticks: 1,
    });
    this.aimStick.on("start", () => {
      this.aimActive = true;
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
      this.aimActive = false;
    });
  }

  /** True while the player is holding the aim stick (touch). */
  isAiming(): boolean {
    return this.aimActive;
  }

  /**
   * When the last finger leaves the screen, give nipplejs a moment to fire its
   * `end` (which clears the active flags), then — if a stick is somehow STILL
   * active — it's the stuck-stick bug, so rebuild the sticks clean. The delay
   * matters: it lets a normal release (and its `onFire`) complete first.
   */
  private onTouchRelease = (e: TouchEvent) => {
    if (e.touches.length > 0) return; // a finger is still down on the other stick
    setTimeout(() => {
      if (this.aimActive || this.moveActive) this.rebuildSticks();
    }, 60);
  };

  /** Losing focus/visibility can drop touch-end events entirely — reset then. */
  private onAppBlur = () => {
    if (this.aimActive || this.moveActive) this.rebuildSticks();
  };

  /** Tear the sticks (and any orphaned nipple DOM) down and recreate them. */
  private rebuildSticks() {
    this.moveStick?.destroy();
    this.aimStick?.destroy();
    this.leftZone?.remove(); // removing the zone also drops any stuck nipple
    this.rightZone?.remove();
    this.joyX = 0;
    this.joyY = 0;
    this.aimActive = false;
    this.moveActive = false;
    this.aimMoved = false;
    this.createTouchSticks(this.gameEl);
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

  /** Let GameScene light up the Gadget button when it's off cooldown. */
  setGadgetReady(ready: boolean): void {
    this.gadgetButton.classList.toggle("ready", ready);
  }

  /** Remove the joysticks + zones + button (called when leaving the game). */
  destroy(): void {
    this.moveStick?.destroy();
    this.aimStick?.destroy();
    this.superButton.remove();
    this.gadgetButton.remove();
    this.leftZone?.remove();
    this.rightZone?.remove();
    document.getElementById("game")?.removeEventListener("contextmenu", this.blockContext);
    document.removeEventListener("touchend", this.onTouchRelease, true);
    document.removeEventListener("touchcancel", this.onTouchRelease, true);
    document.removeEventListener("visibilitychange", this.onAppBlur);
    window.removeEventListener("blur", this.onAppBlur);
  }
}
