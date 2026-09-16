import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/simulation.js";
import { cellIndex } from "../src/grid.js";

test("a light spot is brightest at its centre and fades smoothly toward the edge", () => {
  const sim = new Simulation({ seed: 1, params: { gridSize: 160 } });
  sim.place("light", 80, 80, 12);
  const at = (dx) => sim.world.light[cellIndex(sim.world.size, 80 + dx, 80)];
  assert.ok(at(0) > 0.95, `centre ${at(0)}`);
  assert.ok(at(0) > at(6) && at(6) > at(11) && at(11) > at(16), "brightness should fall off with distance");
  assert.ok(at(6) > 0.3 && at(6) < 0.95, `half radius ${at(6)} should be partly lit`);
  assert.ok(at(16) > 0 && at(16) < 0.2, `just beyond the brush radius ${at(16)} should be a faint glow`);
  assert.equal(at(30), 0);
});

test("overlapping light strokes keep the brighter value instead of adding up", () => {
  const sim = new Simulation({ seed: 1, params: { gridSize: 160 } });
  sim.place("light", 80, 80, 12);
  sim.place("light", 82, 80, 12);
  const { light } = sim.world;
  assert.ok(Math.max(...light) <= 1);
});
