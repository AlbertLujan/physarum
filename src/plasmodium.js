import { forEachInDisc } from "./grid.js";
import { addValueNoise } from "./noise.js";
import { VeinNetwork, signedSample } from "./veins.js";
import { chemoAt, coarseCellOf } from "./world.js";

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
const SENSE_CELLS = 8;

/**
 * Multinucleate plasmodium as a lattice territory: the life cycle of each cell.
 * - Young cells at the edge form the advancing fan-shaped front.
 * - Behind the front the sheet withdraws unless an adaptive vein keeps it alive, leaving slime.
 * - Fronts fed by strong veins grow faster, so arms emerge where supply arrives (veins live in VeinNetwork).
 */
export class Plasmodium {
  /**
   * @param {object} world lattice from createWorld
   * @param {object} params model parameters
   * @param {{next: () => number, int: (n: number) => number}} rng
   */
  constructor(world, params, rng) {
    this.world = world;
    this.params = params;
    this.rng = rng;
    this.count = 0;
    this.stepsTaken = 0;
    this.births = [];
    this.lobe = createLobeNoise(world.size, params.growth.lobeCells, rng);
    this.network = new VeinNetwork(world, params, rng);
  }

  /** Seed a disc of plasmodium carrying an energy reserve; these cells form the persistent core. */
  inoculate(cx, cy, radius) {
    const { world } = this;
    const energy = this.params.metabolism.inoculumEnergy;
    forEachInDisc(world.size, cx, cy, radius, (i) => {
      if (world.wall[i]) return;
      if (!world.body[i]) this.count++;
      world.body[i] = 1; world.age[i] = 0; world.core[i] = 1;
      world.energy[i] += energy;
      this.network.addCore(i);
    });
  }

  /** Remove plasmodium from cells (e.g. freshly painted walls) without leaving slime. */
  removeAt(cells) {
    for (const i of cells) if (this.world.body[i]) this.clearCell(i);
  }

  /** Advance one step: periodic network update, then every body cell, then synchronous births. */
  step() {
    if (this.stepsTaken++ % this.params.network.interval === 0) this.network.update(this.count);
    this.births.length = 0;
    const { body } = this.world;
    for (let i = 0; i < body.length; i++) if (body[i]) this.updateCell(i);
    this.applyBirths();
  }

  updateCell(i) {
    const w = this.world;
    w.age[i] += 1;
    if (w.core[i] && w.age[i] > this.params.metabolism.coreLifetime && !w.halo[i]) w.core[i] = 0;
    this.metabolize(i);
    if (this.shouldRetract(i)) this.retract(i);
    else this.tryGrow(i);
  }

  /** Feed from food under the cell and pay maintenance, raised by light and dissolved repellent. */
  metabolize(i) {
    const w = this.world, m = this.params.metabolism;
    const take = Math.min(w.food[i], m.uptake);
    w.food[i] -= take;
    w.energy[i] = Math.max(0, w.energy[i] + take - m.cost - w.light[i] * m.lightCost - this.repelAt(i) * m.toxicCost);
  }

  /** Old sheet withdraws unless fed by a vein, lying on food, or part of a well-fed core. */
  shouldRetract(i) {
    const w = this.world, r = this.params.retraction;
    if (w.age[i] < this.params.growth.frontAge || w.food[i] > 0 || w.halo[i]) return false;
    if (w.mass[i] > 0) return this.rng.next() < r.base * (1 - w.mass[i]) ** 3;
    const starving = w.energy[i] < r.starvingEnergy;
    if (w.core[i] && !starving) return false;
    const inVein = w.vein[i] > r.veinKeep;
    if (inVein && !starving) return false;
    const base = r.base * (inVein ? r.veinProtection : 1);
    const stress = 1 + (starving ? r.starvation : 0) + w.light[i] * r.lightFactor + this.repelAt(i) * r.repelFactor;
    return this.rng.next() < base * stress;
  }

  /** Withdraw a cell: leave extracellular slime and stream its energy into a touching cell (conserved). */
  retract(i) {
    const w = this.world;
    const offset = this.rng.int(STEPS.length);
    for (let k = 0; k < STEPS.length; k++) {
      const [dx, dy] = STEPS[(offset + k) % STEPS.length];
      const n = this.neighbourIndex(i, dx, dy);
      if (n >= 0 && w.body[n]) { w.energy[n] += w.energy[i]; break; }
    }
    w.slime[i] = 1;
    w.trace[i] = Math.max(w.trace[i], w.vein[i]);
    w.retractedStep[i] = this.stepsTaken;
    this.clearCell(i);
  }

