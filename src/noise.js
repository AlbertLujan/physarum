/** Smoothstep easing: zero slope at both ends, so lattice value noise has no visible creases. */
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Linear easing, for noise where speed matters more than smoothness. */
export const linear = (t) => t;

/**
 * Add one octave of 2D value noise into `out`.
 * Random values are drawn on a lattice with spacing `cell` (row by row, via `sample`) and interpolated per cell.
 * @param {Float32Array} out size² buffer the octave is added into
 * @param {number} size grid side
 * @param {number} cell lattice spacing in cells
 * @param {() => number} sample draws one lattice value
 * @param {{amplitude?: number, ease?: (t: number) => number}} [options]
 * @returns {Float32Array} out
 */
export function addValueNoise(out, size, cell, sample, { amplitude = 1, ease = smoothstep } = {}) {
  const lattice = Math.ceil(size / cell) + 2;
  const values = Float32Array.from({ length: lattice * lattice }, sample);
  for (let y = 0; y < size; y++) {
    const gy = y / cell, y0 = gy | 0, fy = ease(gy - y0);
    for (let x = 0; x < size; x++) {
      const gx = x / cell, x0 = gx | 0, fx = ease(gx - x0);
      const a = values[y0 * lattice + x0], b = values[y0 * lattice + x0 + 1];
      const c = values[(y0 + 1) * lattice + x0], d = values[(y0 + 1) * lattice + x0 + 1];
      out[y * size + x] += amplitude * ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy);
    }
  }
  return out;
}

/**
 * One octave of value noise in a fresh buffer.
 * @returns {Float32Array}
 */
export function valueNoise(size, cell, sample, options) {
  return addValueNoise(new Float32Array(size * size), size, cell, sample, options);
}
