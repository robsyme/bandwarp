---
id: 012
title: "Build: scaffold and worker pixel pipeline"
labels: [wayfinder:task]
status: open
assignee:
blocked-by: []
---

## Question

Stand up the app per [What tech stack and distribution for the client-side tool?](007-tech-stack-and-distribution.md): Vite + TypeScript + Preact + vitest + vite-plugin-singlefile, one Web Worker with transferable buffers. Implement the pixel pipeline from [What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md): EXIF-aware decode, corner homography rectification, region crop, sRGB linearization, green-channel OD log-ratio against a fitted 2D background surface. Done when unit tests pass on synthetic fixtures and Gel 4B renders rectified in the browser.
