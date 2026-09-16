import { Simulation } from "../src/simulation.js";
import { PRESETS } from "../src/presets.js";
import { stepEnvironment } from "../src/environment.js";
const sim = new Simulation({ seed: 3 });
PRESETS.ring.build(sim);
sim.step(1100);
const p = sim.plasmodium, t = {};
const time = (name, fn) => { const s = performance.now(); fn(); t[name] = (t[name] || 0) + performance.now() - s; };
const N = 80;
for (let k = 0; k < N; k++) {
  const w = sim.world;
  if (k % 4 === 0) {
    let comps;
    time("label", () => { comps = (0, labelOf)(p); });
    time("mix", () => p.mixEnergy(comps));
    time("route", () => p.routeFlow(comps));
    time("veins", () => p.adaptVeins());
    time("pressure", () => p.spreadPressure());
  }
  time("cells", () => { p.births.length = 0; const b = w.body; for (let i = 0; i < b.length; i++) if (b[i]) p.updateCell(i); p.applyBirths(); });
  time("env", () => stepEnvironment(w, sim.params));
}
function labelOf(pl) { return pl.constructor.name && labelComponentsWrap(pl); }
import { labelComponents } from "../src/network.js";
function labelComponentsWrap(pl) { return labelComponents(pl.world.body, pl.world.size, pl.labels, pl.queue); }
for (const [k, v] of Object.entries(t)) console.log(k.padEnd(9), (v / N).toFixed(2), "ms/step");
console.log("cells", p.count);
