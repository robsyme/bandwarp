---
id: 005
title: How will we validate that quantification is accurate?
labels: [wayfinder:grilling]
status: closed
assignee: robsyme
blocked-by: []
---

## Question

What ground truth exists or can be made? Is there independent quantification (e.g. HPLC) of any samples on the example plates? Would a validation plate (known spiked amounts in sample lanes) be run? What accuracy is good enough for the science this feeds — ±10%? ±2x? And what checks should the tool itself surface (calibration fit quality, replicate agreement) so the Operator can tell a trustworthy plate from a dubious one?

## Resolution

Decided (user-confirmed, 2026-08-20):

- **No external ground truth exists** for the example plates' samples (no HPLC/LC-MS numbers), so validation is internal.
- **Protocol**: (1) standards-as-unknowns leave-one-out on the existing photos — fit calibration excluding one standard level, quantify that band as a sample, compare to its known amount; (2) replicate-lane agreement — repeated tissue codes on the same plate (e.g. Lo/Le/R twice on Gel 4A) should quantify the same. Both run on data we already have.
- **Ongoing self-validation**: the scientist will include standards on outer lanes of future plates; the tool quantifies them as unknowns against the main dilution series, giving every plate its own built-in accuracy check.
- **Acceptance bar**: leave-one-out recovery within ±15% for mid-range standards; replicate RSD <= 10%. The tool is documented as screening-grade, not assay-grade, either way.
- **Placement**: running the protocol is in-map — [Run the validation protocol on the example plates](009-run-validation-protocol.md), a task ticket blocked by the build (wired once build tickets are charted). The per-plate QC surface decided in [What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md) remains the day-to-day guard.
