# Milestone 3 — Map Layouts

> **Status: IMPLEMENTED (terrain).** Both layouts below now live in code:
> `MAPS` in `server/src/config.ts` (authoritative geometry + collision via
> `server/src/geom.ts`) mirrored by `client/src/game/maps.ts` (rendering). New
> rooms use **Layout A "The Crossroads"** (`DEFAULT_MAP_ID`); Layout B "Fang
> Hollow" is wired into the data but not yet selected. Walls block movement and
> shots; bushes hide you (synced `hidden` flag). Tile art is in
> `client/public/tiles/`. The geometry numbers below are the source of truth and
> match the code — keep them in sync if you nudge a rectangle.
>
> *Origin note:* this started as a draft proposal — the README mentions an
> M3–M5 roadmap "in the kickoff brief," but no such brief exists in the repo or
> git history (only `README.md` references it in prose). If a real brief turns
> up, treat that as authoritative.

M3 adds the first **static terrain** to the arena:

- **Walls** — block both movement *and* projectiles. Hard cover.
- **Bushes** — you walk *through* them; standing in one (and not firing) hides
  you from other players. Soft cover / ambush. (Brawl-Stars rule: firing or
  taking damage briefly reveals you.)

Everything below is expressed as **axis-aligned rectangles in world
coordinates**, because that maps cleanly onto the server's collision model
(circle-vs-AABB for players, segment-vs-AABB for projectiles). The arena is
`2000 × 2000` (`ARENA_WIDTH/HEIGHT`), origin top-left, `+x` right, `+y` down,
drawn on a 100-unit grid. Rectangles are `{ x, y, w, h }` = top-left corner +
size.

## Design constraints both layouts respect

These come from the existing simulation (`server/src/config.ts`) — a draft that
ignores them would break the round:

1. **Keep the endgame core open.** The poison zone shrinks to a centered box of
   half-size `ZONE_MIN_HALF = 180` → the final fight happens inside
   **`[820, 1180] × [820, 1180]`** (a 360×360 square around `1000,1000`). **No
   wall** is placed inside that square in either layout (verified per-rect
   below). Bushes inside it are allowed and intentional — they give the last
   players ambush cover without trapping anyone.
2. **Connectivity / no death-pockets.** No fully enclosed space with a single
   choke a player can be cornered in. Every bunker opening is ≥ 120u wide
   (`brute` is the widest monster at radius 28 → 56u diameter; 120u clears two
   bodies).
3. **Cube reachability.** `POWER_CUBE_COUNT = 8` cubes spawn each round. Walls
   are placed so the suggested spawn anchors (and the open lanes between them)
   are all reachable; none get walled off.
4. **Symmetry for FFA fairness.** No spawn or quadrant gets a structural edge.
5. **Lane width ≥ 120u** everywhere a player is meant to pass.

> **Note on spawns:** cube spawns are currently randomized server-side. The
> "cube anchors" below are *suggested* deterministic spots for M3 — adopting
> them is optional and separate from the terrain.

---

## Layout A — "The Crossroads"

**Feel:** fast, flanky, open. A big central plaza with a pinwheel of sightline
breakers around its mouths and L-bunkers in the four corners. Rewards juking and
flanking over camping. Good default / "ranked" map.

**Symmetry:** 4-fold (mirrored across both axes).

```
  0    250   500   750  1000  1250  1500  1750 2000
  +----------------------------------------------------+
  | ####:::      C        ::::       C      ::::####   |  ~200  bush + corner bunkers
  | #  #                  ::::                  #  #   |
  | #            [bunker openings face inward]         |  ~400
  |     ::::                                ::::       |  B5 / B6 ambush patches
  | C          ##  (N choke)  ##          C           |  ~560
  |::::                                         ::::   |  ~700  W/E edge bushes
  |::::    ##                          ##       ::::   |  W & E chokes, plaza edge
  |::::    (W                          E)       ::::   |
  |              ......................                |  ~900   OPEN CORE
  |   X          .   endgame  core    .          X    | 1000   (820..1180) — no walls
  |              ......................                |
  |::::                                         ::::   |
  |::::    ##                          ##       ::::   | ~1360  S choke + plaza edge
  |::::                                         ::::   |
  | C          ##  (S choke)  ##          C           |
  |     ::::                                ::::       | ~1440
  | #  #                  ::::                  #  #   |
  | ####:::      C        ::::       C      ::::####   | ~1800
  +----------------------------------------------------+
   #=wall  :=bush  C=cube anchor  X=open spawn lane  .=protected-open core
```

