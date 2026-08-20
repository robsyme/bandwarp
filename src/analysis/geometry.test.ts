import { describe, expect, it } from "vitest";
import { applyHomography, homographyFromQuad, rectify, suggestSize } from "./geometry";

const rectCorners = [
  { x: 5, y: 4 },
  { x: 25, y: 4 },
  { x: 25, y: 24 },
  { x: 5, y: 24 },
];

describe("homographyFromQuad", () => {
  it("maps the destination corners exactly onto the source corners", () => {
    const src = [
      { x: 3, y: 2 },
      { x: 41, y: 6 },
      { x: 38, y: 33 },
      { x: 1, y: 29 },
    ]; // a genuinely perspective quad
    const H = homographyFromQuad(20, 10, src);
    const dstCorners = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ];
    dstCorners.forEach((d, i) => {
      const p = applyHomography(H, d.x, d.y);
      expect(p.x).toBeCloseTo(src[i].x, 6);
      expect(p.y).toBeCloseTo(src[i].y, 6);
    });
  });
});

describe("suggestSize", () => {
  it("returns the dimensions of an axis-aligned rectangle", () => {
    const { width, height } = suggestSize(rectCorners);
    expect(width).toBe(20);
    expect(height).toBe(20);
  });
});

describe("rectify", () => {
  it("reproduces the sub-image when corners are an axis-aligned rectangle", () => {
    const w = 40, h = 30;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        rgba[i + 1] = (x * 7 + y * 13) % 256; // deterministic green pattern
        rgba[i + 3] = 255;
      }
    const out = rectify(rgba, w, h, rectCorners, 20, 20);
    // pattern steps 7/px horizontally, 13/px vertically: allow bilinear
    // half-pixel tolerance but catch any real misalignment
    for (const [dx, dy] of [[0, 0], [10, 7], [19, 19], [3, 15]]) {
      const got = out[(dy * 20 + dx) * 4 + 1];
      const want = ((5 + dx) * 7 + (4 + dy) * 13) % 256;
      expect(Math.abs(got - want)).toBeLessThanOrEqual(12);
    }
  });
});
