# M8 — Gadgets, three new brawlers, and bot customization

> **Status: PLANNED.** Second slice of the arc (after M7 bots). Adds the
> defining Brawl-Stars depth layer — **gadgets** — plus **Ruby, Asher, Sam**, and
> **bot customization** (what they play + how hard). **No star powers yet** (per
> request). Server-authoritative as always; the client only gains a second
> action button + a gadget HUD + look entries.

## The shared enabler: a timed status-effect system
Almost everything below needs *temporary* effects on a player — a speed boost
(Asher's rage, Sam's rev, Gnash's dash gadget), a damage shield (Brute), a slow
or root (Ruby's vines, acid). Rather than bespoke timers per ability, add **one
small status layer** on `Player`:

- Server-only timers like `speedMultUntil`, `damageTakenMultUntil`,
  `slowUntil` / `rootUntil`, plus the multiplier values.
- Applied where they matter: `simulatePlayers` scales movement by the active
  speed/slow factor; `damagePlayer` scales incoming damage by any shield.
- A **minimal synced flag** (e.g. `Player.fxState: "" | "rage" | "shield" |
  "rooted"`) so the client can tint/aura the monster — no per-effect sync.

This is built in **PR-A** because gadgets are its first consumer.

## Gadgets (cooldown-based, no charges)
Per your spec: each gadget has a **cooldown scaled to its power** (stronger →
longer). No star powers.

- **Config:** `MonsterType.gadget = { id, name, cooldownMs, … }`.
- **State:** `Player.gadgetCharge` (0..1, synced) for the HUD ring; server fills
  it from the cooldown. (Mirrors how the super meter already works.)
- **Intent:** a `"gadget"` message (optional aim vector), like `"super"`. Server
  fires the effect if `gadgetCharge >= 1`, then resets the cooldown.
- **Client:** a **second action button** in `Controls` + a small gadget
  indicator on the HUD. (The *choose-1-of-2-gadgets* picker is **M9**, with the
  select-screen glow-up — M8 ships one gadget per monster.)
- **Bots** use their gadget opportunistically (extends `updateBots`).

First gadget per existing monster (directional, tune in code):

| Monster | Gadget |
| --- | --- |
| Gnash | Extra short dash (reposition) |
| Spit | Lob a slowing glob |
| Brute | 2s damage-reduction shield |
| Vex | Instant full reload |
| Spike | Drop a thorn field (area damage) |
| Wisp | Short blink/teleport |

## Three new brawlers
All built on the existing main-attack + super model, each with a gadget. Stats in
`server/src/config.ts` `MONSTERS`; looks in `client/src/game/monsters.ts`
(+ `MONSTER_ORDER`).

| Brawler | Identity | Main attack | Super | Gadget |
| --- | --- | --- | --- | --- |
| **Ruby** — human biologist studying monsters; short black hair; fights with plants | Mid-range **control + sustain** (a niche nobody fills) | Thorny seed pods (medium range) | Bursts a seed into an **entangling thicket** (area slow/root) | **Bloom**: drop a healing plant (heal-over-time zone) |
| **Asher** — one-eyed, slug-bottomed, very slow, spits acid; rages when hurt | **Slow bruiser with a comeback** | Acid glob (short-mid; leaves a lingering acid slow) | **Enrage** — big speed (+ fire-rate) for a few seconds. **Charges from damage *taken*, not dealt** | Acid puddle (area denial) |
| **Sam** — grumpy human in his late 60s; wants the monsters quiet; wields a chainsaw | **Sticky heavy melee** (vs Gnash's hit-and-run) | Chainsaw slash (very short range, high damage, fast cadence) | **Chainsaw charge** — a dash that shreds everything in its path | **Rev up**: brief attack-speed + lifesteal |

**The one non-trivial mechanic — Asher's super:** today supers charge via
`superChargePerHit` when you *land* hits. Asher charges when he *takes* damage.
Add `MonsterType.superFromDamageTaken` (charge per HP lost) and credit it in
`damagePlayer` on the victim. His "Enrage" is a self-buff (speed mult via the
PR-A status layer), not a projectile.

## Bot customization (what they play + how hard)
- **Monster:** `addBot` takes an optional `monster` ("random" by default).
- **Difficulty:** `addBot` takes `difficulty: "easy" | "normal" | "hard"`, stored
  on the bot (`Player.botLevel`, synced so the roster can show it). Difficulty
  scales `updateBots`: reaction cadence, aim jitter, engage discipline, and how
  readily it uses super/gadget. (Easy = sluggish + sometimes idle/miss; Hard =
  tight range control, smart super/gadget timing.)
- **UI:** waiting-room controls (host-only) to choose the **monster** + **level**
  applied to bots you add; bot rows show their level.
- Bots become wall-aware enough not to fire point-blank into a wall (a small
  line-of-sight check) — addresses the M7 wall-blindness deferral.

## PR breakdown (build order)
- **PR-A — Status-effect layer + gadget system** (the enabler). Statuses on
  `Player`; `"gadget"` message + cooldown + HUD + second action button; one
  gadget per existing monster; bots use gadgets. *Effort: M–L.*
- **PR-B — Ruby, Asher, Sam.** Stats, looks, main/super, gadgets; Asher's
  damage-taken super charge + Enrage self-buff (uses PR-A). *Effort: M.*
- **PR-C — Bot customization.** `addBot` options, difficulty-scaled AI, waiting-
  room monster/level controls, LOS fix. *Effort: M.*

A → B → C: PR-A is the foundation both others build on. Each PR is independently
shippable through the deploy gate.

## Out of scope (later milestones)
- **Choose 1 of 2 gadgets** + the **3D-style select screen** with portraits and
  custom icons → **M9** (needs the art direction).
- **Star powers** — deferred indefinitely per request.
- Duo Showdown / Monster Ball → **M10 / M11**.