### Walls (block movement + shots)

Corner L-bunkers (open side faces the plaza):

| id  | x    | y    | w   | h   | notes              |
| --- | ---- | ---- | --- | --- | ------------------ |
| A1  | 240  | 240  | 300 | 90  | TL bunker, top arm |
| A2  | 240  | 240  | 90  | 300 | TL bunker, side arm|
| A3  | 1460 | 240  | 300 | 90  | TR (mirror x)      |
| A4  | 1670 | 240  | 90  | 300 | TR                 |
| A5  | 240  | 1670 | 300 | 90  | BL (mirror y)      |
| A6  | 240  | 1460 | 90  | 300 | BL                 |
| A7  | 1460 | 1670 | 300 | 90  | BR                 |
| A8  | 1670 | 1460 | 90  | 300 | BR                 |

Pinwheel chokes around the plaza mouths (all outside the core):

| id  | x   | y    | w   | h   | mouth | clearance to core |
| --- | --- | ---- | --- | --- | ----- | ----------------- |
| A9  | 900 | 560  | 200 | 80  | N     | ends y640 (core y≥820) |
| A10 | 1360| 900  | 80  | 200 | E     | ends x1440 / starts x1360 (core x≤1180) |
| A11 | 900 | 1360 | 200 | 80  | S     | starts y1360 (core y≤1180) |
| A12 | 560 | 900  | 80  | 200 | W     | ends x640 (core x≥820) |

### Bushes (walk-through, hide)

| id  | x    | y    | w   | h   | role                 |
| --- | ---- | ---- | --- | --- | -------------------- |
| B1  | 820  | 140  | 360 | 180 | N edge ambush belt   |
| B2  | 820  | 1680 | 360 | 180 | S edge ambush belt   |
| B3  | 140  | 820  | 180 | 360 | W edge ambush belt   |
| B4  | 1680 | 820  | 180 | 360 | E edge ambush belt   |
| B5  | 620  | 620  | 180 | 180 | TL diagonal ambush   |
| B6  | 1200 | 620  | 180 | 180 | TR diagonal ambush   |
| B7  | 620  | 1200 | 180 | 180 | BL diagonal ambush   |
| B8  | 1200 | 1200 | 180 | 180 | BR diagonal ambush   |

(B5–B8 sit just at the diagonal corners of the endgame core — passable cover for
the final fight without blocking it.)

### Suggested cube anchors (8)

Quadrant centers `(450,450) (1550,450) (450,1550) (1550,1550)` +
edge midpoints `(1000,400) (1000,1600) (400,1000) (1600,1000)`.

---

## Layout B — "Fang Hollow"

**Feel:** slower, cover-heavy, ambush-driven. Two big hooked "fang" walls sweep
in from opposite corners, splitting the arena into a central pit + two side
galleries, with long bush belts top and bottom. Rewards patience, peeking, and
`brute`/`spit` hold-the-corner play more than `gnash` rushes.

**Symmetry:** 2-fold rotational (180° about center) — each fang is the other
rotated, so every player's view is identical after rotation.

```
  0    250   500   750  1000  1250  1500  1750 2000
  +----------------------------------------------------+
  |        ::::::::::::::::::::::::::::::::::::         | ~250  top bush belt
  |   ###########                                      | ~550  Fang 1 top bar
  |   #        #                                       |
  |   #     #  #            ::::                       | ~700  N-core bush
  |   #     #  #          ........                     |
  |   #     ## #          . core .          C         | ~900
  |         tooth         ........        #  #        | 1000  OPEN CORE (no walls)
  |         C             ::::            #  ##        |
  |                       S-core bush     #     #      |
  |                                       #     #      | ~1100 Fang 2 tooth
  |                                       #     #      |
  |                          ###########  #     #      | ~1390 Fang 2 bottom bar
  |        ::::::::::::::::::::::::::::::::::::         | ~1700 bottom bush belt
  +----------------------------------------------------+
   #=wall  :=bush  C=cube anchor  .=open core
```

