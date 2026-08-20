---
id: 003
title: Can lanes and bands be auto-detected well enough to assist?
labels: [wayfinder:prototype]
status: open
assignee: robsyme
blocked-by: []
---

## Question

On the photos in `examples/`, can a throwaway prototype (any language) detect lanes and band centres well enough that the Operator mostly corrects rather than marks from scratch? What signal-processing approach works on these images (green-channel extraction, lane profile detection, per-lane intensity profiles, peak finding), and where does it fail (faint bands, the warped rows on Gel 4B, plate edges)? The manual path is the floor either way — this ticket decides how good the assist can be and what preprocessing it needs.

Evidence so far (from the warp prototype's crude extractor, `prototypes/extract_bands.py`): green-channel + column-profile peaks + pitch-grid finds most lanes but misplaces some (user confirmed), EXIF orientation must be honoured, each photo needs a region crop before analysis, and faint bands/middle ladder rows are under-detected at fixed prominence thresholds.
