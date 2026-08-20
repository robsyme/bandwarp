// Warp modelling and Band-to-Compound-Row assignment (ticket 004's decision):
// scaled shared warp y = offset_row + amplitude_row * d(x), greedy row-linking
// as the initializer. Ported from the validated prototypes; `fitScaledWarp`
// mirrors the Python reference exactly (the detection parity tests depend
// on it).

import { mean, std } from "./signal";

export interface Band {
  id?: string;
  lane: number;
  y: number;
  strength: number;
  rescued?: boolean;
}

export interface PlateGeom {
  width: number;
  height: number;
  lanes: { x: number }[];
}

export interface Row {
  members: Band[];
  /** Fitted row curve, one y per lane. */
  curve: number[];
}

export interface FitResult {
  rows: Row[];
  noise: Band[];
}

interface ScaledRow {
  o: number;
  a: number;
  members: Band[];
}

/** Gaussian-weighted local linear regression of ys(xs) evaluated at evalXs. */
export function loess(xs: number[], ys: number[], evalXs: number[], bw: number): number[] {
  return evalXs.map((x0) => {
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (let i = 0; i < xs.length; i++) {
      const w = Math.exp(-0.5 * ((xs[i] - x0) / bw) ** 2);
      sw += w;
      swx += w * xs[i];
      swy += w * ys[i];
      swxx += w * xs[i] * xs[i];
      swxy += w * xs[i] * ys[i];
    }
    const det = sw * swxx - swx * swx;
    if (Math.abs(det) < 1e-9) return swy / (sw || 1);
    const b = (sw * swxy - swx * swy) / det;
    return (swy - b * swx) / sw + b * x0;
  });
}

/** Greedy strongest-first row linking across lanes, tolerating 2-lane gaps. */
export function buildRows(bands: Band[], laneCount: number, tol: number): Band[][] {
  const byLane: Band[][] = Array.from({ length: laneCount }, () => []);
  for (const b of bands) byLane[b.lane].push(b);
  const free = new Set(bands);
  const rows: Band[][] = [];
  for (const seed of [...bands].sort((a, b) => b.strength - a.strength)) {
    if (!free.has(seed)) continue;
    free.delete(seed);
    const members = [seed];
    for (const dir of [1, -1]) {
      let last = seed;
      let prev: Band | null = null;
      let gaps = 0;
      for (let li = seed.lane + dir; li >= 0 && li < laneCount && gaps <= 2; li += dir) {
        const slope = prev ? (last.y - prev.y) / (last.lane - prev.lane) : 0;
        const pred = last.y + slope * (li - last.lane);
        let best: Band | null = null;
        for (const c of byLane[li])
          if (free.has(c) && Math.abs(c.y - pred) < tol &&
              (!best || Math.abs(c.y - pred) < Math.abs(best.y - pred))) best = c;
        if (best) {
          free.delete(best);
          members.push(best);
          prev = last;
          last = best;
          gaps = 0;
        } else gaps++;
      }
    }
    rows.push(members);
  }
  return rows;
}

function sharedCore(
  bands: Band[],
  laneXs: number[],
  width: number,
  tol: number,
  scaled: boolean,
): { rows: ScaledRow[]; d: number[] } | null {
  const L = laneXs.length;
  let rows: ScaledRow[] = buildRows(bands, L, tol)
    .filter((m) => m.length >= 4)
    .map((m) => ({ o: mean(m.map((b) => b.y)), a: 1, members: m }));
  if (!rows.length) return null;
  let d: number[] = new Array(L).fill(0);

  for (let iter = 0; iter < 6; iter++) {
    const num = new Array(L).fill(0);
    const den = new Array(L).fill(0);
    for (const r of rows)
      for (const b of r.members) {
        num[b.lane] += r.a * (b.y - r.o);
        den[b.lane] += r.a * r.a;
      }
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < L; i++)
      if (den[i] > 0) {
        xs.push(laneXs[i]);
        ys.push(num[i] / den[i]);
      }
    d = loess(xs, ys, laneXs, width * 0.08);
    const dm = mean(d);
    d = d.map((v) => v - dm);
    if (scaled) {
      const s = std(d) || 1;
      d = d.map((v) => v / s);
    }
    for (const r of rows) {
      const dv = r.members.map((b) => d[b.lane]);
      const yv = r.members.map((b) => b.y);
      const md = mean(dv);
      const my = mean(yv);
      const va = mean(dv.map((v) => (v - md) ** 2));
      if (scaled && r.members.length >= 3 && va > 1e-6) {
        const cov = mean(dv.map((v, i) => (v - md) * (yv[i] - my)));
        r.a = Math.min(Math.max(cov / va, 0), tol * 4);
      } else if (!scaled) r.a = 1;
      r.o = my - r.a * md;
    }
    for (const r of rows) r.members = [];
    for (const b of bands) {
      let best: ScaledRow | null = null;
      let bd = Infinity;
      for (const r of rows) {
        const dist = Math.abs(b.y - (r.o + r.a * d[b.lane]));
        if (dist < bd) {
          bd = dist;
          best = r;
        }
      }
      if (best && bd < tol) best.members.push(b);
    }
    rows = rows.filter((r) => r.members.length >= 2);
    if (!rows.length) return null;
    rows.sort((r1, r2) => r1.o - r2.o);
    const merged = [rows[0]];
    for (const r of rows.slice(1)) {
      const p = merged[merged.length - 1];
      const gap = mean(d.map((v) => Math.abs(p.o + p.a * v - (r.o + r.a * v))));
      if (gap < tol * 0.7) {
        p.members = p.members.concat(r.members);
        const yv = p.members.map((b) => b.y);
        const dv = p.members.map((b) => d[b.lane]);
        p.o = mean(yv) - p.a * mean(dv);
      } else merged.push(r);
    }
    rows = merged;
  }
  return { rows, d };
}

/** Python-parity scaled fit; used by detection's warp-guided rescue. */
export function fitScaledWarp(
  bands: Band[],
  laneXs: number[],
  width: number,
  tol: number,
): { rows: ScaledRow[]; d: number[] } | null {
  return sharedCore(bands, laneXs, width, tol, true);
}

function fitIndependent(plate: PlateGeom, bands: Band[], tol: number): FitResult {
  const laneXs = plate.lanes.map((l) => l.x);
  const rows: Row[] = [];
  const noise: Band[] = [];
  for (const members of buildRows(bands, laneXs.length, tol)) {
    if (members.length < 2) {
      noise.push(...members);
      continue;
    }
    rows.push({
      members,
      curve: loess(members.map((b) => laneXs[b.lane]), members.map((b) => b.y), laneXs, plate.width * 0.12),
    });
  }
  return { rows, noise };
}

export interface FitOptions {
  model: "independent" | "shared" | "scaled";
  /** Match tolerance in pixels. */
  tol: number;
}

export function fit(plate: PlateGeom, bands: Band[], opts: FitOptions): FitResult {
  if (opts.model === "independent") return fitIndependent(plate, bands, opts.tol);
  const laneXs = plate.lanes.map((l) => l.x);
  const core = sharedCore(bands, laneXs, plate.width, opts.tol, opts.model === "scaled");
  if (!core) return fitIndependent(plate, bands, opts.tol);
  const assigned = new Set(core.rows.flatMap((r) => r.members));
  return {
    rows: core.rows.map((r) => ({
      members: r.members,
      curve: core.d.map((v) => r.o + r.a * v),
    })),
    noise: bands.filter((b) => !assigned.has(b)),
  };
}
