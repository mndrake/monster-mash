# M7 — Bots (the first slice of the big feature arc)

> **Status: SHIPPED.** First milestone of the larger plan (bots → gadgets + 3
> new brawlers → select-screen glow-up → game modes/Duo → Monster Ball). Bots
> come first because they're self-contained, unblocked by the art/mode
> decisions, and make every later feature **testable solo**.

## What shipped
Server-controlled **bots** the host adds in the waiting room.

- **`Player.isBot`** (synced) — the client tags bot rows "BOT".
- **Host controls** (`WaitingRoom.ts`): **+ Add bot** / **− Bot** buttons, host-
  and lobby-only, sending `addBot`/`removeBot` messages.
- **Bots are real players.** Keyed `bot-N` in `state.players`, they respawn each
  round, collide, take damage, drop cubes on death, score on the session
  leaderboard, and count toward the win condition — no special-casing in the
  round/poison/leaderboard code.

## How the AI works (and why it's cheap)
`MatchRoom.updateBots()` runs every PLAYING tick **before** `simulatePlayers`,
and writes the *same intent fields a human client sends*:

- `inputX/inputY` — movement vector
- `aimX/aimY` + `facing` — toward the target
- `wantFire` / `wantSuper` with a **zero `fireDir`**, so the existing
  `resolveDirection` auto-aim picks the nearest enemy

So bots flow through the **identical** simulation as players — no parallel combat
path to keep in sync. Behaviour: **flee the closing poison** (steer to safe-zone
center when near an edge), else **engage the nearest enemy** at ~70% of attack
range, strafing sideways so they're not sitting ducks; fire when in range with
ammo, pop the super when charged and close.

## Edge cases handled
- Bots **never become host** — host reassignment (`onLeave`) skips them.
- Adding a bot respects `MAX_PLAYERS`.
- The room **auto-disposes when the last human (client) leaves**, so bots never
  keep an empty room alive (Colyseus disposes on zero clients; bots aren't
  clients).

## Verified
typecheck + build + geom test green; a headless run confirmed add/remove,
host-only enforcement, bots alive on start, **bots moving under AI**, and live
combat (bot fire landing hits).

## Next
M8 — **Gadgets** (cooldown-based, no star powers) + the three new brawlers
**Ruby, Asher, Sam**. Bots will learn to use gadgets there.
