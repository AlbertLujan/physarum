import { diffuse } from "./grid.js";
import { coarseCellOf } from "./world.js";

/**
 * Advance all passive lattice processes by one step.
 * @param {object} world
 * @param {object} params
 */
export function stepEnvironment(world, params) {
  const env = params.environment;
  world.envSteps++;
  if (world.envSteps % SLIME_DECAY_INTERVAL === 0) decaySlime(world, env);
  emitFoodScent(world, env);
  for (let p = 0; p < env.chemoPasses; p++) {
    diffuse(world.chemo, world.coarseScratch, world.coarseSize, { rate: env.chemoDiffusion, decay: env.chemoDecay }, world.coarseWall);
  }
  if (!world.repelActive) return;
  emitRepellent(world, env);
  for (let p = 0; p < env.repelPasses; p++) {
    diffuse(world.repel, world.coarseScratch, world.coarseSize, { rate: env.repelDiffusion, decay: env.repelDecay }, world.coarseWall);
  }
  if (world.envSteps % 64 === 0) world.repelActive = hasRepellentLeft(world);
}

/** Slime changes slowly, so its decay is applied in batches. */
const SLIME_DECAY_INTERVAL = 8;

/** Extracellular slime fades very slowly. */
function decaySlime(world, env) {
  const { slime } = world;
  const keep = (1 - env.slimeDecay) ** SLIME_DECAY_INTERVAL;
  for (let i = 0; i < slime.length; i++) if (slime[i]) slime[i] *= keep;
}

/** True while any repellent is still dissolving or measurable in the agar. */
function hasRepellentLeft(world) {
  for (let ci = 0; ci < world.repel.length; ci++) if (world.repel[ci] > 1e-3 || world.repelSource[ci] > 1e-3) return true;
  return false;
}

/**
 * Food cells release attractant while nutrient remains. Emission is suppressed under plasmodium,
 * as in Jones & Adamatzky's nutrient projection, so engulfed sources stop monopolising the network.
 */
function emitFoodScent(world, env) {
  const { food, scent, chemo, body, factor } = world;
  let write = 0;
  const cells = world.foodCells;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k];
    if (food[i] <= 0) continue;
    cells[write++] = i;
    const ci = coarseCellOf(world, i);
    const suppression = body[i] ? env.coveredEmission : 1;
    chemo[ci] += scent[i] * env.chemoEmission * suppression / (factor * factor);
  }
  cells.length = write;
}

/** Repellent crystals dissolve: a fraction of each source enters the solution each step. */
function emitRepellent(world, env) {
  const { repelSource, repel } = world;
  const rate = env.repelRelease;
  for (let ci = 0; ci < repelSource.length; ci++) {
    if (repelSource[ci] <= 0) continue;
    const released = repelSource[ci] * rate;
    repelSource[ci] -= released;
    repel[ci] += released;
  }
}
