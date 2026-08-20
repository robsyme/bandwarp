---
title: Isoflavone plate quantification tool
labels: [wayfinder:map]
status: open
---

# Isoflavone plate quantification tool

## Destination

A working, fully client-side browser tool the Operator (a scientist, no dev environment) uses to analyse one Plate Photo at a time: label Lanes and the Standard Lanes' Dilution Series, mark or correct Bands (manual path is the reliable floor, auto-detection is an assist), have Warp modelled so each Band is assigned to the correct Compound, get per-Compound Calibration Curves from the on-plate standards, and walk away with a calibrated results CSV plus a reloadable JSON Analysis File. Feasibility is proven on the images in `examples/` before the tool is specced and built around it.

## Notes

- Execution is folded into this map (charting session, 2026-08-20): feasibility prototypes first, then the tool is built along the way — not just a spec hand-off.
- Domain vocabulary lives in [CONTEXT.md](../CONTEXT.md); consult and sharpen it (`/domain-modeling`) whenever working a ticket. Default skills for tickets: `/grilling` + `/domain-modeling`; prototypes via `/prototype`; research via `/research`.
- Scope settled during charting: client-side only (no server, no upload); tens of plates total, arriving in small batches; one Photo per Plate; Operator labels standards and lanes; Dilution Series values and Compound names supplied by the Operator; lane labels are free text; calibrated quantities via on-plate standards are the point of the tool.
- Example images: `examples/` — three plates, each as an unlabelled photo plus an annotated copy (lane codes, dilution series, "METHYL JASMONATE"). Gel 4B shows the worst warping.
- Tracker: local markdown. Tickets are files in `wayfinder/tickets/`, frontmatter carries `labels`, `status` (open/closed), `assignee` (the claim), and `blocked-by` (ticket ids). Frontier = open, unassigned, all blockers closed. Resolutions are appended to the ticket file under `## Resolution`.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [How do established tools quantify gel/TLC bands?](tickets/001-how-do-established-tools-quantify-bands.md) — lane-profile peak integration above a recorded baseline is universal; TLC calibration is inherently nonlinear (linear/polynomial/Michaelis-Menten with bracketing, 4-6 standard levels); camera photos need gamma linearization, flat-field, and an OD-like transform; ~3-5% RSD is realistic.
- [What image processing is realistic fully client-side in the browser?](tickets/002-browser-image-processing-capability.md) — everything we need works in plain JS + typed arrays + a Web Worker; skip OpenCV.js/WASM, use image-js + mljs fitting libraries (<200 KB total), canvas-blit pan/zoom with an SVG marker overlay.
- [How should Warp be modelled and Band identities assigned?](tickets/004-warp-model-and-identity-assignment.md) — scaled shared warp (one drift shape per plate, per-row amplitude), greedy row-linking as initializer, manual add/remove/rename plus draggable lane positions as the correction floor; user-confirmed on the prototype, and the demo's pure `WarpAssign` module lifts into the tool.
- [Can lanes and bands be auto-detected well enough to assist?](tickets/003-band-autodetection-feasibility.md) — yes, user-confirmed: origin-anchored lanes unioned with band-mass peaks (no pitch grid), 2D flat-field, noise-adaptive thresholds, warp-guided rescue with rescued bands flagged; faintest standards may go undetected since calibration anchors on the stronger levels.
- [What is the exact pixel-to-quantity pipeline?](tickets/006-pixel-to-quantity-pipeline.md) — sRGB-linearized green channel as log-ratio OD against a fitted local background; corner-marking rectification first; 1D lane-profile area between valley bounds with a visible valley-to-valley baseline; per-compound linear + Michaelis-Menten calibration auto-selected by fit, censored ("> top") above the top standard; fixed QC flag set with provenance recorded.
- [How will we validate that quantification is accurate?](tickets/005-validation-of-quantification-accuracy.md) — internal validation (no external ground truth exists): standards-as-unknowns leave-one-out plus replicate-lane agreement on the existing photos, ±15% recovery / <=10% RSD to pass, screening-grade labelling; future plates carry outer-lane standards for per-plate self-validation; execution charted as [Run the validation protocol on the example plates](tickets/009-run-validation-protocol.md).
- [What tech stack and distribution for the client-side tool?](tickets/007-tech-stack-and-distribution.md) — Vite + TypeScript + Preact shell over pure TS analysis modules (vitest); single-file build doubling as the GitHub Pages artifact; only dependency ml-levenberg-marquardt; one Web Worker for pixel work; provisioning charted as [Create the GitHub repo and Pages hosting](tickets/010-repo-and-pages.md).
- [What is the Operator's step-by-step workflow?](tickets/008-operator-workflow.md) — the Workspace layout (plate center-stage, step checklist left, context panel right) over the confirmed nine-step flow: Photo, Corners, Region, Lanes, Compounds, Bands, Profiles, Calibration, Results.
- [What exactly goes in the Analysis File and the results CSV?](tickets/011-file-formats.md) — Analysis File embeds the original photo for self-contained provenance; CSV is the full lane x compound grid (`nd` for absent bands), censored amounts stay empty with `amount_display` carrying "> top", standards appear as ordinary rows so recovery is checkable in the CSV.
- [Build: scaffold and worker pixel pipeline](tickets/012-build-scaffold-pixel-pipeline.md) — done: Vite/TS/Preact app at repo root, pure analysis modules with 11 tests (rectify, sRGB, background/OD with the flat-field property verified), inlined worker with transferable buffers, dev harness rendering Gel 4B rectified + OD in the browser.
- [Build: port detection and warp modules](tickets/013-build-detection-and-warp.md) — done: signal.ts (scipy-parity helpers), warp.ts (scaled-shared-warp ALS + three-model fit), detect.ts (origin-anchored lanes, adaptive peaks, warp rescue); byte-identical-input parity fixtures prove the port matches the Python reference on all three plates; 28 tests green.

## Not yet specified

Nothing — every decision is made or ticketed. The route to the destination is the open tickets: formats ([What exactly goes in the Analysis File and the results CSV?](tickets/011-file-formats.md)), repo provisioning ([Create the GitHub repo and Pages hosting](tickets/010-repo-and-pages.md)), the build chain (scaffold → detection/warp port → workspace shell → quantification/exports → release, tickets 012-016), and the acceptance test ([Run the validation protocol on the example plates](tickets/009-run-validation-protocol.md), behind the quantification build).

## Out of scope

- Before/after (Bef/Aft, elicitation) plate comparison — happens downstream in Excel/R; this tool produces one clean calibrated table per Plate.
- Any server-side processing, hosting infrastructure, accounts, or multi-user features.
