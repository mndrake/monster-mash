# M4 — Juice & Feedback (scope)

> **Status: SHIPPED.** All four PRs (event channel + damage numbers/sparks,
> defeat/spawn FX, on-character HUD + aim indicator, audio + kill feed, plus the
> background-music/mute follow-up) are merged. This doc is the original plan,
> kept for design history.

Goal: make the game *feel* like Brawl Stars without changing how it plays. No
balance changes, no new modes. Almost everything here is **client presentation**;
the one piece of server work is a small **combat-event channel** that the rest of
M4 (and later milestones) builds on.

Guardrails (unchanged): server stays authoritative; the client only renders. New
server→client data crosses the `Network.ts` boundary as typed events/snapshots —
we do **not** overload the per-tick state sync.

Build order is dependency-ordered. Each item lists **files · side · effort ·
acceptance**. Effort: S ≈ <½ day, M ≈ ~1 day, L ≈ ~2 days.

---

## 1. Combat-event channel (the enabler) — do first

Today the client only sees *state snapshots*, so it can't know the **moment** or
**amount** of a hit (multiple hits in one 50 ms tick collapse into one health
delta). We add a tiny stream of discrete "this just happened" events.

**Design.** Accumulate events during a tick and broadcast once at the end of
`update()` (one message/tick max, only when non-empty):

- `hit` — `{ t:"hit", x, y, amount, kind:"main"|"super", targetId }`
  Pushed at the **projectile-hit call site** in `simulateProjectiles()` (where
  `proj.kind`, position, and `proj.damage` are known). **Poison damage does NOT
  emit hits** — it ticks every frame and would spam damage numbers; its feedback
  stays the red overlay + the existing hit-flash.
- `ko` — `{ t:"ko", x, y, victimId, victimName, killerId, killerName }`
  Pushed inside `damagePlayer()` on the branch where the target dies (it already
  knows victim + attacker there).
- `cube` — `{ t:"cube", x, y, byId }` (optional) pushed in `collectCube()`.

**Server** (`MatchRoom.ts`): add `private fx: any[] = []`; push at the three
sites above; at the end of the PLAYING branch of `update()` do
`if (this.fx.length) { this.broadcast("fx", this.fx); this.fx = []; }`.
(Keep a typed `FxEvent` union in `schema/` or a shared file for clarity.)

**Transport** (`Network.ts`): add to `NetEvents`
`onHit?(e)`, `onKO?(e)`, `onCube?(e)`; register `room.onMessage("fx", list =>
list.forEach(dispatch))`. Keep Colyseus types from leaking — emit the same plain
shapes above.

**Side:** server + transport · **Effort:** M · **Acceptance:** a `console.log` in
the client `onHit`/`onKO` fires with correct amounts/ids during a fight; no events
during countdown/roundover; poison produces none.

---

## 2. Damage numbers + hit sparks — needs #1

**Client** (`GameScene`): on `onHit`, spawn a `Text` at world `(x,y)` showing
`Math.round(amount)`; tween it up ~28px and fade over ~600 ms, then destroy.
Color by kind (main = white, super = gold); numbers for damage to **self** tinted
red and slightly larger. Add a small additive spark burst at the hit point (reuse
the muzzle-flash tween pattern). Cull is automatic (off-camera = off-screen).

**Side:** client · **Effort:** S–M · **Acceptance:** numbers pop at the point of
impact, sum roughly to the victim's health drop, and clean themselves up (no
leak after a long fight).

## 3. Defeat explosion + spawn-in — partly #1

