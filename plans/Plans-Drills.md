# Plan: Drills Expansion

## Overview

Expand the current "Shot Timer" functionality into a comprehensive "Drills" module. The first new drill will be the "Magazine Reload Drill".

## Goals

1.  Rename "Timer" to "Drills" in the UI.
2.  Allow users to select between "Draw Drill" (current) and "Mag Reload Drill".
3.  Implement "Mag Reload Drill" logic (2 shots, split time calculation).
4.  Update data structures to support multi-shot drills.
5.  Update analytics to display drill-specific stats.

## Phase 1: UI & Architecture Refactoring

- [x] **Rename Components**: Rename `ShotTimerPanel` to `DrillsPanel` (or create new and deprecate old). Update `ActionBar` to show "Drills".
- [x] **Drill Selector**: Add a UI element (dropdown/tabs) in `DrillsPanel` to select the active drill.
- [x] **Config State**: Refactor `shotTimerConfig` to include `drillType` ('draw', 'reload', etc.).
- [x] **Session Data Structure**: Refactor `shotTimerSession` to be generic.
  - Current Rep: `{ drawTime, hit }`
  - New Rep: `{ type: 'reload', splits: [t1, t2], hits: [h1, h2], totalTime: t2 }`

## Phase 2: Drill Logic Engine

- [x] **Refactor `handleTimerHit`**: Move logic from `+page.svelte` into a more modular structure or switch statement based on `drillType`.
- [x] **Drill State Machine**:
  - **Draw Drill**: Waiting -> Active -> Complete (1 shot).
  - **Reload Drill**: Waiting -> Active (Shot 1) -> Reloading (Shot 2) -> Complete.

## Phase 3: Implement Magazine Reload Drill

- [x] **Logic Implementation**:
  - Detect 1st shot: Record time (Draw Time), keep timer running, update UI prompt to "RELOAD!".
  - Detect 2nd shot: Record time, calculate split (Reload Time = T2 - T1), stop timer.
- [x] **UI Feedback**: Add visual cues for the "Reload" phase.
- [x] **Auto-Reset**: Ensure "Automatic Next Round" handles the multi-stage sequence correctly.

## Phase 4: Analytics & Display

- [x] **Session Stats**: Update the stats view to render columns dynamically based on drill type.
  - Draw Drill: "Draw Time", "Zone".
  - Reload Drill: "Draw Time", "Reload Time", "Total", "Zones".
- [x] **Export**: Ensure export functionality handles the new data structure.

## Technical Considerations

- **Data Migration**: right now we're not even saving to session. we just want to hold the data in a $state object for now like we're already doing
- **Component Reusability**: Reuse the existing `ShotTimerPanel` layout but make the inner content dynamic.
