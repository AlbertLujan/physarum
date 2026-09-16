// Per-phase cost of one simulation step on a busy dish: `npm run profile`.
import { Simulation } from "../src/simulation.js";
import { PRESETS } from "../src/presets.js";
import { stepEnvironment } from "../src/environment.js";
import { labelComponents } from "../src/network.js";
import { updateFoodMasses } from "../src/world.js";

const WARMUP_STEPS = 1100;
const MEASURED_STEPS = 80;

const sim = new Simulation({ seed: 3 });
PRESETS.ring.build(sim);
sim.step(WARMUP_STEPS);

const { world, params, plasmodium } = sim;
const { network } = plasmodium;
const totals = {};
const time = (name, fn) => {
  const start = performance.now();
  const result = fn();
  totals[name] = (totals[name] ?? 0) + performance.now() - start;
  return result;
};

for (let k = 0; k < MEASURED_STEPS; k++) {
  if (k % params.network.interval === 0) {
    const components = time("label", () => labelComponents(world.body, world.size, network.labels, network.queue));
    time("mix", () => network.mixEnergy(components));
    time("masses", () => updateFoodMasses(world, params.network.massDecay));
    time("route", () => network.routeFlow(components, plasmodium.count));
    time("veins", () => network.adaptVeins());
    time("pressure", () => network.spreadPressure());
  }
  time("cells", () => {
    plasmodium.births.length = 0;
    for (let i = 0; i < world.body.length; i++) if (world.body[i]) plasmodium.updateCell(i);
    plasmodium.applyBirths();
  });
  time("env", () => stepEnvironment(world, params));
}

for (const [name, ms] of Object.entries(totals)) console.log(name.padEnd(9), (ms / MEASURED_STEPS).toFixed(2), "ms/step");
console.log("cells", plasmodium.count);
