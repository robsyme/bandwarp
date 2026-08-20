// Auto-detection on the Operator-marked analysis Region of the rectified
// plate. Mirrors the Python reference's signal prep (extract_bands.py):
// green channel, wide 2D background, fractional darkness — run at ~700 px
// width, the scale the parity fixtures proved, then mapped back to
// rectified-image coordinates.

import { estimateBackground } from "./background";
import { detectOnSignal } from "./detect";
import type { Band } from "./warp";

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RegionDetection {
  /** Lane centre x positions in rectified px, left to right. */
  lanes: number[];
  /** Lane pitch in rectified px. */
  unit: number;
  /** Origin (spotting) row in rectified px. */
  yOrigin: number;
  /** Detected bands; `lane` indexes into `lanes`, `y` in rectified px. */
  bands: Band[];
}

const DETECT_W = 700;

/** Integer-binned area average of the green channel over `region`. */
export function downscaleGreen(
  rgba: Uint8ClampedArray,
  w: number,
  region: Rect,
  outW: number,
): { g: Float32Array; sw: number; sh: number } {
  const rw = region.x1 - region.x0;
  const rh = region.y1 - region.y0;
  const sw = Math.min(outW, rw);
  const sh = Math.max(1, Math.round((rh * sw) / rw));
  const sum = new Float64Array(sw * sh);
  const cnt = new Uint32Array(sw * sh);
  for (let y = region.y0; y < region.y1; y++) {
    const sy = Math.min(sh - 1, Math.trunc(((y - region.y0) * sh) / rh));
    for (let x = region.x0; x < region.x1; x++) {
      const sx = Math.min(sw - 1, Math.trunc(((x - region.x0) * sw) / rw));
      const i = sy * sw + sx;
      sum[i] += rgba[(y * w + x) * 4 + 1];
      cnt[i]++;
    }
  }
  const g = new Float32Array(sw * sh);
  for (let i = 0; i < g.length; i++) g[i] = cnt[i] ? sum[i] / cnt[i] : 0;
  return { g, sw, sh };
}

export function detectInRegion(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  region: Rect,
): RegionDetection | null {
  const x0 = Math.max(0, Math.round(region.x0));
  const y0 = Math.max(0, Math.round(region.y0));
  const x1 = Math.min(w, Math.round(region.x1));
  const y1 = Math.min(h, Math.round(region.y1));
  if (x1 - x0 < 40 || y1 - y0 < 40) return null;

  const { g, sw, sh } = downscaleGreen(rgba, w, { x0, y0, x1, y1 }, DETECT_W);
  const bg = estimateBackground(g, sw, sh, Math.round(sw / 6), Math.round(sh / 6));
  const sig = new Float32Array(sw * sh);
  for (let i = 0; i < sig.length; i++) sig[i] = Math.max(0, 1 - g[i] / (bg[i] + 1e-6));

  const det = detectOnSignal(sig, sw, sh);
  const sx = (x1 - x0) / sw;
  const sy = (y1 - y0) / sh;
  return {
    lanes: det.lanes.map((x) => x0 + x * sx),
    unit: det.unit * sx,
    yOrigin: y0 + det.yOrigin * sy,
    bands: det.bands.map((b) => ({ ...b, y: y0 + b.y * sy })),
  };
}
