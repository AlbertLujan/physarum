import { diffuse, forEachInDisc } from "./grid.js";
import { labelComponents, shortestPathTree, accumulateFlow } from "./network.js";
import { addValueNoise, valueNoise } from "./noise.js";

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
const SENSE_CELLS = 8;

/**
 * Multinucleate plasmodium as a lattice territory.
 * - Young cells at the edge form the advancing fan-shaped front.
 * - Behind the front the sheet withdraws unless an adaptive vein keeps it alive, leaving slime.
 * - Cytoplasm is routed from sources (food, inoculum core) to the fronts; routes carrying flow thicken
 *   into veins, and fronts fed by strong veins grow faster, so arms emerge where supply arrives.
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
    const n = world.size * world.size;
    this.lobe = createLobeNoise(world.size, params.growth.lobeCells, rng);
    this.labels = new Int32Array(n);
    this.queue = new Int32Array(n);
    this.dist = new Int32Array(n);
    this.parent = new Int32Array(n);
    this.veinTarget = new Float32Array(n);
    this.cost = new Uint8Array(n);
    this.meanderA = valueNoise(world.size, params.network.meanderCells, signedSample(rng));
    this.meanderB = valueNoise(world.size, params.network.meanderCells, signedSample(rng));
    this.meanderPhase = rng.next() * Math.PI * 2;
    this.coreList = [];
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
      this.coreList.push(i);
    });
  }

  /** Remove plasmodium from cells (e.g. freshly painted walls) without leaving slime. */
  removeAt(cells) {
    for (const i of cells) if (this.world.body[i]) this.clearCell(i);
  }

  /** Advance one step: periodic network update, then every body cell, then synchronous births. */
  step() {
    if (this.stepsTaken++ % this.params.network.interval === 0) this.updateNetwork();
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
    const scent = this.chemoAt(xn, yn);
    const gradient = this.chemoAt(xn + dx * SENSE_CELLS, yn + dy * SENSE_CELLS) - this.chemoAt(xi - dx * SENSE_CELLS, yi - dy * SENSE_CELLS);
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

  /* ---------- Network ---------- */

  /** Streaming, routing, vein adaptation and supply pressure. */
  updateNetwork() {
    const w = this.world;
    const components = labelComponents(w.body, w.size, this.labels, this.queue);
    if (!components) return;
    this.mixEnergy(components);
    this.updateFoodMasses();
    this.routeFlow(components);
    this.adaptVeins();
    this.spreadPressure();
  }

  /**
   * Food with nutrient left keeps a halo; plasmodium inside it thickens into a mass. Once the food is gone the
   * mass thins slowly and erodes from its weakest cells, leaving slime where it withdraws.
   */
  updateFoodMasses() {
    const w = this.world, decay = this.params.network.massDecay;
    for (const item of w.items) {
      if (item.kind !== "food") continue;
      const active = item.cells.some((i) => w.food[i] > 0);
      for (const i of item.halo) {
        w.halo[i] = active ? 1 : 0;
        w.mass[i] = active && w.body[i] ? 1 : w.mass[i] * (1 - decay);
      }
    }
  }

  /** Shuttle streaming is fast (~1 mm/s): each connected plasmodium moves its energy toward its mean. */
  mixEnergy(components) {
    const w = this.world, labels = this.labels;
    const sums = new Float64Array(components), counts = new Uint32Array(components);
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] < 0) continue;
      sums[labels[i]] += w.energy[i];
      counts[labels[i]]++;
    }
    const mixing = this.params.network.mixing;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] >= 0) w.energy[i] += (sums[labels[i]] / counts[labels[i]] - w.energy[i]) * mixing;
    }
  }

  /**
   * Route cytoplasm along noisy least-cost paths that prefer existing veins:
   * 1. from the nearest source to each sampled front / maintenance cell (foraging supply);
   * 2. from one randomly chosen source site to every other source site (Tero-style source/sink pairing),
   *    which builds the trunks that keep food sources and the inoculum connected.
   */
  routeFlow(components) {
    const w = this.world, net = this.params.network, rng = this.rng, cost = this.cost;
    this.meanderPhase += (rng.next() - 0.5) * net.meanderDrift;
    const ca = Math.cos(this.meanderPhase), sa = Math.sin(this.meanderPhase);
    for (let j = 0; j < cost.length; j++) {
      if (!w.body[j]) continue;
      const meander = 0.5 + 0.35 * (ca * this.meanderA[j] + sa * this.meanderB[j]);
      cost[j] = net.baseCost + Math.round(net.meander * meander) + rng.int(net.noise) + Math.round(net.veinCost * (1 - w.vein[j]));
    }
    const { sources, sinks } = this.collectTerminals(components);
    shortestPathTree(w.size, w.body, sources, cost, this.dist, this.parent);
    accumulateFlow(this.parent, this.dist, sinks, w.flow);
    this.routeMesh();
    const sites = this.sourceSites();
    if (sites.length < 2) return;
    const hub = sites.splice(rng.int(sites.length), 1);
    shortestPathTree(w.size, w.body, hub, cost, this.dist, this.parent);
    accumulateFlow(this.parent, this.dist, sites, w.flow, { reset: false, amount: net.trunkFlow });
  }

  /**
   * Local exchange between random hubs and random cells. Hubs change every update, so the union of these
   * short routes over time is a reticulated mesh with loops rather than a single tree.
   */
  routeMesh() {
    const w = this.world, net = this.params.network, rng = this.rng;
    const hubs = [], sinks = [];
    const hubCount = Math.max(3, Math.round(this.count / net.meshCellsPerHub));
    const sinkCount = Math.min(net.meshSinkCap, Math.round(this.count / net.meshCellsPerSink));
    let seen = 0;
    for (let i = 0; i < w.body.length; i++) {
      if (!w.body[i]) continue;
      seen++;
      reservoirPush(hubs, i, seen, hubCount, rng);
      reservoirPush(sinks, i, seen, sinkCount, rng);
    }
    if (hubs.length < 2) return;
    shortestPathTree(w.size, w.body, hubs, this.cost, this.dist, this.parent);
    accumulateFlow(this.parent, this.dist, sinks, w.flow, { reset: false, amount: net.meshAmount });
  }

  /** One representative covered cell per food item still being eaten, plus one live inoculum core cell. */
  sourceSites() {
    const w = this.world, sites = [];
    for (const item of w.items) {
      if (item.kind !== "food") continue;
      const cell = this.randomCell(item.cells, (i) => w.body[i] && w.food[i] > 0);
      if (cell >= 0) sites.push(cell);
    }
    this.coreList = this.coreList.filter((i) => w.core[i]);
    const core = this.randomCell(this.coreList, (i) => w.body[i]);
    if (core >= 0) sites.push(core);
    return sites;
  }

  /** Uniformly pick a cell from a list that satisfies a predicate, without allocating; -1 when none. */
  randomCell(cells, accept) {
    let chosen = -1, seen = 0;
    for (const i of cells) if (accept(i) && this.rng.int(++seen) === 0) chosen = i;
    return chosen;
  }

  /**
   * Sources: food-covered or core cells (fallback: the thickest vein of a component).
   * Sinks: sampled front cells, plus a sample of all body cells for maintenance flow so a resting network persists.
   */
  collectTerminals(components) {
    const w = this.world, labels = this.labels, net = this.params.network, frontAge = this.params.growth.frontAge;
    const sources = [], sinks = [], upkeep = [], hasSource = new Uint8Array(components), fallback = new Int32Array(components).fill(-1);
    let seen = 0, seenBody = 0;
    for (let i = 0; i < labels.length; i++) {
      const c = labels[i];
      if (c < 0) continue;
      if (w.food[i] > 0 || w.core[i]) { sources.push(i); hasSource[c] = 1; }
      if (fallback[c] < 0 || w.vein[i] > w.vein[fallback[c]]) fallback[c] = i;
      if (w.age[i] < frontAge) reservoirPush(sinks, i, ++seen, net.maxSinks, this.rng);
      reservoirPush(upkeep, i, ++seenBody, net.maintenanceSinks, this.rng);
    }
    for (let c = 0; c < components; c++) if (!hasSource[c]) sources.push(fallback[c]);
    return { sources, sinks: sinks.concat(upkeep) };
  }

  /**
   * Veins relax toward a strength set by the square root of the flow they carry (Tero-style adaptation).
   * Strong veins are widened across neighbouring cytoplasm so trunks have real thickness.
   */
  adaptVeins() {
    const w = this.world, net = this.params.network, target = this.veinTarget;
    target.fill(0);
    for (let i = 0; i < w.flow.length; i++) {
      if (!w.flow[i] || !w.body[i]) continue;
      const strength = Math.min(1, Math.sqrt(w.flow[i] / net.flowSaturation));
      this.widenVein(i, strength, strength > 0.8 ? 1 : 0);
    }
    for (let i = 0; i < w.vein.length; i++) {
      if (!w.body[i]) continue;
      const delta = target[i] - w.vein[i];
      w.vein[i] += (delta > 0 ? net.veinRate : net.veinDecay) * delta;
    }
  }

  /** Raise the vein target within `radius` cells of i, fading slightly toward the vein wall. */
  widenVein(i, strength, radius) {
    const w = this.world, size = w.size, target = this.veinTarget;
    const x = i % size, y = (i / size) | 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || dx * dx + dy * dy > radius * radius + 1) continue;
        const j = ny * size + nx;
        const value = strength * (1 - 0.12 * Math.max(Math.abs(dx), Math.abs(dy)));
        if (w.body[j] && value > target[j]) target[j] = value;
      }
    }
  }

  /** Supply pressure: the strongest vein in each coarse cell, blurred so fronts near vein ends feel it. */
  spreadPressure() {
    const w = this.world;
    w.pressure.fill(0);
    for (let i = 0; i < w.vein.length; i++) {
      if (!w.vein[i]) continue;
      const ci = this.coarseOf(i);
      if (w.vein[i] > w.pressure[ci]) w.pressure[ci] = w.vein[i];
    }
    for (let p = 0; p < this.params.network.pressurePasses; p++) {
      diffuse(w.pressure, w.coarseScratch, w.coarseSize, { rate: 1, decay: 0 }, w.coarseWall);
    }
  }

  /* ---------- Lattice helpers ---------- */

  neighbourIndex(i, dx, dy) {
    const size = this.world.size;
    const x = (i % size) + dx, y = ((i / size) | 0) + dy;
    return x < 0 || y < 0 || x >= size || y >= size ? -1 : y * size + x;
  }

  coarseOf(i) {
    const { size, factor, coarseSize } = this.world;
    return (((i / size) | 0) / factor | 0) * coarseSize + (((i % size) / factor) | 0);
  }

  chemoAt(x, y) {
    const { factor, coarseSize, chemo } = this.world;
    const cx = Math.min(coarseSize - 1, Math.max(0, (x / factor) | 0));
    const cy = Math.min(coarseSize - 1, Math.max(0, (y / factor) | 0));
    return chemo[cy * coarseSize + cx];
  }

  repelAt(i) { return this.world.repel[this.coarseOf(i)]; }

  pressureAt(i) { return this.world.pressure[this.coarseOf(i)]; }
}

/** Reservoir sampling: keep a uniform sample of at most `limit` items. */
function reservoirPush(sample, item, seen, limit, rng) {
  if (sample.length < limit) { sample.push(item); return; }
  const slot = rng.int(seen);
  if (slot < limit) sample[slot] = item;
}

/** Lattice sampler for zero-mean noise in [-1, 1]. */
function signedSample(rng) {
  return () => rng.next() * 2 - 1;
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
