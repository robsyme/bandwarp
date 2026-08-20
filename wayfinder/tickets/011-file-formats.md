---
id: 011
title: What exactly goes in the Analysis File and the results CSV?
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
---

## Question

Pin the two output formats now that the data model is settled by the pipeline ([What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md)) and workflow ([What is the Operator's step-by-step workflow?](008-operator-workflow.md)) decisions.

Analysis File (JSON, save/reload + provenance): corner points, region, lanes (x, label, standard flag, amount), compounds, bands (position, source: detected/rescued/manual, integration bounds, baseline), warp fit parameters, calibration fits, provenance strings (transform, baseline method, fit choice, app version), and the open question — embed the photo (single portable file, big) vs reference it by filename + hash (small, needs the photo kept alongside)?

Results CSV: one row per lane x compound, columns for label, compound, amount + unit, censoring ("> top"), QC flags, and whether absent-band lanes emit a row (amount empty? zero? "nd"?). Schema version field in both.
