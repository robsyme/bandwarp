// Per-Compound Calibration Curves (ticket 006's decision): fit linear and
// Michaelis-Menten (not through origin) to the standards, auto-select by
// fit quality, never extrapolate above the top standard — censor instead.

import { levenbergMarquardt } from "ml-levenberg-marquardt";

export interface StandardPoint {
  amount: number;
  area: number;
}

export type CalibrationModel = "linear" | "michaelis-menten";

export interface Calibration {
  model: CalibrationModel;
  /** linear: [slope, intercept]; michaelis-menten: [Vmax, Km, offset]. */
  params: number[];
  r2: number;
  points: StandardPoint[];
  /** Fitted area at each standard, index-aligned with points. */
  fitted: number[];
  topAmount: number;
  bottomAmount: number;
}

export function predictArea(cal: Calibration, amount: number): number {
  if (cal.model === "linear") return cal.params[0] * amount + cal.params[1];
  const [vmax, km, c] = cal.params;
  return (vmax * amount) / (km + amount) + c;
}

export type Quantity =
  | { kind: "value"; amount: number; belowBottom: boolean }
  | { kind: "aboveTop" };

/** Invert the curve for a measured area, honouring the bracketing rules. */
export function invertArea(cal: Calibration, area: number): Quantity {
  let amount: number;
  if (cal.model === "linear") {
    const [m, c] = cal.params;
    amount = (area - c) / m;
  } else {
    const [vmax, km, c] = cal.params;
    const y = area - c;
    if (y >= vmax * 0.999) return { kind: "aboveTop" };
    amount = (km * y) / (vmax - y);
  }
  if (!Number.isFinite(amount)) return { kind: "aboveTop" };
  if (amount > cal.topAmount) return { kind: "aboveTop" };
  return { kind: "value", amount: Math.max(amount, 0), belowBottom: amount < cal.bottomAmount };
}

function r2Of(points: StandardPoint[], fitted: number[]): number {
  const mean = points.reduce((s, p) => s + p.area, 0) / points.length;
  let ssRes = 0;
  let ssTot = 0;
  points.forEach((p, i) => {
    ssRes += (p.area - fitted[i]) ** 2;
    ssTot += (p.area - mean) ** 2;
  });
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

function fitLinear(points: StandardPoint[]): { params: number[]; fitted: number[]; r2: number } {
  const n = points.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    sx += p.amount;
    sy += p.area;
    sxx += p.amount * p.amount;
    sxy += p.amount * p.area;
  }
  const det = n * sxx - sx * sx;
  const m = det !== 0 ? (n * sxy - sx * sy) / det : 0;
  const c = (sy - m * sx) / n;
  const fitted = points.map((p) => m * p.amount + c);
  return { params: [m, c], fitted, r2: r2Of(points, fitted) };
}

function fitMM(points: StandardPoint[]): { params: number[]; fitted: number[]; r2: number } | null {
  const maxArea = Math.max(...points.map((p) => p.area));
  const midAmount = points[Math.trunc(points.length / 2)].amount;
  const mm = ([vmax, km, c]: number[]) => (a: number) => (vmax * a) / (km + a) + c;
  try {
    const out = levenbergMarquardt(
      { x: points.map((p) => p.amount), y: points.map((p) => p.area) },
      mm,
      {
        initialValues: [maxArea * 1.5, midAmount, 0],
        minValues: [1e-9, 1e-9, -maxArea],
        maxValues: [maxArea * 100, midAmount * 1000, maxArea],
        maxIterations: 200,
        damping: 1.5,
      },
    );
    const f = mm(out.parameterValues);
    const fitted = points.map((p) => f(p.amount));
    return { params: out.parameterValues, fitted, r2: r2Of(points, fitted) };
  } catch {
    return null;
  }
}

/**
 * Fit both models and auto-select: Michaelis-Menten wins only when it has
 * enough points to earn its extra parameters and meaningfully beats the
 * line; ties go to the simpler model.
 */
export function fitCalibration(points: StandardPoint[]): Calibration | null {
  const pts = [...points].sort((a, b) => a.amount - b.amount);
  if (pts.length < 3) return null;
  const lin = fitLinear(pts);
  const mm = pts.length >= 4 ? fitMM(pts) : null;
  const useMM = mm !== null && mm.r2 > lin.r2 + 0.003 && mm.params[0] > 0 && mm.params[1] > 0;
  const chosen = useMM ? mm : lin;
  return {
    model: useMM ? "michaelis-menten" : "linear",
    params: chosen.params,
    r2: chosen.r2,
    points: pts,
    fitted: chosen.fitted,
    topAmount: pts[pts.length - 1].amount,
    bottomAmount: pts[0].amount,
  };
}
