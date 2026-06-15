# M5 — Gameplay depth (scope)

After M4 made the game *feel* like Brawl Stars, M5 adds Showdown *depth*. All of
this is **server-authoritative gameplay** (unlike M4, which was mostly client
presentation), so each slice changes `server/src/` and mirrors the minimum to the
client through the `Network.ts` boundary.

Sliced into PRs, lowest-risk-first within each:

## PR-A — Breakable boxes  ← this milestone's first PR
In real Showdown, power cubes come from **breaking boxes** and from **kills**, not
a free scatter. Kills already drop cubes (`damagePlayer`). This adds the boxes:

- New synced `Box` entity (AABB + hp/maxHp) on `MatchState`.
- Boxes **block movement and shots** like walls until destroyed, then **drop a
  power cube** and become passable.
- Server: spawn boxes at round start (replacing most of the free-cube scatter);
  add boxes to the movement, projectile, and super-dash collision checks; damage
  a box when a shot hits it (boxes don't charge the shooter's super); on break,
  remove it and drop cubes.
- Client: render boxes as crates with a crack overlay that deepens with damage,
  and a break burst on removal.

## PR-B — Gadgets + Star Powers
One limited-use **gadget** (active, a few charges) and one passive **star power**
per monster — the defining BS depth layer. Adds a second action button + intent
message; server owns the effects (e.g. Gnash dash, Spit slow, Brute shield;
passives like "+speed in a bush"). Larger; do after boxes.

## PR-C — More monsters
2–3 new monster types — mostly a row of numbers in `config.ts` `MONSTERS` plus a
look entry in client `monsters.ts` (+ the display-only `range`). Cheap, reuses
all existing combat. Good variety to end the milestone on.

---

### Architecture notes
- Boxes are **dynamic** (unlike the static `walls`/`bushes` in `MAPS`), so they're
  synced as entities, not looked up from a table. Collision combines
  `walls ++ activeBoxes` each tick.
- Hitting a box must **not** charge super (only enemy hits do).
- Keep gameplay on the server; the client only draws boxes and the break FX.
