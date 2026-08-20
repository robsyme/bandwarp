// The Analysis File (ticket 011's decision): one self-contained JSON with
// the original photo bytes embedded, everything the Operator did, the fits,
// and the provenance strings. Reloadable to the exact saved state.

import type { CalibrationModel, StandardPoint } from "./analysis/calibrate";
import type { Rect } from "./analysis/detectRegion";
import type { Pt } from "./analysis/geometry";
import type { Bounds } from "./analysis/profile";
import type { Lane, PlacedBand } from "./state";

export const SCHEMA_VERSION = 1;
export const APP_VERSION = "bandwarp 0.1.0";

export interface SavedBand {
  id: number;
  laneId: number;
  y: number;
  strength: number;
  source: "detected" | "rescued" | "manual";
  bounds: Bounds | null;
  /** Compound Row pinned by hand; null when the warp fit decides. */
  rowOverride?: number | null;
}

export interface SavedCalibration {
  compound: string;
  model: CalibrationModel;
  params: number[];
  r2: number;
  points: StandardPoint[];
}

export interface AnalysisFile {
  schemaVersion: number;
  app: string;
  photo: { name: string; mime: string; base64: string };
  corners: Pt[];
  region: Rect;
  detection: { unit: number; yOrigin: number } | null;
  /** Warp-fit settings the Operator tuned (optional; defaults when absent). */
  fit?: { tolFrac: number; bw: number };
  lanes: Lane[];
  compounds: string[];
  unit: string;
  bands: SavedBand[];
  warp: { laneXs: number[]; curves: number[][] } | null;
  calibrations: (SavedCalibration | null)[];
  provenance: string;
}

export function bandsToSaved(bands: PlacedBand[]): SavedBand[] {
  return bands.map((b) => ({
    id: b.id,
    laneId: b.laneId,
    y: b.y,
    strength: b.strength,
    source: b.manual ? "manual" : b.rescued ? "rescued" : "detected",
    bounds: b.bounds ?? null,
    rowOverride: b.rowOverride ?? null,
  }));
}

export function savedToBands(saved: SavedBand[]): PlacedBand[] {
  return saved.map((s) => ({
    id: s.id,
    laneId: s.laneId,
    y: s.y,
    strength: s.strength,
    rescued: s.source === "rescued",
    manual: s.source === "manual",
    bounds: s.bounds ?? undefined,
    rowOverride: s.rowOverride ?? undefined,
  }));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK)
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(out);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function serializeAnalysis(file: AnalysisFile): string {
  return JSON.stringify(file);
}

export function parseAnalysis(json: string): AnalysisFile {
  const data = JSON.parse(json) as AnalysisFile;
  if (data.schemaVersion !== SCHEMA_VERSION)
    throw new Error(`Unsupported Analysis File schema ${data.schemaVersion} (expected ${SCHEMA_VERSION})`);
  if (!data.photo?.base64 || !Array.isArray(data.lanes) || !Array.isArray(data.bands))
    throw new Error("Not a bandwarp Analysis File");
  return data;
}
