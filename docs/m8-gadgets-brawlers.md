# M8 — Gadgets, three new brawlers, and bot customization

> **Status: PR-A + PR-B SHIPPED** (gadget system + 2 gadgets per brawler;
> Ruby/Asher/Sam). PR-C (bot customization) and PR-D (voice lines) still planned.
> Second slice of the arc (after M7 bots). Adds the
> defining Brawl-Stars depth layer — **gadgets (2 per brawler, pick 1 of 2)** —
> plus **Ruby, Asher, Sam**, **5–10 voice lines per brawler**, and **bot
> customization** (what they play + how hard). **No star powers** (per request).
> Server-authoritative as always; the client gains a second action button, a
> gadget HUD, look entries, and voice playback.

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

## Gadgets (cooldown-based, no charges) — **2 per brawler**
Per your spec: **every brawler has exactly 2 gadgets**, and the player **picks 1
of the 2** to take into a match. Each gadget has a **cooldown scaled to its
power** (stronger → longer). No star powers.

- **Config:** `MonsterType.gadgets = [ { id, name, cooldownMs, … }, { … } ]` (an
  array of two).
- **Selection:** the chosen gadget index is sent at join (alongside `monster`),
  defaulting to gadget 0. The **polished chooser** ships with the M9 select
  screen; M8 ships **both gadget definitions per brawler** + a minimal pick in
  the existing picker so the choice is usable now.
- **State:** `Player.gadgetCharge` (0..1, synced) for the HUD ring; server fills
  it from the chosen gadget's cooldown. (Mirrors the super meter.)
- **Intent:** a `"gadget"` message (optional aim vector), like `"super"`. Server
  fires the chosen gadget's effect if `gadgetCharge >= 1`, then resets cooldown.
- **Client:** a **second action button** in `Controls` + a gadget HUD indicator.
- **Bots** use their gadget opportunistically (extends `updateBots`).

Two gadgets per existing monster (directional, tune in code):

| Monster | Gadget 1 | Gadget 2 |
| --- | --- | --- |
| Gnash | Extra short dash (reposition) | Frenzy — next bite lifesteals |
| Spit | Lob a slowing glob | Spread — extra pellets on the next shot |
| Brute | 2s damage-reduction shield | Ground slam — knock back nearby enemies |
| Vex | Instant full reload | Scope — next shot pierces, +range |
| Spike | Drop a thorn field (area damage) | Quick roll (evasive dash) |
| Wisp | Short blink/teleport | After-images — brief speed + dodge |

## Three new brawlers
All built on the existing main-attack + super model, each with a gadget. Stats in
`server/src/config.ts` `MONSTERS`; looks in `client/src/game/monsters.ts`
(+ `MONSTER_ORDER`).

| Brawler | Identity | Main attack | Super | Gadgets (pick 1 of 2) |
| --- | --- | --- | --- | --- |
| **Ruby** — human biologist studying monsters; short black hair; fights with plants | Mid-range **control + sustain** (a niche nobody fills) | Thorny seed pods (medium range) | Bursts a seed into an **entangling thicket** (area slow/root) | 1) **Bloom** — drop a healing plant (heal-over-time zone); 2) **Thornburst** — instant ring of thorns/slow around her |
| **Asher** — one-eyed, slug-bottomed, very slow, spits acid; rages when hurt | **Slow bruiser with a comeback** | **Enrage** — big speed (+ fire-rate) for a few seconds. **Charges from damage *taken*, not dealt** | Acid glob (short-mid; leaves a lingering acid slow) | 1) **Acid puddle** — area denial; 2) **Caustic shell** — brief incoming-damage reduction + reflect |
| **Sam** — grumpy human in his late 60s; wants the monsters quiet; wields a chainsaw | **Sticky heavy melee** (vs Gnash's hit-and-run) | **Chainsaw charge** — a dash that shreds everything in its path | Chainsaw slash (very short range, high damage, fast cadence) | 1) **Rev up** — brief attack-speed + lifesteal; 2) **Oil slick** — drop a slowing patch |

**The one non-trivial mechanic — Asher's super:** today supers charge via
`superChargePerHit` when you *land* hits. Asher charges when he *takes* damage.
Add `MonsterType.superFromDamageTaken` (charge per HP lost) and credit it in
`damagePlayer` on the victim. His "Enrage" is a self-buff (speed mult via the
PR-A status layer), not a projectile.

## Voice lines (5–10 per brawler)
**Every character gets 5–10 voice lines** (min 5, max 10), played on game moments
for Brawl-Stars personality.

- **Triggers** (map a line to each): **spawn/enter**, **super cast**, **takedown
  (KO an enemy)**, **defeated**, and a **taunt** (idle / round win). That's a
  natural 5; up to 10 lets a character have variants (two takedown barks, etc.).
- **Source:** the project audio is otherwise zero-asset/synthesized and TTS was
  previously blocked — so generate the lines with the **pollinations MCP TTS**
  (`listAudioVoices` → pick a fitting voice per character, `sayText`/
  `respondAudio` to render). Bake them to small audio files under
  `client/public/voice/<brawler>/<event>.*` at build/author time (not at
  runtime). This is a deliberate, scoped exception to "zero-asset."
- **Playback:** `client/src/audio/Sfx.ts` plays the right line off the same
  signals the juice already uses — spawn/super/KO/defeat come from state +
  the `fx` event channel. Respect the existing **mute** toggle; keep lines short
  and don't overlap (debounce per character).
- **Lines** should match each personality (e.g. Sam: "Pipe down, ya varmints!";
  Ruby: "Fascinating specimen…"; Asher: a wet, angry hiss on Enrage).

Scriptwriting the actual lines per brawler is part of **PR-D**; confirm tone/
wording there before generating audio.

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
  `Player`; `"gadget"` message + cooldown + HUD + second action button; **two
  gadgets per existing monster** + a minimal pick-1-of-2 at join; bots use
  gadgets. *Effort: L.*
- **PR-B — Ruby, Asher, Sam.** Stats, looks, main/super, **two gadgets each**;
  Asher's damage-taken super charge + Enrage self-buff (uses PR-A). *Effort: M.*
- **PR-C — Bot customization.** `addBot` options, difficulty-scaled AI, waiting-
  room monster/level controls, LOS fix. *Effort: M.*
- **PR-D — Voice lines.** 5–10 per brawler (all nine + the new three): write the
  lines, generate audio via pollinations TTS, wire playback in `Sfx.ts` off the
  existing signals, respect mute. *Effort: M.*

A → B → C → D: PR-A is the foundation B/C build on; D can land last (or in
parallel once the brawler roster from B is final). Each PR ships through the gate.

## Out of scope (later milestones)
- The **polished 3D-style select screen** (AI-art portraits + custom icons) with
  the full **choose-1-of-2-gadgets** UI → **M9** (needs art direction). M8 still
  defines both gadgets per brawler and a minimal chooser.
- **Star powers** — deferred indefinitely per request.
- Duo Showdown / Monster Ball → **M10 / M11**.
