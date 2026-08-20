---
id: 004
title: How should Warp be modelled and Band identities assigned?
labels: [wayfinder:prototype]
status: open
assignee: robsyme
blocked-by: []
---

## Question

Given band centres per lane (hand-marked is fine — this ticket does not depend on auto-detection), what model of the Warp assigns each Band to the correct Compound Row across all lanes of a Plate? Candidates: a smooth curve (e.g. spline) fitted per Compound Row; a single plate-wide vertical displacement field shared by all rows; clustering by warp-corrected position. Prototype on `examples/` — Gel 4B is the stress case. Also: how does the Operator seed or correct identity (name one band per row? drag a band to another row?), and does the model stay stable when a lane is missing a band?

## Assets

- [warp-model-demo.html](../../prototypes/warp-model-demo.html) — double-clickable single-file demo comparing three warp models on the example plates (built by `prototypes/build_demo.py` from `prototypes/extract_bands.py` output). Awaiting user reaction.
