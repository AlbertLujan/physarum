import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/simulation.js";
import { cellIndex } from "../src/grid.js";
import { labelComponents } from "../src/network.js";

const SMALL = { gridSize: 160 };
const CENTRE = 80;

/** Cells currently part of the plasmodium. */
function bodyCells(sim) {
  const out = [];
  sim.world.body.forEach((v, i) => { if (v) out.push(i); });
  return out;
}

function centroidX(sim) {
  const cells = bodyCells(sim);
  return cells.reduce((sum, i) => sum + (i % sim.world.size), 0) / cells.length;
}

/** Share of body cells within `radius` of a point. */
function shareNear(sim, x, y, radius) {
  const cells = bodyCells(sim);
  const near = cells.filter((i) => Math.hypot((i % sim.world.size) - x, Math.floor(i / sim.world.size) - y) < radius).length;
  return near / Math.max(1, cells.length);
}

function averageOverSeeds(seeds, run) {
  return seeds.reduce((sum, seed) => sum + run(seed), 0) / seeds.length;
}

test("inoculum creates a body with energy and never covers walls", () => {
  const sim = new Simulation({ seed: 1, params: SMALL });
  sim.place("wall", CENTRE + 4, CENTRE, 2);
  sim.place("inoculum", CENTRE, CENTRE, 8);
  const { world } = sim;
  assert.ok(sim.plasmodium.count > 100);
  assert.equal(world.body[cellIndex(world.size, CENTRE + 4, CENTRE)], 0);
  assert.ok(world.energy[cellIndex(world.size, CENTRE, CENTRE)] > 0);
});

test("painting a wall removes the plasmodium underneath", () => {
  const sim = new Simulation({ seed: 2, params: SMALL });
  sim.place("inoculum", CENTRE, CENTRE, 8);
  sim.place("wall", CENTRE, CENTRE, 3);
  assert.equal(sim.world.body[cellIndex(sim.world.size, CENTRE, CENTRE)], 0);
});

test("the plasmodium expands on plain agar with an irregular, reticulated territory", () => {
  const sim = new Simulation({ seed: 3, params: SMALL });
  sim.place("inoculum", CENTRE, CENTRE, 6);
  sim.step(160);
  const { body, size } = sim.world;
  let perimeter = 0, maxR = 0;
  for (const i of bodyCells(sim)) {
    const x = i % size, y = Math.floor(i / size);
    maxR = Math.max(maxR, Math.hypot(x - CENTRE, y - CENTRE));
    if (!body[i - 1] || !body[i + 1] || !body[i - size] || !body[i + size]) perimeter++;
  }
  assert.ok(maxR > 20, `front reached only ${maxR.toFixed(1)} cells`);
  assert.ok(sim.plasmodium.count < Math.PI * maxR * maxR * 0.75, "territory should be reticulated, not a solid disc");
  const roundness = (perimeter * perimeter) / (4 * Math.PI * sim.plasmodium.count);
  assert.ok(roundness > 3, `front too circular (${roundness.toFixed(2)})`);
});

test("veins form a hierarchy: a few thick trunks and many thin veins", () => {
  const sim = new Simulation({ seed: 4, params: SMALL });
  sim.place("inoculum", CENTRE, CENTRE, 6);
  sim.step(200);
  const veins = Array.from(sim.world.vein).filter((v) => v > sim.params.retraction.veinKeep);
  assert.ok(veins.length > 100, `only ${veins.length} vein cells`);
  const thick = veins.filter((v) => v > 0.6).length;
  assert.ok(thick > 5 && thick < veins.length * 0.5, `thick ${thick} of ${veins.length}`);
});

test("chemotaxis biases growth toward food", () => {
  const run = (withFood) => averageOverSeeds([5, 15, 25], (seed) => {
    const sim = new Simulation({ seed, params: SMALL });
    if (withFood) sim.place("glucose", CENTRE + 45, CENTRE);
    sim.place("inoculum", CENTRE, CENTRE, 6);
    sim.step(150);
    return centroidX(sim);
  });
  const control = run(false), baited = run(true);
  assert.ok(baited > control + 3, `control ${control.toFixed(1)} vs baited ${baited.toFixed(1)}`);
});

