/**
 * Flat index of the cell containing (x, y), or -1 when outside a square grid.
 * @param {number} size grid side in cells
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function cellIndex(size, x, y) {
  if (x < 0 || y < 0 || x >= size || y >= size) return -1;
  return (y | 0) * size + (x | 0);
}

/**
 * One explicit diffusion + decay pass using the 3x3 mean (Jones 2010 trail kernel).
 * Blocked cells act as absorbing boundaries and stay at zero.
 * @param {Float32Array} field values, updated in place
 * @param {Float32Array} scratch same-length buffer
 * @param {number} size grid side
 * @param {{rate: number, decay: number}} opts rate 0..1 blends toward the mean; decay 0..1 per pass
 * @param {Uint8Array|null} blocked
 * @returns {Float32Array} field
 */
export function diffuse(field, scratch, size, { rate, decay }, blocked) {
  const keep = 1 - decay;
  for (let y = 0; y < size; y++) {
    const y0 = y > 0 ? y - 1 : y, y1 = y < size - 1 ? y + 1 : y;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (blocked && blocked[i]) { scratch[i] = 0; continue; }
      const x0 = x > 0 ? x - 1 : x, x1 = x < size - 1 ? x + 1 : x;
      let sum = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * size;
        for (let xx = x0; xx <= x1; xx++) sum += field[row + xx];
      }
      const mean = sum / 9;
      scratch[i] = (field[i] + rate * (mean - field[i])) * keep;
    }
  }
  field.set(scratch);
  return field;
}

/**
 * Visit every cell index inside a disc.
 * @param {number} size grid side
 * @param {number} cx centre x (cells)
 * @param {number} cy centre y (cells)
 * @param {number} radius cells
 * @param {(index: number, distance: number) => void} visit
 */
export function forEachInDisc(size, cx, cy, radius, visit) {
  const r2 = radius * radius;
  const xMin = Math.max(0, Math.floor(cx - radius)), xMax = Math.min(size - 1, Math.ceil(cx + radius));
  const yMin = Math.max(0, Math.floor(cy - radius)), yMax = Math.min(size - 1, Math.ceil(cy + radius));
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const d2 = (x - Math.floor(cx)) ** 2 + (y - Math.floor(cy)) ** 2;
      if (d2 <= r2) visit(y * size + x, Math.sqrt(d2));
    }
  }
}

/**
 * Fill a disc of a layer with a constant value.
 * @param {Uint8Array|Float32Array} layer
 */
export function paintDisc(layer, size, cx, cy, radius, value) {
  forEachInDisc(size, cx, cy, radius, (i) => { layer[i] = value; });
}
