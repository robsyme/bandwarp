---
id: 007
title: What tech stack and distribution for the client-side tool?
labels: [wayfinder:grilling]
status: closed
assignee: robsyme
blocked-by: [002]
---

## Question

Decide the stack: framework (or none), language/build tooling, which image-processing approach from the research the tool commits to, and how the Operator gets and opens the tool (single self-contained HTML file? static hosting? both?). Constraints: fully client-side, non-developer Operator, tens of plates, smooth interaction on multi-megapixel photos. Grounded in [What image processing is realistic fully client-side in the browser?](002-browser-image-processing-capability.md).

## Resolution

Decided (user-confirmed, 2026-08-20):

- **Vite + TypeScript, Preact for the UI shell.** The analysis core (detection, warp fit, calibration, quantification) stays pure framework-free TS modules with vitest tests — the demo's `WarpAssign` and the Python detection recipe port into these.
- **Distribution both ways from one build**: vite-plugin-singlefile produces a self-contained `index.html` that works from a double-click and is also served via GitHub Pages. The scientist bookmarks the Pages URL; frozen single-file copies can live alongside datasets for provenance. Provisioning charted as [Create the GitHub repo and Pages hosting](010-repo-and-pages.md).
- **Dependency policy**: hand-rolled kernels stay (loess, peak finding, greedy linking, ALS warp — already proven on the real plates); the single library dependency is `ml-levenberg-marquardt` for the Michaelis-Menten calibration fit. No OpenCV.js/WASM, no SharedArrayBuffer (keeps hosting zero-config).
- **One Web Worker from day one** for pixel work (decode, sRGB linearization, OD transform, background surface) with transferable buffers; the UI thread touches only the display bitmap and the small lane/band data.
