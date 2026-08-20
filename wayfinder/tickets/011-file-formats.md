---
id: 011
title: What exactly goes in the Analysis File and the results CSV?
labels: [wayfinder:grilling]
status: closed
assignee: robsyme
blocked-by: []
---

## Question

Pin the two output formats now that the data model is settled by the pipeline ([What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md)) and workflow ([What is the Operator's step-by-step workflow?](008-operator-workflow.md)) decisions.

Analysis File (JSON, save/reload + provenance): corner points, region, lanes (x, label, standard flag, amount), compounds, bands (position, source: detected/rescued/manual, integration bounds, baseline), warp fit parameters, calibration fits, provenance strings (transform, baseline method, fit choice, app version), and the open question — embed the photo (single portable file, big) vs reference it by filename + hash (small, needs the photo kept alongside)?

Results CSV: one row per lane x compound, columns for label, compound, amount + unit, censoring ("> top"), QC flags, and whether absent-band lanes emit a row (amount empty? zero? "nd"?). Schema version field in both.

## Resolution

Decided (user-confirmed, 2026-08-20):

- **Analysis File (JSON)**: embeds the **original photo bytes** (base64) — one self-contained, portable provenance file (~3-8 MB per plate is acceptable at tens of plates). Plus: schema version, corner points, region, lanes (x, label, standard flag, amount), compounds, bands (position, source: detected/rescued/manual, integration bounds, baseline anchors), warp fit parameters, calibration fits, and the provenance strings (transform, baseline method, fit choice, app version).
- **Results CSV**: one row per lane x compound over the **full grid** — absent bands emit a row with empty `amount` and flag `nd`. Columns: `plate`, `lane_number`, `lane_label`, `is_standard`, `compound`, `rf`, `area_od`, `amount`, `unit`, `amount_display`, `flags` (semicolon-joined: `nd`, `above_top_standard`, `below_bottom_standard`, `rescued`, `manual`), plus a header-comment line carrying the provenance string and schema version.
- **Censoring**: `amount` never holds a number that isn't a measurement — censored results leave `amount` empty, set `above_top_standard`, and put "> 4" in `amount_display`.
- **Standards as rows**: standard lanes appear as ordinary rows with their fitted values, so leave-one-out-style recovery is checkable directly in the CSV against the known amounts.
