# M8 PR-D — Voice line scripts (for review)

Draft voice lines for all **nine** brawlers, written to each character's
personality (looks/blurbs in `client/src/game/monsters.ts`, the three new ones
described in `docs/m8-gadgets-brawlers.md`). Per the design rule: **5–10 lines
each** ([[brawler-design-rules]]).

**Review this first.** Once you sign off on wording/tone, I generate the audio
once via the pollinations MCP TTS (`sayText`, with the per-character voice +
tone notes below), bake the clips to `client/public/voice/<brawler>/<event>.mp3`,
and wire playback in `Sfx.ts`. Generation is the expensive/irreversible step —
nothing is generated until you OK the script.

## Trigger map

Each line is tagged with the game moment that plays it:

- **spawn** — entering the arena (round start / respawn)
- **super** — casting the super
- **takedown** — you KO an enemy
- **defeated** — you get KO'd
- **taunt** — idle barks / round win

Variants (e.g. `takedown-a` / `takedown-b`) are picked at random for variety.
Aim 5–8 lines per brawler; mute toggle and per-character debounce respected.

---

## Gnash 👹 — feral melee biter
*Voice/tone: feral, hungry, gleeful little predator; short clipped words, growly.*

| Event | Line |
| --- | --- |
| spawn | "Gnash hungry!" |
| super | "CHOMP TIME!" |
| takedown-a | "Tasty!" |
| takedown-b | "Gnash eat good tonight!" |
| defeated | "No... fair..." |
| taunt-a | "Come closer. Gnash won't bite." |
| taunt-b | "Snack time?" |

## Spit 👾 — cocky glob marksman
*Voice/tone: cocky alien sharpshooter, a wet gloopy edge; smug and clipped.*

| Event | Line |
| --- | --- |
| spawn | "Lock and load... glob." |
| super | "Eat the spread!" |
| takedown-a | "Bazzinga." |
| takedown-b | "Right on target." |
| defeated | "All... dried up." |
| taunt-a | "Bet you can't dodge this." |
| taunt-b | "Stand still, would ya?" |

## Brute 🐲 — proud slow tank
*Voice/tone: huge, slow, friendly-dumb, thunderous; speaks in his own name.*

| Event | Line |
| --- | --- |
| spawn | "Brute smash!" |
| super | "GROUND SHAKE!" |
| takedown-a | "Squished." |
| takedown-b | "Brute win." |
| defeated | "Huh" |
| taunt-a | "Throw rocks? Brute throws bigger rocks." |
| taunt-b | "Is all?" |

## Vex 🦂 — cold long-range sniper
*Voice/tone: cold, precise, patient, venomous; quiet and measured.*

| Event | Line |
| --- | --- |
| spawn | "One shot. One sting." |
| super | "Hold still." |
| takedown-a | "Target eliminated." |
| takedown-b | "Clean." |
| defeated | "Missed... my mark." |
| taunt-a | "I see you from here." |
| taunt-b | "Patience. You'll wander into range." |

## Spike 🐡 — prickly close-range scrapper
*Voice/tone: sassy, prickly little fighter; bright and provoking.*

| Event | Line |
| --- | --- |
| spawn | "Full of power!" |
| super | "Get pricked!" |
| takedown-a | "Pop!" |
| takedown-b | "Too close, pal." |
| defeated | "Deflated..." |
| taunt-a | "Hug me. I dare you." |
| taunt-b | "Sharp, aren't I?" |

## Wisp 👻 — playful phantom skirmisher
*Voice/tone: playful, ethereal, teasing, fleeting; airy and singsong.*

| Event | Line |
| --- | --- |
| spawn | "Boo!" |
| super | "Catch me!" |
| takedown-a | "Spooked ya." |
| takedown-b | "Gotcha." |
| defeated | "Fading..." |
| taunt-a | "Now you see me..." |
| taunt-b | "Over here. No — over here." |

## Ruby 🌿 — curious plant biologist
*Voice/tone: human; curious, clinical, fascinated by the monsters; warm-scientific.*

| Event | Line |
| --- | --- |
| spawn | "Let's begin the study." |
| super | "Specimen — meet the thicket." |
| takedown-a | "Hypothesis confirmed." |
| takedown-b | "Noted for the record." |
| defeated | "Fascinating... data..." |
| taunt-a | "Hold still — I'm taking notes." |
| taunt-b | "Remarkable specimen. Shame I have to prune it." |

## Asher 🐌 — seething acid slug
*Voice/tone: wet, slow, seething; hissing sibilants; erupts into a furious snarl on Enrage.*

| Event | Line |
| --- | --- |
| spawn | "Ssslow... and sssteady." |
| super | "NOW you've made me MAD!" |
| takedown-a | "Dissssolved." |
| takedown-b | "Melted right through ya." |
| defeated | "...ssssalt." |
| taunt-a | "One eye's all I need to watch you." |
| taunt-b | "Grrr... keep poking. See what happens." |

## Sam 👴 — grumpy chainsaw geezer
*Voice/tone: crotchety old man, late 60s; gravelly "get off my lawn" energy.*

| Event | Line |
| --- | --- |
| spawn | "Alright, who's makin' all that racket?" |
| super | "REV IT UP!" |
| takedown-a | "Pipe down, ya varmint!" |
| takedown-b | "And STAY quiet!" |
| defeated | "Bah... my back..." |
| taunt-a | "Back in my day, monsters knew their place." |
| taunt-b | "Get off my lawn!" |

---

## Notes for generation (after sign-off)

- **Voice picking:** I'll `listAudioVoices` and map a fitting voice per
  character (gruff/old for Sam, airy for Wisp, cold for Vex, etc.), using
  `sayText` `voiceInstructions` to push tone (e.g. Asher: "wet, slow, hissing,
  then furious"). Ruby/Sam read human; the rest can lean monstrous.
- **Files:** `client/public/voice/<brawler>/<event>.mp3` (e.g.
  `sam/takedown-a.mp3`). ~9 × 7 ≈ 60 small clips, committed as assets.
- **Playback:** added to `client/src/audio/Sfx.ts`, fired off the existing
  spawn/super/KO/defeat signals + the `fx` event channel; honors mute; debounced
  per character so lines don't overlap.
</content>
</invoke>
