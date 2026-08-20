---
id: 006
title: What is the exact pixel-to-quantity pipeline?
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: [001]
---

## Question

Decide the concrete quantification pipeline: which channel/transform turns the photo into a densitometric signal, how background is estimated and subtracted, how a Band's integration region is defined (locally, following the Warp fit, rather than a global straight box), which Calibration Curve model is fitted (linear default, what happens on visible saturation), and what per-plate quality indicators come out of it. Grounded in the findings of [How do established tools quantify gel/TLC bands?](001-how-do-established-tools-quantify-bands.md).

Inputs settled by other tickets: calibration anchors on the stronger standard levels — the faintest (0.25) may go undetected and can be excluded (ruled in [Can lanes and bands be auto-detected well enough to assist?](003-band-autodetection-feasibility.md), which also validated EXIF handling and a 2D flat-field on these photos). Still to decide here from the research: gamma linearization of the JPEG, the OD-like transform, baseline method, 1D-profile vs 2D-spot integration, and the calibration model (linear vs Michaelis-Menten, bracketing).
