# Duck Hunt Arcade

An original grayscale marsh arcade game on branch `codex/duck-hunt-arcade`. No new dependencies, backend, database changes, or game-result persistence. Phaser remains pinned to the existing 3.90.0 dependency.

## Launch and simulate

1. Run `npm run dev` (or `npm run build` then `npm run preview`). Open the app and choose **Projector Mode**.
2. In the right-hand **1. Projector display** menu choose **Duck Hunt · Marsh arcade**. You can select the game before opening the display. On narrow screens the display controls appear first.
3. Click **Open projector window**, or use the browser-tab fallback. Move the display to the projector and use its fullscreen button. Calibration and fullscreen remain the existing Projector Mode workflow.
4. Choose Single Duck or Two-Duck Choice, difficulty, and 5/10/20 encounters. Default: Single Duck, Easy, 10 encounters, sound off.
5. **Start Duck Hunt**, then **I’m ready**. A randomized 650–1650 ms delay precedes flight. One shot ends the encounter, including a miss. Reset the training device and manually confirm **Ready for next encounter**. There is no automatic next launch.
6. Pause/resume freezes the authoritative encounter and visual animation. Restart clears the in-memory session; settings apply on start/restart or the first READY. Exit returns to the bullseye; choosing another activity also destroys the old game.

Without hardware, enable **simulated shots in laptop preview**. Click a duck’s body for a hit or empty sky for a miss. Enter targets the first visible body. Enable **body hitboxes and scoring geometry** to see current ellipses and dashed scoring ellipses on the laptop only. Preview clicks use the timestamp of the snapshot actually displayed, through the same normalized shot event, window channel, world mapping, and game handler as laser events.

To test camera mapping without hardware, expand **Developer simulation**, select **Use synthetic camera**, show the calibration pattern, and select four corners clockwise in the camera preview. The chosen quadrilateral represents the projected calibration rectangle. Resume the game after calibration. Camera-preview clicks then pass through the existing homography into the active game. Real camera use follows the same path after enabling a camera and calibrating its view. Changing camera/display geometry invalidates calibration and pauses the game.

Optional audio is synthesized originally on the laptop’s default audio output: launch, hit/miss/escape resolution, and completion tones. The checkbox unlocks Web Audio through a user gesture; disabling it or leaving the game closes the context. Audio does not drive timing or scoring. Detailed wing and dog sound effects are not included.

## Implementation and lifecycle

- `src/lib/games/duck-hunt/model.js`: pure state machine, configuration, encounter records, scoring, pause/resume, resolution animation state. Injected clock and randomness support deterministic tests.
- `src/lib/games/duck-hunt/flight.js`: named difficulty presets, spawn configuration, deterministic continuous flight paths, body ellipses, containment. Future moving-target games can reuse the path functions with flight configuration objects.
- `src/lib/games/history.js`: reusable bounded geometry history and timestamp conversion independent of rendering.
- `src/lib/games/duck-hunt/runtime.js`: lazy browser-only Phaser scene using the existing lifecycle interface, one independent Phaser sprite per duck, duplicate command/event guards, 10 Hz reports, and actual canvas CSS geometry.
- `src/lib/games/duck-hunt/art.js`: original duck frames, dog poses, subtle water/reed movement, projected HUD, and shared laptop preview painting. The dog wags while waiting, moves with a retrieved silhouette on hits, and tilts on misses. It is never a scoring target.
- `src/lib/components/DuckHuntController.svelte`: setup, session controls, mirrored 2D preview, simulation, diagnostics, result table, and optional audio. This preview does not create another Phaser instance.
- Existing `ProjectorGameHost`, display route, game report validation and controller route now accept `duck-hunt` as well as High Noon. A keyed host destroys the previous runtime on switching. Existing camera selection, laser detection, calibration, temporal filtering, BroadcastChannel, 1280×720 FIT strategy, and letterbox conversion are retained.
- The shared pixel alphabet gains a percent glyph so the projected hit rate is legible.

States: `IDLE → WAITING_FOR_READY → LAUNCH_DELAY → FLYING → RESOLVING → ROUND_RESULTS`. Only explicit READY starts another encounter. The final resolution leads to `SESSION_COMPLETE`. Pause is an orthogonal flag. Resolution lasts 1.5 seconds. Runtime event IDs are bounded to 1,000 and command IDs to 128; the model independently accepts only one scoring shot per encounter.

## Flight, geometry, and scoring

Each flight records side, direction, speed, start height, scale, path, phase and flap period. Position is a function of elapsed milliseconds, independent of update count. Paths include horizontal, ascending, descending, gentle sinusoidal curves and mild smooth variation. A smooth lane bound prevents jumps. Two-duck mode separates upper/lower lanes so body ellipses do not overlap.

