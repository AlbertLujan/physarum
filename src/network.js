const NEIGHBOURS_8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
export const UNREACHED = 0x3fffffff;

/**
 * Label 8-connected regions of a mask.
 * @param {Uint8Array} mask 1 = member
 * @param {number} size grid side
 * @param {Int32Array} labels output, -1 outside the mask
 * @param {Int32Array} queue scratch buffer
 * @returns {number} component count
 */
export function labelComponents(mask, size, labels, queue) {
  labels.fill(-1);
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    labels[start] = count;
    while (head < tail) {
      const i = queue[head++];
      forEachNeighbour(size, i, (j) => {
        if (mask[j] && labels[j] === -1) { labels[j] = count; queue[tail++] = j; }
      });
    }
    count++;
  }
  return count;
}

/** Cell costs must stay below this; it sizes the circular bucket queue. */
export const MAX_CELL_COST = 256;
/** Diagonal step multiplier in 1/128 units (181/128 ≈ √2), keeping lattice paths close to Euclidean. */
const DIAGONAL = 181;

/**
 * Multi-source shortest-path tree with small integer cell costs (circular Dial bucket queue).
 * @param {number} size grid side
 * @param {Uint8Array} passable 1 = traversable
 * @param {number[]} sources start cells
 * @param {Uint8Array} cost cost (1..181) of entering each cell orthogonally; diagonal entry costs ≈ √2 times more
 * @param {Int32Array} dist output distances, UNREACHED when unreachable
 * @param {Int32Array} parent output predecessor, -1 at sources
 */
export function shortestPathTree(size, passable, sources, cost, dist, parent) {
  dist.fill(UNREACHED);
  parent.fill(-1);
  const rings = Array.from({ length: MAX_CELL_COST }, () => []);
  const ringMask = MAX_CELL_COST - 1;
  let pending = 0;
  for (const s of sources) { dist[s] = 0; rings[0].push(s); pending++; }
  for (let d = 0; pending > 0; d++) {
    const bucket = rings[d & ringMask];
    for (let k = 0; k < bucket.length; k++) {
      const i = bucket[k];
      pending--;
      if (dist[i] !== d) continue;
      const x = i % size, y = (i / size) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= size) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= size) continue;
          const j = ny * size + nx;
          if (!passable[j]) continue;
          const step = dx !== 0 && dy !== 0 ? (cost[j] * DIAGONAL) >> 7 : cost[j];
          const nd = d + step;
          if (nd >= dist[j]) continue;
          dist[j] = nd;
          parent[j] = i;
          rings[nd & ringMask].push(j);
          pending++;
        }
      }
    }
    bucket.length = 0;
  }
}

/**
 * Send one unit of flow from every sink back to its source along the tree.
 * @param {Int32Array} parent from shortestPathTree
 * @param {Int32Array} dist from shortestPathTree
 * @param {number[]} sinks demand cells
 * @param {Float32Array} flow output
 * @param {{reset?: boolean, amount?: number}} [options] reset clears flow first; amount is the flow per sink
 */
export function accumulateFlow(parent, dist, sinks, flow, { reset = true, amount = 1 } = {}) {
  if (reset) flow.fill(0);
  for (const sink of sinks) {
    if (dist[sink] === UNREACHED) continue;
    for (let i = sink; i !== -1; i = parent[i]) flow[i] += amount;
  }
}

/** Visit the in-bounds 8-neighbours of cell i. */
export function forEachNeighbour(size, i, visit) {
  const x = i % size, y = (i / size) | 0;
  for (const [dx, dy] of NEIGHBOURS_8) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size) visit(ny * size + nx);
  }
}
