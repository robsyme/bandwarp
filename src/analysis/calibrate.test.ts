import { describe, expect, it } from "vitest";
import { fitCalibration, invertArea, predictArea } from "./calibrate";

const SERIES = [0.25, 0.5, 1, 1.5, 2, 3, 4];

describe("fitCalibration", () => {
  it("selects linear for straight data and inverts it", () => {
    const pts = SERIES.map((a) => ({ amount: a, area: 2 * a + 0.1 }));
    const cal = fitCalibration(pts)!;
    expect(cal.model).toBe("linear");
    expect(cal.r2).toBeGreaterThan(0.9999);
    expect(cal.params[0]).toBeCloseTo(2, 3);
    const q = invertArea(cal, 2 * 1.7 + 0.1);
    expect(q.kind).toBe("value");
    if (q.kind === "value") {
      expect(q.amount).toBeCloseTo(1.7, 3);
      expect(q.belowBottom).toBe(false);
    }
  });

  it("selects Michaelis-Menten for saturating data", () => {
    const mm = (a: number) => (10 * a) / (1.2 + a) + 0.05;
    const cal = fitCalibration(SERIES.map((a) => ({ amount: a, area: mm(a) })))!;
    expect(cal.model).toBe("michaelis-menten");
    expect(cal.r2).toBeGreaterThan(0.999);
    expect(predictArea(cal, 2)).toBeCloseTo(mm(2), 2);
    const q = invertArea(cal, mm(2.5));
    expect(q.kind).toBe("value");
    if (q.kind === "value") expect(q.amount).toBeCloseTo(2.5, 1);
  });

  it("censors above the top standard instead of extrapolating", () => {
    const cal = fitCalibration(SERIES.map((a) => ({ amount: a, area: 2 * a })))!;
    expect(invertArea(cal, 2 * 4.5)).toEqual({ kind: "aboveTop" });
    // MM: area at/above Vmax is uninvertible -> censored
    const mmCal = fitCalibration(SERIES.map((a) => ({ amount: a, area: (10 * a) / (1.2 + a) })))!;
    if (mmCal.model === "michaelis-menten") expect(invertArea(mmCal, 11).kind).toBe("aboveTop");
  });

  it("flags below the bottom standard but still reports", () => {
    const cal = fitCalibration(SERIES.map((a) => ({ amount: a, area: 2 * a })))!;
    const q = invertArea(cal, 2 * 0.1);
    expect(q.kind).toBe("value");
    if (q.kind === "value") {
      expect(q.belowBottom).toBe(true);
      expect(q.amount).toBeCloseTo(0.1, 3);
    }
  });

  it("needs at least three standards", () => {
    expect(fitCalibration([{ amount: 1, area: 2 }, { amount: 2, area: 4 }])).toBeNull();
  });

  it("survives excluded faint standards (subset of the series)", () => {
    const pts = SERIES.slice(2).map((a) => ({ amount: a, area: 1.5 * a + 0.2 }));
    const cal = fitCalibration(pts)!;
    expect(cal.bottomAmount).toBe(1);
    expect(cal.topAmount).toBe(4);
  });
});
