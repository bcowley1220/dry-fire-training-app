# Duck Hunt Arcade progress

Branch: `codex/duck-hunt-arcade`, based on clean `master` containing Projector Mode and High Noon. Changes are in the working tree; no commit or push was requested.

Original request: [Duck Hunt task](duck-hunt-task.md). Implementation and usage: [Duck Hunt guide](duck-hunt.md). Art provenance: [assets](duck-hunt-assets.md).

## Current state

Software implementation is complete and checked. The missing physical training laser remains the hardware validation dependency. There is no unfinished implementation step required to run simulated sessions.

Implemented:

- Original grayscale marsh, animated independent ducks, original dog reactions, water/reed movement and projected pixel HUD.
- Single Duck and Two-Duck Choice, Easy/Normal/Hard, 5/10/20 encounters, one shot per encounter, manual READY, pause/resume/restart/exit, score and encounter records.
- Deterministic bounded flight paths, body ellipses that follow scaling/flipping, timestamped bounded history, interpolation/path reconstruction, stale-event rejection and one-second post-exit settlement.
- Existing camera/homography/laser pipeline routes into the same game handler as laptop-preview and calibrated-camera simulation. Frame-observed timestamps are explicitly labeled; no sensor exposure timing is claimed.
- Existing Phaser host and display lifecycle generalized for Duck Hunt, with one display canvas and no second Phaser preview. Activity/launch controls retain their right-menu and narrow-screen-first layout.
- Laptop-only geometry overlay and timing diagnostics, simulation labels, optional original synthesized audio, no database changes or game-result persistence, no new dependencies.

Main new files: `src/lib/games/duck-hunt/{model,flight,art,runtime}.js`, `src/lib/games/history.js`, `src/lib/components/DuckHuntController.svelte`, `static/duck-hunt/marsh.png`, and `tests/duckHunt.test.js`. Shared controller, host, display route and protocol validators now recognize Duck Hunt; the original bitmap alphabet gains `%`.

## Verification completed

- `node tests/duckHunt.test.js`: **19/19 behavioral tests passed**.
- `npm test`: **all seven test-file groups passed**, including existing High Noon, projector, lifecycle, interface and training tests.
- `npm run lint`: **passed** (Prettier and ESLint).
- `npm run build`: **passed**. No separate typecheck script exists. Existing Phaser bundle size/adapter-auto deployment notices remain informational.
- `git diff --check`: **passed**.
- Browser: select Duck Hunt before launching via the existing display-tab fallback; start/READY; Single Duck simulated hit for 100 points; choice-mode independent sprites, hit for one duck, escape, manual results pacing; pause/resume; restart and new setup; first-READY applies mode changed after Start; optional audio checkbox unlock/disable without browser errors; moving-target diagnostic timestamps/geometry; switching to High Noon/start and exiting to bullseye. The display had one Phaser canvas while playing and zero after exit.
- Browser: synthetic-camera selection, four clockwise calibration clicks, then keyboard camera-preview shot through the existing homography. It resolved as a labeled simulated miss with `method: camera`, `timestampKind: simulation-click`, normalized/world coordinates and historical scoring.
- Final build was served after restarting the preview server, then reloaded and checked. Choice-mode preview shot scored using `timestamp-history` with receipt epoch and monotonic times exposed. No display console warnings/errors were captured during this check.
- Saved 1280×720 projected-scene screenshot checked with Pillow: **0 non-neutral pixels out of 921,600**. This checks the rendered sampled scene, not real projector light or detector performance. Screenshot: `/tmp/duck-hunt-verification.png`.
- Coordinate tests cover portrait and wide letterboxing; physical projector alignment remains pending. Popup/fullscreen hardware behavior was not newly validated; the browser-tab fallback was used.

## Pick up tonight

1. Start the app (`npm run dev`) and follow the Duck Hunt guide for a simulated session. The temporary verification preview server is stopped when this task finishes.
2. When the laser is found, run the existing [Projector Mode hardware checklist](projector-mode.md), then test red and green isolated pulses on moving ducks at Easy before Normal/Hard. Record observed FPS, missed/false detections, calibration error and buffering.
3. Tune sizes/speeds/detector settings from hardware evidence. Do not add arbitrary hitbox expansion or pretend frame-observed time is sensor exposure time.
4. Optional polish: richer dog retrieval choreography, refined duck sprite detail, original wing/dog sounds, and trustworthy camera-capture metadata if available. These are follow-ups, not hidden unfinished gameplay.
