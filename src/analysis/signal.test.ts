import { describe, expect, it } from "vitest";
import { findPeaks, gaussian1d, median } from "./signal";

// Truth values computed independently with scipy (gaussian_filter1d /
// signal.find_peaks) — the port must reproduce them.

describe("gaussian1d", () => {
  it("matches scipy.ndimage.gaussian_filter1d (sigma 1.2, reflect)", () => {
    const a = [0, 0, 1, 3, 7, 3, 1, 0, 0, 2, 5, 2, 0];
    const want = [
      0.154743, 0.591236, 1.662681, 3.140076, 3.902641, 3.142929, 1.698378,
      0.831182, 1.049442, 2.024308, 2.60628, 2.041146, 1.154958,
    ];
    const got = gaussian1d(Float64Array.from(a), 1.2);
    want.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 5));
  });
});

describe("findPeaks", () => {
  const y = Float64Array.from([0, 1, 0.2, 3, 0.5, 2.5, 0.4, 5, 0.1, 1.2, 0.3]);

  it("matches scipy prominences without a distance constraint", () => {
    const { peaks, prominences } = findPeaks(y, 1, 0.5);
    expect(peaks).toEqual([1, 3, 5, 7, 9]);
    const want = [0.8, 2.6, 2.0, 4.9, 0.9];
    want.forEach((v, i) => expect(prominences[i]).toBeCloseTo(v, 4));
  });

  it("applies the distance filter by peak height before prominence", () => {
    const { peaks, prominences } = findPeaks(y, 3, 0.5);
    expect(peaks).toEqual([3, 7]);
    expect(prominences[0]).toBeCloseTo(2.6, 4);
    expect(prominences[1]).toBeCloseTo(4.9, 4);
  });
});

describe("median", () => {
  it("averages the middle pair for even length", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([5, 1, 9])).toBe(5);
  });
});
