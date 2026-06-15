# art-generated/

Output directory for textures generated via Pollinations (the `pollinations` MCP
server in `/.mcp.json`, and the `gen.pollinations.ai` HTTP API directly).

## M3 tileset — 2026-06-14

The full M3 terrain tileset for the layouts in `docs/m3-maps.md`. All tiles are
**512×512, flux, seamless-ish**, in the game's dark palette
(`#10101a / #1b1b2f / #2a2a4a / #44446a`), top-down orthographic. Bushes use a
muted teal-green foliage that stays inside the dark register but reads as clearly
distinct cover.

| file                  | role                | notes                                              |
| --------------------- | ------------------- | -------------------------------------------------- |
| `test-wall-tile.jpg`  | wall (base)         | grey stone brick — the original test tile          |
| `wall-mossy.jpg`      | wall (variant)      | bluer brick, cracks + teal moss flecks             |
| `test-floor-tile.jpg` | floor (base)        | grey flagstone — the original test tile            |
| `floor-cracked.jpg`   | floor (variant)     | cracked flagstone + rubble, faint moss in joints   |
| `bush.jpg`            | bush (walk-through) | dense dark teal foliage, top-down canopy           |

These are **art assets only**. Wiring them into `GameScene.setupArena()` (and a
`MAPS` table) is separate M3 work — see the implementation notes in
`docs/m3-maps.md`.

### How they were generated (the path that works on disk)

The MCP `generateImage` tool renders an image inline but does **not** write a
file here (no `OUTPUT_DIR` in `.mcp.json`). To land files on disk, call the new
API directly with the `sk_` token:

```sh
curl -H "Authorization: Bearer $POLLINATIONS_TOKEN" \
  "https://gen.pollinations.ai/image/<url-encoded-prompt>?model=flux&width=512&height=512&seed=<n>&nologo=true" \
  -o art-generated/<name>.jpg
```

Vary `seed` per tile (default 42) so similar prompts don't clone each other.

### Seamlessness

flux honors "edges wrap seamlessly" only approximately. Each tile was roll-tested
(offset by half, then inspect the new center for a discontinuity). The base
`test-floor-tile.jpg` already shows a faint center seam and was accepted — that is
the quality bar these match. `bush.jpg` has the most visible seam, but on dark
foliage it reads as a natural shadow gap. If a future pass needs truly seamless
tiles, run them through an offset+heal step (no such tool is installed here yet).

## RESOLVED — 2026-06-14: working on the new `gen.pollinations.ai` API

Image generation **now works.** `test-wall-tile.jpg` and `test-floor-tile.jpg`
(both 512×512, flux, dark dungeon palette) were generated successfully.

The earlier 402s were because Pollinations moved generation to a **new base URL**,
`https://gen.pollinations.ai`, and deprecated the legacy `image.pollinations.ai`
host the old MCP package called. On the new host our `sk_` token is honored and
secret keys have **no rate limit** (`/account/key` → `valid:true, type:secret,
rateLimitEnabled:false`). Direct call that works:

```sh
curl -H "Authorization: Bearer $POLLINATIONS_TOKEN" \
  "https://gen.pollinations.ai/image/<url-encoded-prompt>?model=flux&width=512&height=512&nologo=true" \
  -o out.jpg
```

**`.mcp.json` was switched** from `@pinkpixel/mcpollinations` (legacy endpoint) to
the official `@pollinations/mcp`, which talks to `gen.pollinations.ai` and reads
`POLLINATIONS_API_KEY`. We map it to the existing `POLLINATIONS_TOKEN` env var:

```json
"pollinations": {
  "command": "npx",
  "args": ["-y", "@pollinations/mcp"],
  "env": { "POLLINATIONS_API_KEY": "${POLLINATIONS_TOKEN}" }
}
```

**Restart Claude Code** so the MCP server re-launches with the new package; then
the in-session image tools (`generateImage`, etc.) will work too. Until restart,
the `curl` form above is the working path. Note `account:balance` is scope-gated
on this key (403 unless `account:usage` is granted) — generation is unaffected.

