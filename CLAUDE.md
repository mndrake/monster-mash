# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A private, browser-based 2D top-down brawler (monster-themed Brawl Stars clone) intended for LAN play with friends. PWA installable to a phone home screen. Currently at **Milestone 3 (Terrain)**: everything from Showdown (free-for-all rounds, three monsters, power cubes, closing poison zone) plus static terrain — **walls** that block movement *and* projectiles, and **bushes** you walk through to hide from other players.

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

The tick loop runs at `TICK_RATE = 20` Hz on the server. Clients interpolate (~60 fps) by gliding each sprite toward its latest server position via `PlayerView.interpolate` / `ProjectileView.interpolate`. There is **no client-side prediction** — even the local player glides toward the server position. This is deliberate (simple, readable) and fine on LAN.

### Where to make changes

| If you want to change… | Edit… |
| --- | --- |
| Monster stats, cube/poison/round tuning | `server/src/config.ts` |
| Map layouts (wall/bush rectangles, cube anchors), bush-reveal timing | `server/src/config.ts` (`MAPS`, `DEFAULT_MAP_ID`, `BUSH_REVEAL_MS`) **and** the mirror in `client/src/game/maps.ts` |
| Collision math (circle-vs-AABB move/slide, segment-vs-AABB sweep) | `server/src/geom.ts` (pure, no game state; covered by `server/src/geom.test.ts`) |
| Match simulation (movement, shots, damage, cubes, poison, phases, walls, bush-hiding) | `server/src/rooms/MatchRoom.ts` |
| Synced state fields visible to the client | `server/src/schema/*.ts` (must use `@colyseus/schema` decorators) |
| The transport layer / message shape | `client/src/net/Network.ts` (the **only** client file that imports `colyseus.js`) |
| Twin-stick input / desktop controls | `client/src/input/Controls.ts` |
| Rendering / HUD / poison overlay / round banner / terrain | `client/src/game/GameScene.ts` + `*View.ts` |
| Arena look (grass palette, 3D crate walls, bushes, camera zoom) | `client/src/game/GameScene.ts` (`PALETTE`, `WALL_EXTRUDE`, `CAMERA_ZOOM`, `makeGrassTexture`/`drawWall`/`drawBush`) — all drawn procedurally; the old `client/public/tiles/*.jpg` masters in `art-generated/` are no longer loaded |
| Lobby HTML / monster picker | `client/index.html` + `client/src/main.ts` |
| Monster looks (emoji, accent, blurb) | `client/src/game/monsters.ts` |

Adding a new monster is mostly a row of numbers in `server/src/config.ts` (`MONSTERS` array) plus a corresponding look entry on the client.

### Terrain (walls + bushes)

Static terrain is **server-authoritative gameplay**, not decoration: walls block movement (circle-vs-AABB, resolved per-axis so players slide along faces) and projectiles (segment-vs-AABB sweep so fast supers can't tunnel a thin wall in one tick); bushes set a synced `hidden` flag when a player stands in one and hasn't fired or taken damage for `BUSH_REVEAL_MS`. The collision primitives live in `server/src/geom.ts` and are exercised by `server/src/geom.test.ts` (run `cd server && npx tsx src/geom.test.ts` — the repo has no test runner, so this is a standalone script). Terrain is static, so only a `mapId` is synced (on `MatchState`); the client holds the **same** `MAPS` table in `client/src/game/maps.ts` and looks the geometry up to draw it — keep the two tables in sync. The local player is **never** hidden client-side (FFA: you always see yourself; only *other* players' hidden monsters are dimmed in `PlayerView`).

### The transport boundary

`client/src/net/Network.ts` is the only file in the client that knows the backend is Colyseus. The rest of the client sees plain `PlayerSnapshot` / `ProjectileSnapshot` / `CubeSnapshot` / `MatchInfo` objects and a `NetEvents` callback bag. Keep it that way — if you need new state to flow from server to client, add a field to the schema (`server/src/schema/`), expose it through a snapshot type in `Network.ts`, and consume it from `GameScene`. Don't import `colyseus.js` from anywhere else.

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
