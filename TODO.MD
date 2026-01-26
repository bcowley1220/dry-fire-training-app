# Working

[x] split apart the main file into components
[x] Extract ActionBar component
[x] Extract CameraStage component
[x] Extract Header component
[x] Extract HitsList component
[x] Extract StatusPills component

## Features

[x] fix the custom target selection functionality
[x] implement the mag change drill, we'll probably need to create a new component that is similar but different than the draw functionality. there is a data difference between what we had set up in another branch and it caused a lot of problems. We can probably reformat the data type to match regardless of the drill, but the issue is what's going to happen when we have a dozen drills all with diff data types.
[x] if we doing "enable automatic next round", at the end of the training the "next round" button will still show. I believe it's a conditional issue with the button.
[x] change the name of the timer button to Drills
[x] we need to clean up the way the user interacts with the draw drill. It's easy enough to start, but doing another round of 10 or trying to get out of it isn't as obvious.

### Bugs

## Roadmap

### Phase 1: The "Rock Solid" Foundation (Reliability)

Before adding games, the app has to work 100% of the time without false positives. This phase fixes the quirks found in testing.

- [x] **Environmental Nulling (Background Subtraction):** Implement "Snapshot" calibration. By ignoring any red/green light that is static in the room, eliminate the "red shirt" or "bright window" problem immediately.
- [x] **Digital Zoom / Auto-Crop:** Since browser hardware zoom is flaky, implement Digital Zoom. Once the user draws their target polygon, have the app "zoom" its processing power into just that area.
  - _Benefit:_ This increases detection accuracy at distance and helps users set up their "range" more easily.

### Phase 2: The "Striker Solution" (Core Training)

Now that the app is reliable, solve the "I have to rack my slide" problem for striker-fired users.

- [x] **The "Malfunction" Toggle:** Add a toggle to existing Draw/Shot Timer drills.
  - _Logic:_ Randomly (e.g., 20% of the time) the app ignores the first hit and plays a "Click" sound. The timer keeps running until the second laser hit is detected after the user racks the slide.
  - _Benefit:_ This makes the app the only one on the market that explicitly trains "Tap-Rack-Bang" as part of a standard drill.

### Phase 3: Capability Expansion (Multi-Target)

This is the "bridge" feature. You can't do the cool games or advanced drills without this.

- [x] **Multi-Zone Detection:** Update the UI to allow "Add Target" so users can draw multiple polygons.
- [x] **The "Call-Out" Drill:** Once you have multiple zones, the app can call out "Target 1!" or "Blue!" and time how long it takes to hit that specific zone.
  - _Benefit:_ This moves the app from "target practice" to "tactical decision making."

### Phase 4: The "Product" Wrapper (MVP Polish)

Turning a "tool" into a "product" that users can figure out on their own.

- [x] **Onboarding Flow:** A guided tour (using something like `driver.js` or custom overlays) to teach the user: 1. Setup Camera, 2. Calibrate, 3. Set Background, 4. Start Drill.
- [x] **Local Persistence:** Save user preferences (Beep volume, drill settings) and Session History to `localStorage` so they don't vanish on refresh.