### Walls (block movement + shots)

Fang 1 (hooks in from the top-left), a 3-rect hook:

| id  | x   | y   | w   | h   | notes                          |
| --- | --- | --- | --- | --- | ------------------------------ |
| F1  | 300 | 520 | 90  | 360 | vertical shaft (x≤390 ≪ core)  |
| F2  | 300 | 520 | 420 | 90  | top bar                        |
| F3  | 630 | 610 | 90  | 300 | tooth toward center (ends x720)|

Fang 2 = Fang 1 rotated 180° about `(1000,1000)`
(`{x,y,w,h} → {2000−x−w, 2000−y−h, w, h}`):

| id  | x    | y    | w   | h   | notes                          |
| --- | ---- | ---- | --- | --- | ------------------------------ |
| F4  | 1610 | 1120 | 90  | 360 | shaft (x≥1610)                 |
| F5  | 1280 | 1390 | 420 | 90  | bottom bar                     |
| F6  | 1280 | 1090 | 90  | 300 | tooth (x≥1280 > core)          |

Both teeth stop short of the core: F3 ends at `x720` (< 820), F6 starts at
`x1280` (> 1180). The pit between the fangs stays fully open.

### Bushes (walk-through, hide)

| id  | x   | y    | w    | h   | role                              |
| --- | --- | ---- | ---- | --- | --------------------------------- |
| G1  | 360 | 200  | 1280 | 160 | top ambush belt                   |
| G2  | 360 | 1640 | 1280 | 160 | bottom ambush belt                |
| G3  | 760 | 600  | 280  | 160 | N-of-core peek bush (y ends 760)  |
| G4  | 960 | 1240 | 280  | 160 | S-of-core peek bush (y starts 1240)|
| G5  | 540 | 940  | 180  | 220 | west gallery cover                |
| G6  | 1280| 840  | 180  | 220 | east gallery cover                |

(G3/G4 flank the core for endgame ambush; both are passable and outside the wall
core box.)

### Suggested cube anchors (8)

Two behind each fang `(450,700) (450,1000)` and `(1550,1000) (1550,1300)`,
two in the galleries `(900,300) (1100,1700)`, two near the pit
`(800,1000) (1200,1000)`.

---

## Implementation notes (for whoever builds M3)

These are pointers, not part of the draft decision:

- **Where the data lives:** add a `MAPS` array to `server/src/config.ts`
  (`{ id, name, walls: Rect[], bushes: Rect[], cubeAnchors?: Vec2[] }`) and a
  `mapId` field on `MatchState` (`server/src/schema/MatchState.ts`). Terrain is
  static, so it can be sent once on join (or, simplest: hardcode the same `MAPS`
  table on the client and select by `mapId` — no per-tick sync cost).
- **Collision:** circle-vs-AABB for player movement (clamp/slide along the
  nearest face); segment-vs-AABB for projectiles (kill the projectile at the hit
  point). Both belong in `MatchRoom.ts` per the authoritative-server rule.
- **Bush hiding:** a bush sets a per-player `hidden` flag when the player's
  center is inside any bush AABB *and* they haven't fired or taken damage in the
  last ~1s. The client dims/clips hidden remote players. This is gameplay truth
  → server-owned.
- **Rendering:** walls and bushes are static; draw them once in
  `GameScene.setupArena()` at depth between the grid (−9) and the monsters.
  Tileable wall/floor textures (see MCP test below) would replace the flat
  fills.
- **Validation done here:** every wall rect above was checked against the
  endgame core box `[820,1180]²` — none intersect it. Re-check this if you nudge
  the geometry.
