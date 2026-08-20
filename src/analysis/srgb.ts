// sRGB (IEC 61966-2-1) decoding. JPEG pixel values are gamma-encoded;
// densitometry needs values proportional to radiance.

const LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LUT[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function srgbToLinear(value: number): number {
  return LUT[value];
}

/** Linearized green channel of an RGBA buffer (the F254 glow lives in green). */
export function linearGreen(rgba: Uint8ClampedArray): Float32Array {
  const n = rgba.length / 4;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = LUT[rgba[i * 4 + 1]];
  return out;
}
