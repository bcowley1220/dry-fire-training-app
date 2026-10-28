# Codex Task: Build Duck Hunt Arcade for Dry Fire Forge

## Project context

Dry Fire Forge is an existing browser-based dry-fire training application with Projector Mode and Phaser 3 integration.

We are building a collection of interactive projector-based training and arcade games. High Noon is the first game; Duck Hunt Arcade will be the second.

The user projects the game onto a wall using a laptop and inexpensive projector. A webcam observes the projection and detects laser training cartridge strikes. The existing calibration system maps those strikes to normalized projector coordinates.

**The goal is to build a polished, animated, grayscale retro duck-hunting arcade game that works with single-shot laser training devices.**

The game should be entertaining, visually appealing, and designed around deliberate one-shot encounters rather than rapid-fire gameplay.

## Critical instructions

Before implementation:

1. Inspect the existing repository.
2. Review the Projector Mode architecture.
3. Review the existing Phaser 3 integration and High Noon implementation.
4. Identify the shared game lifecycle, hit-event pipeline, calibration, coordinate transformations, and cross-window synchronization.
5. Reuse the existing infrastructure.
6. Follow the repository's existing architectural and styling conventions.
7. Preserve all existing training modes and games.

Do not create another game engine, camera detector, or projector synchronization system.

Do not add database migrations, backend services, or unnecessary dependencies.

Implement the game, not merely an implementation plan.

---

# 1. Mandatory grayscale-only rendering

**THIS IS A HARD TECHNICAL REQUIREMENT.**

The projector must support reliable detection of both red and green training lasers.

All projected game graphics must be strictly neutral grayscale.

Allowed:

- Black
- White
- Neutral dark gray
- Neutral medium gray
- Neutral light gray

Forbidden:

- Red
- Green
- Blue
- Yellow
- Brown
- Sepia
- Colored gradients
- Colored particles
- Colored UI highlights
- Colored hit markers
- Colored animations

This applies to every projected element:

- Background
- Ducks
- Dog
- HUD
- Text
- Animations
- Particles
- Hit effects
- Menus
- Transitions

Use a deliberately limited grayscale palette.

Prefer darker backgrounds and moderate brightness to reduce interference with laser detection.

Avoid large white flashes, flashing backgrounds, or rapidly changing bright regions.

Do not project simulated red or green laser dots.

Developer-only diagnostic overlays may use color on the laptop controller, but they must never appear on the projector.

Grayscale alone does not guarantee laser-detection reliability. Preserve the existing detector's ability to distinguish actual laser strikes from projected content.

If any asset contains non-grayscale pixels, replace or convert it before use.

---

# 2. Game identity and art direction

Working title: **Duck Hunt Arcade**.

Use original artwork and animations inspired by classic 8-bit and 16-bit hunting arcade games.

Do not copy Nintendo's original Duck Hunt sprites, dog, sound effects, level layouts, or other protected artwork.

The game should have its own recognizable visual identity.

### Environment

Create a detailed grayscale marshland environment featuring:

- Open sky
- Distant hills
- Trees
- Tall grass
- Reeds
- Water or marshland
- Clouds
- Optional distant cabin or hunting blind

Use layered pixel art with subtle environmental animation.

The game should feel like an actual retro arcade title, not a basic rectangle moving across a background.

### Duck artwork

Create an original animated duck sprite with:

- Flapping wings
- Left-facing and right-facing movement
- Different wing positions
- Hit reaction
- Falling animation
- Escape animation

Ducks must be separate Phaser game objects with independent animation and hitbox geometry.

### Dog character

Create an original hunting dog character that appears between encounters.

Possible animations:

- Waiting in the grass
- Retrieving a successful hit
- Returning to the player
- Sitting while the player resets
- Reacting humorously to a missed duck

Keep the dog friendly and expressive.

The dog is primarily a pacing and personality element, not a gameplay target.

Do not count hits on the dog as valid hits.

If artwork generation is a bottleneck, prioritize the animated duck and working gameplay first, then implement a simpler dog animation.

---

# 3. Phaser integration

Use the existing Phaser 3 integration.

Implement Duck Hunt as a separate game module or scene that plugs into the existing reusable game architecture.

Reuse the existing lifecycle interface, including equivalents of:

- initialize
- start
- pause
- resume
- reset
- handleShot
- updateConfiguration
- destroy

Use the established logical resolution and scaling strategy.