test("food keeps a sheet on it and feeds growth", () => {
  const fed = new Simulation({ seed: 6, params: SMALL });
  fed.place("oat", CENTRE, CENTRE);
  fed.place("inoculum", CENTRE, CENTRE, 4);
  fed.step(250);
  assert.equal(fed.world.body[cellIndex(fed.world.size, CENTRE, CENTRE)], 1, "sheet on food retracted");

  const starved = new Simulation({ seed: 6, params: SMALL });
  starved.place("inoculum", CENTRE, CENTRE, 4);
  starved.step(250);
  assert.ok(fed.plasmodium.count > starved.plasmodium.count * 1.3, `fed ${fed.plasmodium.count} vs starved ${starved.plasmodium.count}`);
});

test("starvation eventually shrinks the plasmodium", () => {
  const sim = new Simulation({ seed: 7, params: { ...SMALL, metabolism: { inoculumEnergy: 3, cost: 0.01 } } });
  sim.place("inoculum", CENTRE, CENTRE, 6);
  sim.step(120);
  const peak = sim.plasmodium.count;
  sim.step(600);
  assert.ok(sim.plasmodium.count < peak * 0.6, `peak ${peak} -> ${sim.plasmodium.count}`);
});

test("salt and light are avoided", () => {
  const near = (tool, seed) => {
    const sim = new Simulation({ seed, params: SMALL });
    if (tool === "salt") sim.place("salt", CENTRE + 22, CENTRE);
    if (tool === "light") sim.place("light", CENTRE + 22, CENTRE, 12);
    sim.place("inoculum", CENTRE, CENTRE, 6);
    sim.step(170);
    return shareNear(sim, CENTRE + 22, CENTRE, 12);
  };
  const seeds = [8, 18, 28];
  const control = averageOverSeeds(seeds, (s) => near(null, s));
  const salt = averageOverSeeds(seeds, (s) => near("salt", s));
  const light = averageOverSeeds(seeds, (s) => near("light", s));
  assert.ok(salt < control * 0.6, `salt not avoided: ${salt.toFixed(3)} vs ${control.toFixed(3)}`);
  assert.ok(light < control * 0.6, `light not avoided: ${light.toFixed(3)} vs ${control.toFixed(3)}`);
});

test("retracted ground keeps slime and slime discourages regrowth", () => {
  const sim = new Simulation({ seed: 9, params: SMALL });
  sim.place("inoculum", CENTRE, CENTRE, 6);
  sim.step(200);
  const slimed = Array.from(sim.world.slime).filter((v, i) => v > 0.5 && !sim.world.body[i]).length;
  assert.ok(slimed > 50, `only ${slimed} slime cells left behind`);
  const p = sim.plasmodium;
  const i = cellIndex(sim.world.size, 20, 80), n = i + 1;
  sim.world.slime[n] = 0;
  const fresh = p.environmentFactor(i, n);
  sim.world.slime[n] = 1;
  assert.ok(p.environmentFactor(i, n) < fresh * 0.5);
});

test("two inocula grow into one connected plasmodium", () => {
  const sim = new Simulation({ seed: 10, params: SMALL });
  sim.place("oat", CENTRE, CENTRE);
  sim.place("inoculum", CENTRE - 16, CENTRE, 5);
  sim.place("inoculum", CENTRE + 16, CENTRE, 5);
  sim.step(150);
  const { world } = sim;
  const labels = new Int32Array(world.body.length), queue = new Int32Array(world.body.length);
  labelComponents(world.body, world.size, labels, queue);
  const a = labels[cellIndex(world.size, CENTRE - 16, CENTRE)], b = labels[cellIndex(world.size, CENTRE + 16, CENTRE)];
  assert.ok(a >= 0 && a === b, "inocula did not fuse");
});

