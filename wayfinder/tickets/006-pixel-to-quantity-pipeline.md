---
id: 006
title: What is the exact pixel-to-quantity pipeline?
labels: [wayfinder:grilling]
status: closed
assignee: robsyme
blocked-by: [001]
---

## Question

Decide the concrete quantification pipeline: which channel/transform turns the photo into a densitometric signal, how background is estimated and subtracted, how a Band's integration region is defined (locally, following the Warp fit, rather than a global straight box), which Calibration Curve model is fitted (linear default, what happens on visible saturation), and what per-plate quality indicators come out of it. Grounded in the findings of [How do established tools quantify gel/TLC bands?](001-how-do-established-tools-quantify-bands.md).

Inputs settled by other tickets: calibration anchors on the stronger standard levels — the faintest (0.25) may go undetected and can be excluded (ruled in [Can lanes and bands be auto-detected well enough to assist?](003-band-autodetection-feasibility.md), which also validated EXIF handling and a 2D flat-field on these photos). Still to decide here from the research: gamma linearization of the JPEG, the OD-like transform, baseline method, 1D-profile vs 2D-spot integration, and the calibration model (linear vs Michaelis-Menten, bracketing).

## Resolution

All decided (user-confirmed, 2026-08-20), grounded in [the densitometry research](../research/tlc-densitometry.md):

1. **Signal transform**: undo the JPEG sRGB gamma → green channel → absorbance-like value `OD = log10(I_background / I_pixel)` against a smooth 2D local-background surface fitted to band-free plate regions. The log-ratio performs flat-field correction implicitly. Detection may keep its cheaper fractional-darkness signal; quantification uses this chain.
2. **Perspective correction**: yes — the Operator marks the four plate corners right after loading the photo, before region marking (TLCyzer-style). The Warp model then only carries real chromatographic drift, not camera geometry.
3. **Integration**: per-lane 1D profile along the migration axis; each Band integrated as **area** between explicit start/end bounds found at the flanking valleys, placed where the Warp fit predicts the band; bounds visible and draggable. 2D spot-footprint integration is noted as a future refinement if validation shows 1D wanting.
4. **Baseline**: valley-to-valley (straight line between flanking minima) is the only method in v1, drawn visibly on the profile; method name + parameters written into every Analysis File and CSV row from day one so later methods can't create silent incomparability.
5. **Calibration**: per Compound per Plate, fit linear and Michaelis-Menten (not through origin), auto-select by fit quality, show curve + residuals. Undetected faint standards are excluded. Above the top standard the result is a **censored value** ("> top amount") with a dilute-and-re-run hint — never an extrapolated number; below the bottom standard the value is reported but flagged as outside the calibrated range.
6. **QC surface**: per Compound — calibration r²/CV with a warning under 0.99; per Band — flags for out-of-bracket, saturated, rescued, manually-added; plus the baseline/transform provenance string. One row of chips per band, one line per compound — no dashboard.