If the existing implementation uses 1280 × 720, continue using it.

Do not create another Phaser instance unnecessarily.

Ensure the game cleans up timers, sprites, event listeners, and other resources when exited.

---

# 4. Primary gameplay model

**Default gameplay must support striker-fired training pistols that require manual trigger reset after every shot.**

Do not assume the user can fire repeatedly.

The default game mode is one shot per encounter.

An encounter may contain one or two ducks, but the player receives only one scoring shot.

After a shot or timeout, the encounter ends.

The game must wait for explicit player confirmation before starting the next encounter.

### Encounter lifecycle

1. Game waits for READY.
2. Player confirms readiness.
3. A short randomized launch delay occurs.
4. One or two ducks enter the scene.
5. Ducks follow their flight paths.
6. Player fires one shot or allows the ducks to escape.
7. The shot is evaluated.
8. Hit or miss animation plays.
9. Dog performs an appropriate reaction if available.
10. Round result appears.
11. Game enters RESET / READY state.
12. Player manually resets the training device and confirms readiness.
13. Next encounter begins.

Never automatically begin another live encounter while the player may still be resetting the trigger.

Do not require the game to detect physical trigger reset.

---

# 5. Initial game modes

Implement two game modes.

## Mode A: Single Duck

One duck appears per encounter.

The duck enters from a randomized side of the screen and flies across the play area.

Randomize:

- Spawn side
- Spawn height
- Flight speed within configured difficulty
- Flight direction
- Flight path variation
- Wing animation timing

The player gets one shot.

A successful hit triggers a falling animation.

A miss ends the encounter.

If the duck exits the play area before a shot, it escapes.

Default session length: 10 encounters.

## Mode B: Two-Duck Choice

Two ducks appear during the same encounter.

The player still gets only one shot.

The ducks may differ in:

- Size
- Speed
- Flight direction
- Flight height
- Point value

The player chooses which duck to attempt to hit.

A shot at either duck ends the encounter.

Only one duck can be scored per encounter.

The other duck may continue briefly as part of the resolution animation, but no additional shots are accepted.

Do not require the player to shoot both ducks.

Avoid spawning ducks with overlapping hitboxes unless explicitly intended.

---

# 6. Difficulty configuration

Provide three difficulty presets.

### Easy

- Larger ducks
- Slower flight
- Mostly straightforward horizontal paths
- Longer time before escape

### Normal

- Medium-sized ducks
- Moderate flight speed
- Mixed horizontal and diagonal paths
- Some gentle path changes

### Hard

- Smaller ducks
- Faster flight
- More varied trajectories
- Shorter engagement windows

Allow users to configure the following where practical:

- Difficulty preset
- Session length
- Single Duck or Two-Duck Choice
- Sound enabled/disabled

Suggested session lengths:

- 5 encounters
- 10 encounters
- 20 encounters

Use named difficulty configuration values rather than scattering magic numbers throughout the game.

Ensure all flight speeds and sizes remain reasonable for webcam-based hit detection.

---

# 7. Duck movement and flight paths

Use Phaser's animation and update systems.

The ducks should move smoothly across the screen.

Implement a reusable flight-path system that can eventually support other moving-target games, including sporting clays.

Initial flight patterns:

- Horizontal crossing
- Diagonal ascending
- Diagonal descending
- Gentle curved flight
- Mild randomized directional variation

Do not introduce complex physics simulation.

The duck's position should be deterministic from its flight configuration and elapsed time wherever practical.

This is important for testing and latency compensation.

Avoid movement logic that depends entirely on frame count.

Use delta time or elapsed-time-based positioning.

Keep movement consistent across different frame rates.

Do not let ducks teleport or visibly jump when flight paths change.

---

# 8. Duck hitboxes

Each duck must have an accurate hitbox.

Requirements:

- Hitbox follows the duck's position.
- Hitbox scales with duck size.
- Hitbox respects sprite flipping.
- Hitbox corresponds reasonably to the duck's body.
- Empty space around the sprite must not count as a hit.
- Wings may be included or excluded depending on the chosen hitbox model, but the behavior must be consistent.

For the MVP, use a body-centered polygon or ellipse rather than a large rectangular sprite boundary.

Keep hitbox geometry separate from rendering.

Provide laptop-only debug visualization of hitboxes.

Do not display hitbox outlines on the projector during normal gameplay.

---

# 9. Moving-target detection and latency

This is one of the most important engineering requirements.

