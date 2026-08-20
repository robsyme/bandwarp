---
id: 008
title: What is the Operator's step-by-step workflow?
labels: [wayfinder:prototype]
status: closed
assignee: robsyme
blocked-by: [003, 004]
---

## Question

Mock the UI flow the Operator walks for one Plate — load photo, mark lanes, name Compounds, enter the Dilution Series, review/correct bands and identities, inspect calibration, export CSV, save/reload the Analysis File — as something concrete to react to. Shaped by what the detection prototype ([Can lanes and bands be auto-detected well enough to assist?](003-band-autodetection-feasibility.md)) and the warp prototype ([How should Warp be modelled and Band identities assigned?](004-warp-model-and-identity-assignment.md)) proved feasible.

Requirements those resolutions established: an explicit "mark the analysis region" step (each photo holds two developed regions; detection doesn't find the boundary); correction gestures — remove/add band by click, drag lane x, add whole lane (right-click, with the context menu suppressed), rename rows to Compound names; rescued bands visually flagged for review.

From [What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md): the flow starts with marking the four plate corners (rectification) before region marking; band integration bounds and the valley-to-valley baseline are drawn on a visible per-lane profile and draggable; the calibration view shows curve + residuals per Compound; results carry the fixed QC flag set (out-of-bracket, saturated, rescued, manually-added).

## Assets

- [workflow-mock.html](../../prototypes/workflow-mock.html) — three structurally different UI variants of the same 9-step flow (`?variant=A` wizard, `B` workspace, `C` notebook), switchable with the floating pill or arrow keys. Built by `prototypes/build_mock.py`.

## Resolution

**Variant B — Workspace** (user-chosen from the three-variant mock, 2026-08-20), with the nine-step flow confirmed as mocked:

1. Photo (EXIF applied) → 2. Corners (rectify) → 3. Region → 4. Lanes (correct/label/tick standards) → 5. Compounds (names, dilution series, unit) → 6. Bands (warp-assisted, correction gestures, rescued flagged) → 7. Profiles (bounds + baseline, draggable) → 8. Calibration (per-compound curve, residuals) → 9. Results (QC chips, CSV export, Analysis File save).

Layout: the plate canvas stays center-stage throughout; a step checklist on the left jumps anywhere and shows progress ticks; a right-hand context panel carries the active step's controls; top bar holds Open / Save Analysis File / Export CSV. The step order and content drew no objections; no guided/wizard mode required.
