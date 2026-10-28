# Projector Mode MVP

Projector Mode runs on one laptop with a webcam and a second display. It needs no accounts, backend, database, pairing, or new dependencies. Real camera/laser/projector hardware has **not** been validated in this development session.

## Run and calibrate

1. Run `npm install` if dependencies are missing, then `npm run dev`. Open the local URL in a desktop browser. A deployed copy needs HTTPS for camera access; localhost is also supported.
2. Connect the projector as an **extended** display. Open **Projector Mode** in the navigation. Navigation is disabled during an existing active practice drill.
3. Click **Open projector window**, move that window onto the projector, and click **Fullscreen** there. Allow popups if prompted. If the browser does not support popups (including some embedded browsers), use **Open display in a browser tab**, then drag that tab into a separate window. Both views must share the same browser profile and origin.
4. Click **Enable camera** and grant camera permission. The camera selector lists devices after permission; changing its selection restarts capture without a reload. Capture prefers 640 × 480 at 30 FPS, subject to camera capabilities. Diagnostics report actual sensor resolution and processing FPS.
5. With the camera stationary and the entire projected image visible, click **Show calibration pattern**. On the laptop preview, click the centers of crosshairs **1, 2, 3, 4**: top-left, top-right, bottom-right, bottom-left. Click the crosshairs, not the outer edges of the projector light. Undo corrects a point; Cancel abandons calibration. Arrow keys move the preview cursor and Enter selects it.
6. The blue boundary indicates the calibrated region. Invalid, crossed, reversed, or degenerate selections are rejected. Choose target size and position, then **Start / resume**.
7. Use **Pause** before changing target geometry or detection tuning. **Reset results** clears statistics and returns to idle. **Reset target & results** also restores target defaults.
8. Recalibrate after physically moving the camera/projector or changing projector keystone, zoom, or output configuration. Software invalidates calibration on camera identity, sensor dimensions, viewport dimensions, or device-pixel-ratio changes. Calibration is stored locally for matching geometry; storage failure only disables convenience persistence. A detected geometry change or display disconnect discards the saved calibration, so returning to the old dimensions cannot silently restore an invalidated setup. Synthetic-camera testing does not replace or remove saved hardware calibration.

The projection's usable area is inset 5% horizontally, starts 16% from the top, and ends 6% from the bottom. The HUD and footer occupy the remaining margins. Projected graphics are monochrome and never draw laser hit markers. Normalized projector coordinates cover the whole viewport; crosshairs mark the usable area's corners.

## Simulation without hardware

1. Open the display using either control above.
2. Expand **Developer simulation** and click **Use synthetic camera (no hardware)**.
3. Show the calibration pattern and select a clockwise quadrilateral in the synthetic preview. This stands in for the camera's view of the four projected crosshairs.
4. Click inside that region to see a normalized location and score. A center point should score 10; points inside the projection but outside the target score 0; points outside the calibrated region are ignored.
5. Simulation disables real laser detection. By default, clicks only update the labeled simulation diagnostic. To update session/HUD statistics, deliberately check **Intentionally count simulated shots in session statistics** and start the session. Both HUDs retain a simulated-shot count.

## Implementation and files

