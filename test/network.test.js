import { test } from "node:test";
import assert from "node:assert/strict";
import { labelComponents, shortestPathTree, accumulateFlow } from "../src/network.js";

test("labelComponents separates disconnected regions (8-connectivity)", () => {
  const size = 6;
  const mask = new Uint8Array(size * size);
  [0, 7, 14].forEach((i) => { mask[i] = 1; });
  mask[35] = 1;
  const labels = new Int32Array(mask.length), queue = new Int32Array(mask.length);
  assert.equal(labelComponents(mask, size, labels, queue), 2);
  assert.equal(labels[0], labels[14]);
  assert.notEqual(labels[0], labels[35]);
  assert.equal(labels[1], -1);
});

test("flow accumulates toward the source along the cheapest path", () => {
  const size = 10;
  const passable = new Uint8Array(size * size);
  for (let x = 0; x < size; x++) passable[5 * size + x] = 1;
  const dist = new Int32Array(passable.length), parent = new Int32Array(passable.length);
  shortestPathTree(size, passable, [5 * size], new Uint8Array(passable.length).fill(1), dist, parent);
  assert.equal(dist[5 * size + 9], 9);
  const flow = new Float32Array(passable.length);
  accumulateFlow(parent, dist, [5 * size + 9, 5 * size + 6], flow);
  assert.equal(flow[5 * size + 1], 2, "trunk near the source carries both sinks");
  assert.equal(flow[5 * size + 8], 1, "branch tip carries one sink");
  assert.equal(flow[0], 0);
});

test("flow can be added on top of existing flow with a weight", () => {
  const size = 4;
  const passable = new Uint8Array(size * size).fill(1);
  const dist = new Int32Array(passable.length), parent = new Int32Array(passable.length);
  shortestPathTree(size, passable, [0], new Uint8Array(passable.length).fill(1), dist, parent);
  const flow = new Float32Array(passable.length);
  accumulateFlow(parent, dist, [3], flow);
  accumulateFlow(parent, dist, [3], flow, { reset: false, amount: 5 });
  assert.equal(flow[3], 6);
});

test("cheaper cells attract the path (vein reinforcement)", () => {
  const size = 5;
  const passable = new Uint8Array(size * size).fill(1);
  const cheapRow = 0;
  const cost = Uint8Array.from({ length: passable.length }, (_, i) => (Math.floor(i / size) === cheapRow ? 1 : 5));
  const dist = new Int32Array(passable.length), parent = new Int32Array(passable.length);
  shortestPathTree(size, passable, [2 * size], cost, dist, parent);
  const flow = new Float32Array(passable.length);
  accumulateFlow(parent, dist, [2 * size + 4], flow);
  const onCheapRow = [1, 2, 3].some((x) => flow[cheapRow * size + x] > 0);
  assert.ok(onCheapRow, "path ignored the low-cost vein");
});

test("diagonal steps cost about sqrt(2) times an orthogonal step, so paths are not octilinear", () => {
  const size = 12;
  const passable = new Uint8Array(size * size).fill(1);
  const dist = new Int32Array(passable.length), parent = new Int32Array(passable.length);
  shortestPathTree(size, passable, [0], new Uint8Array(passable.length).fill(10), dist, parent);
  assert.equal(dist[10], 100, "ten orthogonal steps");
  assert.ok(Math.abs(dist[10 * size + 10] - 141) <= 2, `ten diagonal steps cost ${dist[10 * size + 10]}`);
});
