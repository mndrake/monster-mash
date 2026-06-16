# Shareable room links (room code in the URL)

> **Status: SHIPPED.** `?room=CODE` (and `#CODE`) pre-fills the lobby; a 🔗
> copy-link button copies `origin + ?room=CODE`; join writes the code to the URL
> via `history.replaceState`. Codes normalized via `normalizeRoomCode` in
> `client/src/util/roomCode.ts`. Client-only, no server changes.

## Goal
Let a host send a friend a link like `https://<client>/?room=ABCD` (or
`/#ABCD`) so opening it drops them straight into the **same private room** —
instead of reading the 4-letter code aloud and typing it.

## Why it's small
The room code is already the only thing that selects an arena
(`.filterBy(["roomCode"])` on the server; codes generated client-side in
`client/src/util/roomCode.ts`). Nothing server-side changes — this is purely the
client reading/writing the code in the URL.

## Plan (one PR)
1. **Read on load** (`client/src/main.ts`): if the URL has a room code
   (`?room=CODE` query param, or the `#CODE` hash), pre-fill `codeInput` with it
   (uppercased, validated against the code alphabet) instead of a random code.
   Fall back to the current random code when absent/invalid.
2. **Write on join:** when a game starts, reflect the active code into the URL
   with `history.replaceState` (`?room=CODE`) so the address bar is always
   copy-pasteable — and so a browser refresh rejoins the same room.
3. **Share affordance:** a small **"Copy link"** button next to the room code in
   the lobby (and/or the waiting room) that copies the full
   `location.origin + "?room=" + code` via the Clipboard API. Cheap, and it's the
   actual point — people share the link, not the code.
4. **Back-to-lobby:** when leaving to the lobby, optionally clear the param so a
   fresh visit gets a fresh code (or keep it — minor; default: keep so refresh
   rejoins).

## Notes / edge cases
- **PWA `start_url`:** the service worker / manifest `start_url` is `/`; a
  `?room=` query still resolves to the same app shell, so this is compatible with
  the installed PWA. (Use a query param, not a path segment — no SPA rewrite
  needed, and we confirmed earlier the app has no client-side routes.)
- **Validation:** only accept characters from the code alphabet in
  `roomCode.ts`; ignore junk so a malformed link just lands on the normal lobby.
- **Capitalization:** codes are uppercase; normalize on read.
- No new dependencies; ~one file (`main.ts`) plus a small lobby button + style.

*Effort: S.*