- `src/lib/components/Header.svelte`: Projector Mode navigation, including wrapping on narrow screens.
- `src/routes/+page.svelte`: mounts the controller only while selected; stops practice camera capture before entering other modes. Existing practice, timer, target zones, and IndexedDB history remain in place.
- `src/lib/components/ProjectorController.svelte`: authoritative local session, camera permission/selection/lifecycle, processing loop, calibration clicks and persistence, diagnostics, simulation, and display-window lifecycle.
- `src/routes/projector/display/+page.svelte`: display-only SVG target, calibration crosshairs, HUD, fullscreen, viewport/readiness reporting, and disconnected state.
- `src/lib/projector/geometry.js`: convex-quad validation, pivoted 8-equation homography solver, normalized mapping, contain-scaled preview conversion, shared circular target geometry, and ring hit testing.
- `src/lib/projector/session.js`: session scoring, accuracy, numeric tuning validation, and pulse confirmation/cooldown filter.
- `src/lib/projector/protocol.js`: versioned message envelopes, per-controller channel names, payload validation, calibration geometry keys, and a testable display heartbeat tracker.
- `src/lib/projector/lifecycle.js`: camera request/stream ownership and defensive local calibration restoration/invalidation. Late camera permission responses are stopped after camera switching or exit; stale setup continuations cannot restart processing.
- `src/lib/utils/detection.js`: optional projector parameters extend the existing detector. Default practice calls retain red/green thresholds, radius-limited clustering, and the original hit object shape. Projector calls use configurable selected red/green channel brightness/dominance and full connected blob sizes, reject oversized blobs, and return pixel counts. No separate color-detection engine was introduced.
- `tests/projector.test.js`: perspective transforms/round trips, invalid geometry, letterboxing, portrait/landscape target geometry and ring scores, sensor-space scoring/outside rejection, session scoring, temporal filtering, detector compatibility/settings, and message validation/isolation.
- `tests/projectorLifecycle.test.js`: camera switch/exit races using mocked streams, saved calibration corruption and geometry changes, heartbeat expiry/reconnection, malformed messages, and native BroadcastChannel readiness/state delivery.
- `README.md` and this guide: entry point, operation, architecture, limitations, and hardware checklist.

Camera capture and practice session management originally lived inside the large root page, so they could not be reused as independent services without restructuring working workflows. The controller follows the existing MediaDevices/video/canvas pattern and reuses the shared detector. Projector statistics are an isolated in-memory session, not new drill records in training history.

The controller alone captures and scores. The projector renders state snapshots and never processes shots. A random per-controller BroadcastChannel isolates sessions; messages carry a protocol version and controller ID. The display sends readiness/viewport heartbeats every second, and the controller responds with authoritative state. Closure or ten seconds without readiness pauses training and invalidates calibration. The display stops drawing the target when disconnected. Reactive Svelte objects are converted to plain snapshots before messaging. A tab fallback handles embedded browsers that do not actually open popup windows.

The processing loop is capped near 30 FPS and draws preview overlays directly on the sensor-sized canvas. Diagnostics update twice per second; session UI changes only on shots/actions. DOM clicks convert CSS pixels to sensor pixels without multiplying by device pixel ratio. Sensor points are normalized before the homography. Renderer and scorer share the same normalized center and aspect-corrected radii, clamped to keep the full circle in the usable area. Ten equal-radius rings score 10 through 1. All accepted pulses within the projection count as shots, including target misses; outside-region candidates are filtered before temporal confirmation. The pulse must disappear before another shot can count. A component teardown cancels animation frames, stops camera tracks, closes owned popup/channel resources, and removes device listeners and timers. Tab-fallback displays may remain open but go disconnected.

## Validation

Run:

```bash
npm test
npm run lint
npm run build
```

The repository has no separate typecheck script; this feature uses its existing JavaScript/Svelte setup. Before implementation, tests and lint passed. After implementation, `npm test`, `npm run lint`, `npm run build`, and `git diff --check` all passed. The build's adapter-auto deployment-target notice is not an application compilation error.

Browser checks performed with the local app: controller navigation, synthetic preview and FPS, real BroadcastChannel readiness, four-point calibration pattern/overlay, center scoring, simulation exclusion and explicit inclusion, synchronized start/pause/HUD, outside-region rejection, and fullscreen entry/exit. The embedded browser could not open the popup; the display-tab fallback was exercised instead. Pure tests cover aspect ratios, viewport geometry keys, and transform accuracy; physical projection alignment and end-to-end hardware latency remain unverified.

## Manual hardware checklist

