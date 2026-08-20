// Smooth 2D background estimate of the plate glow. Three separable box-blur
// passes approximate a wide Gaussian; edges are normalized by the true
// window size so the estimate stays unbiased at the borders.

function boxBlurAxis(src: Float32Array, w: number, h: number, r: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const lines = horizontal ? h : w;
  const len = horizontal ? w : h;
  const stride = horizontal ? 1 : w;
  for (let ln = 0; ln < lines; ln++) {
    const base = horizontal ? ln * w : ln;
    let sum = 0;
    let count = 0;
    for (let i = 0; i <= Math.min(r, len - 1); i++) {
      sum += src[base + i * stride];
      count++;
    }
    for (let i = 0; i < len; i++) {
      out[base + i * stride] = sum / count;
      const add = i + r + 1;
      const drop = i - r;
      if (add < len) {
        sum += src[base + add * stride];
        count++;
      }
      if (drop >= 0) {
        sum -= src[base + drop * stride];
        count--;
      }
    }
  }
  return out;
}

/**
 * Background field via 3 separable box blurs of radius `r`.
 * `r` should be much larger than a band (bands must not dent the estimate)
 * and much smaller than the plate.
 */
export function estimateBackground(img: Float32Array, w: number, h: number, r: number): Float32Array {
  let cur = img;
  for (let pass = 0; pass < 3; pass++) {
    cur = boxBlurAxis(cur, w, h, r, true);
    cur = boxBlurAxis(cur, w, h, r, false);
  }
  return cur;
}
