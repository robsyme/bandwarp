import { runPipeline } from "../analysis/pipeline";
import type { Pt } from "../analysis/geometry";

interface Job {
  rgba: ArrayBuffer;
  width: number;
  height: number;
  corners: Pt[];
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { rgba, width, height, corners } = e.data;
  const result = runPipeline(new Uint8ClampedArray(rgba), width, height, corners);
  (self as unknown as Worker).postMessage(result, [
    result.rectified.buffer,
    result.od.buffer,
    result.odPreview.buffer,
  ]);
};
