import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectOnSignal } from "./detect";
import fixtures from "../../prototypes/out/fixtures.json";

// Parity fixtures: the Python reference implementation ran on the exact
// downscaled, u8-quantized signal stored next to fixtures.json, so the port
// runs on byte-identical input. Small numeric drift (f32 vs f64, gaussian
// kernels) is tolerated; structural disagreement is not.

function loadSignal(name: string, w: number, h: number): Float32Array {
  const raw = readFileSync(new URL(`../../prototypes/out/${name}_sig.u8`, import.meta.url));
  expect(raw.length).toBe(w * h);
  const sig = new Float32Array(w * h);
  for (let i = 0; i < raw.length; i++) sig[i] = (raw[i] / 255) * 0.5;
  return sig;
}

for (const [name, fx] of Object.entries(fixtures)) {
  describe(`detectOnSignal parity: ${name}`, () => {
    const sig = loadSignal(name, fx.width, fx.height);
    const got = detectOnSignal(sig, fx.width, fx.height);

    it("finds the same lanes (±3 px)", () => {
      expect(got.lanes).toHaveLength(fx.lanes.length);
      fx.lanes.forEach((x, i) => expect(Math.abs(got.lanes[i] - x)).toBeLessThanOrEqual(3));
    });

    it("finds the origin row and pitch", () => {
      expect(Math.abs(got.yOrigin - fx.yOrigin)).toBeLessThanOrEqual(3);
      expect(Math.abs(got.unit - fx.unit)).toBeLessThanOrEqual(1.5);
    });

    it("reproduces the reference bands (>=90% recall and precision, ±4 px)", () => {
      const unmatched = new Set(got.bands.map((_, i) => i));
      let matched = 0;
      for (const ref of fx.bands) {
        let best = -1;
        let bestD = Infinity;
        got.bands.forEach((b, i) => {
          if (!unmatched.has(i) || b.lane !== ref.lane) return;
          const d = Math.abs(b.y - ref.y);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        if (best >= 0 && bestD <= 4) {
          unmatched.delete(best);
          matched++;
        }
      }
      expect(matched / fx.bands.length).toBeGreaterThanOrEqual(0.9);
      expect(unmatched.size / got.bands.length).toBeLessThanOrEqual(0.1);
    });
  });
}
