/**
 * Seeded PRNG (mulberry32) so runs are reproducible.
 * @param {number} seed
 * @returns {{next: () => number, range: (lo: number, hi: number) => number, int: (n: number) => number}}
 */
export function createRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
  };
}
