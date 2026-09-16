/** Rim strength by what the border of the plasmodium is doing. */
export const EDGE = Object.freeze({ expanding: 1, static: 0.3 });

/** A neighbouring cell that withdrew within this many steps marks a retreating border. */
const RETREAT_WINDOW = 30;

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Rim strength for a plasmodium cell: 0 inside the body or on a retreating border,
 * EDGE.expanding on a young advancing border, EDGE.static on an old border that is holding still.
 * @param {object} world lattice with body, age and retractedStep layers
 * @param {number} i cell index
 * @param {number} step current simulation step
 * @param {number} frontAge cells younger than this belong to the advancing front
 * @returns {number}
 */
export function edgeStrength(world, i, step, frontAge) {
  if (!world.body[i]) return 0;
  const { size, body, retractedStep } = world;
  const x = i % size, y = (i / size) | 0;
  let border = false;
  for (const [dx, dy] of SIDES) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    const n = ny * size + nx;
    if (body[n]) continue;
    if (retractedStep[n] > 0 && step - retractedStep[n] < RETREAT_WINDOW) return 0;
    border = true;
  }
  if (!border) return 0;
  return world.age[i] < frontAge ? EDGE.expanding : EDGE.static;
}
