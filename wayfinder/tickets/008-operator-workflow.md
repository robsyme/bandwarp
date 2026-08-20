---
id: 008
title: What is the Operator's step-by-step workflow?
labels: [wayfinder:prototype]
status: open
assignee:
blocked-by: [003, 004]
---

## Question

Mock the UI flow the Operator walks for one Plate — load photo, mark lanes, name Compounds, enter the Dilution Series, review/correct bands and identities, inspect calibration, export CSV, save/reload the Analysis File — as something concrete to react to. Shaped by what the detection prototype ([Can lanes and bands be auto-detected well enough to assist?](003-band-autodetection-feasibility.md)) and the warp prototype ([How should Warp be modelled and Band identities assigned?](004-warp-model-and-identity-assignment.md)) proved feasible.

Requirements those resolutions established: an explicit "mark the analysis region" step (each photo holds two developed regions; detection doesn't find the boundary); correction gestures — remove/add band by click, drag lane x, add whole lane (right-click, with the context menu suppressed), rename rows to Compound names; rescued bands visually flagged for review.

From [What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md): the flow starts with marking the four plate corners (rectification) before region marking; band integration bounds and the valley-to-valley baseline are drawn on a visible per-lane profile and draggable; the calibration view shows curve + residuals per Compound; results carry the fixed QC flag set (out-of-bracket, saturated, rescued, manually-added).
