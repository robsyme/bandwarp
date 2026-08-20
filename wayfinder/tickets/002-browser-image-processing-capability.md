---
id: 002
title: What image processing is realistic fully client-side in the browser?
labels: [wayfinder:research]
status: closed
assignee: claude-research-agent
blocked-by: []
---

## Question

The tool must run fully client-side on multi-megapixel plate photos. What are the realistic options and limits for: (a) pixel-level access and processing (Canvas/ImageData, typed arrays, workers), (b) heavier lifting via OpenCV.js or other WASM libraries — size, load time, what they buy us for profile extraction, peak detection, and smoothing, (c) curve/spline fitting in JS for warp modelling and calibration fits, (d) reading large JPEGs and doing interactive overlays (zoom/pan, draggable markers) without jank? What do comparable in-browser scientific-image tools use?

Findings go to `wayfinder/research/browser-image-processing.md`.

## Resolution

Everything the tool needs is feasible fully client-side with plain JS, typed arrays, and one Web Worker — full findings in [browser-image-processing.md](../research/browser-image-processing.md). Highlights:

- A 4000x3000 photo (12 MP, 48 MB RGBA) fits a single canvas in every browser, just under Safari's 16.7 M-pixel area cap; guard with a decode-time downscale for larger photos. `createImageBitmap` + `OffscreenCanvas` + transferable ArrayBuffers keep decode and pixel math off the main thread (all Baseline APIs).
- OpenCV.js is not worth its 7-9 MB: the kernels we need can be hand-rolled or taken from image-js (pure JS, MIT, Zakodium, v1.7.0 July 2026). wasm-vips needs COOP/COEP headers, which conflict with zero-config static hosting — avoiding SharedArrayBuffer keeps GitHub-Pages-style deployment trivial.
- Curve fitting is covered by the actively maintained mljs ecosystem: ml-levenberg-marquardt (nonlinear), ml-gsd (1-D profile peak detection), ml-savitzky-golay-generalized, ml-airpls (baseline), ml-regression-theil-sen (robust linear), d3-regression (LOESS). Smoothing splines are the thin spot — hand-roll a natural cubic spline over ml-matrix for the warp model.
- No tiling engine needed at 12 MP. Pattern: viewport canvas blitting an ImageBitmap for pan/zoom + an SVG overlay for draggable markers. ImageJ.JS proves far heavier client-side workloads work.
- Recommended stack totals well under 200 KB of pure-JS dependencies.

This unblocks [What tech stack and distribution for the client-side tool?](007-tech-stack-and-distribution.md).
