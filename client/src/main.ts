import Phaser from "phaser";
import "./style.css";
import { GameScene } from "./game/GameScene";
import { randomRoomCode, normalizeRoomCode } from "./util/roomCode";
import { MONSTER_ORDER, lookOf } from "./game/monsters";
import { setupPwaUpdates } from "./pwa";

/**
 * App entry point. This wires up the plain-HTML lobby and, once you join,
 * boots the Phaser game. Keeping the lobby as HTML (instead of inside Phaser)
 * makes the text inputs behave nicely with mobile keyboards.
 */

/**
 * Kill browser pinch-/double-tap-zoom on touch devices.
 *
 * iOS Safari IGNORES `user-scalable=no` / `maximum-scale` in the viewport meta
 * (Apple disabled it for accessibility), so two thumbs on the twin-stick zones
 * trigger a page pinch-zoom. Worse, recognising that gesture makes Safari STEAL
 * the touch — it never delivers a touchend/touchcancel, so nipplejs can't clean
 * up and the aim stick gets stuck on screen and stops firing. Preventing the
 * gesture here fixes both the zoom and the stuck stick.
 *
 * We block the iOS-only `gesture*` events and any multi-touch `touchmove`.
 * preventDefault only stops the browser's default (zoom/scroll); the events
 * still reach nipplejs, so the joysticks keep working. Single-touch taps and
 * typing in the lobby are untouched.
 */
