// Main-thread facade over the pixel worker. RGBA buffers are transferred,
// not copied — callers pass a disposable copy.

import type { Rect, RegionDetection } from "../analysis/detectRegion";
import type { Pt } from "../analysis/geometry";
import type { PipelineResult } from "../analysis/pipeline";
import PipelineWorker from "./pipeline.worker?worker&inline";
import type { Job } from "./pipeline.worker";

function run<T>(job: Job, transfer: Transferable[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new PipelineWorker();
    worker.onmessage = (e: MessageEvent<T>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (err: ErrorEvent) => {
      reject(err);
      worker.terminate();
    };
    worker.postMessage(job, transfer);
  });
}

export function processPlate(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  corners: Pt[],
): Promise<PipelineResult> {
  const buf = rgba.buffer as ArrayBuffer;
  return run({ kind: "pipeline", rgba: buf, width, height, corners }, [buf]);
}

export function detectPlateRegion(
  rectified: Uint8ClampedArray,
  width: number,
  height: number,
  region: Rect,
): Promise<RegionDetection | null> {
  const buf = rectified.buffer as ArrayBuffer;
  return run({ kind: "detect", rgba: buf, width, height, region }, [buf]);
}
