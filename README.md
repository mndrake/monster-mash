# Monster Mash 🟣 — Milestone 1

> **Working title only.** "Monster Mash" is a placeholder (it matches the repo
> name) — pick the real name with your son! It only appears in a couple of
> spots: `client/index.html`, `client/vite.config.ts` (the PWA manifest), and
> this README.

A tiny, private, browser-based **2D top-down arena** you can play with friends
on the same wifi. No app store, no accounts, no payments. It installs to your
phone's home screen as a fullscreen PWA.

**This repo is Milestone 1 only:** several players join one shared arena with a
room code, move with a touch joystick (or WASD/arrows on desktop), and see each
other move in real time, smoothly. There's no shooting, health, or win
condition yet — those are later milestones.

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
 │                   │                      │ every tick (20×/sec):           │
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
2. **Tick** — 20 times a second the server moves every player by their last
   input. The server owns the positions, so nobody can cheat by teleporting.
3. **Snapshot** — Colyseus automatically broadcasts the changed state to every
   client after each tick.
4. **Interpolation** — the server only updates ~20×/sec, which would look
   choppy. So each client *glides* every sprite toward its latest server
   position a little each frame (~60×/sec). That smooth gliding is what removes
   the teleporting/jitter.

### Files to read, in order

If you want to understand the netcode, read these (they're short and commented):

| Step | File | What it does |
| --- | --- | --- |
| 1. Synced state | `server/src/schema/Player.ts`, `server/src/schema/MatchState.ts` | The data that's shared with every client. |
| 2. The match + tick | `server/src/rooms/MatchRoom.ts` | Receives input, runs the authoritative 20 Hz loop, moves players. |
| 3. Server bootstrap | `server/src/index.ts` | Starts Colyseus; `filterBy(["roomCode"])` is how room codes work. |
| 4. Transport boundary | `client/src/net/Network.ts` | The **only** client file that knows about Colyseus. Swap backends here. |
| 5. Input | `client/src/input/Controls.ts` | Joystick + keyboard → one `{ x, y }` vector. |
| 6. Smoothing | `client/src/game/PlayerView.ts` | Holds a "target" position and glides toward it (interpolation). |
| 7. Glue | `client/src/game/GameScene.ts` | Each frame: send input → glide everyone → update the HUD. |

---

## Project layout

```
/                         root scripts; `npm run dev` runs both packages
├── client/               Phaser 3 + Vite PWA (what the browser runs)
│   ├── index.html        the lobby (plain HTML) + the game canvas
│   ├── vite.config.ts    dev server + PWA manifest/service worker
│   └── src/
│       ├── main.ts       lobby logic → boots Phaser on "Join"
│       ├── config.ts     server URL + interpolation settings
│       ├── game/         Phaser scene + player sprite
│       ├── net/          Colyseus client wrapper (the transport boundary)
│       ├── input/        joystick + keyboard
│       └── util/         room-code generator
└── server/               Colyseus authoritative server (Node)
    └── src/
        ├── index.ts      server bootstrap
        ├── config.ts     tick rate, arena size, speed, colors
        ├── rooms/        MatchRoom: the match + authoritative tick loop
        └── schema/       synced state (players, positions)
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

### Test with two browser tabs (same computer)

1. Open http://localhost:5173 in **two tabs** (or two windows).
2. Use the **same room code** in both, then Join in each.
3. Drive one player with **WASD / arrow keys** — you'll see it move in the other
   tab too, smoothly. The HUD (top-left) shows the room code and player count.

### Test with two phones on the same wifi

The dev server is exposed to your local network automatically.

1. Find your computer's **LAN IP address**:
   - **macOS:** `ipconfig getifaddr en0` (or System Settings → Wi-Fi → Details)
   - **Windows:** `ipconfig` → look for "IPv4 Address"
   - **Linux:** `hostname -I`
   - It looks like `192.168.1.50`. (When you run `npm run dev`, Vite also prints
     it next to **Network:**.)
2. Make sure the phones are on the **same wifi** as the computer.
3. On each phone's browser, go to **`http://<that-ip>:5173`**
   (e.g. `http://192.168.1.50:5173`).
4. Enter the **same room code** on both phones and Join. Drag the joystick in
   the bottom-left — each phone sees the others move in real time.

The client automatically connects to the game server at `ws://<same-ip>:2567`,
so there's nothing else to configure. (If your firewall blocks it, allow inbound
connections on ports **5173** and **2567** on your local network.)

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
- **Interpolation, not prediction:** for Milestone 1 every sprite — including
  your own — glides toward the latest server position (`PlayerView.interpolate`).
  It's the simplest thing that looks smooth and is easy to read. On a LAN the
  input lag is tiny. Client-side *prediction* for the local player is a sensible
  later upgrade; it would live in `GameScene`/`Network` and wouldn't change the
  server.
- **Room codes** use Colyseus `.filterBy(["roomCode"])`: same code → same room,
  new code → new room. Codes avoid look-alike characters (no `0`/`O`, `1`/`I`).
- **Backend swap (future):** all Colyseus-specific client code is isolated in
  `client/src/net/Network.ts`. The game only sees plain `PlayerSnapshot` objects
  and a few callbacks, so switching the realtime layer (e.g. to Cloudflare
  Durable Objects) should only touch `/server` and that one client file.
- **Icons** are generated programmatically (`client/scripts/make-icons.mjs`)
  since this environment had no image tools — swap in real art anytime.

## Out of scope for Milestone 1 (coming later)

Shooting/weapons, health/damage, the shrinking safe zone, pickups, win/lose
conditions, accounts, persistence, sound, and art polish. See the roadmap in the
kickoff brief (M2–M5).
