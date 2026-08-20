// Workspace state types and pure helpers (no DOM). Lanes and Bands carry
// stable ids so correction gestures (drag, add, remove) never invalidate
// references; the warp fit works on x-sorted indices computed at call time.

import type { RegionDetection } from "./analysis/detectRegion";
import { type Band, fit } from "./analysis/warp";

export interface Lane {
  id: number;
  /** Centre x in rectified px. */
  x: number;
  /** Free-text Lane Label typed by the Operator. */
  label: string;
  isStandard: boolean;
  /** Dilution Series amount for a Standard Lane, kept as typed. */
  amount: string;
}

export interface PlacedBand {
  id: number;
  laneId: number;
  /** Centre y in rectified px. */
  y: number;
  strength: number;
  /** Warp-guided rescue — flagged for the Operator to double-check. */
  rescued: boolean;
  /** Placed by the Operator, not detection. */
  manual: boolean;
}

export const PALETTE = [
  "#e4572e", "#2e86ab", "#e0b410", "#7a3fbf",
  "#1c9e77", "#c2571a", "#5b7bd5", "#a1327a",
];

export function compoundName(i: number): string {
  return `Compound ${String.fromCharCode(65 + (i % 26))}`;
}

export function nextId(items: { id: number }[]): number {
  return items.reduce((m, it) => Math.max(m, it.id), 0) + 1;
}

export function lanesFromDetection(det: RegionDetection): Lane[] {
  return det.lanes.map((x, i) => ({ id: i + 1, x, label: "", isStandard: false, amount: "" }));
}

export function bandsFromDetection(det: RegionDetection, lanes: Lane[]): PlacedBand[] {
  return det.bands.map((b, i) => ({
    id: i + 1,
    laneId: lanes[b.lane].id,
    y: b.y,
    strength: b.strength,
    rescued: !!b.rescued,
    manual: false,
  }));
}

export function sortedLanes(lanes: Lane[]): Lane[] {
  return [...lanes].sort((a, b) => a.x - b.x || a.id - b.id);
}

export function addLane(lanes: Lane[], x: number): Lane[] {
  return [...lanes, { id: nextId(lanes), x, label: "", isStandard: false, amount: "" }];
}

export function removeLane(
  lanes: Lane[],
  bands: PlacedBand[],
  laneId: number,
): { lanes: Lane[]; bands: PlacedBand[] } {
  return {
    lanes: lanes.filter((l) => l.id !== laneId),
    bands: bands.filter((b) => b.laneId !== laneId),
  };
}

export function addBand(bands: PlacedBand[], laneId: number, y: number, strength: number): PlacedBand[] {
  return [...bands, { id: nextId(bands), laneId, y, strength, rescued: false, manual: true }];
}

export interface RowAssignment {
  /** Band id -> Compound Row index (top row = 0); unassigned bands -> -1. */
  rowOf: Map<number, number>;
  rowCount: number;
  /** Sorted lane x positions the curves are evaluated at. */
  laneXs: number[];
  /** Per row, fitted curve y at each sorted lane. */
  curves: number[][];
}

const EMPTY: RowAssignment = { rowOf: new Map(), rowCount: 0, laneXs: [], curves: [] };

/** Group bands into Compound Rows with the scaled shared warp fit. */
export function assignRows(
  lanes: Lane[],
  bands: PlacedBand[],
  regionW: number,
  regionH: number,
): RowAssignment {
  if (!lanes.length || !bands.length) return EMPTY;
  const sl = sortedLanes(lanes);
  const idxOf = new Map(sl.map((l, i) => [l.id, i]));
  const wb: Band[] = bands.map((b) => ({
    id: String(b.id),
    lane: idxOf.get(b.laneId)!,
    y: b.y,
    strength: b.strength,
    rescued: b.rescued,
  }));
  const res = fit(
    { width: regionW, height: regionH, lanes: sl.map((l) => ({ x: l.x })) },
    wb,
    { model: "scaled", tol: 0.035 * regionH },
  );
  const order = res.rows
    .map((r, i) => ({ i, y: r.curve.reduce((s, v) => s + v, 0) / r.curve.length }))
    .sort((a, b) => a.y - b.y);
  const rowOf = new Map<number, number>();
  for (const b of bands) rowOf.set(b.id, -1);
  order.forEach(({ i }, rank) => {
    for (const m of res.rows[i].members) rowOf.set(Number(m.id), rank);
  });
  return {
    rowOf,
    rowCount: order.length,
    laneXs: sl.map((l) => l.x),
    curves: order.map(({ i }) => res.rows[i].curve),
  };
}