function disablePageZoom() {
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener(
    "touchmove",
    (e) => {
      if ((e as TouchEvent).touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
disablePageZoom();

// Show a "new version available" banner when a fresh deploy is waiting, so
// updates never get stuck behind a stale service worker (see client/src/pwa.ts).
setupPwaUpdates();

const lobby = document.getElementById("lobby")!;
const nameInput = document.getElementById("name") as HTMLInputElement;
const codeInput = document.getElementById("code") as HTMLInputElement;
const monstersEl = document.getElementById("monsters")!;
const errorEl = document.getElementById("error")!;

let game: Phaser.Game | undefined;

// ---- Monster picker: one tappable card per monster, with stat bars ----
let chosenMonster = MONSTER_ORDER[0];

// Normalize each stat against the strongest monster so the bars are comparable.
const looks = MONSTER_ORDER.map(lookOf);
const statMax = {
  health: Math.max(...looks.map((l) => l.health)),
  damage: Math.max(...looks.map((l) => l.damage)),
  speed: Math.max(...looks.map((l) => l.speed)),
  range: Math.max(...looks.map((l) => l.range)),
};
const statRow = (label: string, value: number, max: number) =>
  `<span class="m-stat"><span class="m-stat-label">${label}</span>` +
  `<span class="m-bar"><i style="width:${Math.round((value / max) * 100)}%"></i></span></span>`;

MONSTER_ORDER.forEach((id) => {
  const look = lookOf(id);
  const card = document.createElement("button");
  card.type = "button";
  card.className = "monster-card";
  card.dataset.id = id;
  card.style.setProperty("--accent", look.accent);
  card.innerHTML =
    `<span class="m-portrait">${look.emoji}</span>` +
    `<span class="m-name">${look.name}</span>` +
    `<span class="m-stats">` +
    statRow("HP", look.health, statMax.health) +
    statRow("DMG", look.damage, statMax.damage) +
    statRow("SPD", look.speed, statMax.speed) +
    statRow("RNG", look.range, statMax.range) +
    `</span>` +
    `<span class="m-blurb">${look.blurb}</span>`;
  card.addEventListener("click", () => selectMonster(id));
  monstersEl.appendChild(card);
});

// ---- Gadget chooser: pick 1 of the selected monster's 2 gadgets ----
let chosenGadget = 0;
const gadgetWrap = document.createElement("div");
gadgetWrap.id = "gadget-pick";
// Place the chooser AFTER the whole "Pick your monster" <label>, not inside it.
// #monsters lives inside that label, so inserting "afterend" of #monsters would
// nest these gadget buttons within the label — and a <label> forwards clicks to
// its first labelable control (the first monster card), which runs selectMonster
// and resets chosenGadget to 0. That made the second gadget impossible to pick
// (clicks set it to 1, then the label immediately reset it to 0).
const monsterLabel = monstersEl.closest("label") ?? monstersEl;
monsterLabel.insertAdjacentElement("afterend", gadgetWrap);
function renderGadgets(id: string) {
  const g = lookOf(id).gadgets;
  gadgetWrap.innerHTML =
    `<div class="gp-label">Gadget — pick one</div><div class="gp-row">` +
    g
      .map(
        (gad, i) =>
          `<button type="button" class="gp-btn${i === chosenGadget ? " selected" : ""}" data-i="${i}">` +
          `<img class="gp-icon" src="${import.meta.env.BASE_URL}gadgets/${gad.id}.png" alt="" draggable="false" />` +
          `<span class="gp-name">${gad.name}</span>` +
          `<span class="gp-desc">${gad.desc}</span>` +
          `</button>`,
      )
      .join("") +
    `</div>`;
  gadgetWrap.querySelectorAll(".gp-btn").forEach((b) =>
    b.addEventListener("click", (e) => {
      // Keep the click from bubbling / triggering any ancestor default action.
      e.preventDefault();
      e.stopPropagation();
      chosenGadget = Number((b as HTMLElement).dataset.i);
      renderGadgets(id);
    }),
  );
}

function selectMonster(id: string) {
  // Only reset the chosen gadget when the monster ACTUALLY changes. This also
  // makes the picker robust to any stray re-selection of the current monster
  // (e.g. a click that bubbles/forwards): re-selecting the same monster must not
  // wipe a gadget the player just picked.
  if (id !== chosenMonster) chosenGadget = 0;
  chosenMonster = id;
  monstersEl.querySelectorAll(".monster-card").forEach((c) => {
    c.classList.toggle("selected", (c as HTMLElement).dataset.id === id);
  });
  renderGadgets(id);
}
selectMonster(chosenMonster);

// Pre-fill the code from a shared link (?room=CODE or #CODE) if present, else a
// random code so a solo developer can just hit "Join arena".
const sharedCode =
  normalizeRoomCode(new URLSearchParams(location.search).get("room")) ??
  normalizeRoomCode(location.hash.replace(/^#/, ""));
codeInput.value = sharedCode ?? randomRoomCode();

// The dice button makes a fresh code (i.e. a brand new arena).
document.getElementById("generate")!.addEventListener("click", () => {
  codeInput.value = randomRoomCode();
});

// Copy a shareable link (origin + ?room=CODE) for the current code.
const copyLinkBtn = document.getElementById("copy-link") as HTMLButtonElement;
copyLinkBtn.addEventListener("click", async () => {
  const code = (normalizeRoomCode(codeInput.value) ?? randomRoomCode());
  codeInput.value = code;
  const link = `${location.origin}${location.pathname}?room=${code}`;
  try {
    await navigator.clipboard.writeText(link);
    copyLinkBtn.textContent = "✅";
  } catch {
    // Clipboard blocked (insecure context / permissions) — show the link to copy.
    window.prompt("Copy this link to share the room:", link);
  }
  window.setTimeout(() => (copyLinkBtn.textContent = "🔗"), 1200);
});

document.getElementById("join")!.addEventListener("click", startGame);
// Pressing Enter in either field also joins.
[nameInput, codeInput].forEach((el) =>
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startGame();
  }),
);

function startGame() {
  const roomCode = normalizeRoomCode(codeInput.value) ?? randomRoomCode();
  const name = nameInput.value.trim() || "Player";

  // Reflect the active room into the URL so the address bar is copy-pasteable and
  // a refresh rejoins the same room.
  history.replaceState(null, "", `${location.pathname}?room=${roomCode}`);

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

  // Start the scene and pass the chosen room code + name + monster into create().
  game.scene.add("GameScene", GameScene, true, {
    roomCode,
    name,
    monster: chosenMonster,
    gadget: chosenGadget,
  });
}
