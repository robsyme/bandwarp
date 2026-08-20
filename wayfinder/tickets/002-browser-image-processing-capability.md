---
id: 002
title: What image processing is realistic fully client-side in the browser?
labels: [wayfinder:research]
status: open
assignee:
blocked-by: []
---

## Question

The tool must run fully client-side on multi-megapixel plate photos. What are the realistic options and limits for: (a) pixel-level access and processing (Canvas/ImageData, typed arrays, workers), (b) heavier lifting via OpenCV.js or other WASM libraries — size, load time, what they buy us for profile extraction, peak detection, and smoothing, (c) curve/spline fitting in JS for warp modelling and calibration fits, (d) reading large JPEGs and doing interactive overlays (zoom/pan, draggable markers) without jank? What do comparable in-browser scientific-image tools use?

Findings go to `wayfinder/research/browser-image-processing.md`.