**Client** (`PlayerView` + `GameScene`): 
- **Defeat:** on `onKO` (have position), play a one-shot explosion (expanding
  ring + a few particles in the victim's color) at `(x,y)`. The existing ghost
  fade in `PlayerView` stays for spectating.
- **Spawn-in:** in `PlayerView.applySnap`, detect `alive` flipping `false→true`
  (respawn) or fresh `onPlayerAdd`; scale the body/emoji from 0 with a quick
  back-ease + a flash. Gives rounds a clean "drop in".

**Side:** client · **Effort:** S · **Acceptance:** a kill always produces an
explosion at the right spot; new rounds visibly "pop" each monster in.

## 4. Kill feed — needs #1

**Client** (`GameScene`): on `onKO`, push a line into a top-right stack:
`"{killer} 💥 {victim}"`, or `"You KO'd {victim}!"` / `"{killer} KO'd you"` when
self is involved. Auto-expire after ~3.5 s, max ~4 lines, `scrollFactor(0)` and
zoom-corrected via the existing `placeUi()` helper. Poison deaths
(`killerId===""`) read `"{victim} succumbed to the gas"`.

**Side:** client · **Effort:** S · **Acceptance:** every KO shows one feed line;
lines expire and never overflow the screen.

---

## 5. On-character HUD: ammo pips + super ring — independent

Brawl Stars shows **your own** ammo + super on the character, not in a corner.

**Client** (`PlayerView`, **local player only**):
- **Super ring:** a `Graphics` arc around the body (radius+~6) that fills
  clockwise with `player.super` (0→1); turns solid white + a soft pulse at ≥1.
  Replaces the "white stroke when ready" hack with something readable mid-charge.
- **Ammo pips:** a segmented arc just under the body (N = `ammoMax` segments),
  each filled/empty from `floor(ammo)`, with the reloading segment partially
  filled from the fractional part. (We already sync `ammo` as a float — perfect.)
- Both follow the body in `interpolate()`.

Then **trim the top-left text** (`GameScene.updateHud`) to just
`Room · X left · Kills` (HP/ammo/super now live on the monster).

**Side:** client · **Effort:** M · **Acceptance:** ammo pips drain on fire and
refill smoothly; the super ring tracks charge and the local player can read both
without looking at the corner.

## 6. Aim indicator — small mirror

Show where a shot will go while aiming; redden it when you can't fire.

**Client** (`GameScene`, local player): a `Graphics` redrawn each frame — a thin
dotted line (and faint cone for spread weapons) from the player along `facing`,
length = the monster's range. Tint **red when `self.ammo < 1`** (matches BS).
Visible while the aim stick is active (touch) or the mouse has moved (desktop).

Range/spread are display-only: add `range`, `spread`, `pellets` to the client
`MonsterLook` in `monsters.ts` (a deliberate cosmetic mirror of `config.ts`, same
pattern as `maps.ts` — comment it as "display only, keep ≈ in sync").

**Side:** client (+ tiny mirror) · **Effort:** S–M · **Acceptance:** the line
points where shots actually fly and goes red with no ammo.

---

## 7. Audio — independent, biggest feel win

The game is silent. Two layers so we ship sound immediately and upgrade later:

**7a. Zero-asset SFX (ship first).** New `client/src/audio/Sfx.ts`: a thin
WebAudio synth (short oscillator/noise blips) for: shoot (main vs super),
**hit**, **super-ready ding**, cube pickup, defeat, countdown beep, and
win/lose stings. Triggers:
- shoot → `onProjectileAdd` (gate to the local player / near-camera so it isn't a
  wall of noise);
- hit / defeat → the `fx` events from #1;
- super-ready → when `self.super` crosses ≥1 (detect in `updateHud`);
- cube → `onCubeRemove` near self; countdown/round stings → phase changes.
- **Mobile autoplay:** WebAudio starts suspended; `resume()` it on the first
  input (the "Join arena" tap / first joystick touch).

**7b. Real SFX / music / announcer (drop-in later).** Optional `public/audio/*`
loaded in `preload()` if present, replacing the synth blips behind the same
`Sfx` API. Announcer lines ("3-2-1, BRAWL!", victory/defeat) could be TTS-
generated (the pollinations MCP exposes `sayText`/`respondAudio` — may be gated
like image-gen was; treat as a bonus, not a dependency). A low music loop on
`PLAYING`.

**Side:** client · **Effort:** M (7a), S (7b drop-in) · **Acceptance:** firing,
hits, KOs, super-ready, and the countdown are all audible; sound works after the
join tap on a phone; muting (a settings toggle) is a nice-to-have.

---

## Suggested PR slicing
1. **PR-A (enabler + first payoff):** #1 event channel + #2 damage numbers/sparks
   + #3 defeat/spawn FX. One coherent "hits feel real" drop.
2. **PR-B:** #5 on-character HUD + trim corner HUD + #6 aim indicator. "Reads like
   BS" drop.
3. **PR-C:** #7a audio (+ #4 kill feed, cheap). "Sounds like BS" drop.
4. **PR-D (optional):** #7b real audio assets / announcer.

## Verification
- Visual items (#2–#6): the Playwright + headless-Chrome screenshot harness used
  in M3.5 — two players, fire, KO, capture at a phone viewport (portrait **and**
  landscape, since zoom-corrected UI must hold in both).
- Audio (#7): can't screenshot — assert the `Sfx` calls fire on the right events
  and that the WebAudio context resumes after the join gesture; confirm by ear on
  a real device.

## Risk / decisions already made
- **Poison emits no `hit` events** (anti-spam); its feel stays the overlay + flash.
- **All players' hit numbers are shown** (camera-culled) — simpler than filtering
  to self; revisit if it's noisy.
- **`fx` is batched once per tick** — bounded volume, safe at our ≤10-player LAN
  scale.
- **Audio starts asset-free** (synth) so M4 isn't blocked on sourcing/generating
  sound files, with a clean swap point for real ones.
- **Aim range is a display-only mirror** in `monsters.ts` — accepted duplication,
  documented like `maps.ts`.
