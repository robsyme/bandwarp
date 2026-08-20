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

- [What image processing is realistic fully client-side in the browser?](tickets/002-browser-image-processing-capability.md) — everything we need works in plain JS + typed arrays + a Web Worker; skip OpenCV.js/WASM, use image-js + mljs fitting libraries (<200 KB total), canvas-blit pan/zoom with an SVG marker overlay.

## Not yet specified

- Analysis File JSON schema and results CSV column layout — waits on the data model settling through the pipeline and workflow tickets.
- How the auto-detection assist integrates into the UI (when it runs, how corrections feed back) — waits on the detection prototype's results.
- Photo preprocessing: rotation, plate-region cropping, illumination/flat-field correction — waits on the densitometry research and detection prototype showing what's actually needed.
- The build itself: implementation tickets get charted once the workflow, pipeline, and stack decisions close.
- Validation protocol details — waits on the accuracy grilling.

## Out of scope

- Before/after (Bef/Aft, elicitation) plate comparison — happens downstream in Excel/R; this tool produces one clean calibrated table per Plate.
- Any server-side processing, hosting infrastructure, accounts, or multi-user features.
