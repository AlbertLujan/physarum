import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../src/rng.js";
import { diffuse, paintDisc, cellIndex } from "../src/grid.js";
import { createDishMask } from "../src/dish.js";

test("rng is deterministic per seed", () => {
  const a = createRng(7), b = createRng(7), c = createRng(8);
  const seqA = [a.next(), a.next(), a.next()];
  assert.deepEqual(seqA, [b.next(), b.next(), b.next()]);
  assert.notDeepEqual(seqA, [c.next(), c.next(), c.next()]);
});

test("cellIndex returns -1 outside the grid", () => {
  assert.equal(cellIndex(10, 3.7, 2.2), 23);
  assert.equal(cellIndex(10, -0.1, 2), -1);
  assert.equal(cellIndex(10, 5, 10), -1);
});

test("diffuse spreads a point source to its neighbours and applies decay", () => {
  const size = 5;
  const field = new Float32Array(size * size);
  field[cellIndex(size, 2, 2)] = 9;
  diffuse(field, new Float32Array(field.length), size, { rate: 1, decay: 0 }, null);
  assert.ok(Math.abs(field[cellIndex(size, 2, 2)] - 1) < 1e-6);
  assert.ok(Math.abs(field[cellIndex(size, 1, 1)] - 1) < 1e-6);
  diffuse(field, new Float32Array(field.length), size, { rate: 0, decay: 0.5 }, null);
  assert.ok(Math.abs(field[cellIndex(size, 2, 2)] - 0.5) < 1e-6);
});

test("diffuse keeps blocked cells empty", () => {
  const size = 5;
  const field = new Float32Array(size * size).fill(1);
  const blocked = new Uint8Array(size * size);
  blocked[cellIndex(size, 2, 2)] = 1;
  diffuse(field, new Float32Array(field.length), size, { rate: 1, decay: 0 }, blocked);
  assert.equal(field[cellIndex(size, 2, 2)], 0);
});

test("paintDisc sets values inside the radius only", () => {
  const size = 9;
  const layer = new Uint8Array(size * size);
  paintDisc(layer, size, 4, 4, 2, 1);
  assert.equal(layer[cellIndex(size, 4, 4)], 1);
  assert.equal(layer[cellIndex(size, 6, 4)], 1);
  assert.equal(layer[cellIndex(size, 7, 4)], 0);
});

test("dish mask blocks the corners and frees the centre", () => {
  const size = 50;
  const mask = createDishMask(size);
  assert.equal(mask[cellIndex(size, 25, 25)], 0);
  assert.equal(mask[cellIndex(size, 0, 0)], 1);
  assert.equal(mask[cellIndex(size, 49, 49)], 1);
});
