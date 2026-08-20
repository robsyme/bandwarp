import { describe, expect, it } from "vitest";
import { defaultBounds, integrateBand, isSaturated, laneProfileOD, smoothProfile } from "./profile";

// Synthetic lane: OD image with two gaussian bands on a sloped background,
// region rows 100..600 (absolute), lane at x=50 in a 100-wide image.

const W = 100;
const Y0 = 100;
const Y1 = 600;
const BAND_A = 250;
const BAND_B = 400;

function syntheticOD(): Float32Array {
  const od = new Float32Array(W * Y1);
  for (let y = Y0; y < Y1; y++)
    for (let x = 0; x < W; x++) {
      const bg = 0.02 + 0.00002 * (y - Y0);
      const g1 = 0.3 * Math.exp(-0.5 * ((y - BAND_A) / 12) ** 2);
      const g2 = 0.15 * Math.exp(-0.5 * ((y - BAND_B) / 12) ** 2);
      od[y * W + x] = bg + g1 + g2;
    }
  return od;
}

describe("lane profile integration", () => {
  const prof = laneProfileOD(syntheticOD(), W, 50, 6, Y0, Y1);
  const smooth = smoothProfile(prof);

  it("profiles the lane strip per region row", () => {
    expect(prof.length).toBe(Y1 - Y0);
    expect(prof[BAND_A - Y0]).toBeGreaterThan(0.3);
    expect(prof[BAND_A - Y0 - 60]).toBeLessThan(0.05);
  });

  it("finds valley bounds flanking the band, stopping at neighbours", () => {
    const b = defaultBounds(smooth, Y0, BAND_A, [BAND_B], Y1 - Y0);
    expect(b.a).toBeLessThan(BAND_A - 12);
    expect(b.b).toBeGreaterThan(BAND_A + 12);
    expect(b.b).toBeLessThanOrEqual((BAND_A + BAND_B) / 2 + Y0 - Y0 + Y0); // never past midpoint
    expect(b.b - Y0).toBeLessThanOrEqual(Math.floor((BAND_A + BAND_B) / 2) - Y0 + 1);
  });

  it("integrates area above the valley-to-valley baseline", () => {
    const bounds = defaultBounds(smooth, Y0, BAND_A, [BAND_B], Y1 - Y0);
    const integ = integrateBand(prof, Y0, bounds);
    // gaussian area = amp * sigma * sqrt(2*pi) ≈ 0.3*12*2.507 ≈ 9.02,
    // minus tail truncation and baseline — expect the right ballpark
    expect(integ.area).toBeGreaterThan(6);
    expect(integ.area).toBeLessThan(10);
    expect(integ.peak).toBeGreaterThan(0.25);
    // the stronger band integrates to about twice the weaker one
    const b2 = defaultBounds(smooth, Y0, BAND_B, [BAND_A], Y1 - Y0);
    const i2 = integrateBand(prof, Y0, b2);
    expect(integ.area / i2.area).toBeGreaterThan(1.6);
    expect(integ.area / i2.area).toBeLessThan(2.4);
  });

  it("returns zero area for degenerate bounds", () => {
    expect(integrateBand(prof, Y0, { a: 300, b: 300 }).area).toBe(0);
  });
});

describe("isSaturated", () => {
  it("flags dark-clipped pixels inside the window only", () => {
    const rect = new Uint8ClampedArray(W * Y1 * 4).fill(120);
    expect(isSaturated(rect, W, 50, 6, { a: 200, b: 300 })).toBe(false);
    rect[(250 * W + 50) * 4 + 1] = 3; // one clipped green pixel at y=250
    expect(isSaturated(rect, W, 50, 6, { a: 200, b: 300 })).toBe(true);
    expect(isSaturated(rect, W, 50, 6, { a: 300, b: 400 })).toBe(false);
    expect(isSaturated(rect, W, 80, 6, { a: 200, b: 300 })).toBe(false);
  });
});
