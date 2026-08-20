import { describe, expect, it } from "vitest";
import { linearGreen, srgbToLinear } from "./srgb";

describe("srgbToLinear", () => {
  // expected values are worked examples from the sRGB spec (IEC 61966-2-1)
  it("maps black to 0 and white to 1", () => {
    expect(srgbToLinear(0)).toBeCloseTo(0, 6);
    expect(srgbToLinear(255)).toBeCloseTo(1, 6);
  });

  it("maps mid-gray 128 to 0.2158 (spec curve, not 0.5)", () => {
    expect(srgbToLinear(128)).toBeCloseTo(0.2158, 3);
  });

  it("uses the linear segment below the knee", () => {
    // 8/255 = 0.03137 <= 0.04045, so linear/12.92 = 0.002428
    expect(srgbToLinear(8)).toBeCloseTo(0.03137 / 12.92, 5);
  });
});

describe("linearGreen", () => {
  it("extracts the linearized green channel from RGBA", () => {
    const rgba = new Uint8ClampedArray([
      10, 0, 200, 255, // green 0
      0, 128, 0, 255, // green 128
      99, 255, 3, 255, // green 255
    ]);
    const g = linearGreen(rgba);
    expect(g).toHaveLength(3);
    expect(g[0]).toBeCloseTo(0, 6);
    expect(g[1]).toBeCloseTo(0.2158, 3);
    expect(g[2]).toBeCloseTo(1, 6);
  });
});
