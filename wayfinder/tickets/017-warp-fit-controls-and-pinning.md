---
id: 017
title: "Warp fit controls and manual row pinning"
labels: [wayfinder:task]
status: closed
assignee: robsyme
blocked-by: [015]
---

## Question

Operator feedback (2026-08-20, after working drastic gels): manually added band points fail to connect into rows — the scaled-warp fit's fixed tolerance and curve stiffness can't follow severe warp, and there is no way to overrule the assignment. Add (a) exposed fit controls on the Bands step — row match tolerance and drift-curve stiffness — and (b) a way to manually pin a band to a specific Compound Row, including pinning points into a new row the auto-fit missed. Pins and fit settings must survive the Analysis File round-trip.

## Resolution

Done (2026-08-20).

- **Fit controls** (Bands step, "Warp fit"): row match tolerance slider (2-10% of region height, default 3.5%) — how far a band may sit from a row curve and still join it — and curve stiffness slider (loess bandwidth, 3-25% of region width, default 8%) — lower it and the drift curves bend harder to follow a drastic warp. `assignRows` takes `AssignOptions`; `warp.fit` exposes the loess bandwidth. The Python-parity detection path (`fitScaledWarp`) is untouched and its tests still pass.
- **Manual pinning** ("Assign clicks to"): a brush selects Auto (default, click-to-remove as before), any existing compound, or "Pin to a new row". With a compound brushed, clicking a dot pins it to that compound instead of removing it, and clicking a lane adds a pinned band; "new row" creates the row on first click and the brush follows it. Pins overrule the warp fit, pinned rows get their curve re-regressed against the shared drift so it passes through the pinned points, and pinned dots render with a white centre. "Clear all pins" undoes the lot.
- **Persistence**: `rowOverride` on saved bands and `fit` settings ride in the Analysis File (schema stays v1 — both fields optional, older files load unchanged).
- Verified: 63 tests green (tolerance widening connects a dropped outlier; pin overrules the fit; two pins create a new row whose curve passes through them; untouched rows keep byte-identical curves), and the headless-Chrome walkthrough pins two hand-added points into a new fifth compound row on Gel 4B — CSV grows to the full 115-row grid and the Analysis File round-trip restores all of it.
