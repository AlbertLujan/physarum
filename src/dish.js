/**
 * Mask of cells outside the circular Petri dish (1 = outside / blocked).
 * @param {number} size grid side in cells
 * @returns {Uint8Array}
 */
export function createDishMask(size) {
  const mask = new Uint8Array(size * size);
  const c = (size - 1) / 2;
  const r2 = (size / 2 - 1.5) ** 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x - c) ** 2 + (y - c) ** 2 > r2) mask[y * size + x] = 1;
    }
  }
  return mask;
}
