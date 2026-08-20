---
id: 009
title: Run the validation protocol on the example plates
labels: [wayfinder:task]
status: open
assignee:
blocked-by: [015]
---

## Question

Execute the validation protocol decided in [How will we validate that quantification is accurate?](005-validation-of-quantification-accuracy.md) once the tool computes calibrated quantities. **Requires the built tool — blocked by the build; wire blocked-by ids when the build tickets are charted.**

1. Standards-as-unknowns leave-one-out on all three example plates: for each detected standard level, refit the calibration without it and quantify it as a sample. Pass: mid-range recovery within ±15%.
2. Replicate-lane agreement: quantify the repeated tissue-code lanes (e.g. Lo/Le/R duplicated on Gel 4A) and compute RSD per compound. Pass: <= 10%.

Record the numbers in the resolution. If either fails, the failure analysis reopens the pipeline decisions, not this ticket alone. Future plates carry standards on outer lanes for ongoing per-plate self-validation — check the tool handles standards lanes at both plate edges.
