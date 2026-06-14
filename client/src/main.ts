import Phaser from "phaser";
import "./style.css";
import { GameScene } from "./game/GameScene";
import { randomRoomCode } from "./util/roomCode";

/**
 * App entry point. This wires up the plain-HTML lobby and, once you join,
 * boots the Phaser game. Keeping the lobby as HTML (instead of inside Phaser)
 * makes the text inputs behave nicely with mobile keyboards.
 */

const lobby = document.getElementById("lobby")!;
const nameInput = document.getElementById("name") as HTMLInputElement;
const codeInput = document.getElementById("code") as HTMLInputElement;
const errorEl = document.getElementById("error")!;

let game: Phaser.Game | undefined;

// Pre-fill a random code so a solo developer can just hit "Join arena".
codeInput.value = randomRoomCode();

// The dice button makes a fresh code (i.e. a brand new arena).
document.getElementById("generate")!.addEventListener("click", () => {
  codeInput.value = randomRoomCode();
});

document.getElementById("join")!.addEventListener("click", startGame);
// Pressing Enter in either field also joins.
[nameInput, codeInput].forEach((el) =>
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startGame();
  }),
);

function startGame() {
  const roomCode = (codeInput.value.trim() || randomRoomCode()).toUpperCase();
  const name = nameInput.value.trim() || "Player";

  errorEl.textContent = "";
  lobby.style.display = "none";

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#10101a",
    // RESIZE mode makes the canvas fill whatever space it has — phone, tablet,
    // or a desktop browser tab — and re-fits when the screen rotates.
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: "100%",
      height: "100%",
    },
    scene: [],
  });

  // If joining fails, GameScene emits "join-error"; show the lobby again.
  game.events.on("join-error", (message: string) => {
    errorEl.textContent = message;
    game?.destroy(true);
    game = undefined;
    lobby.style.display = "";
  });

  // Start the scene and pass the chosen room code + name into create().
  game.scene.add("GameScene", GameScene, true, { roomCode, name });
}
