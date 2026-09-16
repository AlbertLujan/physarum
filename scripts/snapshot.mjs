// Offline morphology check: node scripts/snapshot.mjs <preset> <out.bin> [steps,...]
import { writeFileSync } from "node:fs";
import { Simulation } from "../src/simulation.js";
import { PRESETS } from "../src/presets.js";

const [preset, out, list = "100,300,600,900,1200"] = process.argv.slice(2);
const sim = new Simulation({ seed: 3 });
PRESETS[preset].build(sim);
const size = sim.world.size;
const frames = [];
let done = 0;
for (const cp of list.split(",").map(Number)) {
  sim.step(cp - done);
  done = cp;
  const s = sim.stats();
  console.log(`step ${cp} (${(s.elapsedSeconds / 3600).toFixed(1)} h) cells=${s.cells} veins=${s.veinLengthCm.toFixed(0)} cm food=${s.foodRemaining == null ? '-' : Math.round(s.foodRemaining * 100) + '%'}`);
  const rgb = Buffer.alloc(size * size * 3);
  const { body, age, vein, mass, food, slime, wall } = sim.world;
  for (let i = 0; i < size * size; i++) {
    let r = 14 + slime[i] * 34, g = 15 + slime[i] * 34, b = 12 + slime[i] * 20;
    if (food[i] > 0) { r = 200; g = 185; b = 140; }
    if (body[i]) {
      const young = age[i] < sim.params.growth.frontAge * 3;
      const film = young ? 0.8 : 0.4, v = Math.min(1, vein[i] * 1.3);
      r = r * (1 - film) + 150 * film; g = g * (1 - film) + 162 * film; b = b * (1 - film) + 40 * film;
      r = r * (1 - v) + 228 * v; g = g * (1 - v) + 214 * v; b = b * (1 - v) + 64 * v;
      if (mass[i] > 0.5) { r = 248; g = 196; b = 36; }
    }
    if (wall[i]) { r = g = b = 120; }
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
  }
  frames.push(rgb);
}
writeFileSync(out, Buffer.concat([Buffer.from(JSON.stringify({ size, n: frames.length }) + "\n"), ...frames]));
