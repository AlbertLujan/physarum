import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/simulation.js";
import { stepEnvironment } from "../src/environment.js";

const SMALL = { gridSize: 120 };

/** Total attractant released in one environment step. */
function scentAfterOneStep(covered) {
  const sim = new Simulation({ seed: 1, params: { ...SMALL, environment: { chemoPasses: 0 } } });
  sim.place("oat", 60, 60);
  if (covered) sim.plasmodium.inoculate(60, 60, 14);
  stepEnvironment(sim.world, sim.params);
  return sim.world.chemo.reduce((a, b) => a + b, 0);
}

test("food covered by plasmodium releases less attractant (Jones & Adamatzky suppression)", () => {
  const bare = scentAfterOneStep(false);
  const covered = scentAfterOneStep(true);
  assert.ok(bare > 0);
  assert.ok(covered < bare * 0.5, `bare ${bare.toFixed(2)} vs covered ${covered.toFixed(2)}`);
});
