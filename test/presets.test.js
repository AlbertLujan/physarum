import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/simulation.js";
import { PRESETS } from "../src/presets.js";

test("every preset seeds a plasmodium", () => {
  for (const [key, preset] of Object.entries(PRESETS)) {
    const sim = new Simulation({ seed: 1, params: { gridSize: 200 } });
    preset.build(sim);
    assert.ok(sim.plasmodium.count > 0, `${key} has no inoculum`);
  }
});

test("maze preset builds walls and leaves the centre food reachable", () => {
  const sim = new Simulation({ seed: 1, params: { gridSize: 200 } });
  PRESETS.maze.build(sim);
  const { wall, dishMask, size } = sim.world;
  let walls = 0;
  for (let i = 0; i < wall.length; i++) if (wall[i] && !dishMask[i]) walls++;
  assert.ok(walls > 300, `only ${walls} wall cells`);
  assert.ok(sim.world.items.some((item) => item.kind === "food"));
  assert.ok(reachable(sim.world, sim.plasmodium, size / 2, size / 2), "centre unreachable from inoculum");
});

/** Flood fill from the first agent through non-wall cells. */
function reachable(world, plasmodium, tx, ty) {
  const { size, wall } = world;
  const start = world.body.findIndex((v) => v === 1);
  const target = Math.floor(ty) * size + Math.floor(tx);
  const seen = new Uint8Array(size * size);
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const i = queue.pop();
    if (i === target) return true;
    const x = i % size, y = (i / size) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * size + nx;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen[j] || wall[j]) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return false;
}
