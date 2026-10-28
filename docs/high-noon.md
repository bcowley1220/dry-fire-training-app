# High Noon

High Noon is a single-shot Western quick-draw game inside Projector Mode. It uses Phaser **3.90.0**, pinned to the current stable Phaser 3 release listed in the [official archive](https://phaser.io/download/archive). No backend, account, database, or persistent analytics changes are needed. The training laser remains unavailable: physical laser/webcam/projector validation is deferred.

## Launch

1. Run `npm install`, then `npm run dev`. Open the localhost URL in a desktop browser (or deploy over HTTPS for webcam access).
2. Open **Projector Mode** and select **High Noon · Quick draw** under **Projected activity**.
3. Open the projector window, move it to the extended projector display, and enter fullscreen. Embedded browsers with popup limitations can use **Open display in a browser tab** and drag that tab into its own window. Both views must use the same browser profile and origin.
4. For hardware play, enable/select the webcam and calibrate the four projected crosshairs using the existing controls. Choose red or green under **Detection tuning**. The camera/detector remain outside Phaser.
5. Choose opponent draw time (0.3–2.0 s, 0.1 s increments) and session length (1–50 rounds, default 10). Try 1.5–2.0 s during initial webcam tests.
6. Click **Start High Noon**, then **I’m ready**. GET READY lasts a random 1.5–4 seconds. Fire once after DRAW. Every round ends after one shot or the opponent deadline.
7. Reset the training device yourself and click **Ready for next round**. There is no automatic next round. Pause/resume preserves the current timing phase. Restart discards the current session; Exit game returns to the static bullseye.

## Test without a laser or camera

### Projector-space simulation

Open the projector display and enable **simulated game shots in this laptop preview**. The preview mirrors the projected scene. Click the torso or hips after DRAW; hat, arms, legs, and scenery are misses. Press Enter while the preview is focused to send a simulated torso shot. A shot before DRAW is a false start. Enable **Show hitboxes on laptop only** to see the target regions. These colored debug rectangles never enter the projected scene.

The preview converts its click to logical world coordinates, then uses the projector's reported canvas rectangle to produce normalized full-viewport coordinates. These go back through the same game-level handler as physical laser shots, including the canvas/letterbox conversion and deadline guard.

### Camera-space simulation

Expand **Developer simulation** below the camera controls. Use a real webcam preview with simulation enabled, or select **Use synthetic camera (no hardware)**. Show the calibration pattern and click a clockwise quadrilateral in the camera preview, corresponding to crosshairs 1–4. Start the game, confirm readiness, and click the camera preview after DRAW.

Camera clicks use the same sensor-coordinate → homography → normalized projector-coordinate pipeline as laser detections. They route to the game independently of the static bullseye's “count simulated shots” checkbox. That checkbox applies only to static bullseye statistics; High Noon labels every simulated round explicitly. No simulated or physical High Noon results are written to IndexedDB or physical-shot analytics in this MVP.

A useful synthetic test: with camera corners approximately (10%,10%), (90%,10%), (90%,90%), (10%,90%), the center camera point maps near the cowboy's hips. Precise hitboxes are visible in the laptop preview and diagnostics.

## Architecture and changed files

The existing Svelte 5/SvelteKit/Vite application owns camera capture, detector thresholds and pulse filtering, calibration, projector lifecycle, and local communication. Phaser is an isolated browser-only rendering subsystem. The additional game subsystem is deliberately small:

| File                                                               | Responsibility                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`, `package-lock.json`                                | Pin Phaser 3.90.0; its sole transitive addition is eventemitter3.                                                                    |
| `src/lib/components/ProjectorController.svelte`                    | Activity selection, existing calibrated camera-shot routing, game commands/reports, optional red/green detector controls.            |
| `src/lib/components/HighNoonController.svelte`                     | Configuration, manual readiness, controls, mirrored canvas preview, simulated clicks, diagnostics and results.                       |
| `src/lib/components/ProjectorGameHost.svelte`                      | Dynamic browser-only runtime import; one Phaser instance per active display; destroys it on unmount.                                 |
| `src/routes/projector/display/+page.svelte`                        | Mounts game alongside existing calibration display, forwards commands, returns game reports.                                         |
| `src/lib/games/coordinates.js`                                     | Shared shot contract, FIT rectangle calculation, normalized projector ↔ logical-world conversion.                                    |
| `src/lib/games/protocol.js`                                        | Validates game reports before the laptop consumes them.                                                                              |
| `src/lib/games/high-noon/runtime.js`                               | Phaser scene, monotonic game loop, lifecycle/command dispatch, shot routing, state reports, renderer teardown.                       |
| `src/lib/games/high-noon/model.js`                                 | Testable state machine, deadlines, pause/resume, one-shot rounds, score/results, sprite poses and hitboxes.                          |
| `src/lib/games/high-noon/art.js`                                   | Bitmap HUD typography, grayscale preparation, sprite-cell registration, foreground and mirrored preview painting.                    |
| `src/lib/projector/protocol.js`                                    | Activity validation alongside the original bullseye protocol.                                                                        |
| `src/lib/utils/detection.js`, `src/lib/projector/session.js`       | Extend existing optional projector detection settings to select red or green; preserve legacy practice detection behavior.           |
| `static/high-noon/street.png`, `static/high-noon/cowboy-sheet.png` | Independently generated replaceable backdrop and eight-frame transparent cowboy sheet.                                               |
| `tests/highNoon.test.js`                                           | Game rules, timing, scoring, coordinates, geometry, shot contract, grayscale conversion, green detector settings, report validation. |
| `docs/high-noon-assets.md`                                         | Asset provenance, generation prompts and replacement conventions.                                                                    |

The earlier Projector Mode work remains in this working tree. No unrelated training workflow was rewritten.

The runtime exposes `initialize`, `start`, `pause`, `resume`, `reset`, `handleShot`, `updateConfiguration`, and `destroy`. A future game can supply a runtime with these operations and use the same host, shot contract, and coordinate functions. Phaser's module is imported only after `onMount`; the main route and server renderer never import Phaser directly. The laptop uses a lightweight mirrored 2D canvas, not a second authoritative game or Phaser instance.

Commands and reports use the existing per-controller BroadcastChannel. Each Phaser instance also has a random game ID; commands for an old instance are rejected. Command/shot IDs are deduplicated. The model rejects further shots after a round resolves. Reports update around 10 Hz; Phaser drives visuals per frame, and the camera retains its existing processing loop and temporal filter.

## Timing and results

The **projector owns the clock**. It uses its local `performance.now()` for DRAW, deadlines, pause/resume, and accepted-shot receipt. It never compares the controller's `performance.now()` with its own. Shot metadata includes normalized x/y, an ID, source (`laser` or `simulated`), epoch-based detection time, optional confidence, and camera information when available.

DRAW begins on the first rendered scene update after the randomized wait, so a stalled renderer does not start an invisible draw clock. The opponent deadline is DRAW plus configured duration. A shot is judged at **projector receipt**, with an exact-deadline tie awarded to the opponent. This is deterministic but intentionally includes local message-delivery latency. Detection timestamps remain diagnostic metadata and do not backdate a late hit. Pausing shifts deadlines by the paused duration; there are no per-round `setTimeout` callbacks left to fire after restart or exit.

Each result includes round, configured opponent duration, reaction estimate, detection/receipt timestamps where applicable, region, false-start flag, win/loss, score, and source. Best reaction is the best winning reaction in the current session.

| Outcome               | Points |
| --------------------- | -----: |
| Torso before deadline |    100 |
| Hip before deadline   |     75 |
| False start           |    -50 |
| Miss, late/no shot    |      0 |

## Rendering, animation and hitboxes

The logical world is **1280 × 720**. Phaser Scale Manager uses FIT and CENTER_BOTH; it preserves aspect ratio with black letterboxes. Background artwork uses aspect-preserving cover placement. Shot conversion uses actual canvas CSS bounds, its viewport offset, and scaling; black bars cannot produce valid hits. Device pixel ratio does not multiply CSS-space input coordinates.

The street, foreground stones, shadow, cowboy sprite, and HUD are separate layers. Texture smoothing is disabled and the sprite/HUD use nearest-neighbor rendering. Generated assets are converted to exact neutral RGB on load, preserving alpha; the projected canvas also has a grayscale CSS guard. No red/green/blue debug overlays, laser markers, blood, or large flashing panels are projected. When the cowboy fires, a small grayscale pixel muzzle flash fades over 140 ms at the barrel. The laptop preview mirrors the same effect. Audio is disabled in this MVP.

The cowboy sheet has eight independent frames: idle A/B, ready, holster reach, raising the revolver, opponent fired, hit recoil, and recovery. Phaser's Sprite selects frames from the authoritative state and monotonic draw progress. Ready holds a stable stance without reaching or revealing a countdown; drawing reaches the final frame over the configured opponent duration. Hit recoil briefly precedes recovery. This clock-driven native Sprite approach keeps animation and hitboxes together without letting animation frame counts decide the round deadline.

Each sheet cell is cropped to its alpha bounds and normalized to a common boot baseline, with aspect preserved. The prepared frame is 96 × 176 logical sprite pixels, rendered at scale 2.6. Torso is local rectangle (34,45,28,34); hip is (30,84,36,23). Frame body offsets, sprite position, and scale transform those regions to world space. They exclude the hat, outstretched arms, lower legs, and scenery. They are invisible on the projector. The laptop mirrors the same poses/geometry and can draw its own debug overlay.

## Validation

`npm test`, `npm run lint`, `npm run build`, and `git diff --check` all passed. The High Noon test file contains 20 passing tests; all six project test files pass. There is no separate typecheck command in this JavaScript repository.

The new automated tests cover state transitions, random delay bounds, early shots, torso/hip points, invalid regions/misses, deadline ties and late hits, duplicate rejection, no-shot completion, manual readiness, pause/resume during both timing phases, restart/destroy, configuration limits, frame hitbox transformations, 16:9/4:3/portrait/ultrawide mapping, inset canvases, shot metadata, strict grayscale conversion, green/red detector selection, and report validation.

Production-browser checks exercised dynamic Phaser startup, separate-window reports, a false start (-50), a torso win (+100), a two-round total of 50, manual readiness, completed results, generated sprite rendering and laptop hitboxes. Exit/reentry removed the Phaser canvas and recreated exactly one instance, with no browser errors. Synthetic camera calibration mapped a camera point to world (628.8,395.3), and the shared handler correctly recorded its deliberately early shot as a simulated false start. Automated tests validate winning hip shots and deadline boundaries; embedded-browser automation can miss the short live DRAW window. It is not a timing benchmark.

## Known limitations and next improvements

- Real laser/webcam/projector testing remains deferred. Grayscale artwork alone does not guarantee reliable detection. Camera exposure, bloom, lighting, blob settings and short cartridge pulses still need hardware testing.
- Reaction values are estimates and include exposure, detection, local transport and event-loop latency. There is no cross-window clock calibration or latency compensation.
- Keep the display visible. Browsers may throttle background tabs/windows; explicitly pause before hiding or moving away from the game. Resize invalidates camera calibration through existing controls.
- Results are in memory and reset on leaving/reloading/disconnecting the game display. There is no history persistence, export, leaderboard or account change.
- Generated frames are an initial art pass, registered in code. More production animation frames and per-frame polygon hitboxes can replace these without changing the camera, timing or shot contract.
- No audio, physics, additional characters, levels or other game modes are included.
- Next, run the [Projector Mode hardware checklist](projector-mode.md) when the laser returns, then repeat torso/hip/miss tests at several draw times and projector aspect ratios. Measure missed pulses, false positives, processing FPS and camera-to-result latency before adding compensation or detector complexity.

## Planned audio cues

Audio cues are future work. Prioritize a clear DRAW cue, an opponent gunshot synchronized with the muzzle flash, and distinct round-result feedback. Include mute/volume controls and browser audio activation from an explicit user action. Keep audio on the authoritative game clock so it cannot signal DRAW early or repeat across pause/resume or window reconnection.
