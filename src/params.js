/**
 * Model parameters. Distances are in lattice cells (one cell = dishMm / gridSize mm); rates are per step.
 *
 * growth:     advance of the fan-shaped front into free agar.
 * metabolism: energy economy of the shared cytoplasm.
 * retraction: withdrawal of old sheet that no vein keeps alive.
 * network:    adaptive vein network; cytoplasm routes from sources (food, inoculum core) to growing
 *             fronts, and routes that carry flow thicken (after Tero et al. 2007, 2010).
 */
export const DEFAULT_PARAMS = Object.freeze({
  gridSize: 400,
  coarseFactor: 4,
  dishMm: 90,
  secondsPerStep: 40,
  growth: {
    base: 0.22, frontAge: 14, energyHalf: 0.6, chemoBoost: 2, gradientBoost: 25,
    slimeAvoid: 0.97, slimeScentMask: 0.35, repelAvoid: 2.5, lightAvoid: 0.92, lobeCells: 22, sideBranch: 0.04, pressureGain: 6,
    engulfBoost: 6, surplusForRegrowth: 3,
  },
  metabolism: { inoculumEnergy: 25, uptake: 0.08, cost: 0.0002, growthCost: 0.1, growthReserve: 0.5, coreLifetime: 150, lightCost: 0.05, toxicCost: 0.02 },
  retraction: { base: 0.06, veinKeep: 0.12, veinProtection: 0.2, starvation: 5, lightFactor: 6, repelFactor: 4, starvingEnergy: 0.05 },
  network: { interval: 5, maxSinks: 1600, maintenanceSinks: 150, trunkFlow: 60, meshCellsPerHub: 700, meshCellsPerSink: 40, meshSinkCap: 1500, meshAmount: 1, flowSaturation: 25, veinRate: 0.35, veinDecay: 0.15, massDecay: 0.012, baseCost: 8, meander: 45, meanderCells: 9, meanderDrift: 0.3, noise: 8, veinCost: 32, mixing: 0.85, pressurePasses: 5 },
  environment: {
    chemoEmission: 0.6, coveredEmission: 0.1, chemoDiffusion: 1, chemoDecay: 0.003, chemoPasses: 3,
    repelRelease: 0.003, repelDiffusion: 1, repelDecay: 0.002, repelPasses: 2,
    slimeDecay: 0.0003,
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