test("a trunk vein keeps two food sources connected", () => {
  const sim = new Simulation({ seed: 12, params: SMALL });
  sim.place("oat", CENTRE - 25, CENTRE);
  sim.place("oat", CENTRE + 25, CENTRE);
  sim.place("inoculum", CENTRE, CENTRE, 6);
  sim.step(400);
  const { world } = sim;
  const labels = new Int32Array(world.body.length), queue = new Int32Array(world.body.length);
  labelComponents(world.body, world.size, labels, queue);
  const a = labels[cellIndex(world.size, CENTRE - 25, CENTRE)], b = labels[cellIndex(world.size, CENTRE + 25, CENTRE)];
  assert.ok(a >= 0 && a === b, "food sources ended up disconnected");
  let trunk = 0;
  for (let x = CENTRE - 15; x <= CENTRE + 15; x++) {
    for (let y = CENTRE - 12; y <= CENTRE + 12; y++) if (world.vein[cellIndex(world.size, x, y)] > 0.5) { trunk++; break; }
  }
  assert.ok(trunk > 25, `trunk covers only ${trunk} of 31 columns`);
});

test("stats never report more than 100% food, even with overlapping items", () => {
  const sim = new Simulation({ seed: 11, params: SMALL });
  sim.place("oat", CENTRE, CENTRE);
  sim.place("oat", CENTRE + 2, CENTRE);
  sim.place("oat", CENTRE - 2, CENTRE + 1);
  sim.place("inoculum", CENTRE + 30, CENTRE, 4);
  sim.step(10);
  const s = sim.stats();
  assert.equal(s.elapsedSeconds, 10 * sim.params.secondsPerStep);
  assert.ok(s.areaMm2 > 0);
  assert.ok(s.foodRemaining > 0 && s.foodRemaining <= 1, `food ${s.foodRemaining}`);
});

/* ---------- Behaviour after reaching food ---------- */

/** Network loops: regions of free agar completely enclosed by plasmodium (4-connectivity, not touching open agar). */
function countVeinLoops(world) {
  const { size, body, wall } = world;
  const seen = new Uint8Array(size * size);
  let loops = 0;
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || body[start] || wall[start]) continue;
    let open = false, area = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      area++;
      const x = i % size, y = (i / size) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, j = ny * size + nx;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || wall[j]) { open = true; continue; }
        if (seen[j] || body[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    if (!open && area >= 6) loops++;
  }
  return loops;
}

function maxRadius(sim, cx, cy) {
  return bodyCells(sim).reduce((m, i) => Math.max(m, Math.hypot((i % sim.world.size) - cx, Math.floor(i / sim.world.size) - cy)), 0);
}

test("a well-fed plasmodium keeps exploring after reaching its food", () => {
  const sim = new Simulation({ seed: 21, params: SMALL });
  sim.place("oat", CENTRE, CENTRE);
  sim.place("inoculum", CENTRE, CENTRE, 5);
  sim.step(250);
  const early = maxRadius(sim, CENTRE, CENTRE);
  sim.step(450);
  const late = maxRadius(sim, CENTRE, CENTRE);
  assert.ok(late > early + 12, `stopped exploring: radius ${early.toFixed(0)} -> ${late.toFixed(0)}`);
});

test("food is engulfed by a thick mass of plasmodium", () => {
  const sim = new Simulation({ seed: 22, params: SMALL });
  sim.place("yeast", CENTRE + 20, CENTRE);
  sim.place("inoculum", CENTRE - 10, CENTRE, 5);
  sim.step(350);
  const item = sim.world.items.find((it) => it.kind === "food");
  const covered = item.cells.filter((i) => sim.world.body[i] && sim.world.mass[i] > 0.5).length;
  assert.ok(covered > item.cells.length * 0.8, `only ${covered}/${item.cells.length} food cells under a thick mass`);
});

test("the vein network forms loops, not only a tree", () => {
  const sim = new Simulation({ seed: 23, params: SMALL });
  sim.place("oat", CENTRE - 30, CENTRE);
  sim.place("oat", CENTRE + 30, CENTRE);
  sim.place("inoculum", CENTRE, CENTRE, 6);
  sim.step(600);
  const loops = countVeinLoops(sim.world);
  assert.ok(loops >= 6, `only ${loops} loops in the vein network`);
});

