// Workspace state types and pure helpers (no DOM). Lanes and Bands carry
// stable ids so correction gestures (drag, add, remove) never invalidate
// references; the warp fit works on x-sorted indices computed at call time.

import type { RegionDetection } from "./analysis/detectRegion";
import type { Bounds } from "./analysis/profile";
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
  /** Operator-dragged integration bounds; absent means auto valleys. */
  bounds?: Bounds | null;
  /** Compound Row this band is pinned to by hand; absent means the warp fit decides. */
  rowOverride?: number | null;
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

export function addBand(
  bands: PlacedBand[],
  laneId: number,
  y: number,
  strength: number,
  rowOverride?: number,
): PlacedBand[] {
  return [...bands, { id: nextId(bands), laneId, y, strength, rescued: false, manual: true, rowOverride }];
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

export interface AssignOptions {
  /** Row match tolerance as a fraction of region height (default 0.035). */
  tolFrac?: number;
  /** Drift-curve loess bandwidth as a fraction of region width (default 0.08). */
  bw?: number;
}

export const DEFAULT_ASSIGN: Required<AssignOptions> = { tolFrac: 0.035, bw: 0.08 };

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/**
 * Group bands into Compound Rows with the scaled shared warp fit. Pinned
 * bands (`rowOverride`) overrule the fit — including into rows the fit
 * never found — and the affected row curves are re-regressed against the
 * shared drift so they pass through the pinned memberships.
 */
export function assignRows(
  lanes: Lane[],
  bands: PlacedBand[],
  regionW: number,
  regionH: number,
  opts: AssignOptions = {},
): RowAssignment {
  if (!lanes.length || !bands.length) return EMPTY;
  const tolFrac = opts.tolFrac ?? DEFAULT_ASSIGN.tolFrac;
  const bw = opts.bw ?? DEFAULT_ASSIGN.bw;
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
    { model: "scaled", tol: tolFrac * regionH, bw },
  );
  const order = res.rows
    .map((r, i) => ({ i, y: r.curve.reduce((s, v) => s + v, 0) / r.curve.length }))
    .sort((a, b) => a.y - b.y);
  const rowOf = new Map<number, number>();
  for (const b of bands) rowOf.set(b.id, -1);
  order.forEach(({ i }, rank) => {
    for (const m of res.rows[i].members) rowOf.set(Number(m.id), rank);
  });
  let rowCount = order.length;
  const curves: number[][] = order.map(({ i }) => res.rows[i].curve);

  const pinned = bands.filter((b) => b.rowOverride != null && b.rowOverride >= 0);
  if (pinned.length) {
    const touched = new Set<number>();
    for (const b of pinned) {
      const prev = rowOf.get(b.id);
      if (prev !== undefined && prev >= 0) touched.add(prev);
      rowOf.set(b.id, b.rowOverride!);
      touched.add(b.rowOverride!);
      rowCount = Math.max(rowCount, b.rowOverride! + 1);
    }
    const d = res.drift;
    for (const r of touched) {
      const members = bands.filter((b) => rowOf.get(b.id) === r);
      if (!members.length) {
        curves[r] = curves[r] ?? [];
        continue;
      }
      const yv = members.map((b) => b.y);
      if (d && d.length === sl.length && members.length >= 2) {
        const dv = members.map((b) => d[idxOf.get(b.laneId)!]);
        const md = mean(dv);
        const va = mean(dv.map((v) => (v - md) ** 2));
        const my = mean(yv);
        const a = va > 1e-9 ? Math.max(mean(dv.map((v, i) => (v - md) * (yv[i] - my))) / va, 0) : 0;
        const o = my - a * md;
        curves[r] = d.map((v) => o + a * v);
      } else {
        const my = mean(yv);
        curves[r] = sl.map(() => my);
      }
    }
    for (let r = 0; r < rowCount; r++) curves[r] = curves[r] ?? [];
  }

  return { rowOf, rowCount, laneXs: sl.map((l) => l.x), curves };
}
