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
- [ ] **Rename Components**: Rename `ShotTimerPanel` to `DrillsPanel` (or create new and deprecate old). Update `ActionBar` to show "Drills".
- [ ] **Drill Selector**: Add a UI element (dropdown/tabs) in `DrillsPanel` to select the active drill.
- [ ] **Config State**: Refactor `shotTimerConfig` to include `drillType` ('draw', 'reload', etc.).
- [ ] **Session Data Structure**: Refactor `shotTimerSession` to be generic.
    -   Current Rep: `{ drawTime, hit }`
    -   New Rep: `{ type: 'reload', splits: [t1, t2], hits: [h1, h2], totalTime: t2 }`

## Phase 2: Drill Logic Engine
- [ ] **Refactor `handleTimerHit`**: Move logic from `+page.svelte` into a more modular structure or switch statement based on `drillType`.
- [ ] **Drill State Machine**:
    -   **Draw Drill**: Waiting -> Active -> Complete (1 shot).
    -   **Reload Drill**: Waiting -> Active (Shot 1) -> Reloading (Shot 2) -> Complete.

## Phase 3: Implement Magazine Reload Drill
- [ ] **Logic Implementation**:
    -   Detect 1st shot: Record time (Draw Time), keep timer running, update UI prompt to "RELOAD!".
    -   Detect 2nd shot: Record time, calculate split (Reload Time = T2 - T1), stop timer.
- [ ] **UI Feedback**: Add visual cues for the "Reload" phase.
- [ ] **Auto-Reset**: Ensure "Automatic Next Round" handles the multi-stage sequence correctly.

## Phase 4: Analytics & Display
- [ ] **Session Stats**: Update the stats view to render columns dynamically based on drill type.
    -   Draw Drill: "Draw Time", "Zone".
    -   Reload Drill: "Draw Time", "Reload Time", "Total", "Zones".
- [ ] **Export**: Ensure export functionality handles the new data structure.

## Technical Considerations
-   **Data Migration**: Since this is a local-first app (presumably), we might not need complex DB migrations, but we should ensure the new data structure doesn't break existing session views if we persist them.
-   **Component Reusability**: Reuse the existing `ShotTimerPanel` layout but make the inner content dynamic.