test("without food the plasmodium migrates away from where it started, leaving slime", () => {
  const sim = new Simulation({ seed: 24, params: SMALL });
  sim.place("inoculum", CENTRE, CENTRE, 6);
  sim.step(900);
  const cells = bodyCells(sim);
  assert.ok(cells.length > 50, "plasmodium died instead of migrating");
  const cx = cells.reduce((s, i) => s + (i % sim.world.size), 0) / cells.length;
  const cy = cells.reduce((s, i) => s + Math.floor(i / sim.world.size), 0) / cells.length;
  const originCovered = sim.world.body[cellIndex(sim.world.size, CENTRE, CENTRE)];
  assert.ok(Math.hypot(cx - CENTRE, cy - CENTRE) > 15 || !originCovered, "plasmodium stayed on its starting point");
  assert.ok(sim.world.slime[cellIndex(sim.world.size, CENTRE, CENTRE)] > 0.3, "no slime left at the origin");
});

test("a food mass fades gradually after the food is used up instead of vanishing", () => {
  const sim = new Simulation({ seed: 25, params: SMALL });
  sim.place("glucose", CENTRE, CENTRE);
  sim.place("inoculum", CENTRE, CENTRE, 6);
  const item = sim.world.items.find((it) => it.kind === "food");
  const meanMass = () => item.halo.reduce((s, i) => s + sim.world.mass[i], 0) / item.halo.length;
  let guard = 0;
  while (sim.stats().foodRemaining > 0 && guard++ < 3000) sim.step(10);
  assert.ok(sim.stats().foodRemaining === 0, "food never ran out");
  const atExhaustion = meanMass();
  sim.step(60);
  const shortlyAfter = meanMass();
  assert.ok(shortlyAfter > atExhaustion * 0.6, `mass collapsed: ${atExhaustion.toFixed(2)} -> ${shortlyAfter.toFixed(2)}`);
  sim.step(900);
  assert.ok(meanMass() < shortlyAfter * 0.5, "mass never faded");
  const stained = item.cells.filter((i) => sim.world.body[i] || sim.world.slime[i] > 0.5).length;
  assert.ok(stained > item.cells.length * 0.8, "no slime stain left where the food was");
});

test("veins meander instead of following the lattice axes", () => {
  const sim = new Simulation({ seed: 26, params: SMALL });
  sim.place("oat", CENTRE - 40, CENTRE - 23);
  sim.place("oat", CENTRE + 40, CENTRE + 23);
  sim.place("inoculum", CENTRE, CENTRE, 6);
  sim.step(500);
  const { vein, size } = sim.world;
  const keep = sim.params.retraction.veinKeep;
  const straightRun = (i, dx, dy) => {
    let n = 0;
    for (let k = 1; k <= 6; k++) {
      const x = (i % size) + dx * k, y = ((i / size) | 0) + dy * k;
      if (x < 0 || y < 0 || x >= size || y >= size || vein[y * size + x] <= keep) break;
      n++;
    }
    return n;
  };
  let veinCells = 0, onLongAxisRuns = 0;
  for (let i = 0; i < vein.length; i++) {
    if (vein[i] <= keep) continue;
    veinCells++;
    const axial = [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dx, dy]) => straightRun(i, dx, dy) + straightRun(i, -dx, -dy) >= 10);
    if (axial) onLongAxisRuns++;
  }
  assert.ok(veinCells > 100);
  // Octilinear routing with per-cell noise put ~74% of vein cells on such lines; meandering routes stay well below.
  assert.ok(onLongAxisRuns < veinCells * 0.45, `${onLongAxisRuns} of ${veinCells} vein cells lie on long straight lattice lines`);
});

test("withdrawing cells record when they retracted", () => {
  const sim = new Simulation({ seed: 27, params: SMALL });
  sim.place("inoculum", CENTRE, CENTRE, 6);
  sim.step(200);
  const { retractedStep, slime, body } = sim.world;
  const withdrawn = [];
  for (let i = 0; i < slime.length; i++) if (slime[i] > 0.5 && !body[i]) withdrawn.push(retractedStep[i]);
  assert.ok(withdrawn.length > 50);
  assert.ok(withdrawn.every((s) => s > 0 && s <= sim.plasmodium.stepsTaken), "retraction step missing or out of range");
});
