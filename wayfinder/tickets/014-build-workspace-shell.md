---
id: 014
title: "Build: workspace UI shell (steps 1-6)"
labels: [wayfinder:task]
status: closed
assignee: robsyme
blocked-by: [013]
---

## Question

Implement the Workspace layout decided in [What is the Operator's step-by-step workflow?](008-operator-workflow.md) — plate canvas center-stage, left step checklist, right context panel, top bar — wired to the real modules for steps 1-6 (Photo, Corners, Region, Lanes, Compounds, Bands), including every correction gesture: click band on/off, drag lane x, right-click add lane (context menu suppressed), lane labels + standard ticks, compound naming, dilution series entry, rescued bands flagged. Steps 7-9 may stub until the quantification ticket. Done when the scientist-facing flow on Gel 4B feels like the mock.

## Resolution

Done (2026-08-20). The dev harness in `src/app.tsx` is replaced by the variant-B Workspace: top bar (plate name, Open/Save/Export stubbed disabled until ticket 015), left nine-step checklist, plate canvas center-stage (`src/ui/stage.tsx` — full-res canvas blit with an SVG overlay in image coordinates), right context panel per step.

- Steps wired to real modules: Photo (file input or bundled Gel 4B example, EXIF applied), Corners (four draggable numbered handles, re-rectifies in the worker on release), Region (drag box, dimmed surround), Lanes (auto-detected, drag-to-move, right-click add with context menu suppressed, per-lane label/standard-tick/dilution-amount table, delete, re-detect), Compounds (auto-named per warp row, editable, unit field, fitted row curves drawn on the plate), Bands (dots coloured by compound row, click to remove, click a lane to add, warp-rescued dots dark-ringed, manual dots dashed, per-row counts). Steps 7-9 stub with a pointer to the quantification build.
- New pure modules with tests: `src/analysis/detectRegion.ts` (green channel → wide 2D background → fractional darkness at ~700 px, the fixture-proven scale, mapped back to rectified coordinates) and `src/state.ts` (stable-id Lane/PlacedBand bookkeeping plus `assignRows` wrapping the scaled shared warp fit, top row = compound 0). Worker now takes `pipeline` and `detect` jobs. 52 tests green.
- Verified in headless Chrome (`scripts/walkthrough.mjs` drives the full operator flow on Gel 4B): after corner-marking and marking the lower developed region inside the plate's dark edges, detection finds all 23 lanes (reference parity) and 62 bands vs the reference's 63 on its slightly different crop; every gesture exercised.
- Caveat carried forward: detection assumes the marked Region excludes the plate's dark edges (they inflate the noise thresholds) — the step hint says so, matching how the Python reference cropped. No pan/zoom on the stage yet; the mock had none, revisit only if the scientist asks.
