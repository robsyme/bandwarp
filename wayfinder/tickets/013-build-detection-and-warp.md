---
id: 013
title: "Build: port detection and warp modules"
labels: [wayfinder:task]
status: open
assignee: robsyme
blocked-by: [012]
---

## Question

Port the proven prototypes into pure TS modules with vitest tests: the detection recipe from [Can lanes and bands be auto-detected well enough to assist?](003-band-autodetection-feasibility.md) (origin-row lanes unioned with band-mass peaks, centroid refinement, noise-adaptive per-lane peaks, warp-guided rescue) and the `WarpAssign` scaled-shared-warp module from [How should Warp be modelled and Band identities assigned?](004-warp-model-and-identity-assignment.md). Use `prototypes/out/bands.json` as the fixture: the port should reproduce the prototype's lanes/bands on the three example plates within tolerance.
