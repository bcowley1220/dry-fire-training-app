# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Interface redesign

- Introduced a guided camera, targets, detection-check, and training workflow.
- Replaced floating drawers with a camera workspace and inline controls, stacked on phones and side by side on tablets and landscape devices.
- Added readable self-hosted type, large stopwatch feedback, immediate next-rep actions, and explicit automatic-session completion.
- Redesigned on-device history, session details, target naming, scoring controls, and shot review.
- Added keyboard camera navigation, inline camera errors, reduced-motion support, and interface regression tests.
- Kept laser thresholds, clustering, target scoring, and the history storage format unchanged.

### Added

- Frozen-frame target calibration with Retake, Undo, and Cancel controls.
- On-device training history for draw, reload, and call-out reps.
- Automated history tests covering persistence, retries, deletion, and session isolation.

### Fixed

- Refresh saved history after completed reps and report storage failures without interrupting training.
- Keep asynchronous writes attached to their original session; avoid duplicate rep counts and orphaned records.
- Reset calibration points when retaking a frame and map taps correctly through zoom and letterboxing.
- Open one control panel at a time and reconnect visual zone drawing.
- Cancel pending drill timers when ending a session, stopping the camera, or changing setup.
- Load saved settings before writing defaults; preserve training history when resetting preferences.

### Fixed

- **Delete Target Bug**: Fixed missing `removeTarget` and `renameTarget` functions in `+page.svelte` that caused UI to break when managing targets.
- **Menu Z-Index**: Increased `ZoneSettingsPanel` z-index to `z-[60]` to ensure it overlays properly above other UI elements.
- **Screen Sleep**: Added `WakeLockManager` utility to prevent device screen from dimming/locking while camera is active.

## [0.0.1] - 2026-01-26

### Added

- Initial proof of concept.
- Basic camera-based laser detection.
- Target setup (Preloaded, Custom, Freeform).
- Shot timer with basic drill modes (Draw, Reload, Callout).
- Visualization of shot sequence and grouping.
