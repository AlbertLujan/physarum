import { createDishMask } from "./dish.js";
import { forEachInDisc } from "./grid.js";

/**
 * Allocate all lattice layers for one Petri dish.
 * Fine layers (size²):
 *   environment  wall, food, scent, light, slime
 *   plasmodium   body (1 = cytoplasm present), age (steps since the cell joined), energy, vein (0..1 thickness),
 *                flow (routed cytoplasm), core (inoculum origin),
 *                mass (thick sheet engulfing food, 0..1), halo (cells around food that still has nutrient),
 *                trace (dried imprint of withdrawn veins, 0..1), retractedStep (step a cell last withdrew, 0 = never)
 * Coarse layers also hold pressure: vein supply blurred toward the fronts.
 * Coarse layers (coarseSize²): chemo (food attractant), repel, repelSource, coarseWall.
 * @param {object} params
 */
export function createWorld(params) {
  const size = params.gridSize;
  const coarseSize = Math.ceil(size / params.coarseFactor);
  const n = size * size, cn = coarseSize * coarseSize;
  const dishMask = createDishMask(size);
  const world = {
    size, coarseSize, factor: params.coarseFactor, mmPerCell: params.dishMm / size,
    dishMask, wall: dishMask.slice(),
    food: new Float32Array(n), scent: new Float32Array(n), light: new Float32Array(n), slime: new Float32Array(n),
    body: new Uint8Array(n), age: new Float32Array(n), energy: new Float32Array(n), vein: new Float32Array(n),
    flow: new Float32Array(n), core: new Uint8Array(n), mass: new Float32Array(n), halo: new Uint8Array(n), trace: new Float32Array(n),
    retractedStep: new Float32Array(n),
    pressure: new Float32Array(cn),
    chemo: new Float32Array(cn), repel: new Float32Array(cn), repelSource: new Float32Array(cn), coarseWall: new Uint8Array(cn),
    scratch: new Float32Array(n), coarseScratch: new Float32Array(cn),
    items: [], foodCells: [], foodPlaced: 0, repelActive: false, envSteps: 0, version: 0,
  };
  refreshCoarseWall(world);
  return world;
}

/** Coarse index for a fine-grid position. */
export function coarseIndex(world, x, y) {
  return ((y / world.factor) | 0) * world.coarseSize + ((x / world.factor) | 0);
}

/** A coarse cell is blocked when its centre fine cell is blocked. */
export function refreshCoarseWall(world) {
  const { coarseSize, factor, size, wall, coarseWall } = world;
  const half = factor >> 1;
  for (let cy = 0; cy < coarseSize; cy++) {
    for (let cx = 0; cx < coarseSize; cx++) {
      const fx = Math.min(size - 1, cx * factor + half), fy = Math.min(size - 1, cy * factor + half);
      coarseWall[cy * coarseSize + cx] = wall[fy * size + fx];
    }
  }
}

/** Food is engulfed within this multiple of its radius. */
export const HALO_SCALE = 1.9;

/**
 * Deposit a food item; nutrient is spread evenly over a disc.
 * @returns {object|null} placed item
 */
export function placeFood(world, type, substance, x, y) {
  const radius = substance.radiusMm / world.mmPerCell;
  const cells = [];
  forEachInDisc(world.size, x, y, radius, (i) => {
    if (world.wall[i]) return;
    world.food[i] += substance.nutrient;
    world.scent[i] = Math.max(world.scent[i], substance.scent);
    cells.push(i);
  });
  if (!cells.length) return null;
  const halo = [];
  forEachInDisc(world.size, x, y, radius * HALO_SCALE, (i) => { if (!world.wall[i]) halo.push(i); });
  const item = { type, kind: "food", x, y, radius, cells, halo, initial: cells.length * substance.nutrient };
  world.foodPlaced += item.initial;
  world.items.push(item);
  world.foodCells.push(...cells);
  world.version++;
  return item;
}

/** Deposit a dissolving repellent crystal onto the coarse source layer. */
export function placeRepellent(world, type, substance, x, y) {
  const radius = Math.max(1, substance.radiusMm / world.mmPerCell / world.factor);
  forEachInDisc(world.coarseSize, x / world.factor, y / world.factor, radius, (ci) => {
    if (!world.coarseWall[ci]) world.repelSource[ci] += substance.amount;
  });
  world.items.push({ type, kind: "repellent", x, y, radius: substance.radiusMm / world.mmPerCell });
  world.repelActive = true;
  world.version++;
}

/** A light spot spills this far beyond the brush radius before fading to darkness. */
const LIGHT_SPREAD = 1.5;

/**
 * Paint a soft light spot, like a lamp pointed at the dish: full brightness at the centre, fading smoothly to
 * darkness at LIGHT_SPREAD × radius. Overlapping strokes keep the brighter value.
 */
export function paintLight(world, x, y, radius) {
  const reach = radius * LIGHT_SPREAD;
  const cx = Math.floor(x), cy = Math.floor(y);
  forEachInDisc(world.size, x, y, reach, (i) => {
    if (world.dishMask[i]) return;
    const d = Math.hypot((i % world.size) - cx, ((i / world.size) | 0) - cy) / reach;
    const glow = (1 - d * d) ** 2;
    if (glow > world.light[i]) world.light[i] = glow;
  });
  world.version++;
}

/**
 * Paint obstacle cells. Returns indices that became walls so occupants can be removed.
 * @returns {number[]}
 */
export function paintWall(world, x, y, radius) {
  const painted = [];
  forEachInDisc(world.size, x, y, radius, (i) => {
    if (world.wall[i]) return;
    world.wall[i] = 1;
    painted.push(i);
  });
  if (painted.length) { refreshCoarseWall(world); world.version++; }
  return painted;
}

/** Remove food, repellent, light and obstacles under a brush. */
export function eraseArea(world, x, y, radius) {
  forEachInDisc(world.size, x, y, radius, (i) => {
    world.food[i] = 0; world.scent[i] = 0; world.light[i] = 0;
    world.wall[i] = world.dishMask[i];
  });
  forEachInDisc(world.coarseSize, x / world.factor, y / world.factor, radius / world.factor + 1, (ci) => {
    world.repelSource[ci] = 0; world.repel[ci] = 0;
  });
  world.items = world.items.filter((item) => Math.hypot(item.x - x, item.y - y) > radius);
  refreshCoarseWall(world);
  world.version++;
}
