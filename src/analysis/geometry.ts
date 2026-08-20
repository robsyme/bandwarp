// Perspective rectification from four Operator-marked plate corners.
// Corners are ordered top-left, top-right, bottom-right, bottom-left.

export interface Pt {
  x: number;
  y: number;
}

/** Gaussian elimination with partial pivoting for the 8x8 DLT system. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c];
    x[r] = s / A[r][r];
  }
  return x;
}

/**
 * Homography H mapping destination-rectangle coordinates (0,0)-(outW,outH)
 * onto the source quad (tl, tr, br, bl). Returned as 9 values, h8 = 1.
 */
export function homographyFromQuad(outW: number, outH: number, src: Pt[]): Float64Array {
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: X, y: Y } = dst[i];
    const { x, y } = src[i];
    A.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y]);
    b.push(x);
    A.push([0, 0, 0, X, Y, 1, -y * X, -y * Y]);
    b.push(y);
  }
  const h = solve(A, b);
  return Float64Array.from([...h, 1]);
}

export function applyHomography(H: Float64Array, x: number, y: number): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

/** Output size for a rectified quad: the longer of each opposing edge pair. */
export function suggestSize(c: Pt[]): { width: number; height: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  return {
    width: Math.round(Math.max(d(c[0], c[1]), d(c[3], c[2]))),
    height: Math.round(Math.max(d(c[0], c[3]), d(c[1], c[2]))),
  };
}

/** Rectify an RGBA image: sample the source quad onto an outW x outH rect. */
export function rectify(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  corners: Pt[],
  outW: number,
  outH: number,
): Uint8ClampedArray {
  const H = homographyFromQuad(outW, outH, corners);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const p = applyHomography(H, dx + 0.5, dy + 0.5);
      const sx = p.x - 0.5;
      const sy = p.y - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (dy * outW + dx) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const i00 = (y0 * w + x0) * 4 + ch;
        const v =
          rgba[i00] * (1 - fx) * (1 - fy) +
          rgba[i00 + 4] * fx * (1 - fy) +
          rgba[i00 + w * 4] * (1 - fx) * fy +
          rgba[i00 + w * 4 + 4] * fx * fy;
        out[o + ch] = v;
      }
    }
  }
  return out;
}
