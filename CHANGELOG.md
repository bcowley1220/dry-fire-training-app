# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
