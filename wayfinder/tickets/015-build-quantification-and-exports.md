---
id: 015
title: "Build: quantification views and exports (steps 7-9)"
labels: [wayfinder:task]
status: closed
assignee: robsyme
blocked-by: [014, 011]
---

## Question

Implement steps 7-9 per [What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md): per-lane profile view with draggable integration bounds and visible valley-to-valley baseline; per-compound calibration (linear + Michaelis-Menten via ml-levenberg-marquardt, auto-selected, curve + residuals shown); results table with QC chips (out-of-bracket censored as "> top", saturated, rescued, manually-added); CSV export and Analysis File save/load in the formats decided in [What exactly goes in the Analysis File and the results CSV?](011-file-formats.md). Done when a full pass over Gel 4B produces a calibrated CSV.

## Resolution

Done (2026-08-20). A full pass over Gel 4B produces a calibrated CSV; the Analysis File reopens to the identical results table.

- New pure modules with tests: `src/analysis/profile.ts` (per-lane OD profile, valley-to-valley bounds/baseline/area, JPEG dark-clip saturation check), `src/analysis/calibrate.ts` (linear + Michaelis-Menten via ml-levenberg-marquardt, auto-selected by r² with ties to the simpler model, censoring above the top *detected* standard, below-bottom flagging), `src/results.ts` (full lane x compound grid, `nd` rows, `amount_display` carrying "> top", provenance header comment), `src/io.ts` (Analysis File schema v1 with embedded photo bytes, source-tagged bands, bounds overrides, warp + calibration fits). 59 tests green.
- UI: Profiles (lane picker or click-a-lane, profile SVG with shaded bounds, dashed baseline, draggable bound edges, per-band areas, reset-to-auto), Calibration (per-compound curve + points + residual bars, r² warning chip under 0.99), Results (QC chips: nd / "> top" / below bottom standard / saturated / rescued / manual / ok, provenance line, Export CSV + Save Analysis File). Top-bar Open/Save/Export all live; Open restores a saved analysis without re-running detection.
- Verified end-to-end in headless Chrome (`scripts/walkthrough.mjs`): dilution series 0.25-4 µg labelled on lanes 10-16; CSV has 92 rows (23 lanes x 4 compound rows), 12 censored, 34 nd; standards-as-unknowns recovery on the well-behaved compounds within ~7% (e.g. fitted 0.234/0.529/1.029/1.394/2.07 vs known 0.25/0.5/1/1.5/2), the faintest standard correctly flagged below-bottom; save -> fresh page -> Open restores all 92 rows.
- Findings for the validation ticket: the top compound row on Gel 4B is a uniform-intensity band that does not track the dilution series (linear r² 0.08 — the QC chip surfaces it); the 4 µg standard went undetected for two compounds, so bracketing censors at "> 3" there. Both are data behaviour, not tool defects, and are exactly what [Run the validation protocol on the example plates](009-run-validation-protocol.md) should weigh.
