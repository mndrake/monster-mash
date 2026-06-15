# Monster Mash 🟣

A tiny, private, browser-based **2D top-down brawler** you can play with friends
on the same wifi — a monster-themed take on Brawl Stars. No app store, no
accounts, no payments. It installs to your phone's home screen as a fullscreen
PWA.

**It's a SHOWDOWN free-for-all.** Pick one of **six** monsters, drop into a shared
arena, shoot the others, break boxes for power cubes, use the walls and bushes,
and survive the closing poison gas until you're the **last monster standing**.
Rounds run back-to-back (a quick "3… 2… 1…" countdown, a winner banner, then
again) so nobody waits long.

### The six monsters

| Monster | Style | Feel |
| --- | --- | --- |
| 👹 **Gnash** | Fast melee biter | Fragile but quick — dash in, chomp, dash out. Super lunges forward with a triple bite. |
| 👾 **Spit** | Mid-range marksman | Balanced. Super sprays a five-glob fan. |
| 🐲 **Brute** | Slow tank | Huge health, heavy boulders. Super hurls one giant rock. |
| 🦂 **Vex** | Long-range sniper | Longest reach, hits hard, but fragile and slow to fire. |
| 🐡 **Spike** | Close-range shotgun | A wide 5-pellet fan that shreds up close; super dashes in and blasts. |
| 👻 **Wisp** | Fast skirmisher | The quickest feet, a deep clip, rapid light shots. |

### Core mechanics (ported from Brawl Stars)

- **Twin-stick combat** — left stick moves, right stick aims & fires; release to
  shoot, or tap for a quick auto-aimed shot. On desktop: WASD + mouse aim, click
  to fire.
- **Ammo bars** — a few shots that auto-reload over time (not reload-on-empty).
- **Super** — a powerful special that charges as you land hits; fire it with the
  glowing SUPER button (or Space / right-click on desktop).
- **Health + regen** — take damage and you're defeated at 0; avoid damage for a
  few seconds and health regenerates.
- **Terrain** — **walls** block movement *and* shots (slide along them);
  **bushes** hide you when you're not firing or recently hit.
- **Breakable boxes & power cubes** — shoot **boxes** to pop **power cubes**
  (which raise your health + damage); defeated monsters also drop theirs to loot.
- **Closing poison** — after a grace period the safe area shrinks and a wall of
  gas creeps in; standing in it hurts (more and more), forcing the finish.
- **Feel** — on-character ammo/super HUD, an aim indicator, damage numbers, a
  kill feed, defeat/spawn FX, synthesized sound + music, and client-side movement
  prediction so your own monster responds instantly.

---

## How the multiplayer works (the 60-second version)

The **server is authoritative** — it is the single source of truth for where
everyone is. Clients are "dumb": they send what the player *wants* to do and
draw what the server tells them.

```
   YOUR PHONE / TAB                         THE SERVER (one room = one arena)
 ┌──────────────────┐                      ┌────────────────────────────────┐
 │ joystick / keys   │   "input" {x,y}      │ stores your input vector        │
 │  ───────────────► │ ───────────────────► │                                 │
 │                   │                      │ every tick (30×/sec):           │
 │                   │                      │   position += input × speed     │
 │ draw each player  │   state snapshot     │   (clamped to the arena)        │
 │  ◄─────────────── │ ◄─────────────────── │ broadcast new positions         │
 │ glide toward the  │                      │                                 │
 │ new positions     │                      │                                 │
 │ (interpolation)   │                      │                                 │
 └──────────────────┘                      └────────────────────────────────┘
```

1. **Input** — the client reads the joystick/keys and sends a little vector
   `{ x, y }` (each between −1 and 1). It only sends when the input *changes*.
2. **Tick** — 30 times a second the server moves every player by their last
   input. The server owns the positions, so nobody can cheat by teleporting.
