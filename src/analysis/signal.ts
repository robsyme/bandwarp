// 1-D signal helpers, implemented for parity with the scipy functions the
// Python reference detector uses (gaussian_filter1d, signal.find_peaks).

export type Vec = Float32Array | Float64Array | number[];

/** scipy.ndimage.gaussian_filter1d: truncate=4, 'reflect' boundary. */
export function gaussian1d(src: Vec, sigma: number): Float64Array {
  const n = src.length;
  const radius = Math.trunc(4 * sigma + 0.5);
  const kernel = new Float64Array(2 * radius + 1);
  let ksum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-0.5 * (i / sigma) ** 2);
    kernel[i + radius] = v;
    ksum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= ksum;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -radius; k <= radius; k++) {
      let j = i + k;
      // 'reflect': (d c b a | a b c d) — reflect about the edge, edge repeated
      if (j < 0) j = -j - 1;
      if (j >= n) j = 2 * n - j - 1;
      s += kernel[k + radius] * (src[j] as number);
    }
    out[i] = s;
  }
  return out;
}

/**
 * scipy.signal.find_peaks with `distance` and `prominence`, in scipy's
 * order: local maxima (plateau midpoints) -> distance filter by height
 * priority -> prominence threshold.
 */
export function findPeaks(
  y: Vec,
  distance: number,
  prominence: number,
): { peaks: number[]; prominences: number[] } {
  const n = y.length;
  // local maxima with plateau handling (midpoint)
  let maxima: number[] = [];
  let i = 1;
  while (i < n - 1) {
    if (y[i - 1] < y[i]) {
      let end = i;
      while (end < n - 1 && y[end + 1] === y[i]) end++;
      if (end < n - 1 && y[end + 1] < y[i]) {
        maxima.push(Math.floor((i + end) / 2));
        i = end;
      }
    }
    i++;
  }
  // distance filter: highest peaks win, neighbors within ceil(distance) drop
  if (distance > 1) {
    const dmin = Math.ceil(distance);
    const keep = new Set(maxima);
    const byHeight = [...maxima].sort((a, b) => (y[b] as number) - (y[a] as number));
    const removed = new Set<number>();
    for (const p of byHeight) {
      if (removed.has(p)) continue;
      for (const q of maxima)
        if (q !== p && !removed.has(q) && Math.abs(q - p) < dmin) removed.add(q);
    }
    maxima = maxima.filter((p) => keep.has(p) && !removed.has(p));
  }
  // prominences
  const peaks: number[] = [];
  const proms: number[] = [];
  for (const p of maxima) {
    const hp = y[p] as number;
    let base = -Infinity;
    for (const dir of [-1, 1]) {
      let m = hp;
      for (let j = p + dir; j >= 0 && j < n; j += dir) {
        if ((y[j] as number) > hp) break;
        if ((y[j] as number) < m) m = y[j] as number;
      }
      if (m > base) base = m;
    }
    const prom = hp - base;
    if (prom >= prominence) {
      peaks.push(p);
      proms.push(prom);
    }
  }
  return { peaks, prominences: proms };
}

export function median(values: Vec): number {
  const s = [...(values as number[])].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(values: Vec): number {
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i] as number;
  return s / values.length;
}

/** Population standard deviation (numpy default, ddof=0). */
export function std(values: Vec): number {
  const m = mean(values);
  let s = 0;
  for (let i = 0; i < values.length; i++) s += ((values[i] as number) - m) ** 2;
  return Math.sqrt(s / values.length);
}
