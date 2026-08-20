// Per-lane OD profiles and Band integration (ticket 006's decisions):
// 1D profile along the migration axis, band area between explicit bounds at
// the flanking valleys, valley-to-valley straight-line baseline. All y
// coordinates are absolute rectified px; profiles are indexed by
// region-relative row.

import { gaussian1d } from "./signal";

export interface Bounds {
  /** Integration start (upper edge, smaller y), absolute rectified px. */
  a: number;
  /** Integration end (lower edge, larger y), absolute rectified px. */
  b: number;
}

/** Mean OD across a lane strip, one value per region row. */
export function laneProfileOD(
  od: Float32Array,
  w: number,
  laneX: number,
  half: number,
  y0: number,
  y1: number,
): Float64Array {
  const a = Math.max(0, Math.round(laneX - half));
  const b = Math.max(a + 1, Math.round(laneX + half));
  const out = new Float64Array(y1 - y0);
  for (let y = y0; y < y1; y++) {
    let s = 0;
    for (let x = a; x < b; x++) s += od[y * w + x];
    out[y - y0] = s / (b - a);
  }
  return out;
}

/** Lightly smoothed copy for stable valley finding. */
export function smoothProfile(prof: Float64Array): Float64Array {
  return gaussian1d(prof, Math.max(1, prof.length / 300));
}

function argminRange(v: Float64Array, lo: number, hi: number): number {
  let bi = Math.max(0, lo);
  const end = Math.min(v.length, hi);
  for (let i = bi; i < end; i++) if (v[i] < v[bi]) bi = i;
  return bi;
}

/**
 * Default integration bounds for a band at absolute y: the flanking valleys
 * of the smoothed profile, searched within a window that stops halfway to
 * the nearest neighbouring band in the same lane.
 */
export function defaultBounds(
  smooth: Float64Array,
  y0: number,
  bandY: number,
  neighbourYs: number[],
  regionH: number,
): Bounds {
  const yr = Math.round(bandY) - y0;
  const win = Math.max(4, Math.round(0.045 * regionH));
  let lo = yr - win;
  let hi = yr + win + 1;
  for (const ny of neighbourYs) {
    const nr = Math.round(ny) - y0;
    if (nr < yr) lo = Math.max(lo, Math.ceil((nr + yr) / 2));
    else if (nr > yr) hi = Math.min(hi, Math.floor((nr + yr) / 2) + 1);
  }
  const a = argminRange(smooth, lo, Math.max(lo + 1, yr));
  const b = argminRange(smooth, Math.min(yr + 1, hi - 1), hi);
  return { a: y0 + a, b: y0 + b };
}

export interface Integration {
  /** Area above the baseline, in OD·px (negative parts clipped to zero). */
  area: number;
  /** Baseline endpoints on the raw profile, for drawing. */
  base0: number;
  base1: number;
  /** Peak OD above baseline within the bounds. */
  peak: number;
}

/** Valley-to-valley integration of the raw profile between bounds. */
export function integrateBand(prof: Float64Array, y0: number, bounds: Bounds): Integration {
  const a = Math.max(0, Math.round(bounds.a) - y0);
  const b = Math.min(prof.length - 1, Math.round(bounds.b) - y0);
  if (b <= a) return { area: 0, base0: 0, base1: 0, peak: 0 };
  const base0 = prof[a];
  const base1 = prof[b];
  let area = 0;
  let peak = 0;
  for (let i = a; i <= b; i++) {
    const baseline = base0 + ((base1 - base0) * (i - a)) / (b - a);
    const v = prof[i] - baseline;
    if (v > 0) area += v;
    if (v > peak) peak = v;
  }
  return { area, base0, base1, peak };
}

/**
 * Saturation check on the rectified image: JPEG dark clipping inside the
 * integration window (raw green at or below the noise floor) means the OD
 * is untrustworthy there.
 */
export function isSaturated(
  rectified: Uint8ClampedArray,
  w: number,
  laneX: number,
  half: number,
  bounds: Bounds,
): boolean {
  const x0 = Math.max(0, Math.round(laneX - half));
  const x1 = Math.max(x0 + 1, Math.round(laneX + half));
  for (let y = Math.round(bounds.a); y <= Math.round(bounds.b); y++)
    for (let x = x0; x < x1; x++)
      if (rectified[(y * w + x) * 4 + 1] <= 8) return true;
  return false;
}
