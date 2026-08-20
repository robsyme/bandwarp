// The pixel pipeline: rectify -> linearize -> background -> OD.
// Pure module; runs inside the worker.

import { estimateBackground } from "./background";
import { type Pt, rectify, suggestSize } from "./geometry";
import { computeOD } from "./od";
import { linearGreen } from "./srgb";

export interface PipelineResult {
  width: number;
  height: number;
  /** Rectified RGBA image of the plate quad. */
  rectified: Uint8ClampedArray;
  /** Absorbance-like signal per rectified pixel. */
  od: Float32Array;
  /** Grayscale preview of the OD map (dark = band), RGBA. */
  odPreview: Uint8ClampedArray;
}

const PREVIEW_OD_RANGE = 0.5; // OD mapped to full black in the preview

export function runPipeline(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  corners: Pt[],
): PipelineResult {
  const out = suggestSize(corners);
  const rectified = rectify(rgba, width, height, corners, out.width, out.height);
  const lin = linearGreen(rectified);
  const radius = Math.max(8, Math.round(Math.min(out.width, out.height) / 8));
  const bg = estimateBackground(lin, out.width, out.height, radius);
  const od = computeOD(lin, bg);
  const odPreview = new Uint8ClampedArray(out.width * out.height * 4);
  for (let i = 0; i < od.length; i++) {
    const v = 255 * (1 - Math.min(od[i] / PREVIEW_OD_RANGE, 1));
    odPreview[i * 4] = v;
    odPreview[i * 4 + 1] = v;
    odPreview[i * 4 + 2] = v;
    odPreview[i * 4 + 3] = 255;
  }
  return { width: out.width, height: out.height, rectified, od, odPreview };
}
