---
id: 012
title: "Build: scaffold and worker pixel pipeline"
labels: [wayfinder:task]
status: closed
assignee: robsyme
blocked-by: []
---

## Question

Stand up the app per [What tech stack and distribution for the client-side tool?](007-tech-stack-and-distribution.md): Vite + TypeScript + Preact + vitest + vite-plugin-singlefile, one Web Worker with transferable buffers. Implement the pixel pipeline from [What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md): EXIF-aware decode, corner homography rectification, region crop, sRGB linearization, green-channel OD log-ratio against a fitted 2D background surface. Done when unit tests pass on synthetic fixtures and Gel 4B renders rectified in the browser.

## Resolution

Done (2026-08-20). The app lives at the repo root: Vite + TypeScript + Preact + vitest + vite-plugin-singlefile (`npm run dev` / `build` / `test`).

- Pure analysis modules under `src/analysis/`, 11 unit tests passing at the three agreed seams: `srgb.ts` (sRGB-spec linearization), `geometry.ts` (DLT homography, corner-exact; `rectify` reproduces a known crop), `background.ts` + `od.ts` (3-pass box-blur background; the flat-field property holds — equal bands under a 2x illumination gradient come out within 15% OD, and the estimator's contract is documented: unbiased only ~radius px inside the region edge, which the Operator-marked region must respect).
- `src/worker/pipeline.worker.ts` (inlined via `?worker&inline`, so the single-file build keeps working) with transferable buffers both ways; `src/worker/client.ts` is the promise facade.
- Dev harness (`src/app.tsx`, replaced by ticket 014's shell): bundles Gel 4B, EXIF-upright decode via `createImageBitmap`, click-to-place corners, live rectified plate + OD preview from the worker. Verified in headless Chrome: the OD map kills the green illumination gradient completely; warped ladder bands render crisp on a uniform background.
- Build artifact: single `dist/index.html` (~1.9 MB with the bundled sample photo). `scripts/screenshot.mjs` (puppeteer-core, dev-only dep) screenshots a page after canvases render — kept for later build tickets' verification.
