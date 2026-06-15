# client/public/audio/

This folder is the **drop-in point for real sound assets**. Today the game makes
**all** of its audio procedurally with the Web Audio API (see
`client/src/audio/Sfx.ts`) — short synthesized blips for shots/hits/etc. plus a
looping music bed — so it ships with sound and **no binary assets**.

If you want richer audio later, this is where real files go.

## Why it's procedural for now

Generating SFX/voice via the configured Pollinations MCP is **currently blocked**
(the legacy endpoints return `429 Queue full … get unlimited access at
enter.pollinations.ai` — the same paywall/gateway migration that blocks image
generation, see `art-generated/README.md`). The token does not unlock them. So
rather than depend on that, the audio is synthesized in-engine.

## How to add real audio later

1. Drop files here, e.g. `shoot.mp3`, `hit.mp3`, `super-ready.mp3`, `defeat.mp3`,
   `music.mp3`, and announcer lines (`brawl.mp3`, `victory.mp3`, `defeat-vo.mp3`).
2. Extend `Sfx` with a small sample path: `fetch()` each file, `decodeAudioData`
   into the existing `AudioContext`, and play the buffer in the matching method
   (`shoot()`, `hit()`, …) when a sample is present, falling back to the synth
   when it isn't. Keep the public `Sfx` API unchanged so call sites in
   `GameScene` don't move.
3. For the music bed, swap `startMusic()` to loop a `music.mp3` buffer instead of
   the synth scheduler (same start/stop hooks).

Good asset sources: a CC0 SFX pack (e.g. Kenney) for effects, and any TTS you can
actually authenticate for announcer lines. The mute toggle (🔊/🔇, top-right, or
the **M** key) already gates everything via `Sfx.setEnabled`.