The camera may operate at 30 FPS or 60 FPS, and laser detection can introduce processing and communication delays.

A moving duck may change position between the physical laser event and the moment the game receives the detected shot.

Do not blindly score every shot against the duck's latest rendered position without considering latency.

### Implement a lightweight position-history system

Maintain a bounded history of duck positions and hitbox geometry with timestamps.

When a shot arrives:

1. Determine the best available timestamp for the detected laser event.
2. Map that timestamp into the game's authoritative clock domain.
3. Look up or interpolate the duck's position at the corresponding time.
4. Evaluate the shot against the historical hitbox.
5. Record the result.

If the existing shot-event pipeline does not provide trustworthy capture timestamps, use the best available timing source and document the limitation.

Do not invent precise timing data.

Do not introduce arbitrary large hitbox expansion to hide latency problems.

Keep the history bounded and memory-efficient.

Design this functionality so future moving-target games can reuse it.

### Diagnostic requirements

Expose:

- Shot timestamp
- Game receipt timestamp
- Estimated processing delay, if measurable
- Duck position used for scoring
- Hitbox used for scoring
- Whether historical or current-position scoring was applied

---

# 10. Scoring

Track per encounter:

- Mode
- Difficulty
- Duck count
- Shot fired or not fired
- Hit or miss
- Duck escaped
- Target hit
- Target speed
- Target size
- Time from launch to shot
- Points awarded

Suggested base scoring:

| Result          | Points |
| --------------- | -----: |
| Easy duck hit   |    100 |
| Normal duck hit |    150 |
| Hard duck hit   |    200 |
| Miss            |      0 |
| Duck escaped    |      0 |

For Two-Duck Choice, allow the faster or smaller duck to be worth more points.

Keep scoring rules centralized and testable.

Display cumulative score, hit rate, and successful encounters.

Do not treat faster shots as inherently more accurate.

If speed bonuses are added, keep them modest and separate from hit accuracy.

---

# 11. Animations and feedback

## Successful hit

- Duck visibly reacts.
- Duck transitions into a falling animation.
- Duck drops toward the ground.
- Dog may retrieve it.
- Score appears.

## Miss

- Duck continues briefly or escapes.
- Miss indicator appears.
- Dog may react humorously.
- Encounter ends.

## Escape

- Duck flies offscreen.
- ESCAPED appears.
- No points awarded.

## Reset phase

- Game displays RESET / READY.
- Dog waits or performs a short idle animation.
- Game remains paused until the player confirms readiness.

Do not use gore or blood.

Keep all effects grayscale.

---

# 12. Projector HUD

Create a cohesive grayscale retro arcade HUD.

Display:

### Top

- Game title
- Current encounter
- Game mode
- Difficulty
- Total score

### Main play area

- Marsh environment
- Animated ducks
- Dog and foreground scenery
- READY / LAUNCH / HIT / MISS / ESCAPED messages

### Bottom

- Hits
- Misses
- Accuracy
- Last encounter score
- READY status

Keep the HUD outside the primary flight area where possible.

Do not obstruct ducks with interface elements.

Maintain correct scaling on 16:9 and 4:3 projector displays.

Avoid rendering colored hit indicators.

---

# 13. Laptop controller

Add Duck Hunt Arcade to the existing Projector Mode game selection.

The controller should support:

- Select game
- Select Single Duck or Two-Duck Choice
- Select difficulty
- Select session length
- Start session
- Confirm READY
- Pause/resume
- Restart session
- Exit game
- Enable/disable sound
- Enable simulated-hit testing
- View diagnostics

The user should not need to interact with the projector display using a mouse.

All configuration controls should be available from the laptop controller.

---

# 14. Shot processing

Reuse the existing detection and calibration pipeline.

Expected flow:

Webcam detects laser → camera-to-projector calibration → normalized projector coordinates → shared game shot handler → historical duck hitbox evaluation → encounter result.

Do not create another laser detector.

Do not bypass the shared shot-event pipeline.

Ensure real and simulated shots use the same scoring logic.

Game-level logic must prevent duplicate detections from scoring multiple shots.

A shot during the reset phase must not begin a new encounter.

A shot outside the duck hitbox is a miss and ends the encounter.

---

# 15. Simulated-hit testing

The physical laser may not be available during development.

The game must be fully testable without it.

Reuse existing simulated-shot capabilities.

Support:

