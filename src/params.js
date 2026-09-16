/**
 * Model parameters. Distances are in lattice cells (one cell = dishMm / gridSize mm); rates are per step.
 * Energies and nutrients are relative model units.
 */
const DEFAULT_PARAMS = Object.freeze({
  gridSize: 400,          // lattice side, in cells
  coarseFactor: 4,        // fine cells per coarse cell side (chemical fields and supply pressure)
  dishMm: 90,             // Petri dish diameter
  secondsPerStep: 40,     // calibrated so the front advances at about 1 cm/h

  /** Advance of the fan-shaped front into free agar. */
  growth: {
    base: 0.22,               // base chance per step that a front cell buds into a free neighbour
    frontAge: 14,             // cells younger than this (steps) form the advancing front
    energyHalf: 0.6,          // energy surplus at which growth vigour reaches half its maximum
    chemoBoost: 2,            // extra growth per unit of food scent at the target cell
    gradientBoost: 25,        // extra growth per unit of rising scent ahead of the front
    slimeAvoid: 0.97,         // how strongly own slime blocks regrowth (0 none, 1 total)
    slimeScentMask: 0.35,     // food scent that cancels slime avoidance
    repelAvoid: 2.5,          // exponential avoidance of dissolved salt or quinine
    lightAvoid: 0.92,         // growth suppression under full light
    lobeCells: 22,            // spacing of the noise that breaks the front into lobes
    sideBranch: 0.04,         // chance that a well-supplied vein cell sprouts a side arm
    pressureGain: 6,          // growth boost for fronts fed by strong veins
    engulfBoost: 6,           // growth boost into the halo around food
    surplusForRegrowth: 3,    // energy surplus at which the mould fully ignores its own slime
  },

  /** Energy economy of the shared cytoplasm. */
  metabolism: {
    inoculumEnergy: 25,   // energy per inoculum cell
    uptake: 0.08,         // nutrient absorbed per step by a cell lying on food
    cost: 0.0002,         // maintenance per cell per step
    growthCost: 0.1,      // energy spent to build one new cell
    growthReserve: 0.5,   // energy a cell keeps before budding (waived when engulfing food)
    coreLifetime: 150,    // steps the inoculum stays a permanent source unless it lies on food
    lightCost: 0.05,      // extra upkeep under full light
    toxicCost: 0.02,      // extra upkeep per unit of dissolved repellent
  },

  /** Withdrawal of old sheet that no vein keeps alive. */
  retraction: {
    base: 0.06,             // chance per step that an unsupported old cell withdraws
    veinKeep: 0.12,         // vein strength above which a cell counts as vein
    veinProtection: 0.2,    // retraction multiplier for starving vein cells
    starvation: 5,          // extra retraction stress when starving
    lightFactor: 6,         // extra retraction stress under full light
    repelFactor: 4,         // extra retraction stress per unit of repellent
    starvingEnergy: 0.05,   // energy below which a cell is starving
  },

  /**
   * Adaptive vein network (after Tero et al. 2007, 2010): cytoplasm routes from sources (food, inoculum core)
   * to growing fronts and between sources; routes that carry flow thicken.
   */
  network: {
    interval: 5,              // steps between network updates
    mixing: 0.85,             // fraction of the energy gap closed per update by shuttle streaming

    // Flow demand
    maxSinks: 1600,           // sampled front cells receiving foraging flow
    maintenanceSinks: 150,    // sampled body cells receiving upkeep flow so resting veins persist
    trunkFlow: 60,            // flow per source site on the routes that connect food sources
    meshCellsPerHub: 700,     // body cells per random local hub in the mesh routing
    meshCellsPerSink: 40,     // body cells per random mesh sink
    meshSinkCap: 1500,        // upper bound on mesh sinks
    meshAmount: 1,            // flow per mesh sink

    // Vein adaptation
    flowSaturation: 25,       // flow that makes a full-strength vein
    veinRate: 0.35,           // how fast veins thicken toward their target
    veinDecay: 0.15,          // how fast unused veins thin
    massDecay: 0.012,         // how fast a food mass thins once its food is gone
    pressurePasses: 5,        // blur passes spreading vein supply toward the fronts

    // Route costs (integers; a cell's cost stays below 256)
    baseCost: 8,              // minimum cost of crossing a cell
    meander: 45,              // weight of the smooth meander field that curves the veins
    meanderCells: 9,          // spacing of the meander field
    meanderDrift: 0.3,        // how fast the meander field shifts between updates
    noise: 8,                 // per-update random cost
    veinCost: 32,             // extra cost of cells that are not yet veins
  },

  /** Chemical fields in the agar and slime ageing. */
  environment: {
    chemoEmission: 0.6,       // attractant released per step by a food cell
    coveredEmission: 0.1,     // emission multiplier once the plasmodium covers the food
    chemoDiffusion: 1,        // diffusion rate of the attractant
    chemoDecay: 0.003,        // attractant decay per pass
    chemoPasses: 3,           // diffusion passes per step
    repelRelease: 0.003,      // fraction of a repellent crystal dissolving per step
    repelDiffusion: 1,        // diffusion rate of dissolved repellent
    repelDecay: 0.002,        // repellent decay per pass
    repelPasses: 2,           // diffusion passes per step
    slimeDecay: 0.0003,       // slime fading per step
  },
});

/**
 * Merge overrides onto the defaults, one level deep per section.
 * @param {object} overrides
 * @returns {object}
 */
export function createParams(overrides = {}) {
  const merged = { ...DEFAULT_PARAMS };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = value && typeof value === "object" && !Array.isArray(value)
      ? { ...DEFAULT_PARAMS[key], ...value }
      : value;
  }
  return merged;
}
