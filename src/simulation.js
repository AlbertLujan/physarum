import { createParams } from "./params.js";
import { createRng } from "./rng.js";
import { createWorld, placeFood, placeRepellent, paintLight, paintWall, eraseArea } from "./world.js";
import { Plasmodium } from "./plasmodium.js";
import { stepEnvironment } from "./environment.js";
import { SUBSTANCES } from "./substances.js";

/** Tool handlers keyed by substance kind. Brush radius is in cells. */
const PLACE_BY_KIND = {
  inoculum: (sim, type, x, y, brush) => sim.plasmodium.inoculate(x, y, brush),
  food: (sim, type, x, y) => placeFood(sim.world, type, SUBSTANCES[type], x, y),
  repellent: (sim, type, x, y) => placeRepellent(sim.world, type, SUBSTANCES[type], x, y),
  light: (sim, type, x, y, brush) => paintLight(sim.world, x, y, brush),
  wall: (sim, type, x, y, brush) => sim.plasmodium.removeAt(paintWall(sim.world, x, y, brush)),
  erase: (sim, type, x, y, brush) => eraseArea(sim.world, x, y, brush),
};

export class Simulation {
  /**
   * @param {{seed?: number, params?: object}} options
   */
  constructor({ seed = 1, params = {} } = {}) {
    this.params = createParams(params);
    this.rng = createRng(seed);
    this.world = createWorld(this.params);
    this.plasmodium = new Plasmodium(this.world, this.params, this.rng);
    this.steps = 0;
  }

  /** Advance the model by n steps. */
  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.plasmodium.step();
      stepEnvironment(this.world, this.params);
      this.steps++;
    }
  }

  /**
   * Apply a tool at a grid position.
   * @param {string} type key of SUBSTANCES
   * @param {number} x grid x
   * @param {number} y grid y
   * @param {number} [brush=6] brush radius in cells for painted tools and inocula
   */
  place(type, x, y, brush = 6) {
    const substance = SUBSTANCES[type];
    if (!substance) throw new Error(`Unknown tool: ${type}`);
    PLACE_BY_KIND[substance.kind](this, type, x, y, brush);
  }

  /** Summary figures in real-world units. */
  stats() {
    const { world, plasmodium, params } = this;
    let remaining = 0, veinCells = 0;
    for (let i = 0; i < world.food.length; i++) {
      remaining += world.food[i];
      if (world.vein[i] > params.retraction.veinKeep) veinCells++;
    }
    return {
      elapsedSeconds: this.steps * params.secondsPerStep,
      cells: plasmodium.count,
      areaMm2: plasmodium.count * world.mmPerCell ** 2,
      veinLengthCm: (veinCells * world.mmPerCell) / 10,
      foodRemaining: world.foodPlaced > 0 ? Math.min(1, remaining / world.foodPlaced) : null,
    };
  }
}

/** Fraction of one food item's nutrient still present (overlapping items share cells, so it is capped). */
export function remainingFood(world, item) {
  let sum = 0;
  for (const i of item.cells) sum += world.food[i];
  return Math.min(1, sum / item.initial);
}
