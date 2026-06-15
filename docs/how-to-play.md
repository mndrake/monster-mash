# How-to-Play / instructions page

> **Status: PLANNED.** Small, self-contained client feature (no server changes).
> A new-player onboarding screen. Independent of the M8 gameplay work.

## Goal
A short, skimmable **"How to Play"** screen so a first-timer understands the game
in ~20 seconds, without anyone explaining it.

## Access
- A **"How to Play"** button on the lobby (next to Join), opening the screen as an
  overlay; a close/back button returns to the lobby.
- **Auto-open on first visit** (a `localStorage` flag, e.g. `mm-seen-help`), so
  brand-new players see it once; afterwards it's opt-in via the button.
- Also reachable from the **waiting room** (a small "?" so people can re-check
  controls before the round starts).

## What it covers (keep it tight + visual)
1. **Goal** — continuous **Showdown** free-for-all: be the last monster standing;
   a **poison** gas closes in, so don't get caught outside the safe zone.
2. **Controls** — twin-stick:
   - **Touch:** left half = move, right half = aim (drag + release to fire; a
     quick tap auto-fires at the nearest enemy). **SUPER** and **GADGET** buttons
     on the right.
   - **Desktop:** WASD/arrows move, mouse aims, **click** fires, **right-click /
     Space** = super, **Q** = gadget.
3. **Power up** — break **boxes** and defeat enemies for **power cubes**; each cube
   raises your health + damage.
4. **Terrain** — **walls** block movement and shots; **bushes** hide you if you
   sit still and hold fire.
5. **Super & Gadget** — the super charges as you fight (Asher's charges from
   damage taken); the gadget is a cooldown ability you **pick before the match**.
6. **Lobby flow** — the **host** starts each round from the waiting room and can
   add **bots**; standings show between rounds.

## Implementation
- Client-only: an HTML overlay module (mirror `WaitingRoom.ts` / the lobby — own
  DOM + injected styles), opened/closed from `main.ts`. No Phaser, no server.
- Mobile-first: scrollable panel, big tap targets, short copy. Use the monster
  emojis / simple icons inline; richer diagrams can use the generated art later
  (see the M8 visual PRs) but text + emoji is enough for v1.
- Keep copy in one place so it's easy to update as controls evolve (the gadget
  button and Q key are new this milestone — make sure they're listed).

*Effort: S.*