3. **Snapshot** — Colyseus broadcasts the changed state to every client after
   each tick (the room's patch rate is set to 30 Hz to match).
4. **Interpolation + prediction** — the server only updates ~30×/sec, which would
   look choppy. *Other* players are *glided* toward their latest server position
   each frame (~60×/sec). **Your own** monster is **client-side predicted** — it
   moves the instant you press a direction (through the same wall/box collision
   the server runs) and reconciles to the server underneath, so it feels
   immediate while the server stays authoritative.

**Combat is authoritative the same way.** Clients only send *intent* — "fire
this direction", "use super". The server spawns the shots, moves them, decides
who got hit, applies damage, collects cubes, runs the poison, and declares the
winner. Clients just draw what the server reports, so nobody can fake a hit or
teleport out of the poison.

### Files to read, in order

If you want to understand the netcode, read these (they're short and commented):

| Step | File | What it does |
| --- | --- | --- |
| 1. Tuning | `server/src/config.ts` | All the knobs: the 6 monsters' stats, cube/box/poison/round settings, tick rate. |
| 2. Synced state | `server/src/schema/*.ts` | `Player`, `Projectile`, `PowerCube`, `Box`, `MatchState` — the data shared with every client. |
| 3. The match + tick | `server/src/rooms/MatchRoom.ts` | The whole authoritative 30 Hz loop: movement, shooting, damage, cubes, boxes, poison, rounds. |
| 4. Server bootstrap | `server/src/index.ts` | Starts Colyseus; `filterBy(["roomCode"])` is how room codes work. |
| 5. Transport boundary | `client/src/net/Network.ts` | The **only** client file that knows about Colyseus. Swap backends here. |
| 6. Input | `client/src/input/Controls.ts` | Twin-stick joysticks + keyboard → move / aim / fire / super intent. |
| 7. Views | `client/src/game/PlayerView.ts`, `ProjectileView.ts`, `PowerCubeView.ts` | Hold a "target" and glide toward it (interpolation). |
| 8. Glue | `client/src/game/GameScene.ts` | Each frame: send intent → glide everything → draw the poison + HUD + banner. |

---

## Project layout

```
/                         root scripts; `npm run dev` runs both packages
├── client/               Phaser 3 + Vite PWA (what the browser runs)
│   ├── index.html        the lobby (plain HTML) + the game canvas
│   ├── vite.config.ts    dev server + PWA manifest/service worker
│   └── src/
│       ├── main.ts       lobby logic (monster picker w/ stat bars) → boots Phaser
│       ├── config.ts     server URL + interpolation/prediction settings
│       ├── game/         scene, player/projectile/cube/box views, monster looks,
│       │                 client collision (for prediction)
│       ├── audio/        synthesized sound effects + music (no asset files)
│       ├── net/          Colyseus client wrapper (the transport boundary)
│       ├── input/        twin-stick joysticks + keyboard
│       └── util/         room-code generator
└── server/               Colyseus authoritative server (Node)
    └── src/
        ├── index.ts      server bootstrap
        ├── config.ts     monsters' stats, cube/box/poison/round tuning, tick rate
        ├── geom.ts       pure collision math (+ geom.test.ts)
        ├── rooms/        MatchRoom: the full authoritative Showdown loop
        └── schema/       synced state (players, projectiles, cubes, boxes, match)
```

---

## Run it

You need **Node.js 20+** (LTS recommended).

```bash
# 1. Install everything (one command — this is an npm workspaces monorepo)
npm install

# 2. Start the client and server together
npm run dev
```

That's it. You'll see two things start up:

- **Client (the game):** http://localhost:5173
- **Server (Colyseus):** ws://localhost:2567

Open **http://localhost:5173**, pick a name, and hit **Join arena**. A room code
is pre-filled so you can jump straight in.

> Other handy commands: `npm run build` (production build of both),
> `npm run typecheck` (type-check both). To regenerate the app icons, run
> `node client/scripts/make-icons.mjs` from the `client/` folder.

### Controls

| | Move | Aim & fire | Super |
| --- | --- | --- | --- |
| **Touch** | left joystick | right joystick — *release* to fire (tap = quick auto-aim shot) | glowing **SUPER** button |
| **Desktop** | WASD / arrows | mouse aim, **left-click** to fire | **Space** or **right-click** |

Shoot **boxes** to pop **power cubes** and grow stronger, and stay ahead of the
**poison gas** — it creeps in from the edges and hurts more the longer you're in it.

### Test with two browser tabs (same computer)

1. Open http://localhost:5173 in **two tabs** (or two windows).
2. Pick a monster, use the **same room code** in both, then Join in each.
3. With 2+ players the round begins after a short countdown. Drive one with
   **WASD**, aim with the **mouse**, and **click** to shoot the other tab. Ammo
   and super show on your monster; the top-left corner shows the room code,
   monsters left, cubes, and kills.

### Play on your LAN (phones & tablets on the same wifi)

The dev server is exposed to your local network automatically — no code or
config changes needed. Run `npm run dev` **on the computer** (a laptop/desktop),
then connect from phones/tablets on the same wifi.

1. Find the computer's **LAN IP address**:
   - **macOS:** `ipconfig getifaddr en0` (or System Settings → Wi-Fi → Details)
   - **Windows:** `ipconfig` → look for "IPv4 Address"
   - **Linux:** `hostname -I`
   - It looks like `192.168.1.50`. (When you run `npm run dev`, Vite also prints
     it next to **Network:**.)
2. Make sure every device is on the **same wifi** as the computer.
3. On each device's browser, go to **`http://<that-ip>:5173`**
   (e.g. `http://192.168.1.50:5173`).
4. Enter the **same room code** on each device and Join. Drag the joystick in
   the bottom-left — each device sees the others move in real time.

The client automatically connects to the game server at `ws://<same-ip>:2567`,
so there's nothing else to configure.

**Two gotchas if it doesn't connect:**

- **Both ports must be reachable, not just 5173.** The page loads over **5173**,
  but gameplay rides the WebSocket on **2567**. If the page opens but no other
  players ever appear, port **2567** is almost always the one being blocked.
- **Firewall** — the first run, your OS may block incoming connections. Allow
  them on your local/private network:
  - **macOS:** you'll usually get a popup for `node` — click **Allow**. (Or
    System Settings → Network → Firewall → Options.)
  - **Windows:** the Defender Firewall popup → check **Private networks** → Allow
    access.
  - **Linux (ufw):** `sudo ufw allow 5173 && sudo ufw allow 2567`.

### Install it to a phone's home screen (PWA)

Open the site on the phone, then use the browser's **"Add to Home Screen"**
option. It launches fullscreen like a native app. (A production build via
`npm run build` gives the most reliable install experience.)

---

## Notes & decisions made along the way

- **Versions:** Colyseus's client (`colyseus.js`) is on the `0.16` line, so the
  server is pinned to Colyseus `0.16` too — both use `@colyseus/schema@3`, which
  keeps their network format compatible. (The newer server `0.17` line pairs
  with a `@colyseus/schema@4` client that isn't published as stable yet.)
  Per the brief, rendering uses **Phaser 3** (not the newer Phaser 4).
- **Interpolation + local prediction:** *other* players glide toward their latest
  server position (`PlayerView.interpolate`). *Your own* monster is **predicted**
  client-side (`GameScene.predictLocal` + `client/src/game/collision.ts`, a mirror
  of the server's `geom.ts`): it moves instantly from your input through the same
  collision and reconciles to the server underneath. The server stays the single
  source of truth — prediction only affects how your local monster is drawn.
- **Projectiles as a fan:** every attack — single shot or multi-pellet super — is
  the same `spawnSpread()` helper with a different pellet count and angle, so
  adding a new monster is mostly a row of numbers in `server/src/config.ts`.
- **Hitscan vs. travel:** shots are *travelling* projectiles (you can dodge
  them), which is what makes a top-down brawler feel good. Collisions are simple
  circle-overlap checks in the server tick.
- **Continuous rounds:** instead of ending a match and dumping everyone back to
  the lobby, a room loops countdown → play → winner → countdown. For kids on the
  same wifi that means no waiting and no menus between fights.
- **Room codes** use Colyseus `.filterBy(["roomCode"])`: same code → same room,
  new code → new room. Codes avoid look-alike characters (no `0`/`O`, `1`/`I`).
- **Backend swap (future):** all Colyseus-specific client code is isolated in
  `client/src/net/Network.ts`. The game only sees plain `PlayerSnapshot` objects
  and a few callbacks, so switching the realtime layer (e.g. to Cloudflare
  Durable Objects) should only touch `/server` and that one client file.
- **Icons** are generated programmatically (`client/scripts/make-icons.mjs`)
  since this environment had no image tools — swap in real art anytime.

## Done so far / what's next

**Done:** the Showdown loop, three then **six** monsters, **terrain** (walls +
bushes), **breakable boxes**, a bright procedural Brawl-Stars look (grass, 3D
crate walls, gas-cloud poison), the feedback layer (on-character HUD, aim
indicator, damage numbers, kill feed, defeat/spawn FX), synthesized **sound +
music**, **client-side prediction**, and a built-out monster picker. The
per-milestone design notes live in [`docs/`](docs/).

**Not yet:** per-monster **gadgets / star powers** (a limited-use active + a
passive), **team modes** (Gem Grab / Brawl Ball / Bounty), respawns, pings/emotes,
accounts/persistence, and real art (the monsters are emoji for now — swap in real
art anytime). See [`docs/brawl-stars-roadmap.md`](docs/brawl-stars-roadmap.md).
