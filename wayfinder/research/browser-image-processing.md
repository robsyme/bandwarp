# Research: What image processing is realistic fully client-side in the browser?

Ticket: [002](../tickets/002-browser-image-processing-capability.md)
Date: 2026-08-20

Scope: a zero-install, static-hosted browser tool that loads one ~4000x3000 JPEG of a
TLC plate, extracts per-lane intensity profiles, detects peaks, fits smooth curves for
warp modelling and calibration, and renders an interactive annotated overlay.

Short answer: everything this tool needs is comfortably within reach of plain
JavaScript + typed arrays + a Web Worker, with small pure-JS libraries for peak
detection and fitting. No WASM dependency is required, and no tiling engine is needed
at 12 megapixels.

## (a) Pixel-level access and processing

### The APIs

- `ImageData` exposes canvas pixels as a `Uint8ClampedArray` in RGBA order, one byte
  per channel ([MDN: ImageData](https://developer.mozilla.org/en-US/docs/Web/API/ImageData)).
  A 4000x3000 image is 12,000,000 pixels = 48 MB of RGBA, or 12 MB once converted to a
  single-channel `Float32Array`/`Uint8Array` intensity plane (48 MB as Float32). These
  are ordinary allocations for a desktop browser tab.
- `createImageBitmap()` decodes a `Blob` (e.g. a `File` from an `<input type=file>`)
  asynchronously, off the main thread, with optional resize during decode, and is
  available inside workers. Baseline "widely available" since September 2021
  ([MDN: createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)).
  This is the right way to read the JPEG: no `<img>` element, no synchronous decode jank.
- `OffscreenCanvas` decouples canvas rendering from the DOM and works inside Web
  Workers (`transferControlToOffscreen()` or `new OffscreenCanvas(w, h)`), Baseline
  since March 2023
  ([MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)).
  Draw the decoded `ImageBitmap` onto an OffscreenCanvas in a worker, call
  `getImageData()`, and all pixel work happens off the main thread.
- `ArrayBuffer`s move between the main thread and workers as *transferable objects* --
  zero-copy ownership transfer rather than structured clone
  ([MDN: Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)).
  So shipping a 12-48 MB buffer worker<->main costs microseconds, not a copy.
- `SharedArrayBuffer` (needed for multi-threaded WASM and shared-memory workers)
  requires the page to be cross-origin isolated via `Cross-Origin-Opener-Policy` and
  `Cross-Origin-Embedder-Policy` response headers
  ([MDN: SharedArrayBuffer, security requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)).
  Static hosts like GitHub Pages cannot set custom headers; the
  [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) shim exists
  precisely for that case, but it adds a reload on first visit. For a zero-fuss tool,
  design so SharedArrayBuffer is *not* needed (one worker, transferables).

### Canvas size limits at 4000x3000

Browsers cap canvas dimensions and total area. Measured limits (from the
[canvas-size](https://github.com/jhildenbiddle/canvas-size) project and
[PQINA's write-up of the Safari error](https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/)):
Safari/iOS Safari historically cap canvas *area* at 16,777,216 px (4096x4096) -- the
error string is quoted verbatim in real bug reports, e.g.
[react-pdf #1149](https://github.com/wojtekmaj/react-pdf/issues/1149) -- while Chrome
allows 268,435,456 px and Firefox 472,907,776 px
([html2canvas #3169](https://github.com/niklasvh/html2canvas/issues/3169),
[canvas-size test results](https://jhildenbiddle.github.io/canvas-size/#/?id=test-results)).

A 4000x3000 canvas is 12,000,000 px -- **under the strictest (Safari) area limit**, so
the whole plate photo fits in a single canvas on every mainstream browser, including
iPad Safari. Phone cameras above ~16 MP would breach the Safari limit; the safe pattern
is to probe (canvas-size library) or downscale during `createImageBitmap` decode when
`width*height > 16,777,216`. iOS also caps *total* canvas memory per page (~224-384 MB
depending on version, per
[Apple developer forum threads](https://developer.apple.com/forums/thread/112218) and
[PQINA](https://pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/)), so
avoid keeping many full-size canvases alive.

### Practical performance

Whole-image passes in plain JS over typed arrays are single-digit-to-tens of
milliseconds per pass at 12 MP on a desktop machine (a grayscale conversion is one
multiply-add per pixel over a 48 MB array; modern engines stream such loops at memory
bandwidth). This is estimation from arithmetic rather than a published benchmark, but
the existence proofs for far heavier browser workloads are strong primary sources:

- Adobe shipped Photoshop on the web via WASM; their write-up notes SIMD gave their
  Halide kernels "a 3-4x speedup on average and in some cases a 80-160x speedup" and
  that multithreaded WASM was a hard requirement -- for *Photoshop-scale* pipelines
  ([web.dev: Photoshop's journey to the web](https://web.dev/articles/ps-on-the-web)).
- Google's [Squoosh](https://github.com/GoogleChromeLabs/squoosh) does full-image codec
  work (multi-megapixel encode/decode) in workers with WASM codecs, entirely client-side.
- ImageJ itself runs in the browser (see section d).

Our per-frame workload (lane profile = column sums over a lane ROI, maybe 200x2000 px)
is thousands of times smaller than a whole-image pass. Whole-image operations
(grayscale, background estimation, one blur) happen once per photo load, in a worker,
so even 100-300 ms would be invisible. Conclusion: **plain JS typed-array code in one
Web Worker is sufficient; WASM is an optimization we are unlikely to need.**

## (b) OpenCV.js and other WASM libraries

### OpenCV.js

- Official builds compile to WASM (`--build_wasm`), with optional `--simd`
  (experimental) and `--threads` (browser-only, needs cross-origin isolation);
  `--disable_single_file` splits the base64-embedded WASM into a separate `.wasm` file
  to shrink total size
  ([OpenCV docs: Build OpenCV.js](https://docs.opencv.org/4.x/d4/da1/tutorial_js_setup.html)).
- Size: the stock build is ~7.6-9 MB (8.1 MB plain WASM, 9.0 MB threads+SIMD reported in
  [opencv-js-wasm](https://github.com/ttop32/opencv-js-wasm); ~6 MB `.wasm` reported on
  the [OpenCV forum](https://answers.opencv.org/question/229032/opencv_jswasm-is-too-large/)).
  Custom builds that whitelist modules get to ~4.2 MB
  ([Lambda IT build write-up](https://lambda-it.ch/blog/build-opencv-js)) or ~2 MB with
  an aggressive `opencv_js.config.py` whitelist
  ([intel/webml-polyfill #1348](https://github.com/intel/webml-polyfill/issues/1348)).
- What it would buy us over hand-rolled code: `cv.remap`/`cv.warpPerspective` (applying
  a dense warp field with proper interpolation), `morphologyEx` (rolling-ball-style
  background via top-hat), `GaussianBlur`/`medianBlur`, adaptive threshold, contour
  finding. That is genuinely useful -- but each of these is a well-understood algorithm
  over a single grayscale plane, and we need only a handful of them. A bilinear `remap`
  is ~30 lines of JS.

Verdict: 7-9 MB (or a bespoke 2-4 MB build we then own the Docker/Emscripten toolchain
for) is a poor trade for one or two kernels. Keep it as a fallback if dewarp resampling
quality becomes a problem.

### image-js (pure JS/TS, no WASM)

[image-js](https://github.com/image-js/image-js) is "advanced image processing and
manipulation in JavaScript" aimed explicitly at scientific images, maintained by
[Zakodium](https://www.zakodium.com) (the mljs/cheminfo people). The README documents:
JPEG/PNG/TIFF decode (8/16-bit, so it also covers 16-bit TIFFs from gel imagers, which
canvas decoding cannot), greyscale, Gaussian blur, custom-kernel convolution, Sobel,
thresholding (Otsu, triangle, ...), morphology (erode, open, close, ...), histograms,
and an ROI manager ([README](https://github.com/image-js/image-js);
[npm](https://www.npmjs.com/package/image-js), v1.7.0 published 2026-07-08 -- the
TypeScript rewrite has shipped as 1.x). Pure JS means no WASM loading ceremony, tree-
shakeable, and it runs in a worker trivially. This is the natural "step up" from
hand-rolled loops if we want Otsu/top-hat/ROI without writing them.

### wasm-vips

[wasm-vips](https://github.com/kleisauke/wasm-vips) is libvips compiled to WASM
(v0.0.18, self-described "still under early development"). It requires WASM SIMD +
exception handling (Baseline 2023: Chrome 95+, Firefox 100+, Safari 16.4+) and needs
COOP/COEP headers for its threading
([README](https://github.com/kleisauke/wasm-vips);
[libvips announcement](https://www.libvips.org/2020/09/01/libvips-for-webassembly.html)).
It is a streaming resize/convert pipeline library, not an analysis toolkit -- wrong
shape for us, and the header requirement conflicts with dumb static hosting.

### Pyodide/SciPy, custom WASM

Pyodide would give us `scipy.interpolate`/`scipy.signal` verbatim but costs tens of MB
of runtime download plus multi-second startup ([pyodide.org](https://pyodide.org/)) --
disqualifying for a "just open the page" tool. Custom Rust/AssemblyScript WASM is the
right escape hatch *if profiling ever shows a hot loop*, not a starting point.

## (c) Curve/spline fitting in JavaScript

The mljs ecosystem (same maintainers as image-js; actively released through mid-2026)
covers nearly everything, verified against the npm registry on 2026-08-20:

- **Nonlinear least squares**: [ml-levenberg-marquardt](https://github.com/mljs/levenberg-marquardt)
  (v5.1.0, 2026-07-31) -- fit arbitrary parameterized functions (sums of Gaussians for
  band profiles; saturating calibration curves). Jacobian by finite differences
  ([docs](https://mljs.github.io/levenberg-marquardt/)).
- **Peak detection**: [ml-gsd](https://www.npmjs.com/package/ml-gsd) ("global spectra
  deconvolution", v14.2.2, 2026-08-03) -- finds peaks via Savitzky-Golay first/second
  derivatives and inflection points, returning position, width, and second-derivative
  sharpness. Built for exactly our shape of problem (1-D intensity profiles); derivative-
  based detection is inherently baseline-insensitive.
- **Smoothing/derivatives**: [ml-savitzky-golay-generalized](https://www.npmjs.com/package/ml-savitzky-golay-generalized)
  (v5.0.0, 2026-04-18), the border-artifact-free variant used inside ml-gsd.
- **Baseline estimation**: [ml-airpls](https://www.npmjs.com/package/ml-airpls)
  (v2.2.0, 2026-04-20) implements airPLS iterative baseline correction;
  [ml-spectra-processing](https://www.npmjs.com/package/ml-spectra-processing)
  (v14.33.0) is the grab-bag of x/y array utilities under all of these.
- **Linear/polynomial/robust regression**: [ml-regression](https://github.com/mljs/regression)
  (simple linear, polynomial), plus
  [ml-regression-theil-sen](https://www.npmjs.com/package/ml-regression-theil-sen)
  (v3.0.0) for outlier-robust linear fits -- useful for Rf calibration against
  reference lanes without letting one bad band drag the fit.
- **LOESS**: [d3-regression](https://github.com/HarryStevens/d3-regression) (v2.2.0,
  published 2026-07-07) includes `regressionLoess` alongside linear/poly/log/exp;
  [yongjun21/loess](https://github.com/yongjun21/loess) is a direct port of Cleveland,
  Grosse & Shyu's 1992 C implementation (unmaintained since 2017 but the algorithm is
  frozen); [@stdlib/stats-lowess](https://www.npmjs.com/package/@stdlib/stats-lowess)
  is the stdlib take.
- **Smoothing splines**: the thinnest spot in the ecosystem.
  [@umn-latis/simple-smoothing-spline](https://www.npmjs.com/package/@umn-latis/simple-smoothing-spline)
  implements a ridge-penalized cubic smoothing spline but is small and last published
  2021. For the warp model specifically, we control the knots (one control point per
  detected reference band), so *interpolating* or least-squares-fitted low-order
  polynomials / natural cubic splines through robustly-fitted points -- built from
  [ml-matrix](https://github.com/mljs/matrix) least squares in a few dozen lines -- is
  more predictable than a generic smoothing-spline dependency. LOESS (above) covers the
  "smooth curve through noisy points" case where we don't want to pick knots.

Maturity summary: mljs packages are the de-facto scientific-JS stack (they power the
cheminfo NMR/mass-spec web tools), have current 2026 releases, and are all MIT, pure
JS, worker-safe. Nothing here requires WASM.

## (d) Interactive overlay rendering at ~12 MP

### Is tiling (OpenSeadragon-style) needed? No.

Tiling engines exist for images that cannot fit in one texture/canvas. Our worst case
(4000x3000) fits a single canvas in every browser (section a). OpenSeadragon itself
supports plain single images as a tile source and only warns that "using the Image Tile
Source for big images will have a performance impact", recommending pyramids for
genuinely large files ([OpenSeadragon Image Tile Source example](https://openseadragon.github.io/examples/tilesource-image/)).
The tools that do use multiscale machinery target gigapixel data:

- **Viv/Avivator** (HMS): WebGL multi-channel rendering of pyramidal OME-TIFF/Zarr as
  deck.gl layers; published in Nature Methods 2022
  ([hms-dbmi/viv](https://github.com/hms-dbmi/viv)). Built for multiplexed microscopy,
  i.e. many-gigabyte images -- machinery we don't need.
- **Kaibu** (ImJoy team): image annotation web app "built with OpenLayers and
  itk-vtk-viewer" ([imjoy-team/kaibu](https://github.com/imjoy-team/kaibu)) -- again a
  map-style tiled renderer, chosen for whole-slide-scale data.
- **ImageJ.JS**: the full Java ImageJ compiled to WASM/JS via CheerpJ, running
  client-side in the browser for 1,000+ daily users
  ([imjoy-team/imagej.js](https://github.com/imjoy-team/imagej.js),
  [imagej.net page](https://imagej.net/software/imagej-js)) -- the strongest proof that
  serious scientific image analysis is viable fully client-side, and simultaneously a
  demonstration of the UX cost of dragging a desktop app into a tab rather than
  building web-native.

### Recommended rendering pattern

MDN's canvas optimization guidance maps directly onto our UI
([MDN: Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)):

1. **Base layer**: one `<canvas>` sized to the viewport (x devicePixelRatio), redrawn
   per frame with a single `ctx.drawImage(imageBitmap, sx, sy, sw, sh, 0, 0, w, h)`
   from the full-resolution `ImageBitmap`. `drawImage` from an ImageBitmap is a
   GPU-side blit; one call per frame at 60 fps is trivially cheap. Use
   `getContext('2d', { alpha: false })` on the base layer, integer coordinates, and
   `requestAnimationFrame` (all explicit MDN recommendations). Pan/zoom = change the
   source rectangle; no tiles, no pyramid.
2. **Annotation layer**: MDN recommends layered canvases for scenes with independent
   static/dynamic parts; the equivalent (and better, for us) is an **SVG overlay**
   positioned on top of the canvas. Lane boundaries, warp curves (`<path>`), and band
   markers become DOM nodes with native pointer events -- draggable markers are plain
   pointerdown/move/up handlers, hit-testing is free, accessibility and hover states
   come along. At tens-to-hundreds of markers, SVG re-render cost is negligible; SVG
   overlays are an established pattern even inside tiling viewers
   ([OpenSeadragon svg-overlay plugin](https://github.com/openseadragon/svg-overlay)).
   If we ever exceed ~1,000 interactive shapes, [Konva](https://konvajs.org/) provides
   canvas-based draggable shapes with an SVG-like scene graph.
3. **Processing thread**: decode with `createImageBitmap(file)` and do all pixel math
   in one Web Worker (OffscreenCanvas + `getImageData`), posting typed-array results
   (profiles, peaks, warp grids) back as transferables. The main thread only ever
   draws and handles input -- this is what "no jank" reduces to.

WebGL is not needed for a single static photo + vector overlay; it earns its
complexity only for per-frame per-pixel shading (e.g. live contrast remap of 16-bit
multichannel data, Viv's use case). A CSS filter or a one-off worker recompute covers
our brightness/contrast needs.

## Implications for our tool

1. All four capabilities are green. The workload (one 12 MP photo, 1-D profiles,
   dozens of peaks, a handful of curve fits) sits far below what shipping products
   (Photoshop web, ImageJ.JS, Squoosh) already do client-side.
2. Stay off SharedArrayBuffer, threads, and COOP/COEP-requiring libraries so the tool
   deploys as dumb static files (GitHub Pages/S3) with zero configuration.
3. Guard the one real platform edge: Safari's 16,777,216 px canvas area cap. Downscale
   at decode time (`createImageBitmap` resize) when the photo exceeds it; 4000x3000 is
   safe as-is.
4. Skip OpenCV.js (7-9 MB for two kernels we can write) and wasm-vips (early-stage,
   wrong shape, needs COOP/COEP). Revisit only if dewarp resampling quality demands
   `cv.remap`.

### Recommended minimal stack

| Concern | Choice |
| --- | --- |
| Decode + pixel access | `createImageBitmap` -> `OffscreenCanvas`/`getImageData` in one Web Worker; `Float32Array` intensity plane; transferables for messaging |
| Whole-image ops (grayscale, blur, threshold, morphology, 16-bit TIFF later) | hand-rolled typed-array loops first; [image-js](https://github.com/image-js/image-js) (pure JS, MIT, scientific) when an op is nontrivial |
| Smoothing + peak detection | [ml-savitzky-golay-generalized](https://www.npmjs.com/package/ml-savitzky-golay-generalized) + [ml-gsd](https://www.npmjs.com/package/ml-gsd); [ml-airpls](https://www.npmjs.com/package/ml-airpls) for profile baseline |
| Fitting (bands, calibration, warp) | [ml-levenberg-marquardt](https://github.com/mljs/levenberg-marquardt) for nonlinear fits; [ml-regression-theil-sen](https://www.npmjs.com/package/ml-regression-theil-sen) / [d3-regression](https://github.com/HarryStevens/d3-regression) LOESS for robust/smooth curves; low-order polynomial or natural cubic spline via [ml-matrix](https://github.com/mljs/matrix) for the warp model |
| Rendering | viewport canvas (`alpha:false`) drawing an `ImageBitmap` + SVG overlay for lanes/curves/draggable markers; no tiling library |

Total added payload: well under 200 KB of pure-JS dependencies, versus 7-9 MB for the
OpenCV.js route.
