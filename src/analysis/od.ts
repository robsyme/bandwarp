// Absorbance-like signal: OD = log10(I_background / I_pixel) on the
// linearized green channel. The ratio to local background performs
// flat-field correction implicitly.

const EPS = 1e-4;

export function computeOD(linear: Float32Array, background: Float32Array): Float32Array {
  const od = new Float32Array(linear.length);
  for (let i = 0; i < linear.length; i++) {
    const v = Math.log10(Math.max(background[i], EPS) / Math.max(linear[i], EPS));
    od[i] = v > 0 ? v : 0;
  }
  return od;
}
