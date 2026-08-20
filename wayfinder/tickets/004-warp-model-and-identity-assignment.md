---
id: 004
title: How should Warp be modelled and Band identities assigned?
labels: [wayfinder:prototype]
status: closed
assignee: robsyme
blocked-by: []
---

## Question

Given band centres per lane (hand-marked is fine — this ticket does not depend on auto-detection), what model of the Warp assigns each Band to the correct Compound Row across all lanes of a Plate? Candidates: a smooth curve (e.g. spline) fitted per Compound Row; a single plate-wide vertical displacement field shared by all rows; clustering by warp-corrected position. Prototype on `examples/` — Gel 4B is the stress case. Also: how does the Operator seed or correct identity (name one band per row? drag a band to another row?), and does the model stay stable when a lane is missing a band?

## Assets

- [warp-model-demo.html](../../prototypes/warp-model-demo.html) — double-clickable single-file demo comparing three warp models on the example plates (built by `prototypes/build_demo.py` from `prototypes/extract_bands.py` output).

## Resolution

Decided (user-confirmed on the prototype, 2026-08-20): **scaled shared warp, greedy row-linking as initializer, manual add/remove/rename as the correction floor.**

- The Warp model is `y = offset_row + amplitude_row * d(x)`: one smooth drift shape `d(x)` per Plate (local linear regression across lanes), with a per-row amplitude. The examples prove per-row amplitude is required, not optional: on Gel 4B the standards ladder curves hard while the top Compound Row stays flat, so a single shared displacement field misassigns, and purely independent rows fragment (8 rows instead of 4 on Gel 5A) and extrapolate wildly across gaps.
- Fitting: greedy strongest-first band linking across lanes seeds the rows; alternating least squares refines drift, offsets, and amplitudes; near-coincident rows are merged; each band is assigned to the nearest row curve within a tolerance (default ±3.5% of plate height) or left unassigned. Stable under missing bands (walkthrough 2) and identifies a lone faint band via the plate-wide drift (walkthrough 3).
- Correction loop confirmed good by the user: click to remove a band, click a lane to add one, rename rows to Compound names. Added on review: lane x positions must also be Operator-correctable (drag handles in the demo) because auto-detected lanes are sometimes wrong — this carries into [What is the Operator's step-by-step workflow?](008-operator-workflow.md) and is evidence for [Can lanes and bands be auto-detected well enough to assist?](003-band-autodetection-feasibility.md).
- The `WarpAssign` module inside the demo is pure (no DOM) and written to lift directly into the real tool.
