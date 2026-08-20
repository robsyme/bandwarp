---
id: 001
title: How do established tools quantify gel/TLC bands?
labels: [wayfinder:research]
status: closed
assignee: claude-research-agent
blocked-by: []
---

## Question

What is established practice for densitometric quantification of TLC/gel bands, so our pipeline stands on known ground rather than invention? Specifically: how do respected tools (ImageJ/Fiji gel analysis, TLC-specific software, published TLC densitometry methods) handle (a) background estimation and subtraction, (b) defining the integration region around a band, (c) the calibration fit against a standard dilution series — linear vs. saturating models, and how saturation is detected/handled, (d) known pitfalls of quantifying from camera photos (vs. flatbed scans): uneven illumination, gamma, channel choice for a green fluorescent background.

Findings go to `wayfinder/research/tlc-densitometry.md`.

## Resolution

Established practice is well documented and maps cleanly onto our design — full findings in [tlc-densitometry.md](../research/tlc-densitometry.md). Highlights:

- Every respected tool (ImageJ Gels, GelAnalyzer, Bio-Rad Image Lab, LI-COR) integrates a lane-profile peak above a baseline; they differ only in baseline method (manual valley-to-valley lines, rolling ball/disk, local border statistics). Gassmann 2009 showed the background choice alone can flip statistical conclusions — the method and parameters must be recorded (our Analysis File should capture them).
- TLC-specific practice (CAMAG scanner/Visualizer, quanTLC) defines a track ROI collapsed to a 1D profile along migration distance and integrates between peak start/end bounds, HPLC-style. 2D spot-footprint integration (qTLC, J. Chem. Educ. 2018) exists and arguably handles irregular lanes better.
- TLC response is inherently nonlinear (Kubelka-Munk scattering physics). CAMAG software fits linear, polynomial, or Michaelis-Menten calibration, with 4-6 same-plate standard levels, bracketing (no extrapolation beyond the standards), r²/CV fit reporting, and RSD <= 2% targets per ICH-mapped validation (Ferenczi-Fodor 2001).
- Camera photos (vs scanners) need: perspective correction via corner marking, flat-field or fitted 2D background (up to ~3x illumination falloff documented), linearization of JPEG sRGB gamma, green/luminance channel with inversion for quenching, and a log-ratio/OD transform. Realistic phone-imaging precision is ~3-5% RSD (TLCyzer, Sci. Rep. 2022).

This unblocks [What is the exact pixel-to-quantity pipeline?](006-pixel-to-quantity-pipeline.md) and sharpens it: the pipeline grilling should decide among the documented baseline methods, 1D-profile vs 2D-spot integration, and linear vs Michaelis-Menten calibration with bracketing.