- Clicking a duck in a laptop-side game preview.
- Clicking empty space to simulate a miss.
- Camera-preview clicks that pass through existing calibration.
- Testing at different duck speeds.
- Testing different screen aspect ratios.

Simulated shots must use the same game-level scoring pipeline as real shots.

Clearly identify simulated shots in diagnostics.

Do not persist simulated hits as real training results.

---

# 16. Repeat-shot compatibility

Design the architecture to support repeat-shot laser devices in the future.

For this implementation:

**Single-shot mode is mandatory and must be the default.**

A repeat-shot mode may be represented in configuration, but do not implement complex multi-shot gameplay yet.

Avoid building the state machine around an assumption that multiple shots will always be available.

Do not infer repeat-shot capability solely from whether the user's firearm is striker-fired or hammer-fired.

---

# 17. Sound effects

If practical, add original or appropriately licensed sound effects for:

- Duck wing flaps
- Duck launch
- Successful hit
- Miss
- Dog reaction
- Session completion

Sound must be optional.

Respect browser autoplay restrictions.

Do not delay core gameplay implementation for sound effects.

---

# 18. Automated testing

Add tests for:

- Game state transitions
- Single-shot encounter behavior
- Two-Duck Choice behavior
- Duck spawn bounds
- Flight path calculations
- Hitbox scaling
- Hitbox transformations
- Historical position interpolation
- Shot timestamp handling
- Successful hits
- Misses
- Escapes
- Duplicate detection rejection
- Reset/READY behavior
- Session completion
- Score calculation
- Pause/resume
- Coordinate mapping
- Letterboxed display handling

Use deterministic random seeds or injectable randomness where useful.

Run the existing lint, typecheck, build, and test commands.

Fix regressions introduced by this work.

Document unrelated pre-existing failures.

---

# 19. Acceptance criteria

The feature is complete when:

1. Duck Hunt Arcade is selectable in Projector Mode.
2. It runs through the existing Phaser integration.
3. A grayscale marsh environment renders correctly.
4. Ducks are independently animated.
5. Ducks follow randomized flight paths.
6. Single Duck mode works.
7. Two-Duck Choice mode works.
8. Both modes support one shot per encounter.
9. Successful hits trigger a falling animation.
10. Misses and escapes resolve correctly.
11. The game waits for manual READY between encounters.
12. Different difficulty levels affect gameplay.
13. Duck hitboxes remain aligned during movement.
14. Shot processing accounts for moving-target timing as accurately as the available data permits.
15. Simulated shots work without physical laser hardware.
16. Existing real laser detection uses the same game shot pipeline.
17. The projected HUD displays accurate statistics.
18. All projected graphics are strictly grayscale.
19. Existing High Noon and other training modes remain functional.
20. Phaser resources are cleaned up correctly.
21. Automated tests and build checks pass, or remaining limitations are documented.

---

# 20. Out of scope

Do not implement:

- Realistic shotgun ballistics
- Sporting clays physics
- Multiplayer
- Online leaderboards
- User-account changes
- Subscription features
- Database migrations
- New backend services
- Smartphone pairing
- Complex weapon simulation
- Large collections of duck species
- Multiple environments
- Extensive unlock systems

Focus on a polished, functional first game.

---

# 21. Final deliverables

After implementation, provide:

1. Summary of files changed.
2. Overview of Duck Hunt's architecture.
3. Explanation of flight-path implementation.
4. Explanation of moving-target hit detection and latency handling.
5. Explanation of single-shot encounter behavior.
6. Instructions for launching and testing the game.
7. Instructions for simulated-hit testing.
8. New dependencies, if any.
9. Automated test results.
10. Known limitations.
11. Recommended improvements.

## Implementation order

**Phase 1:** Inspect and reuse existing Phaser and Projector Mode infrastructure.

**Phase 2:** Implement game states, single-shot encounters, and scoring.

**Phase 3:** Implement the grayscale marsh environment and animated duck.

**Phase 4:** Implement flight paths, hitboxes, and position-history scoring.

**Phase 5:** Implement Two-Duck Choice, difficulty settings, and the controller.

**Phase 6:** Add dog animations, audio, and visual polish.

**Phase 7:** Test thoroughly and fix regressions.

Prioritize a working, responsive game over excessive architectural complexity.

However, the result should feel like a genuine retro arcade game, not a generic moving-target demonstration.

**Begin by inspecting the existing repository, then implement the game. Do not stop after generating a plan.**
