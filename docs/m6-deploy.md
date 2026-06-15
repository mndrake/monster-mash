# M6 — Deployment (Render + CI)

> **Status: PLANNED.** Up through M5 the game only ran on the LAN (`npm run dev`
> on a laptop, phones visit `http://<computer-ip>:5173`). M6 puts it on the
> public internet on **Render**, with HTTPS, an installable PWA, and a GitHub
> Actions gate that ships only green builds. No gameplay changes — this is
> infra + one tiny client tweak for cold starts.

This is the first **non-gameplay** milestone: no `MatchRoom`/`config.ts`/schema
work. The artifacts live at the repo root, not in `server/`/`client/` source:

| Artifact | Purpose |
| --- | --- |
| `render.yaml` | Render Blueprint — provisions both services as code |
| `.github/workflows/deploy.yml` | CI gate (typecheck + build + geom test) → triggers Render deploys |
| Small `client/src/config.ts` tweak (PR-B) | survive free-tier cold starts |

## What gets deployed (and what doesn't)

**Two Render services** — and, deliberately, **no others**:

1. **`monster-mash-server`** — a **web service** (Node). The Colyseus +
   WebSocket process; long-lived, so it can't be static. Build only the server
   workspace (`npm --workspace server run build`), start with
   `npm --workspace server run start`. Health check `/health`.
2. **`monster-mash-client`** — a **static site**. The Vite/Phaser PWA build,
   served from Render's CDN with HTTPS.

**Services we explicitly do _not_ need:**
- **No database.** Rooms are in-memory and ephemeral by design — a finished
  match has nothing to persist. Adding a DB would be cargo-culting.
- **No Redis / no multi-instance.** A single free/Starter instance holds all
  rooms in memory, which is correct at "play with friends" scale. Horizontal
  scaling (Colyseus presence + driver on Redis) is real work and genuinely out
  of scope here — noted as a Tier-3 future bet, not an M6 task.

**Bonus we get for free:** Render serves the client over **HTTPS**, so the PWA
is now *actually* installable (service workers require https — the LAN http
setup never qualified). Add-to-home-screen now works off the public URL.

## Why these pieces fit our architecture (no code changes for the split)

- **CORS just works.** The static client (one origin) calls the server (another
  origin) for Colyseus matchmaking over HTTP. Verified in
  `@colyseus/core`'s matchmaker: it preserves our existing `/health` `request`
  listener and adds matchmaking routes with a default
  `Access-Control-Allow-Origin: *`. Cross-origin join works with **zero** server
  changes.
- **`PORT` already right.** `server/src/config.ts` reads `process.env.PORT`
  (Render injects it) and `index.ts` binds `0.0.0.0`. Nothing to change.
- **`/health` already exists.** The plain-text handler in `index.ts` doubles as
  Render's health check — keep it (it's already a documented constraint).
- **The one client gap:** `client/src/config.ts` derives the server URL as
  `wss://<same-host>:2567`. In production the server is a *different* host on
  443. So the deployed client **must** be built with
  `VITE_SERVER_URL=wss://monster-mash-server.onrender.com` (full URL, **no
  port**). That env var lives on the *static-site build* — see PR-A.

---

## PR-A — Blueprint + CI deploy pipeline  ← first PR (already drafted)

Adds `render.yaml` and `.github/workflows/deploy.yml` (both committed in this
branch).

**`render.yaml`** declares both services with `autoDeploy: false`. We turn
Render's native auto-deploy *off* on purpose so the **only** way anything ships
is through the gated workflow — otherwise every push would deploy twice (once by
Render, once by us).

**`.github/workflows/deploy.yml`** is a **gate, not just a trigger** (this is
why the Action earns its place — Render can already auto-deploy on push, so a
pure trigger would be redundant). On push to `main` it:
1. `npm ci` → `npm run typecheck` → `npm run build` → runs the geom test
   (`npm --workspace server exec tsx src/geom.test.ts` — the repo's only test,
   which `process.exit(1)`s on failure).
2. **Only on green**, POSTs each service's Render **deploy hook**.

> **Crucial mental model — where the shipped client is built.**
> `VITE_SERVER_URL` is baked in at `vite build` time. The artifact that actually
> ships is built by **Render's static-site builder** (where the env var lives),
> **not** by the workflow's `build` step. The workflow build is only a *compile
> gate*; its `VITE_SERVER_URL` is absent/wrong and that's fine — that artifact
> is thrown away, never deployed. Conflating the two is how you'd bake a
> localhost URL into production.

Deploy hooks are fire-and-forget (no wait, no success/failure report). If we
later want the run to **block until Render reports "live"** and fail on a bad
deploy, swap to the Render API (`RENDER_API_KEY` + `srv-...` ids,
`johnbeynon/render-deploy-action` which polls). Documented inline in the
workflow; deploy hooks chosen for zero-config simplicity.

## PR-B — Cold-start resilience (tiny client change)

The free web-service plan **spins down after ~15 min idle**; the next request
triggers a **~50s cold start**. Our `CONNECT_TIMEOUT_MS = 9000` would fire long
before that, so the first person to join after a quiet spell hits the error
screen on a server that's actually fine — just waking up.

Pick one (both are cheap, not mutually exclusive):
- **Code:** raise `CONNECT_TIMEOUT_MS` to ~60s **and** show a "waking the server
  up… (~30–60s on first join)" message instead of a hard error during the
  initial connect. Keeps the free tier playable.
- **Money:** run the server on Render's **Starter** plan (~$7/mo) — no spin-down,
  no cold start. Recommended if people actually play regularly.
- **Optional keep-warm:** a scheduled GitHub Action (or any uptime pinger)
  hitting `/health` every ~10 min keeps a free instance awake during peak hours.
  Mention, don't rely on — it burns free-tier hours and is a band-aid.

Recommendation: ship the code change (PR-B) regardless — it's the difference
between "looks broken" and "looks like it's loading" — and put the server on
Starter if play picks up.

---

## Manual setup checklist (dashboard — you do these, not the repo)

These are one-time click-ops the workflow/blueprint can't do for you:

1. **Connect the repo to Render**: New → Blueprint → select this repo → Render
   reads `render.yaml` and creates both services.
2. **After the first server deploy, confirm the real URL.** It's *usually*
   `monster-mash-server.onrender.com` but can gain a suffix on a name
   collision. If it differs, update `VITE_SERVER_URL` on the client service to
   match, and redeploy the client.
3. **Set the GitHub repo secrets** (Settings → Secrets and variables →
   Actions): `RENDER_DEPLOY_HOOK_SERVER` and `RENDER_DEPLOY_HOOK_CLIENT` —
   each service's Settings → Deploy Hook URL.
4. **Smoke test:** open the client URL on two devices, create + join a room by
   code, confirm movement/shooting sync and the PWA install prompt appears.

## Acceptance

- Pushing to `main` runs the gate; a red gate blocks the deploy.
- Both services deploy from a green gate; the public client connects to the
  public server (wss, cross-origin) and a full match plays end to end.
- The PWA installs from the public HTTPS URL.
- First join after idle shows a "waking up" state, not an error (PR-B).