  clearCell(i) {
    const w = this.world;
    w.body[i] = 0; w.energy[i] = 0; w.vein[i] = 0; w.core[i] = 0; w.age[i] = 0; w.mass[i] = 0;
    this.count--;
  }

  /**
   * Front cells, and occasionally well-supplied vein cells, try to bud into a random free neighbour.
   * Cells already touching food keep engulfing it at any age and may spend their last reserve doing so,
   * so a plasmodium that arrives exhausted still reaches the nutrient instead of starving next to it.
   */
  tryGrow(i) {
    const w = this.world, g = this.params.growth;
    const young = w.age[i] < g.frontAge;
    const engulfing = w.halo[i] === 1;
    const supply = this.pressureAt(i);
    const branchChance = g.sideBranch * (1 + this.surplus(i));
    if (!young && !engulfing && !(supply > 0.35 && this.rng.next() < branchChance)) return;
    const [dx, dy] = STEPS[this.rng.int(STEPS.length)];
    const n = this.neighbourIndex(i, dx, dy);
    const { growthCost } = this.params.metabolism;
    const reserve = w.halo[n] ? 0 : this.params.metabolism.growthReserve;
    if (n < 0 || w.wall[n] || w.body[n] || w.energy[i] < growthCost + reserve) return;
    const surplus = w.energy[i] - reserve;
    const vigour = surplus / (surplus + g.energyHalf);
    const p = g.base * vigour * (1 + supply * g.pressureGain) * this.environmentFactor(i, n);
    if (this.rng.next() < p) this.births.push(i, n);
  }

  /**
   * Local growth preference for extending from cell i into neighbour n.
   * Attracted by food scent and its gradient; repelled by slime (unless food is sensed), repellent and light;
   * modulated by a static lobe noise that breaks the front into fans.
   */
  environmentFactor(i, n) {
    const w = this.world, g = this.params.growth, size = w.size;
    const xi = i % size, yi = (i / size) | 0, xn = n % size, yn = (n / size) | 0;
    const dx = xn - xi, dy = yn - yi;
    const scent = chemoAt(w, xn, yn);
    const gradient = chemoAt(w, xn + dx * SENSE_CELLS, yn + dy * SENSE_CELLS) - chemoAt(w, xi - dx * SENSE_CELLS, yi - dy * SENSE_CELLS);
    const attraction = 1 + scent * g.chemoBoost + Math.max(0, gradient) * g.gradientBoost;
    const satiety = Math.min(1, this.surplus(i) / g.surplusForRegrowth);
    const slime = w.slime[n] * g.slimeAvoid * Math.max(0, 1 - scent * g.slimeScentMask) * (1 - satiety);
    const engulf = w.halo[n] ? g.engulfBoost : 1;
    const lobe = this.lobe[n];
    return engulf * attraction * (1 - slime) * Math.exp(-this.repelAt(n) * g.repelAvoid) * (1 - w.light[n] * g.lightAvoid) * lobe * lobe;
  }

  /** Energy above the growth reserve; a well-fed plasmodium explores more and re-crosses its own slime. */
  surplus(i) {
    return Math.max(0, this.world.energy[i] - this.params.metabolism.growthReserve);
  }

  applyBirths() {
    const w = this.world, cost = this.params.metabolism.growthCost;
    for (let k = 0; k < this.births.length; k += 2) {
      const parent = this.births[k], child = this.births[k + 1];
      const share = (w.energy[parent] - cost) / 2;
      if (w.body[child] || share <= 0) continue;
      w.energy[parent] = share;
      w.body[child] = 1; w.age[child] = 0; w.energy[child] = share; w.vein[child] = 0;
      this.count++;
    }
  }

  neighbourIndex(i, dx, dy) {
    const size = this.world.size;
    const x = (i % size) + dx, y = ((i / size) | 0) + dy;
    return x < 0 || y < 0 || x >= size || y >= size ? -1 : y * size + x;
  }

  repelAt(i) { return this.world.repel[coarseCellOf(this.world, i)]; }

  pressureAt(i) { return this.world.pressure[coarseCellOf(this.world, i)]; }
}

/**
 * Two-octave value noise around 1 that makes some directions of the front easier than others.
 * @returns {Float32Array}
 */
function createLobeNoise(size, spacing, rng) {
  const out = new Float32Array(size * size);
  addValueNoise(out, size, spacing, signedSample(rng), { amplitude: 0.65 });
  addValueNoise(out, size, Math.max(3, spacing / 3), signedSample(rng), { amplitude: 0.25 });
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0.15, 1 + out[i] * 1.2);
  return out;
}
