---
id: 013
title: "Build: port detection and warp modules"
labels: [wayfinder:task]
status: closed
assignee: robsyme
blocked-by: [012]
---

## Question

Port the proven prototypes into pure TS modules with vitest tests: the detection recipe from [Can lanes and bands be auto-detected well enough to assist?](003-band-autodetection-feasibility.md) (origin-row lanes unioned with band-mass peaks, centroid refinement, noise-adaptive per-lane peaks, warp-guided rescue) and the `WarpAssign` scaled-shared-warp module from [How should Warp be modelled and Band identities assigned?](004-warp-model-and-identity-assignment.md). Use `prototypes/out/bands.json` as the fixture: the port should reproduce the prototype's lanes/bands on the three example plates within tolerance.

## Resolution

Done (2026-08-20). Three pure modules under `src/analysis/`, 17 new tests (28 total green):

- `signal.ts` — scipy-parity `gaussian1d` (truncate-4 kernel, reflect boundary) and `findPeaks` (plateau midpoints, distance-by-height-priority before prominence, scipy prominence definition), verified against scipy-computed truth literals.
- `warp.ts` — `buildRows` greedy linking, `loess`, the scaled-shared-warp ALS (`fitScaledWarp`, exact Python parity for the rescue pass), and the three-model `fit()` facade for the UI. Synthetic-truth tests: recovers 3 rows with full membership under missing bands, predicts a missing band's position from the shared drift within 6 px, rejects an isolated spurious band as noise.
- `detect.ts` — `detectLanes` (origin-anchored + band-mass union + centroid refinement) and `detectOnSignal` (noise-adaptive peaks + warp-guided rescue).

Parity harness: `prototypes/extract_bands.py` now dumps `out/fixtures.json` + `out/<plate>_sig.u8` — its own detection re-run on a downscaled, u8-quantized signal, so vitest runs the reference algorithm on byte-identical input. The port matches on all three plates: identical lane counts with every lane within ±3 px, origin/pitch within tolerance, and >=90% band recall and precision at ±4 px. Fixture note: detection runs on the fractional-darkness signal (as decided in the pipeline ticket); the worker will need to emit that signal alongside OD for the shell (ticket 014).