## Retest result — 2026-06-14 (token in place): STILL BLOCKED — token not honored

A `POLLINATIONS_TOKEN` (`sk_…`, 35 chars) is now present in the shell, and the
tile test was re-run. **It still fails**, but the diagnosis has sharpened:

- The MCP `generateImage` returns `402 Payment Required` for both `flux` and
  `sana` (`listImageModels` now returns only `["sana"]`).
- Hitting the upstream `image.pollinations.ai` endpoint directly by `curl`, the
  402 body is an **x402 crypto-payment challenge**, not an auth error:
  `"Queue full for IP: … 1 requests already queued (max: 1). Get unlimited access
  at https://enter.pollinations.ai"` — it asks you to pay **USDC on the Base
  network** (host redirected to `image.myceli.ai`) to bypass a per-IP queue.
- **The token changes nothing.** Identical 402 with `Authorization: Bearer`, with
  `?token=`, and with no token at all. A single clean anonymous request (IPv4,
  after an 8s pause) returns the same 402 immediately — so it is a hard wall, not
  transient queue contention.
- The text endpoint confirms the model shift:
  `"The Pollinations legacy … API is being deprecated for authenticated users.
  Please migrate to https://enter.pollinations.ai … Anonymous requests … are NOT
  affected."`

**Root cause:** Pollinations has moved generation behind the new
`enter.pollinations.ai` gateway / x402 pay-per-request model. The `sk_` token does
**not** unlock the legacy `image.pollinations.ai` GET endpoints, and the
`@pinkpixel/mcpollinations` server only knows how to call those legacy endpoints.
So no amount of token wiring in `.mcp.json` will fix this — the MCP package itself
would need to target the new gateway, or we switch image providers.

**Options from here:** (a) use a different image MCP/provider that we can actually
authenticate (e.g. an OpenAI/Stability/Replicate-backed one); (b) fund a
pollinations `enter`/x402 account *and* swap to an MCP client that speaks the new
gateway; or (c) ship M3 with the flat-color walls/bushes path in `docs/m3-maps.md`
and drop textures in later. Recommend (c) for now, (a) when art is needed.

## First-test result — 2026-06-14: BLOCKED (402 Payment Required)

The first M3 tile test (a seamless top-down wall tile + floor tile, tuned to the
game's dark palette `#10101a / #1b1b2f / #2a2a4a / #44446a`) **did not produce
art.** The MCP server is installed and reachable — the requests were accepted and
forwarded — but the upstream pollinations.ai image endpoint returned
**HTTP 402 Payment Required** for every model:

- `flux` (the configured default) → 402
- `sana` (the only model `listImageModels` now returns) → 402

So the plumbing is fine; what's missing is **authentication**. Pollinations now
gates image generation behind a token / paid tier, and `.mcp.json` has no token
in its `env`.

### To unblock (chosen path: free pollinations token)

`.mcp.json` is already wired to read the token from the `POLLINATIONS_TOKEN`
environment variable (kept out of the repo file so it can't be committed):

```json
"token": "${POLLINATIONS_TOKEN}",
"referrer": "monster-mash"
```

Remaining **user action**:

1. Sign in at <https://enter.pollinations.ai> and create an **`sk_`** key
   (backend type — `sk_*` = full account access; `pk_*` is the browser-safe one
   we do *not* want here).
2. Export it where this Claude Code session / MCP server can see it, e.g. add to
   `~/.zshrc`:
   ```sh
   export POLLINATIONS_TOKEN="sk_xxxxxxxx"
   ```
   then open a new shell (or `source ~/.zshrc`).
3. Restart Claude Code so the `mcpollinations` MCP server re-launches with the
   token in its env.
4. Ask me to re-run the tile test — the two prompts (seamless top-down wall +
   floor, dark `#10101a/#1b1b2f/#2a2a4a/#44446a` palette) are recorded in the
   conversation.

Note: the free tier is metered ("pollen" credits), so heavy use can 402 again.

Until a token is in place, M3 can proceed with flat-color walls/bushes (per
`docs/m3-maps.md`) and textures can be dropped in later.
