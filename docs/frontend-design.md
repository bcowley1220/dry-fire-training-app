# Dry-Fire Trainer: interface direction

## Audit

The previous screen put target calibration, settings, drill execution, and results into an expanding bottom bar and separate desktop drawers. This hid important actions, reduced camera visibility, and required users to work close to a device during training. Setup terminology assumed knowledge of the implementation. Empty states did not explain the next action. The timer and repeat action were buried in configuration UI.

## Direction

A readable practice instrument for a phone or tablet on a stand. The camera is the working surface; the large timing display is the distinctive visual element. No military styling, decorative gradients, animated status lights, or repeated card grid.

- Porcelain #F1F4F8: page background.
- White #FFFFFF: working surfaces.
- Ink #18324B: text and navigation.
- Cobalt #315DE3: primary actions and active training.
- Slate #5B6D80: secondary information.
- Amber #AC5B0C: waiting and attention.
- Atkinson Hyperlegible Next: instructions, controls, and results.
- Barlow Semi Condensed: headings and tabular stopwatch figures.

Phone portrait stacks the camera and the current step; tablets and short landscape screens put them side by side. Labels and instructions are left aligned. Timing feedback is centered for recognition from a distance. Settings stay in document flow beside or below the camera.

```
Phone                        Tablet / phone landscape
Name      Practice / History Name                 Practice / History
Camera > Targets > Check     Camera > Targets > Check
[ Camera / target view ]     [ Camera / target view ][ Current step ]
[ Current step or timer ]    [                     ][ or timer     ]
[ One primary action   ]
```

## Plan review

A dark control dashboard would repeat the old interface and generic tactical products. Use light, quiet surfaces around the dark camera view instead. The timer earns its large type because the screen is used at a distance. Step numbering conveys an actual sequence. Color does not carry status without text. No invented telemetry or sample performance data.

## Flows

First use: start the camera, choose how targets are defined, tap target corners on a frozen image, filter room lighting, check a training pulse, then choose a drill. The detection check is user-confirmed, not an accuracy guarantee.

Returning use: retain drill preferences and local training history. Repositioning a camera requires checking targets again; do not silently restore old room coordinates. History is available without granting camera access.

Training: keep configuration separate from the live timer. Show waiting, shooting, reload, failure, and automatic-next-rep states explicitly. Offer Next rep immediately after completion and Repeat session when an automatic set finishes. Review provides timing, zone results, and individual reps.

## Boundaries

Preserve the laser detector, thresholds, clustering, scoring behavior, and storage format. Camera performance and real laser accuracy require separate physical-device validation. No accounts, subscriptions, teams, or multiplayer in this pass.

## Visual refinements

Small secondary text uses a darker slate to retain contrast against the porcelain background. Short landscape screens compact setup instructions. Live training reduces setup chrome and keeps the camera and timer close together on portrait phones; session statistics remain available through Review session.

## Verification completed October 17, 2026

Lint, all three test files (14 cases), the production build, and `git diff --check` pass. Detection, scoring helpers, and storage implementation files have no changes. Existing local edits were preserved.

Browser review covered 320px and 390px portrait phones, 844×390 landscape, and a 1024×768 tablet. No horizontal overflow was found. The landscape Enable camera and Next rep actions fit in the initial viewport; the narrow-phone Stop action remains visible. Waiting, active timing, and completed-rep layouts were reviewed with isolated SSR fixtures clearly labeled as sample data, without running the detector. History navigation and its empty state work without camera access.

Earlier live browser checks verified camera startup, frozen-frame corner selection, Undo/Retake/Cancel, target naming, scoring-editor entry/cancel, and detection-check entry/counting. Existing live-camera processing slowdown blocked a complete drill interaction run. Render tests cover waiting, reload, repeat, failure, and automatic-countdown controls. Real laser accuracy, latency, and sustained camera performance still require physical-device validation.

The redesign remains local and uncommitted; it has not been deployed.
