---
id: 003
title: Can lanes and bands be auto-detected well enough to assist?
labels: [wayfinder:prototype]
status: closed
assignee: robsyme
blocked-by: []
---

## Question

On the photos in `examples/`, can a throwaway prototype (any language) detect lanes and band centres well enough that the Operator mostly corrects rather than marks from scratch? What signal-processing approach works on these images (green-channel extraction, lane profile detection, per-lane intensity profiles, peak finding), and where does it fail (faint bands, the warped rows on Gel 4B, plate edges)? The manual path is the floor either way — this ticket decides how good the assist can be and what preprocessing it needs.

Evidence so far (from the warp prototype's crude extractor, `prototypes/extract_bands.py`): green-channel + column-profile peaks + pitch-grid finds most lanes but misplaces some (user confirmed), EXIF orientation must be honoured, each photo needs a region crop before analysis, and faint bands/middle ladder rows are under-detected at fixed prominence thresholds.

## Assets

- [extract_bands.py](../../prototypes/extract_bands.py) — the detection pipeline prototype (Python; the recipe ports to the browser per the stack research).
- [warp-model-demo.html](../../prototypes/warp-model-demo.html) — the detections loaded into the interactive demo for correction-loop testing.

## Resolution

**Yes — auto-detection is good enough to assist** (user-confirmed on the prototype, 2026-08-20): the Operator mostly corrects rather than marks from scratch.

The recipe that got there, each piece earned by a failure on the example plates:

- **Lanes are anchored on the origin spots, not a fixed-pitch grid.** Lanes sit in groups with irregular inter-group gaps, so any global grid misplaces them. Every lane has an origin spot (even band-less samples); the origin row is found as the bottom-most significant row (the lowest compound row can be darker), in a strip wide enough to survive plate tilt. Lanes whose origins are faint but whose bands are strong (the standards ladder) are recovered by unioning in whole-plate column-profile peaks. Each lane x is centroid-refined.
- **2D flat-field** (large-sigma Gaussian background, signal = fractional darkness) plus **noise-adaptive per-lane peak thresholds** (MAD-based) — this recovered the faint middle ladder bands a fixed threshold missed.
- **Warp-guided rescue pass**: fit the scaled shared warp (the model decided in [How should Warp be modelled and Band identities assigned?](004-warp-model-and-identity-assignment.md)) on confident bands, then hunt faint peaks where row curves predict them in band-less lanes. Rescued bands are flagged and drawn distinctly for Operator review — detection and the warp model bootstrap each other.
- EXIF orientation must be applied on load; the analysis region (each photo has two developed regions) is marked by the Operator, not detected.

Score on the three example plates: 23/23/22 lanes, all correctly placed; 50–62 bands each including faint ladder bands; misses are the faintest standards lane (0.25 level) and its bands; false positives are a few smears/over-eager rescues, one click each to remove.

**Faint standards ruling** (user): the faintest standard levels don't need detection — calibration anchors on the stronger levels. Carried into [What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md).

Correction gestures validated (and required in the real tool): remove/add band by click, drag lane position, add whole lane (right-click — the browser context menu must be suppressed), rescued-band review. Carried into [What is the Operator's step-by-step workflow?](008-operator-workflow.md), which this closes the last blocker for.
