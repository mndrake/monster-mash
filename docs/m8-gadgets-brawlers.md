# M8 — Gadgets, three new brawlers, and bot customization

> **Status: PR-A through PR-E SHIPPED** (gadget system + 2 gadgets per brawler;
> Ruby/Asher/Sam; bot customization; voice lines; gadget descriptions + icons).
> Still planned: the rest of the visual pass — **PR-F individualized
> projectiles** and **PR-G player animation**. Second slice of the
> arc (after M7 bots). Adds the
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

- **Config:** `MonsterType.gadgets = [ { id, name, cooldownMs, desc, … }, { … } ]`
  (an array of two; `desc` + icon image added in **PR-E**).
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

## Visual identity (PR-E / PR-F / PR-G)
These three are the "make it look like a real game, not circles" pass. Like the
voice lines, the image assets are a **deliberate, scoped exception** to the
zero-asset rule — generated with the **pollinations MCP image tools**
(`generateImage`/`generateImageBatch`) in one consistent bright cartoon style,
baked to files under `client/public/...`, then loaded by Phaser. (This is the art
direction previously deferred to M9, now confirmed by these requests.)

### PR-E — Gadget descriptions + icons
PR-A shipped gadgets with just a `name`. Add a one-line **description** and an
**icon image** to each, shown in the lobby chooser and as the in-game GADGET
button face.

- **Data:** extend `GadgetDef` with `desc: string` (and the client `MonsterLook`
  gadget entries with the same). Icons live at
  `client/public/gadgets/<id>.png` (one per gadget id; ids are shared across
  monsters that reuse a gadget, e.g. `reload`).
- **UI:** the lobby `#gadget-pick` buttons show icon + name + description; the
  `Controls` GADGET button shows the icon (cooldown ring overlaid).

| Brawler | Gadget | CD | Description |
| --- | --- | --- | --- |
| Gnash | Dash | 6s | Burst forward with a quick speed boost to close or escape. |
| Gnash | Frenzy | 12s | Your bites heal you (lifesteal) for a few seconds. |
| Spit | Reload | 9s | Instantly refill all ammo. |
| Spit | Caltrops | 10s | Scatter spikes that slow nearby enemies. |
| Brute | Shield | 11s | Brace: take greatly reduced damage for ~2.5s. |
| Brute | Slam | 12s | Pound the ground — damage + knock back nearby enemies. |
| Vex | Reload | 9s | Instantly refill all ammo. |
| Vex | Adrenaline | 9s | A surge of speed to reposition the sniper. |
| Spike | Thorns | 9s | Erupt a ring of thorns — damage + slow nearby enemies. |
| Spike | Roll | 6s | Evasive roll: a quick burst of speed. |
| Wisp | Blink | 6s | Dash a short distance almost instantly. |
| Wisp | Haste | 9s | Sustained speed boost for hit-and-run. |
| Ruby | Bloom | 13s | Sprout a plant that heals you over a moment. |
| Ruby | Thornburst | 10s | Lash vines around you — slow + hurt nearby foes. |
| Asher | Acid Puddle | 10s | Spew acid underfoot — slow + burn nearby enemies. |
| Asher | Caustic Shell | 11s | Harden your shell to briefly reduce incoming damage. |
| Sam | Rev Up | 11s | Rev the chainsaw: gain lifesteal and a speed boost. |
| Sam | Oil Slick | 9s | Drop a slick that slows anyone who steps in it. |

### PR-F — Individualized projectiles
Today every shot is a colored circle. Give each brawler a **themed projectile**
that reads at a glance.

- **Plumbing:** the shooter's identity needs to reach the client. Add a synced
  `skin` (or `ownerMonster`) field to the `Projectile` schema, set on spawn;
  `ProjectileView` picks the visual from it (and `kind` for main vs super).
- **Two render options** (pick per-projectile, mix freely): **procedural shapes**
  (a leaf, a droplet, a boulder — drawn in code, zero-asset, lowest risk) or a
  small **generated sprite** (`client/public/proj/<skin>.png`) for the hero look.
  Recommend procedural first, sprites where it adds the most.

| Brawler | Projectile theme |
| --- | --- |
| Ruby | **Plants** — a spinning leaf / thorny seed (super: a vine burst) |
| Asher | Green acid droplet with a splatter trail |
| Sam | Chainsaw tooth / spark shard |
| Gnash | Snapping fang / bite |
| Spit | Blue slime glob |
| Brute | Brown boulder |
| Vex | Thin bright sniper bolt |
| Spike | Orange spike/pellet fan |
| Wisp | Glowing wisp mote |

### PR-G — Player animation
Replace the static "emoji on a circle" with **animated bodies** so monsters feel
alive.

- **Stage 1 — procedural (zero-asset, do first):** in `PlayerView`, add
  squash-&-stretch + a bob while moving, lean into the movement direction, a
  recoil/lunge on attack and a pop on super, and a hurt shake. Big juice gain for
  no assets; lowest risk.
- **Stage 2 — generated sprite frames (bigger lift):** per-brawler frames
  (idle / walk / attack) generated via the image tools into
  `client/public/brawlers/<id>/`, played as Phaser animations, replacing the
  emoji body. The colored ring/HUD stays. Heaviest item — may slip to M9.

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
- **PR-A — Status-effect layer + gadget system** (the enabler). ✅ SHIPPED.
- **PR-B — Ruby, Asher, Sam.** ✅ SHIPPED.
- **PR-C — Bot customization.** ✅ SHIPPED. `addBot` options (monster +
  difficulty), difficulty-scaled AI (awareness/fire-reliability/abilities),
  waiting-room monster/level controls, LOS fire check.
- **PR-D — Voice lines.** ✅ SHIPPED. 7 lines per brawler (all nine), generated
  via pollinations ElevenLabs TTS, baked to `client/public/voice/`, played from
  `Sfx.ts` off the existing signals (local player only), mute-respecting. Script:
  `docs/m8-voice-lines.md`.
- **PR-E — Gadget descriptions + icons.** ✅ SHIPPED. `desc` on the client
  `GadgetLook` + 17 generated icons in `client/public/gadgets/`; shown in the
  lobby chooser and on the GADGET button.
- **PR-F — Individualized projectiles.** Themed per-brawler shots (Ruby = plants,
  etc.); add a `skin` to the `Projectile` schema, render per skin/kind in
  `ProjectileView` (procedural first, optional generated sprites). *Effort: M.*
- **PR-G — Player animation.** Procedural squash/stretch/lean/recoil first
  (zero-asset), then optional generated walk/attack sprite frames. *Effort: M
  (procedural) → L (sprites).*

Order: C and D are independent of the visual PRs. E is a quick follow-on to the
shipped gadget system. F and G are the bigger visual lift (G's sprite stage may
slip to M9). Each PR ships through the gate.

## Out of scope (later milestones)
- The **polished 3D-style select screen** (AI-art portraits) with the full
  **choose-1-of-2-gadgets** UI → **M9**. (Art direction is now confirmed —
  generated bright-cartoon assets — so PR-E/F/G can start using it.)
- **Star powers** — deferred indefinitely per request.
- Duo Showdown / Monster Ball → **M10 / M11**.
- Shareable **room-code-in-URL** links → its own small plan,
  `docs/shareable-room-links.md` (independent of M8).