The original duck sheet has four flap frames, one hit frame and two falling frames. Left flight flips the sprite and body offset. Body ellipse: center at local `(31,25)` on a `64×40` frame, radii `(18,10)`, transformed by position/scale/facing. Wings and surrounding transparent pixels consistently do not score. After a hit the selected bird falls; the other bird departs and cannot score. Miss resolution sends both birds away.

Easy hits earn 100 points, Normal 150, Hard 200. The second duck in choice mode is smaller, faster, and worth 50 more. A shot scores at most one duck; misses/escapes earn zero. Hit rate means successful encounters divided by completed encounters, including escapes. Time to shot is informational and adds no bonus. Records include mode, difficulty, duck count, shot/no shot, outcome, source, target, speed, scale, time, points and scoring geometry.

## Moving-target timing

The projector owns the authoritative monotonic clock. A shot carries an epoch-style `detectedAt` timestamp; subtracting the projector’s `performance.timeOrigin` maps it to that clock. This works across local windows without assuming their `performance.now()` origins match.

For physical camera events the controller stamps **frame-observed time immediately before reading the video frame**. This is the best available pipeline timestamp; it is **not sensor exposure time**. Confirmation settings can introduce additional frames of delay. No fixed capture/display latency is invented or subtracted.

The model keeps up to 150 position samples and approximately two seconds of history (one boundary sample can be retained for interpolation). It interpolates ellipses around a valid shot time. Gaps above 120 ms, such as browser frame throttling or initial resumed frames, use the deterministic path at that timestamp and explicitly report `path-reconstruction`. Missing or implausibly future timestamps use `receipt-fallback`; ordinary valid timestamps report `timestamp-history`. Timestamps up to 25 ms into the future are clamped to receipt. Events older than one second are rejected without consuming the encounter shot. No hitbox expansion is used.

After all ducks leave, a one-second **CHECKING SHOT** settlement window accepts only delayed shots whose timestamps were during flight. Shots timestamped after flight are ignored. This prevents a recently observed hit from being lost merely because delivery came just after the exit boundary. Without a shot, escape then resolves normally. Events predating launch or the most recent resume are rejected. Resume shifts the timeline and clears history rather than interpolating across a pause.

Diagnostics expose event timestamp/kind/source, receipt monotonic and epoch time, estimated observation-to-receipt delay, world/projector coordinates, accepted status, scoring method/time/ellipse, current ellipses, sample count, and CSS canvas geometry. The measured delay excludes unknown sensor/projector buffering. Preview simulation uses the displayed report’s timestamp and remains distinctly labeled.

## Art and grayscale

`static/duck-hunt/marsh.png` is an original background generated with OpenAI image generation for this project: a dark 16:9 pixel-art marsh, open sky, hills, treeline, water, clouds, reeds and a blind; no characters, text or Nintendo material. The source is preserved unchanged. Runtime and laptop loaders force equal R/G/B values before using it, through the existing `grayscaleCanvas` helper. Duck/dog/environment/HUD painters use only neutral grays; canvas smoothing is disabled, and the existing host applies grayscale CSS as a final guard. No projected red/green simulation dots, hitbox overlays or large white flashes are introduced.

The original source prompt and provenance are recorded in [duck-hunt-assets.md](duck-hunt-assets.md). Duck and dog frames are original code-drawn assets with transparent surroundings, not copied sprites.

## Validation and limits

`tests/duckHunt.test.js` adds 19 behavioral tests: READY/state transitions, single shot and choice scoring, misses/dog exclusion, five-round completion, escapes/settlement, historical hits, sparse-history reconstruction, late exit hits, stale/future timestamps, paused flight/delay/resolution, reset/destroy, bounded/interpolated history, seeded path/side/lane coverage, frame-rate independence, ellipse flips/scales/wings, letterboxed coordinate roundtrips, and report/config validation. Existing High Noon, Projector Mode, lifecycle, training history and UI tests remain part of `npm test`.

Commands: `npm test`, `node tests/duckHunt.test.js`, `npm run lint`, `npm run build`. The repository has no separate typecheck script. See [progress and verification](duck-hunt-progress.md) for current results and browser checks.

Physical red/green laser and projector/camera validation is deferred until the missing training laser is available. Grayscale does not guarantee detector reliability: actual camera exposure, frame rate, focus, color dominance and projector buffering still matter. Hard targets may require tuning after hardware trials. Times are estimates, not instrument-grade reaction measurements. Laptop preview updates at 10 Hz; the projector animates at the Phaser update rate. The dog is intentionally a simple original animation; richer retrieval choreography, more detailed duck frames, measured camera capture metadata, additional original audio, and hardware-informed difficulty tuning are sensible follow-ups.
