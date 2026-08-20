import { describe, expect, it } from "vitest";
import { detectInRegion, downscaleGreen } from "./detectRegion";

// Synthetic plate: bright green field with dark origin spots and one warped
// band row, offset inside a larger image so the region -> rectified
// coordinate mapping is exercised.

const W = 1400;
const H = 1200;
const REGION = { x0: 100, y0: 200, x1: 1300, y1: 950 };
const RW = REGION.x1 - REGION.x0;
const RH = REGION.y1 - REGION.y0;
const LANE_XS = Array.from({ length: 16 }, (_, i) => 90 + i * 68); // region-relative
const Y_ORIGIN = Math.round(0.8 * RH);
const BAND_Y = (i: number) => Math.round(0.4 * RH + 12 * Math.sin(i / 3)); // gentle warp

function syntheticPhoto(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4);
  const put = (x: number, y: number, v: number) => {
    const o = (y * W + x) * 4;
    rgba[o] = v * 0.4;
    rgba[o + 1] = v;
    rgba[o + 2] = v * 0.2;
    rgba[o + 3] = 255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 200);
  const spot = (cx: number, cy: number, hw: number, hh: number, v: number) => {
    for (let y = cy - hh; y <= cy + hh; y++)
      for (let x = cx - hw; x <= cx + hw; x++)
        if (x >= 0 && x < W && y >= 0 && y < H) put(x, y, v);
  };
  LANE_XS.forEach((lx, i) => {
    spot(REGION.x0 + lx, REGION.y0 + Y_ORIGIN, 10, 7, 80); // origin spot
    spot(REGION.x0 + lx, REGION.y0 + BAND_Y(i), 12, 9, 100); // band
  });
  return rgba;
}

describe("downscaleGreen", () => {
  it("area-averages the green channel of the region crop", () => {
    const rgba = syntheticPhoto();
    const { g, sw, sh } = downscaleGreen(rgba, W, REGION, 700);
    expect(sw).toBe(700);
    expect(sh).toBe(Math.round((RH * 700) / RW));
    // a flat corner of the plate stays at the background level
    expect(g[0]).toBeCloseTo(200, 0);
    expect(g.length).toBe(sw * sh);
  });
});

describe("detectInRegion", () => {
  const det = detectInRegion(syntheticPhoto(), W, H, REGION)!;

  it("finds every lane at its rectified-image x (±6 px)", () => {
    expect(det).not.toBeNull();
    expect(det.lanes).toHaveLength(LANE_XS.length);
    LANE_XS.forEach((lx, i) =>
      expect(Math.abs(det.lanes[i] - (REGION.x0 + lx))).toBeLessThanOrEqual(6),
    );
  });

  it("maps origin row and pitch back to rectified coordinates", () => {
    expect(Math.abs(det.yOrigin - (REGION.y0 + Y_ORIGIN))).toBeLessThanOrEqual(10);
    expect(Math.abs(det.unit - 68)).toBeLessThanOrEqual(4);
  });

  it("finds the band row in every lane at its rectified y (±8 px)", () => {
    LANE_XS.forEach((_, i) => {
      const mine = det.bands.filter((b) => b.lane === i);
      expect(mine.length).toBeGreaterThanOrEqual(1);
      const target = REGION.y0 + BAND_Y(i);
      expect(Math.min(...mine.map((b) => Math.abs(b.y - target)))).toBeLessThanOrEqual(8);
    });
  });

  it("returns null on a degenerate region", () => {
    expect(detectInRegion(syntheticPhoto(), W, H, { x0: 0, y0: 0, x1: 30, y1: 30 })).toBeNull();
  });
});
