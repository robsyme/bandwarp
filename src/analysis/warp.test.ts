import { describe, expect, it } from "vitest";
import { type Band, fit } from "./warp";

// Synthetic plate: 20 lanes, shared drift shape d(x) = sin ramp, three
// compound rows with different amplitudes (drift grows with migration).
const L = 20;
const laneXs = Array.from({ length: L }, (_, i) => 30 + i * 30);
const drift = (x: number) => 40 * Math.sin(((x - 30) / 570) * Math.PI); // px

function makeBands(): Band[] {
  const rows = [
    { offset: 100, amp: 0.2, strength: 0.2 },
    { offset: 200, amp: 0.6, strength: 0.15 },
    { offset: 300, amp: 1.0, strength: 0.25 },
  ];
  const bands: Band[] = [];
  let id = 0;
  rows.forEach((r, ri) => {
    for (let li = 0; li < L; li++) {
      if (ri === 1 && (li === 5 || li === 6)) continue; // missing bands
      const jitter = ((li * 7919) % 5) - 2; // deterministic ±2 px
      bands.push({
        id: `b${id++}`,
        lane: li,
        y: r.offset + r.amp * drift(laneXs[li]) + jitter,
        strength: r.strength,
      });
    }
  });
  return bands;
}

const plate = { width: 640, height: 400, lanes: laneXs.map((x) => ({ x })) };

describe("fit (scaled shared warp)", () => {
  it("recovers three rows with full membership despite missing bands", () => {
    const bands = makeBands();
    const { rows, noise } = fit(plate, bands, { model: "scaled", tol: 14 });
    expect(rows).toHaveLength(3);
    const sizes = rows.map((r) => r.members.length).sort((a, b) => a - b);
    expect(sizes).toEqual([18, 20, 20]);
    expect(noise).toHaveLength(0);
  });

  it("predicts a missing band's position from the shared drift", () => {
    const bands = makeBands();
    const { rows } = fit(plate, bands, { model: "scaled", tol: 14 });
    const middle = rows.find((r) => r.members.length === 18)!;
    // lane 5 has no band in the middle row: the curve should still predict it
    const want = 200 + 0.6 * drift(laneXs[5]);
    expect(Math.abs(middle.curve[5] - want)).toBeLessThan(6);
  });

  it("leaves an isolated spurious band unassigned", () => {
    const bands = makeBands();
    bands.push({ id: "junk", lane: 10, y: 30, strength: 0.4 });
    const { noise } = fit(plate, bands, { model: "scaled", tol: 14 });
    expect(noise.map((b) => b.id)).toEqual(["junk"]);
  });
});

describe("fit (independent rows)", () => {
  it("still groups the three rows on clean data", () => {
    const bands = makeBands();
    const { rows } = fit(plate, bands, { model: "independent", tol: 14 });
    // greedy linking may fragment, but the three big rows must exist
    const big = rows.filter((r) => r.members.length >= 15);
    expect(big).toHaveLength(3);
  });
});
