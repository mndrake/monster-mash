# Brawl Stars — look/feel/gameplay research & "what to build next"

Research date: 2026-06-14. Grounds the next milestones against how Brawl Stars
actually plays in 2025/26. Scope guardrails for everything below: this is a
**private LAN FFA brawler**, **server-authoritative** (no gameplay logic on the
client), and we value **simple, readable** code over feature-completeness. So the
goal is not to clone Brawl Stars — it's to borrow the highest-impact bits of its
*feel* and depth that fit a small Showdown game.

---

## 1. How Brawl Stars actually looks, feels, and plays

**Controls / feel.** Twin-stick: left = move, right = aim. Drag the right stick
to aim — it shows the **attack's shape + range + a direction indicator** — and
*release to fire*; a quick tap auto-aims at the nearest enemy. If you're out of
ammo, the aim indicator **glows red**. The Super has its own control: a circular
meter with a **thin yellow ring that fills as it charges**, fired by aim-release
or tapped to auto-target. ([controls](https://brawlstars.fandom.com/wiki/Beginner's_Guide))

**The combat kit (depth layers), in order of how Supercell added them.** Every
brawler has a **main attack** + a **Super** (charges by landing hits). On top of
that: **Gadgets** (a limited-use active, a few charges per match), **Star Powers**
(a passive buff), **Gears** (small stat mods), and **Hypercharges** (a
slower-charging "ultra" that briefly boosts speed/damage/defense and upgrades the
Super). ([abilities overview](https://shapes.inc/fandom/brawl-stars/gears-gadgets-starpowers), [hypercharge](https://clutchpoints.com/gaming/brawl-stars-all-hypercharge-abilities))

**Showdown specifics (our mode).** 10 players, solo or **duo**. You start with 0
power cubes and earn them by **breaking boxes** (boxes have HP) and **defeating
enemies** (a defeated brawler **drops cubes**). Each cube = +health and +~10%
damage to everything. A **poison gas** closes from the edges: it reduces healing
~50%, deals a % of max-HP per second, and **ramps the longer you stand in it /
the further from center**. Some maps have **modifiers** (energy drinks, meteors,
etc.). ([Showdown](https://brawlstars.fandom.com/wiki/Showdown), [solo guide](https://www.brawl.one/blogs/brawl-stars-solo-showdown-survival-guide-2025))

**Other modes (for context on where we could go).** Team-based 3v3 with
respawns: **Gem Grab** (hold 10 gems through a 15s countdown), **Bounty** (kills =
stars, most stars wins), **Brawl Ball** (score 2 goals), **Heist** (destroy the
enemy safe), **Knockout** (elimination, **no respawn**, **best-of-3 rounds**,
poison closes in — the closest cousin to our current round model, just team-based).
([modes](https://brawlify.com/gamemodes), [Knockout](https://brawlstars.fandom.com/wiki/Knockout))

**Look & juice.** Bright, saturated, bold-outline cartoon style with a slight ¾
"isometric" tilt (we approximated this with the grass palette + extruded walls +
zoom). The *feel* is carried as much by **feedback** as by art: per-brawler
attack/super/reload **sounds + voice lines** (enter battle, take damage, score a
takedown, defeated), an **announcer** ("3-2-1, GO!", win/lose stings), animated
shape-based VFX (no pre-rendered sprites), defeat explosions, spawn-ins, and a
super-ready "ding." ([SFX set](https://github.com/Henrylq/Brawl-Stars-SFX), [VFX approach](https://www.behance.net/gallery/87326109/Brawl-Stars-VFX))

---

## 2. What we already have (mapped to the above)

| Brawl Stars concept | Us today |
| --- | --- |
| Twin-stick + super button | ✅ Controls.ts (floating sticks, quick-fire on tap) |
| Main attack + ammo + reload | ✅ per-monster ammo/reload/cooldown |
| Super charged by hits + dash | ✅ super meter; Gnash lunges on super |
| Power cubes (+hp/+dmg) | ⚠️ scattered at round start only — no boxes, no drop-on-kill |
| Closing poison zone w/ ramp | ✅ shrinking safe rect, ramping DPS |
| Health regen out of combat | ✅ |
| Walls (block move+shots) + bushes (hide) | ✅ terrain w/ collision; BS-style art |
| Bright cartoon look, extruded walls, zoom | ✅ (just shipped) |
| Hit-flash / muzzle flash / shot glow / shake | ✅ (just shipped) |
| FFA last-monster-standing, continuous rounds | ✅ |
| Gadgets / Star Powers / Hypercharges | ❌ none |
| Teams / Duo / respawns / other modes | ❌ FFA only |
| Audio (SFX, voice, announcer, music) | ❌ **silent** |
| On-character HUD (ammo pips, super ring) | ❌ top-left text only |
| Damage numbers / kill feed / defeat & spawn FX | ❌ |
| Aim trajectory/shape indicator | ❌ (server auto-aims; nothing drawn) |

---

## 3. Recommended next milestones (prioritized)

### ⭐ Tier 1 — "feels like Brawl Stars" for the least gameplay risk
The single biggest perceived-quality jump, almost entirely **presentation**.

1. **Audio.** The game is silent; BS feel is half sound. Add: shoot, hit,
   reload-tick, **super-ready ding**, defeat, cube pickup, plus an announcer
   ("3-2-1 BRAWL!", victory/defeat sting) and a low gameplay music loop. Mostly
   client-side off existing state changes. *Effort: M. Impact: very high.*
2. **On-character HUD (BS layout).** Ammo as **radial pips** beside the monster,
   Super as a **ring that fills around the body**, health bar above (we have it).
   Keep a minimal top-left line for room/kills. Pure client render. *Effort: M.
   Impact: high (authenticity).*
3. **A server→client combat-event channel** (the key *enabler*). Today the client
   only sees state snapshots, so it can't show a hit's *moment* or *amount*. Add a
   small event stream (hit w/ damage + position, KO w/ victim/killer, cube pickup).
   Then layer on: **floating damage numbers**, a **kill feed** ("You KO'd X"),
   **defeat explosion + spawn-in**, and **bush rustle** on entry. *Effort: M.
   Impact: high — and it unlocks later features.*
4. **Aim feedback.** Draw the **attack range/shape while dragging** the aim stick;
   tint it **red when out of ammo**. *Effort: S. Impact: medium.*

> Suggested as the next milestone (call it **M4: Juice & Feedback**) — items 1–4.
> Low gameplay risk, no balance changes, and #3 builds the plumbing M5 needs.

### Tier 2 — gameplay depth that fits the current mode
5. **Breakable boxes + cubes-on-defeat.** Make cubes come from **destructible
   crates** (HP, drop cubes) and from **kills** (defeated monster drops cubes),
   not just a start-of-round scatter. This is core Showdown loop + snowball
   tension. Server gameplay; reuses wall AABBs + the event channel. *Effort: M.*
6. **One Gadget per monster (limited-use active) + one passive Star Power.** The
   defining BS depth layer. Start tiny: e.g. Gnash = short dash, Spit = slowing
   spit, Brute = brief shield; passives like "+speed in bush." Adds a second
   action button. Server-authoritative. *Effort: M–L. Impact: high gameplay.*
7. **More monsters.** BS variety = dozens; we have 3. New monsters are mostly a
   row of numbers in `server/src/config.ts` + a look entry. Cheap variety.
   *Effort: S each.*

### Tier 3 — bigger structural bets (pick later, deliberately)
8. **Duo Showdown (2-player teams)** — shared win condition, team colors, maybe
   teammate revive. Medium-large server change. Good for "play with friends."
9. **A second mode with respawns + an objective** — **Bounty** (simplest team
   kill-count) or **Gem Grab** (iconic). Knockout is closest to our code but is
   team-based. This is the largest bucket (teams, objective state, respawns,
   spawn points) — do it once the event channel + teams exist. *Effort: L.*
10. **Skip for a private LAN game (for now):** trophies/progression, skins, gears,
    hypercharges, claw-machine/"buffies" economy — these are live-service
    retention systems, not feel. Note and move on.

---

## 4. Architecture notes for whoever picks this up
- Keep gameplay on the server. The **combat-event channel (#3)** is the one piece
  of new plumbing worth doing carefully: add it to the schema/`Network.ts`
  boundary as discrete events, not by overloading per-tick snapshots.
- Audio, on-character HUD, damage numbers, aim indicators, defeat/spawn FX are all
  **client presentation** — they belong in `GameScene` / `*View.ts`, driven by
  state + the new events.
- New monsters, boxes, cube-drops, gadgets, teams, and modes are **server**
  changes (`config.ts`, `MatchRoom.ts`, `schema/`), mirrored to the client only
  as new snapshot/look fields.

## Sources
- Controls / aiming / super ring: <https://brawlstars.fandom.com/wiki/Beginner's_Guide>
- Abilities (gadgets/star powers/gears): <https://shapes.inc/fandom/brawl-stars/gears-gadgets-starpowers>
- Hypercharges: <https://clutchpoints.com/gaming/brawl-stars-all-hypercharge-abilities>
- Showdown mechanics: <https://brawlstars.fandom.com/wiki/Showdown> · <https://www.brawl.one/blogs/brawl-stars-solo-showdown-survival-guide-2025>
- Game modes: <https://brawlify.com/gamemodes> · Knockout: <https://brawlstars.fandom.com/wiki/Knockout>
- Sound design / VFX: <https://github.com/Henrylq/Brawl-Stars-SFX> · <https://www.behance.net/gallery/87326109/Brawl-Stars-VFX>
