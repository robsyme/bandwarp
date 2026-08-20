// Lane and band auto-detection (ticket 003's decision), ported from the
// Python reference in prototypes/extract_bands.py. Runs on the fractional-
// darkness signal (detection keeps its cheaper signal; quantification uses
// OD). The parity tests in detect.test.ts hold this port to the reference's
// results on identical input.

import { findPeaks, gaussian1d, mean, median, std, type Vec } from "./signal";
import { type Band, fitScaledWarp } from "./warp";

const Y_MIN_FRAC = 0.04;
const Y_MAX_FRAC = 0.76; // excludes origin spots and the plate's top edge

export interface Detection {
  lanes: number[];
  unit: number;
  yOrigin: number;
  bands: Band[];
}

function colMeans(sig: Float32Array, w: number, y0: number, y1: number): Float64Array {
  const out = new Float64Array(w);
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < w; x++) out[x] += sig[y * w + x];
  const n = y1 - y0;
  for (let x = 0; x < w; x++) out[x] /= n;
  return out;
}

function rowMeans(sig: Float32Array, w: number, y0: number, y1: number): Float64Array {
  const out = new Float64Array(y1 - y0);
  for (let y = y0; y < y1; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) s += sig[y * w + x];
    out[y - y0] = s / w;
  }
  return out;
}

function laneProfile(sig: Float32Array, w: number, h: number, lx: number, half: number): Float64Array {
  const a = Math.max(0, lx - half);
  const b = lx + half;
  const out = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = a; x < b; x++) s += sig[y * w + x];
    out[y] = s / (b - a);
  }
  return out;
}

function argmax(v: Vec): number {
  let bi = 0;
  for (let i = 1; i < v.length; i++) if ((v[i] as number) > (v[bi] as number)) bi = i;
  return bi;
}

export function detectLanes(
  sig: Float32Array,
  w: number,
  h: number,
): { lanes: number[]; unit: number; yOrigin: number } {
  // origins are the BOTTOM-MOST significant row, clear of the dark plate edge
  const lo = Math.trunc(0.68 * h);
  const hi = Math.trunc(0.92 * h);
  const rowprof = gaussian1d(rowMeans(sig, w, lo, hi), h / 200);
  const rp = findPeaks(rowprof, 1, 0.05 * std(rowprof)).peaks;
  const rmax = rowprof[argmax(rowprof)];
  const cands = rp.filter((p) => rowprof[p] > 0.35 * rmax);
  const yOrigin = lo + (cands.length ? cands[cands.length - 1] : argmax(rowprof));

  const dy = Math.trunc(0.05 * h); // wide enough to survive a tilted plate
  const orgProf = gaussian1d(colMeans(sig, w, Math.max(0, yOrigin - dy), Math.min(h, yOrigin + dy)), w / 500);
  const orgPk = findPeaks(orgProf, w / 45, 0.06 * std(orgProf)).peaks;
  const gaps = orgPk.slice(1).map((x, i) => x - orgPk[i]);
  const unit = gaps.length ? median(gaps) : w / 25;

  // lanes with faint origins but strong bands: union in whole-plate peaks
  const fullProf = gaussian1d(colMeans(sig, w, 0, h), w / 500);
  const fullPk = findPeaks(fullProf, w / 45, 0.06 * std(fullProf)).peaks;
  const peaks: Array<[number, Float64Array]> = orgPk.map((x) => [x, orgProf]);
  for (const x of fullPk)
    if (orgPk.every((ox) => Math.abs(x - ox) > 0.5 * unit)) peaks.push([x, fullProf]);
  peaks.sort((a, b) => a[0] - b[0]);

  const half = Math.trunc(unit * 0.3);
  const lanes = peaks.map(([x, prof]) => {
    const gl = Math.trunc(Math.max(0, x - half));
    const gh = Math.trunc(Math.min(w, x + half));
    let mn = Infinity;
    for (let i = gl; i < gh; i++) if (prof[i] < mn) mn = prof[i];
    let tot = 0;
    let wsum = 0;
    for (let i = gl; i < gh; i++) {
      tot += prof[i] - mn;
      wsum += (prof[i] - mn) * i;
    }
    return tot > 1e-6 ? Math.trunc(wsum / tot) : Math.trunc(x);
  });
  return { lanes, unit, yOrigin };
}

export function detectOnSignal(sig: Float32Array, w: number, h: number): Detection {
  const tol = 0.035 * h;
  const { lanes, unit, yOrigin } = detectLanes(sig, w, h);
  const half = Math.trunc(unit * 0.3);

  // per-lane profiles with noise-adaptive peak detection
  const profs: Float64Array[] = [];
  const noises: number[] = [];
  const bands: Band[] = [];
  lanes.forEach((lx, li) => {
    const profS = gaussian1d(laneProfile(sig, w, h, lx, half), h / 300);
    const absDiff = new Float64Array(profS.length - 1);
    for (let i = 0; i < absDiff.length; i++) absDiff[i] = Math.abs(profS[i + 1] - profS[i]);
    const noise = (1.4826 * median(absDiff)) / Math.SQRT2;
    profs.push(profS);
    noises.push(noise);
    const { peaks, prominences } = findPeaks(profS, h / 60, Math.max(3.5 * noise, 0.008));
    peaks.forEach((y, i) => {
      if (Y_MIN_FRAC * h < y && y < Y_MAX_FRAC * h)
        bands.push({ lane: li, y, strength: prominences[i], rescued: false });
    });
  });

  // warp-guided rescue of faint bands
  const fitted = fitScaledWarp(bands, lanes, w, tol);
  if (fitted) {
    const { rows, d } = fitted;
    for (const r of rows) {
      const have = new Set(r.members.map((b) => b.lane));
      for (let li = 0; li < lanes.length; li++) {
        if (have.has(li)) continue;
        const pred = r.o + r.a * d[li];
        if (!(Y_MIN_FRAC * h < pred && pred < Y_MAX_FRAC * h)) continue;
        const lo = Math.trunc(Math.max(0, pred - 0.6 * tol));
        const hiY = Math.trunc(Math.min(h, pred + 0.6 * tol));
        const seg = profs[li].subarray(lo, hiY);
        const yi = argmax(seg);
        const val = seg[yi];
        const nearExisting = bands.some((b) => b.lane === li && Math.abs(b.y - (lo + yi)) < tol / 2);
        if (yi > 0 && yi < seg.length - 1 && !nearExisting && val > Math.max(2.0 * noises[li], 0.005))
          bands.push({ lane: li, y: lo + yi, strength: val, rescued: true });
      }
    }
  }
  return { lanes, unit, yOrigin, bands };
}
