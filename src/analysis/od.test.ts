import { describe, expect, it } from "vitest";
import { estimateBackground } from "./background";
import { computeOD } from "./od";

function makePlate(w: number, h: number): Float32Array {
  // illumination gradient 0.4 -> 0.8 left to right
  const img = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) img[y * w + x] = 0.4 + 0.4 * (x / (w - 1));
  return img;
}

function stampSpot(img: Float32Array, w: number, cx: number, cy: number, r: number) {
  // a band absorbs 40% of the local glow
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) img[y * w + x] *= 0.6;
}

describe("estimateBackground", () => {
  it("recovers a flat field exactly", () => {
    const img = new Float32Array(32 * 32).fill(0.5);
    const bg = estimateBackground(img, 32, 32, 8);
    for (const v of bg) expect(v).toBeCloseTo(0.5, 3);
  });

  it("follows a smooth illumination gradient", () => {
    const w = 96, h = 48;
    const bg = estimateBackground(makePlate(w, h), w, h, 12);
    // center row: background should sit near the local illumination
    const mid = h >> 1;
    expect(bg[mid * w + 20]).toBeGreaterThan(bg[mid * w + 5]);
    expect(bg[mid * w + 80]).toBeGreaterThan(bg[mid * w + 40]);
  });
});

describe("computeOD (flat-field property)", () => {
  it("is ~0 on band-free plate and ~log10(1/0.6) at a band", () => {
    const w = 96, h = 48;
    const img = makePlate(w, h);
    stampSpot(img, w, 48, 24, 3);
    const od = computeOD(img, estimateBackground(img, w, h, 16));
    // clean plate, interior point: the background estimate is only unbiased
    // ~r px away from the region edge (asymmetric window + gradient biases
    // it there) — the Operator-marked region carries that margin
    expect(od[10 * w + 30]).toBeLessThan(0.02);
    expect(od[24 * w + 48]).toBeCloseTo(Math.log10(1 / 0.6), 1); // band center
  });

  it("gives equal OD to equal bands under a 2x illumination gradient", () => {
    const w = 96, h = 48;
    const img = makePlate(w, h);
    stampSpot(img, w, 16, 24, 3); // dim side
    stampSpot(img, w, 80, 24, 3); // bright side
    const od = computeOD(img, estimateBackground(img, w, h, 16));
    const dim = od[24 * w + 16];
    const bright = od[24 * w + 80];
    expect(Math.abs(dim - bright) / bright).toBeLessThan(0.15);
  });
});
