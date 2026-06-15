# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A private, browser-based 2D top-down brawler (monster-themed Brawl Stars clone) intended for LAN play with friends. PWA installable to a phone home screen.

It's a continuous **Showdown** free-for-all: pick one of **six** monsters, drop into a shared arena, and survive the closing **poison** until you're the last standing. Power cubes (which raise your health + damage) come from **breakable boxes** and from kills. Static **terrain** matters — **walls** block movement *and* projectiles; **bushes** you walk through to hide. Rounds loop back-to-back.

On top of the authoritative simulation there's a presentation/feel layer: bright procedural Brawl-Stars-style visuals (grassy field, 3D crate walls, gas-cloud poison), an on-character ammo/super HUD, an aim indicator, damage numbers, a kill feed, defeat/spawn FX, and synthesized sound effects + music (with a mute toggle). Your own monster is **client-side predicted** so it responds instantly. (Built up across milestones M1→M5; the per-milestone design notes live in `docs/`.)

## Commands

This is an **npm workspaces monorepo** (`client`, `server`). Always install from the repo root.

```bash
npm install                  # installs both workspaces
npm run dev                  # runs server (tsx watch) + client (vite) concurrently
npm run build                # tsc on server, tsc --noEmit + vite build on client
npm run typecheck            # type-check both workspaces

# Single-workspace operations
npm --workspace server run dev
npm --workspace client run typecheck

# Regenerate PWA icons (only needed if changing them)
cd client && node scripts/make-icons.mjs
```

Ports: client on **5173**, server (Colyseus + WebSocket) on **2567**. The Vite dev server already binds to `0.0.0.0` for LAN access, and the client auto-derives the server URL from `location.hostname` — so phones on the same wifi just visit `http://<computer-ip>:5173`.

There is **no test suite and no linter** configured. `typecheck` is the only static check.

## Architecture

### Authoritative server, dumb client

The server is the single source of truth. Clients only send **intent** (move vector, aim vector, fire, super) and render the snapshots Colyseus sends back. Never put gameplay logic — damage, hits, pickups, zone, win conditions — in the client. Anything that affects "what is true in the world" belongs in `server/src/rooms/MatchRoom.ts`.

The tick loop runs at `TICK_RATE = 30` Hz on the server, which also patches state to clients at 30 Hz (`setPatchRate` in `MatchRoom.onCreate` — Colyseus otherwise defaults to 20 Hz patches). **Other** players and projectiles are interpolated (~60 fps) toward their latest server position via `PlayerView.interpolate` / `ProjectileView.interpolate` (framerate-independent `1 - exp(-rate·dt)`).

