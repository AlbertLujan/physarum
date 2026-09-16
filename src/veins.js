import { diffuse } from "./grid.js";
import { labelComponents, shortestPathTree, accumulateFlow } from "./network.js";
import { valueNoise } from "./noise.js";
import { coarseCellOf, updateFoodMasses } from "./world.js";

/**
 * Adaptive vein network of the plasmodium (after Tero et al. 2007, 2010).
 * Every few steps it streams energy through each connected piece of cytoplasm, routes cytoplasm along noisy
 * least-cost paths that prefer existing veins, thickens the routes that carried flow and lets unused ones fade.
 */
export class VeinNetwork {
  /**
   * @param {object} world lattice from createWorld
   * @param {object} params model parameters
   * @param {{next: () => number, int: (n: number) => number}} rng
   */
  constructor(world, params, rng) {
    this.world = world;
    this.params = params;
    this.rng = rng;
    const n = world.size * world.size;
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

  /** Remember an inoculum cell as a permanent source of cytoplasm while it stays core. */
  addCore(i) {
    this.coreList.push(i);
  }

  /**
   * One network update: streaming, food masses, routing, vein adaptation and supply pressure.
   * @param {number} cellCount current number of plasmodium cells
   */
  update(cellCount) {
    const w = this.world;
    const components = labelComponents(w.body, w.size, this.labels, this.queue);
    if (!components) return;
    this.mixEnergy(components);
    updateFoodMasses(w, this.params.network.massDecay);
    this.routeFlow(components, cellCount);
    this.adaptVeins();
    this.spreadPressure();
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
   * 2. between random local hubs and cells (reticulated mesh);
   * 3. from one randomly chosen source site to every other source site (Tero-style source/sink pairing),
   *    which builds the trunks that keep food sources and the inoculum connected.
   */
  routeFlow(components, cellCount) {
    const w = this.world, net = this.params.network, rng = this.rng;
    this.updateCosts();
    const { sources, sinks } = this.collectTerminals(components);
    shortestPathTree(w.size, w.body, sources, this.cost, this.dist, this.parent);
    accumulateFlow(this.parent, this.dist, sinks, w.flow);
    this.routeMesh(cellCount);
    const sites = this.sourceSites();
    if (sites.length < 2) return;
    const hub = sites.splice(rng.int(sites.length), 1);
    shortestPathTree(w.size, w.body, hub, this.cost, this.dist, this.parent);
    accumulateFlow(this.parent, this.dist, sites, w.flow, { reset: false, amount: net.trunkFlow });
  }

  /**
   * Cost of crossing each body cell: a base cost, a slowly drifting smooth meander field that bends routes into
   * curves, per-update noise, and a penalty for cells that are not yet veins (so flow reinforces existing veins).
   */
  updateCosts() {
    const w = this.world, net = this.params.network, rng = this.rng, cost = this.cost;
    this.meanderPhase += (rng.next() - 0.5) * net.meanderDrift;
    const ca = Math.cos(this.meanderPhase), sa = Math.sin(this.meanderPhase);
    for (let j = 0; j < cost.length; j++) {
      if (!w.body[j]) continue;
      const meander = 0.5 + 0.35 * (ca * this.meanderA[j] + sa * this.meanderB[j]);
      cost[j] = net.baseCost + Math.round(net.meander * meander) + rng.int(net.noise) + Math.round(net.veinCost * (1 - w.vein[j]));
    }
  }

  /**
   * Local exchange between random hubs and random cells. Hubs change every update, so the union of these
   * short routes over time is a reticulated mesh with loops rather than a single tree.
   */
  routeMesh(cellCount) {
    const w = this.world, net = this.params.network, rng = this.rng;
    const hubs = [], sinks = [];
    const hubCount = Math.max(3, Math.round(cellCount / net.meshCellsPerHub));
    const sinkCount = Math.min(net.meshSinkCap, Math.round(cellCount / net.meshCellsPerSink));
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
      const ci = coarseCellOf(w, i);
      if (w.vein[i] > w.pressure[ci]) w.pressure[ci] = w.vein[i];
    }
    for (let p = 0; p < this.params.network.pressurePasses; p++) {
      diffuse(w.pressure, w.coarseScratch, w.coarseSize, { rate: 1, decay: 0 }, w.coarseWall);
    }
  }
}

/** Lattice sampler for zero-mean noise in [-1, 1]. */
export function signedSample(rng) {
  return () => rng.next() * 2 - 1;
}

/** Reservoir sampling: keep a uniform sample of at most `limit` items. */
function reservoirPush(sample, item, seen, limit, rng) {
  if (sample.length < limit) { sample.push(item); return; }
  const slot = rng.int(seen);
  if (slot < limit) sample[slot] = item;
}
