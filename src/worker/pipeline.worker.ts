import type { Pt } from "../analysis/geometry";
import { detectInRegion, type Rect } from "../analysis/detectRegion";
import { runPipeline } from "../analysis/pipeline";

export type Job =
  | { kind: "pipeline"; rgba: ArrayBuffer; width: number; height: number; corners: Pt[] }
  | { kind: "detect"; rgba: ArrayBuffer; width: number; height: number; region: Rect };

self.onmessage = (e: MessageEvent<Job>) => {
  const job = e.data;
  const rgba = new Uint8ClampedArray(job.rgba);
  if (job.kind === "detect") {
    const det = detectInRegion(rgba, job.width, job.height, job.region);
    (self as unknown as Worker).postMessage(det);
    return;
  }
  const result = runPipeline(rgba, job.width, job.height, job.corners);
  (self as unknown as Worker).postMessage(result, [
    result.rectified.buffer,
    result.od.buffer,
    result.odPreview.buffer,
  ]);
};
