import Phaser from "phaser";
import nipplejs from "nipplejs";

/** The joystick manager type (nipplejs doesn't export it by name). */
type Joystick = ReturnType<typeof nipplejs.create>;

/**
 * Reads movement input from two sources and blends them into ONE vector:
 *   - an on-screen virtual joystick (nipplejs) for touch / mobile
 *   - WASD and arrow keys for desktop development
 *
 * getVector() returns { x, y } where each value is in [-1, 1]:
 *   x: -1 = left,  +1 = right
 *   y: -1 = up,    +1 = down   (y grows downward, matching screen pixels)
 *
 * The game scene reads this vector and sends it to the server. That's all the
 * client decides — the server turns the vector into actual movement.
 */
export class Controls {
  private joystick: Joystick;
  private joyX = 0;
  private joyY = 0;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    // ---- Keyboard (handy for desktop dev) ----
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

    // ---- Virtual joystick (touch) ----
    // A "static" joystick sits in a fixed spot in the lower-left of the screen.
    this.joystick = nipplejs.create({
      zone: document.getElementById("game")!,
      mode: "static",
      position: { left: "22%", bottom: "24%" },
      color: "white",
      size: 120,
    });

    // While dragging, nipplejs gives us a normalized vector in [-1, 1]. Its y
    // axis points up, so we flip it to match screen coordinates (y grows down).
    this.joystick.on("move", (event) => {
      this.joyX = event.data.vector.x;
      this.joyY = -event.data.vector.y;
    });
    // On release, stop moving.
    this.joystick.on("end", () => {
      this.joyX = 0;
      this.joyY = 0;
    });
  }

  /** The current movement input, blended from joystick + keyboard. */
  getVector(): { x: number; y: number } {
    // Start with the joystick value...
    let x = this.joyX;
    let y = this.joyY;

    // ...and let held keys override it (full speed in that direction).
    if (this.keys.left.isDown || this.keys.leftArrow.isDown) x = -1;
    if (this.keys.right.isDown || this.keys.rightArrow.isDown) x = 1;
    if (this.keys.up.isDown || this.keys.upArrow.isDown) y = -1;
    if (this.keys.down.isDown || this.keys.downArrow.isDown) y = 1;

    return { x, y };
  }

  /** Remove the joystick DOM element (called when leaving the game). */
  destroy(): void {
    this.joystick.destroy();
  }
}
