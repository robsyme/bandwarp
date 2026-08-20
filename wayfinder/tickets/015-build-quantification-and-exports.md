---
id: 015
title: "Build: quantification views and exports (steps 7-9)"
labels: [wayfinder:task]
status: open
assignee:
blocked-by: [014, 011]
---

## Question

Implement steps 7-9 per [What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md): per-lane profile view with draggable integration bounds and visible valley-to-valley baseline; per-compound calibration (linear + Michaelis-Menten via ml-levenberg-marquardt, auto-selected, curve + residuals shown); results table with QC chips (out-of-bracket censored as "> top", saturated, rescued, manually-added); CSV export and Analysis File save/load in the formats decided in [What exactly goes in the Analysis File and the results CSV?](011-file-formats.md). Done when a full pass over Gel 4B produces a calibrated CSV.