**Your own monster is client-side predicted** (`GameScene.predictLocal` + `client/src/game/collision.ts`, a deliberate mirror of the server's pure `geom.ts`): it moves the instant you press a direction, through the *same* wall/box collision the server runs, then reconciles to the authoritative server position underneath (ease normally, snap on a big jump like a super dash / respawn). The server is still the single source of truth — prediction is a render convenience for the local player only.

### Where to make changes

| If you want to change… | Edit… |
| --- | --- |
| Monster stats (all six), cube/poison/round/box tuning, tick rate | `server/src/config.ts` (`MONSTERS`, `CUBE_*`, `ZONE_*`/`POISON_*`, `BOX_*`, `TICK_RATE`) |
| Map layouts (wall/bush rectangles, cube anchors), bush-reveal timing | `server/src/config.ts` (`MAPS`, `DEFAULT_MAP_ID`, `BUSH_REVEAL_MS`) **and** the mirror in `client/src/game/maps.ts` |
| Collision math (circle-vs-AABB move/slide, segment-vs-AABB sweep) | `server/src/geom.ts` (pure, covered by `server/src/geom.test.ts`) — mirrored client-side in `client/src/game/collision.ts` for prediction |
| Match simulation (movement, shots, damage, cubes, poison, phases, walls, bush-hiding, breakable boxes) | `server/src/rooms/MatchRoom.ts` |
| Synced state fields visible to the client | `server/src/schema/*.ts` — `Player`, `Projectile`, `PowerCube`, `Box`, `MatchState` (must use `@colyseus/schema` decorators) |
| The transport layer / message shape / `fx` combat events | `client/src/net/Network.ts` (the **only** client file that imports `colyseus.js`) |
| Twin-stick input / desktop controls / stuck-stick watchdog | `client/src/input/Controls.ts` |
| Rendering / on-character HUD / poison gas / round banner / terrain / boxes | `client/src/game/GameScene.ts` + `*View.ts` |
| Local-player movement prediction | `client/src/game/GameScene.ts` (`predictLocal`) + `client/src/game/collision.ts` |
| Combat juice (damage numbers, kill feed, defeat/spawn FX, muzzle/hit sparks, screen shake) | `client/src/game/GameScene.ts` (driven by the server's batched `fx` events) + `PlayerView.ts` |
| Sound effects + background music + mute | `client/src/audio/Sfx.ts` (all synthesized, no asset files; mute button / `M` key) |
| Arena look (grass, 3D crate walls, bushes, gas poison, camera zoom) | `client/src/game/GameScene.ts` (`PALETTE`, `WALL_EXTRUDE`, `CAMERA_ZOOM`, `makeGrassTexture`/`drawWall`/`drawBush`/`drawPoison`) — all procedural; the old `client/public/tiles/*.jpg` masters in `art-generated/` are no longer loaded |
| Lobby HTML / monster picker (portraits + stat bars) | `client/index.html` + `client/src/main.ts` + `client/src/style.css` |
| Monster looks (emoji, accent, blurb) + display stats | `client/src/game/monsters.ts` |

Adding a new monster is mostly a row of numbers in `server/src/config.ts` (`MONSTERS` array) plus a look entry (with the display stats) in `client/src/game/monsters.ts` and its id in `MONSTER_ORDER`.

### Terrain (walls + bushes)

Static terrain is **server-authoritative gameplay**, not decoration: walls block movement (circle-vs-AABB, resolved per-axis so players slide along faces) and projectiles (segment-vs-AABB sweep so fast supers can't tunnel a thin wall in one tick); bushes set a synced `hidden` flag when a player stands in one and hasn't fired or taken damage for `BUSH_REVEAL_MS`. The collision primitives live in `server/src/geom.ts` and are exercised by `server/src/geom.test.ts` (run `cd server && npx tsx src/geom.test.ts` — the repo has no test runner, so this is a standalone script). Terrain is static, so only a `mapId` is synced (on `MatchState`); the client holds the **same** `MAPS` table in `client/src/game/maps.ts` and looks the geometry up to draw it — keep the two tables in sync. The local player is **never** hidden client-side (FFA: you always see yourself; only *other* players' hidden monsters are dimmed in `PlayerView`).

### The transport boundary

`client/src/net/Network.ts` is the only file in the client that knows the backend is Colyseus. The rest of the client sees plain `PlayerSnapshot` / `ProjectileSnapshot` / `CubeSnapshot` / `BoxSnapshot` / `MatchInfo` objects and a `NetEvents` callback bag. Keep it that way — if you need new state to flow from server to client, add a field to the schema (`server/src/schema/`), expose it through a snapshot type in `Network.ts`, and consume it from `GameScene`. Don't import `colyseus.js` from anywhere else.

Besides per-tick state sync, the server sends **discrete combat events** for things that are *moments* not *state* (a hit's damage + position, a KO's victim/killer) — the per-tick snapshot collapses several hits into one health delta, so the client can't reconstruct them. `MatchRoom` accumulates these during a tick and `broadcast("fx", …)`s them once; `Network.ts` fans them out as `onHit` / `onKO`, which drive damage numbers, the kill feed, and defeat explosions. Poison damage deliberately emits no `hit` events (it ticks every frame — would spam).

### Breakable boxes

Power cubes come from breaking **boxes** (and from kills) — there is no free cube scatter. Boxes are a synced `Box` entity (AABB + `hp`/`maxHp`), placed each round clear of walls/other boxes/spawns. Unlike the static `walls`/`bushes`, boxes are **dynamic** (they take damage and vanish), so the server combines `walls ++ standing boxes` for player movement, the super dash, and projectile sweeps (`MatchRoom.obstacleRects`). A shot soaks into a box and damages it (boxes do **not** charge the shooter's super — only enemy hits do); at 0 hp it breaks and drops cubes. The client mirrors box footprints in `GameScene.boxRects` so prediction collides with them too.

### Room codes

There is one Colyseus room type, `"match"`, registered with `.filterBy(["roomCode"])`. Same `roomCode` → same arena; new code → new room. Codes are generated client-side (`client/src/util/roomCode.ts`) and avoid look-alike characters.

### Match flow

A room loops `COUNTDOWN → PLAYING → ROUNDOVER → COUNTDOWN …` continuously so there is never a lobby wait between rounds. Phase, time-left, alive count, winner name, and the safe-zone rectangle are all on `MatchState` and broadcast every tick.

## Constraints to preserve

- **Colyseus version pinning**: server `colyseus@0.16` + `@colyseus/schema@3` is paired intentionally with client `colyseus.js@0.16`. Do not upgrade either side independently — the network format only stays compatible when both lines match.
- **Phaser 3, not Phaser 4** — per the project brief.
- **Decorator config**: `server/tsconfig.json` has `experimentalDecorators: true`, `emitDecoratorMetadata: true`, and `useDefineForClassFields: false`. These are required for `@type(...)` on schema classes to work with field initializers; do not change them.
- **Health check endpoints**: the server's HTTP handler answers `GET /` and `GET /health` with plain text before falling through to Colyseus matchmaking. This is what makes a blocked-port diagnosis possible from a browser — keep it working when touching `server/src/index.ts`.
- **Connection failure UX**: a blocked port causes a WebSocket connect to *hang* rather than fail fast. The client uses `CONNECT_TIMEOUT_MS` to surface a real error instead of a blank screen — preserve that pattern if you rework connection code.
