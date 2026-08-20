// Main-thread facade over the pixel worker. The RGBA buffer is transferred,
// not copied — callers pass a disposable copy.

import type { Pt } from "../analysis/geometry";
import type { PipelineResult } from "../analysis/pipeline";
import PipelineWorker from "./pipeline.worker?worker&inline";

export function processPlate(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  corners: Pt[],
): Promise<PipelineResult> {
  return new Promise((resolve, reject) => {
    const worker = new PipelineWorker();
    worker.onmessage = (e: MessageEvent<PipelineResult>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (err: ErrorEvent) => {
      reject(err);
      worker.terminate();
    };
    worker.postMessage({ rgba: rgba.buffer, width, height, corners }, [rgba.buffer]);
  });
}