- [ ] Use a desktop browser over localhost/HTTPS. Confirm popup behavior and the tab fallback.
- [ ] Move the display to an HDMI projector, enter fullscreen, and confirm a circular grayscale target with no red graphics.
- [ ] Grant camera permission; verify device labels, resolution, live preview, and measured processing FPS.
- [ ] Switch cameras repeatedly and unplug one. Confirm errors are readable, old tracks stop, and calibration is required for changed geometry.
- [ ] Calibrate from an oblique camera angle. Check all four crosshair centers, center, edges, and a few interior points with simulation first.
- [ ] Reject duplicate/crossed/nearly collinear corner selections; exercise Undo, Cancel, and Recalibrate.
- [ ] Reload with the same geometry and confirm local calibration restoration. Resize/fullscreen/change resolution or DPR and confirm changed geometry invalidates calibration and blocks start.
- [ ] With simulation off, fire isolated red training-laser pulses at the center, rings, off-target projection area, and outside the calibrated region. Compare raw/normalized diagnostics, physical positions, score, shot count, hit count, and accuracy.
- [ ] Hold a laser spot steady: it should not produce repeated shots. Test separate pulses across the cooldown and the intended cartridge's short pulse duration.
- [ ] Adjust red brightness/dominance, blob bounds, consecutive frames, and cooldown for the actual webcam and ambient light. Confirm grayscale graphics and static red objects do not cause false shots under those conditions.
- [ ] Pause/resume/reset while observing both windows. Close the display and confirm training pauses immediately or within the ten-second heartbeat timeout.
- [ ] Leave Projector Mode and verify the webcam activity light turns off. Return to Practice and run an existing drill/history workflow.
- [ ] Run a sustained session with both displays visible; record processing FPS, false positives, missed pulses, and measured latency.

## Limitations and next steps

- The projector detector supports a selected red or green training laser. Practice mode continues to support red and green. Bloom, overexposure, weak red dominance, projector spill, and ambient red objects can still cause false/missed detections. There is no confidence model or projector-specific background subtraction.
- A single scan-first in-region candidate is temporally tracked per frame. Simultaneous lasers and rapidly separated pulses inside cooldown are not supported. Consecutive-frame settings above one may reject short cartridge pulses.
- A homography assumes a planar surface. It cannot correct lens distortion, curved walls, or device movement. Manual calibration accuracy limits scoring accuracy. Physical projection size is not needed.
- Browser background throttling or a sleeping laptop can reduce capture/heartbeat rates. Keep both windows visible; diagnostics measure processing throughput, not camera-to-wall latency.
- Only calibration persists; projector session results are lost when leaving the mode or reloading. Detection settings and target configuration reset with the controller.
- Use one projector display per controller. Same-origin browser communication requires the same profile/storage partition. Unsupported BroadcastChannel browsers show an error rather than introducing networking.
- Next: run the hardware checklist and collect frame/latency/false-positive measurements. Improve exposure guidance and detector robustness from those observations, then consider extracting shared camera lifecycle infrastructure if a second consumer needs more functionality. Advanced games remain out of scope.

## Hardware validation status

Real training-laser testing is deferred until the laser is available. Software development and automated simulation checks can proceed independently. The hardware checklist above remains pending; synthetic pixel tests and mocked media streams do not validate a real webcam, projector, or laser cartridge.

## High Noon

Projector Mode also supports the [High Noon quick-draw game](high-noon.md), using the same calibration and shot pipeline with a browser-only Phaser display. Its laptop preview can simulate shots without camera hardware.

## Duck Hunt Arcade

Projector Mode also supports [Duck Hunt Arcade](duck-hunt.md): original grayscale marsh artwork, Single Duck and Two-Duck Choice, one shot per encounter, explicit READY pacing, and timestamped historical body-hitbox scoring. It reuses the same camera, calibration, shot channel and Phaser host. Laptop simulation works without the training laser.
