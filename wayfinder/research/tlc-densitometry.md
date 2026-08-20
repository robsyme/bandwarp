---
title: Established practice for densitometric quantification of TLC/gel bands
labels: [wayfinder:research]
ticket: 001
date: 2026-08-19
---

# TLC/gel band densitometry: established practice

Research for ticket 001. Context: a browser tool quantifying isoflavone bands on TLC plates photographed under 254 nm UV (green fluorescent F254 background, dark quenching bands), calibrated against an on-plate standard dilution series.

## (a) Background estimation/subtraction and band integration in respected tools

Every widely used gel/blot package integrates the area (or volume) of a lane-profile peak above a baseline. The tools differ only in how that baseline is produced, and the literature shows the choice materially changes results.

### ImageJ/Fiji Gel Analyzer (Analyze > Gels)

- Workflow: outline the first lane with the rectangular selection tool, `Select First Lane`, step the box across lanes with `Select Next Lane`, then `Plot Lanes` to get a per-lane profile plot. Lanes are "assumed to be vertical unless the width of the initial selection is at least twice its height". The commands are explicitly modeled on the NIH Image gel plotting macros. (https://imagej.net/ij/docs/menus/analyze.html)
- The lane profile is a column *average* of pixel intensities, not a sum: `GelAnalyzer.java` calls `ProfilePlot.getProfile()`, which uses `getColumnAverageProfile`/`getRowAverageProfile`. For a fixed lane width this differs from a sum only by a constant factor. (https://github.com/imagej/ImageJ/blob/master/ij/plugin/GelAnalyzer.java, https://github.com/imagej/ImageJ/blob/master/ij/gui/ProfilePlot.java)
- Baseline handling is fully manual: the user draws straight lines with the line tool "so that each peak of interest defines a closed area", then clicks inside each closed peak with the wand tool to measure it. This is a user-drawn valley-to-valley linear baseline; the Gel Analyzer applies no automatic background model. `Label Peaks` reports each peak as a percent of total measured peak area. (https://imagej.net/ij/docs/menus/analyze.html)
- `GelAnalyzer.java` also offers an "uncalibrated OD" option: `v = 0.434294481 * log(255/(255-profile[i]))`. (https://github.com/imagej/ImageJ/blob/master/ij/plugin/GelAnalyzer.java)
- The alternative integrated-density route (rectangular ROI + Measure) "usually requires background correction of the image, which can be done using the Process/Subtract Background command" so the background sits near zero before integration. (https://imagej.net/ij/docs/examples/dot-blot/index.html)

### ImageJ Subtract Background (rolling ball)

- "Based on the 'rolling ball' algorithm described in Stanley Sternberg's article, 'Biomedical Image Processing', IEEE Computer, January 1983." Radius guidance: "at least as large as the radius of the largest object in the image that is not part of the background". Options: Rolling Ball Radius, Light Background, Create Background (don't subtract), Disable Smoothing; the implementation "uses an approximation of a paraboloid of rotation instead of a ball". (https://imagej.net/ij/docs/menus/process.html)
- Source confirms a Sliding Paraboloid variant (Michael Schmid, 2007) with 3x3 noise rejection and corner-object protection, plus a "Separate colors" option for RGB. (https://github.com/imagej/ImageJ/blob/master/ij/plugin/filter/BackgroundSubtracter.java; see also https://imagej.net/plugins/rolling-ball-background-subtraction)

### Other gel tools

- GelAnalyzer (gelanalyzer.com): lane profile "is obtained by averaging intensities along each row within its area"; raw volume = sum of (profile - background profile) over the band interval, with an option to clamp negative corrected values to zero (https://gelanalyzer.com/docs/concepts/). Three automatic baseline methods, plus manual baseline-point editing: rolling ball (rolled over the inverted profile; parameter = maximal peak width as % of profile length), morphological (1-D top-hat/opening), and valley-to-valley (baseline anchored at band start/end profile values). (https://gelanalyzer.com/docs/baseline/)
- Bio-Rad Image Lab: per-lane "rolling disk" background; "Disk Size... specifies the size of a hypothetical rolling disk (between 0.5 and 99.5 mm in 0.5 mm increments) that removes background levels along the length of the lane", with <10 mm "usually appropriate", tuned live with a slider in the Lane Profile window. Band density is the total volume under the 3D peak. (https://www.bio-rad.com/webroot/web/pdf/lsr/literature/10000076953.pdf; https://www.bio-rad.com/en-us/applications-technologies/image-analysis-quantitation-for-western-blotting?ID=PQEERM9V5F6X)
- LI-COR Image Studio: background methods are Lane ("a linear connection between areas of minimum brightness between shapes in a lane", i.e. valley-to-valley), Median/Average of a border around each shape (default 3 px, adjustable 1-5 px, restrictable to sides; median recommended to resist outliers), User Defined region, or None. Signal = Total - (Bkgnd x Area). (https://www.licorbio.com/support/contents/software/image-studio/analysis/gel-and-blot-background.html)

### Why the choice matters

Gassmann et al., "Quantifying Western blots: Pitfalls of densitometry" (Electrophoresis 2009;30:1845-1855) found none of 100 surveyed papers described their densitometry sufficiently, and that applying different common quantification procedures (including different background handling) to the same blots produced correlation p-values "ranging from 0.000013 to 0.76". The background method and its parameters must be explicit and reported. (https://doi.org/10.1002/elps.200800720)

## (b) Defining the integration region: boxes, profiles, and 2D spots

The dominant TLC convention is a track ROI collapsed to a 1D profile along the migration axis, integrated between peak start/end bounds above a baseline, exactly like an HPLC chromatogram. Fixed same-size rectangles are more of a gel-blot convention; 2D spot-footprint integration exists and has published advocates.

### Classical scanning densitometry (CAMAG)

- The CAMAG TLC Scanner 4 slit-scans each track with a rectangular light beam (slit length 0.2-12 mm, width 0.1-1.2 mm, 42 combinations; 25-200 um data steps), producing a per-track densitogram ("peak profile from densitometry", PPD). (https://camag.com/product/camag-tlc-scanner-4/)
- visionCATS integrates chromatogram-style: baseline is "the calculated 'zero' line from integration start to integration end" with "lowest slope" the default baseline algorithm (https://visioncats-doc.camag.com/400/glossary.html); peak detection offers Gauss and quadratic-interpolation algorithms with Separation/Sensitivity/Threshold parameters, a Bounds tool restricting integration to "the data between the start and end bound (in Rf unit)", per-peak Start Rf/End Rf, and manual peak add/delete. (https://visioncats-doc.camag.com/400/RegularUserDocumentation/method_analysis_file/evaluation/integration/integration.html)

### Image-based (videodensitometric) tools

- CAMAG TLC Visualizer 3 generates "image profiles by calculating the resulting luminance from the detected RGB values for each pixel line of the track"; luminance vs. Rf is the "peak profile from image" (PPI), and peak height/area from the PPI is used quantitatively. (https://camag.com/product/camag-tlc-visualizer-3/)
- quanTLC (Fichou & Morlock, J. Chromatogr. A 1560 (2018) 78-81, https://doi.org/10.1016/j.chroma.2018.05.027; source at https://github.com/DimitriF/quanTLC) works the same way from a plate photo:
  - Track ROIs come from application geometry (plate width, first-application distance, band width, gap), with a `tolerance` in mm trimmed from each side "to take only the center" of each band; pixels are averaged across the band width per image row, yielding R, G, B and gray (mean RGB) profiles per track. (https://github.com/DimitriF/quanTLC/blob/master/R/f.eat.image.R)
  - Preprocessing options: baseline correction via the R `baseline` package (als, rollingBall, modpolyfit, medianWindow, irls, ...), Savitzky-Golay smoothing, a negative transform for absorbance/quenching images, and ptw/dtw warping. (https://github.com/DimitriF/quanTLC/blob/master/R/Preprocess.function.R)
  - Integration: `pracma::findpeaks` on the chosen channel's profile; each peak gets start/end/max positions, hRf, height, and area = sum of profile values between start and end indices; the user chooses height or area as the response. (https://github.com/DimitriF/quanTLC/blob/master/inst/shinyapps/quanTLC/module_data_integration.R)

### Photo + ImageJ papers, and 2D spot integration

- Hess, "Digitally Enhanced Thin-Layer Chromatography" (J. Chem. Educ. 84 (2007) 842) photographs a UV-illuminated plate and converts it to multispectral scans/densitograms, again a 1D-profile approach. (https://pubs.acs.org/doi/10.1021/ed084p842)
- Popovic & Sherma compared a slit scanner, a videodensitometer, a flatbed scanner, and camera+ImageJ on the same dye system and found ImageJ results comparable, with the same LOQ as the video and flatbed systems "despite strong differences in signal acquisition and signal analysis". (Trends in Chromatography 9 (2014); https://www.semanticscholar.org/paper/eaeb5e19882b21bdb8e07f02183980684ff1f864)
- Mac Fhionnlaoich et al., "A Toolkit to Quantify Target Compounds in Thin-Layer-Chromatography Experiments" (J. Chem. Educ. 95 (2018) 2191, https://pubs.acs.org/doi/10.1021/acs.jchemed.8b00144) is the clearest primary statement on 1D vs 2D. Of Hess's method, rTLC, and ImageJ, they write: "In all three of the above methods, the quantification routine reduces the two dimensional (2D) densitogram to an one dimensional (1D) array for calculation purposes. This loss of dimensional information limits the achievable accuracy and promotes user errors", noting rTLC/ImageJ also "require a consistent lane width". Their qTLC tool has the user draw rectangles around lanes, subdivides them into bands, segments the spot footprint by a minimum peak prominence ('MinPeakProm') with band boundaries set by a 'Divisor' value, shows the recognized 2D area as an overlay, and sums intensity over the spot footprint. (preprint: https://s3-eu-west-1.amazonaws.com/itempdf74155353254prod/5917330/A_Toolkit_to_Quantify_Target_Compounds_in_Thin_Layer_Chromatography_Experiments_v2.pdf)

## (c) Calibration against a dilution series

### Nonlinearity is expected, not an anomaly

TLC densitometry measures diffuse reflectance from a scattering sorbent layer, so Beer-Lambert linearity does not hold; the governing relation is the Kubelka-Munk function (Goldman & Goodall, Anal. Chim. Acta, https://www.sciencedirect.com/science/article/abs/pii/S0003267001847000). Spangenberg showed the classical KM form assumes isotropic scattering and diffuse illumination and needs extension for collimated scanners ("Does the Kubelka-Munk Theory Describe TLC Evaluations Correctly?", JPC 2006, https://doi.org/10.1556/jpc.19.2006.5.1), and that fluorescence data need a KM-based transform to become linear in mass (JPC 2004, https://doi.org/10.1556/jpc.17.2004.3.1). Curvature arises because analyte in deeper layers contributes unequally to reflectance. (https://www.sciencedirect.com/topics/agricultural-and-biological-sciences/densitometry)

### What the reference software fits

- CAMAG visionCATS documents "single level calibration, and multi level calibration via linear, polynomial or Michaelis-Menten regression" (https://visioncats-doc.camag.com/400/glossary.html), and the product page says the software selects the "best fitting calibration model" among linear, polynomial, and Michaelis-Menten, alongside a System Suitability Test. (https://camag.com/product/software/)
- Two Michaelis-Menten saturation variants are documented: "Michaelis-Menten 1" (forced through the origin) and "Michaelis-Menten 2" (not forced through the origin, used for peak-area work). Fit quality is reported as the regression's coefficient of variation (deviation of calibration points from the fitted function) and correlation coefficient. (http://hptlcmethods.cloudapp.net/204/glossary.html)
- In practice: linear over a narrow bracket, 2nd-order polynomial over a limited range, Michaelis-Menten across the saturating range.

### Practice and QC

- Standard workflow per the Sherma & Fried-derived overview: "Standard zones are applied to a plate to create a calibration curve of peak area or height versus weight through linear, nonlinear, polynomial, or Michaelis-Menten regression, and weights of bracketed sample zones on the plate are interpolated from the curve". Two QC essentials: samples must be bracketed by the standard amounts (never extrapolate into the saturating region), and standards run on the same plate as samples to cancel plate-to-plate and development variability, which is why multi-level calibration is redone per plate. (https://www.sciencedirect.com/topics/agricultural-and-biological-sciences/densitometry)
- Typical published HPTLC practice: 4-6 calibration levels, often triplicate tracks per level, regression coefficient >= 0.99 (example method: https://li05.tci-thaijo.org/index.php/IJHS/article/view/256).
- Validation reference for planar chromatography: Ferenczi-Fodor, Végh, Nagy-Turák, Renger & Zeller, "Validation and quality assurance of planar chromatographic procedures in pharmaceutical analysis", J. AOAC Int. 2001;84:1265-1276, mapping ICH-style linearity, range, LOD/LOQ, repeatability and intermediate precision onto TLC; HPTLC assays commonly target repeatability RSD <= 2%. (https://pubmed.ncbi.nlm.nih.gov/11501931/)
- Saturation detection in practice: residual/lack-of-fit analysis and visible flattening of response at high loads. The accepted responses are to dilute samples back into the linear range, or to fit a nonlinear function (limited-range polynomial or Michaelis-Menten) rather than force a straight line.

## (d) Pitfalls of quantifying from camera photos

### Uneven illumination and flat-field correction

Handheld UV lamps plus lens vignetting give spatially non-uniform brightness that a scanner's controlled geometry avoids. The SPECTACLE study of seven consumer cameras measured "flat-field correction factors varying by up to 2.79 over the field of view", i.e. nearly 3x falloff from optics alone (Burggraaff et al., Opt. Express 2019, https://doi.org/10.1364/OE.27.019075; https://arxiv.org/abs/1906.04155). Remedies in use: divide by a blank/flat-field image taken under the same illumination, or a "pseudo-flat field" from a Gaussian-blurred copy (ImageJ docs, https://imagej.net/imaging/image-intensity-processing); blank-plate background subtraction (Yu et al., J. Pharm. Biomed. Anal. 2016, https://doi.org/10.1016/j.jpba.2016.03.018); or fitting a 15-coefficient 2D polynomial to the plate background and subtracting it, as the TLCyzer smartphone app does (Hauk et al., Sci. Rep. 2022, https://doi.org/10.1038/s41598-022-17527-y; open access: https://pmc.ncbi.nlm.nih.gov/articles/PMC9352711/).

### Camera nonlinearity, auto-exposure, JPEG

- Burggraaff et al. found "high linearity in RAW but not JPEG data" (RAW linearity r >= 0.996-0.999 across phones and a DSLR); JPEG carries the sRGB tone curve, so pixel value is not proportional to radiance. (https://doi.org/10.1364/OE.27.019075)
- Rodríguez Muiña et al. (Chem. Biomed. Imaging 2025): "device-dependent variability, nonlinear signal encoding, and the absence of standardized workflows hinder reproducibility and quantification accuracy"; they prescribe gamma inversion (linearization) and fixed, manually optimized imaging parameters, and found gamma-encoded channels required nonlinear calibration models. (https://doi.org/10.1021/cbmi.5c00056; https://pmc.ncbi.nlm.nih.gov/articles/PMC12648430/)
- Auto-exposure and auto-white-balance change the transfer function between shots: TLCyzer computes luminance from linearized R, G, B, and the 2LabsToGo system fixes ISO, shutter, and AWB rather than trusting automatics (Sing et al., Anal. Chem. 2022, https://doi.org/10.1021/acs.analchem.2c02339).

### Channel choice and the absorbance-like transform

- For dark bands on the green F254 glow, published tools use green-weighted luminance or a user-selected channel: TLCyzer converts to grayscale Y = 0.2126R + 0.7152G + 0.0722B after linearization (https://doi.org/10.1038/s41598-022-17527-y); quanTLC extracts R, G, B, and gray densitograms with a "Negatif" inversion for quenching/absorbance images and offers linear or quadratic calibration (https://doi.org/10.1016/j.chroma.2018.05.027; https://github.com/DimitriF/quanTLC).
- The log/OD transform is codified in ImageJ: "Uncalibrated OD = log10(255 / PixelValue)" (https://imagej.net/ij/docs/menus/analyze.html), with true OD calibration via a step tablet and Rodbard fit (https://imagej.net/ij/docs/examples/calibration/).

### Geometry

Scanners image at fixed perpendicular geometry; photos need perspective correction. TLCyzer has the user mark the four plate corners, removes the perspective warp, and crops before quantification. (https://doi.org/10.1038/s41598-022-17527-y)

### Fluorescence-quenching response and realistic expectations

Quenching densitometry at 254 nm is quantitative but not Beer-Lambert-linear (scattering layer; KM-type behavior). Simon et al., imaging F254 quenching with a scientific CCD, had to characterize the linear dynamic range explicitly (Analyst 2001, 126, 446-450, https://doi.org/10.1039/B006799G). Phone imaging underperforms a densitometer: Gad et al. measured LODs of 1.6 and 97.8 ug/spot by phone vs. 0.8 and 1.1 ug/spot on a CAMAG Scanner 3, with narrower working ranges (RSC Adv. 2021, https://doi.org/10.1039/d1ra01346g). Hauk et al. validated ~2.8-4.5% RSD as realistic phone-imaging precision and flagged sub-1% RSD claims as "surprising". (https://doi.org/10.1038/s41598-022-17527-y)

## Implications for our tool

1. Model the pipeline on the TLC convention, not the gel-blot one: per-lane ROI collapsed to a 1D profile along the migration axis, baseline-corrected, with each band integrated between explicit start/end bounds. This matches CAMAG PPI, quanTLC, and the ImageJ Gels workflow the field already trusts. Keep the bounds visible and editable (manual correction is our reliable floor, same as ImageJ's hand-drawn baselines and visionCATS's manual peak editing).
2. Offer a small, explicit set of baseline options rather than one hidden default; valley-to-valley (linear baseline between the minima flanking each band) plus a rolling-ball option covers what GelAnalyzer, LI-COR, and Image Lab do. Record the method and parameters in the Analysis File: Gassmann et al. showed the background choice alone can flip conclusions, so provenance is part of correctness.
3. For band intensity on the green fluorescent background: correct perspective first (corner marking, as TLCyzer does), then work on linearized green-channel or luminance data, invert (quenching means signal = darkness), and prefer an absorbance-like transform such as log10(I_local_background / I_band). Expect gamma-encoded JPEG input; either linearize with an assumed sRGB curve or accept that the calibration fit absorbs residual encoding nonlinearity, and say so.
4. Flat-field handling is not optional for photos: illumination falloff of up to ~3x is documented for consumer cameras before the UV lamp's own unevenness. Since we won't have blank-plate frames, fit a smooth 2D background surface to the inter-lane/inter-band plate regions (TLCyzer's polynomial-surface approach) and normalize band intensities to their local background, which the log-ratio transform does implicitly.
5. Fit calibration per compound per plate against the on-plate dilution series, and support both linear and a saturating model (Michaelis-Menten, ideally the not-through-origin variant), choosing by fit quality as visionCATS does. Report r^2/CV, plot the curve with residuals, warn when a sample band falls outside the bracketed standard range, and never extrapolate above the top standard.
6. Set honest expectations and QC: 4-6 standard levels is normal practice, same-plate calibration is what cancels plate-to-plate variation (our design already does this), and ~3-5% RSD is realistic for phone-photo quantification. Nonlinearity at high loads is physics (Kubelka-Munk), not a bug; the tool should surface it rather than mask it.
