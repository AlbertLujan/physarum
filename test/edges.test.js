import { test } from "node:test";
import assert from "node:assert/strict";
import { createParams } from "../src/params.js";
import { createWorld } from "../src/world.js";
import { edgeStrength, EDGE } from "../src/edges.js";

const FRONT_AGE = 14;

/** A 20×20 world with a square of plasmodium from (5,5) to (14,14). */
function squareWorld(age) {
  const world = createWorld(createParams({ gridSize: 20 }));
  for (let y = 5; y <= 14; y++) for (let x = 5; x <= 14; x++) { world.body[y * 20 + x] = 1; world.age[y * 20 + x] = age; }
  return world;
}
const at = (x, y) => y * 20 + x;

test("interior cells get no rim", () => {
  const world = squareWorld(2);
  assert.equal(edgeStrength(world, at(9, 9), 100, FRONT_AGE), 0);
});

test("a young, advancing edge gets the strongest rim", () => {
  const world = squareWorld(2);
  assert.equal(edgeStrength(world, at(5, 9), 100, FRONT_AGE), EDGE.expanding);
});

test("an old edge that is not moving gets a faint rim", () => {
  const world = squareWorld(500);
  assert.equal(edgeStrength(world, at(14, 9), 600, FRONT_AGE), EDGE.static);
  assert.ok(EDGE.static > 0 && EDGE.static < EDGE.expanding);
});

test("an edge next to cytoplasm that just withdrew gets no rim", () => {
  const world = squareWorld(500);
  world.retractedStep[at(15, 9)] = 595;
  assert.equal(edgeStrength(world, at(14, 9), 600, FRONT_AGE), 0);
});

test("an old withdrawal no longer counts as retreating", () => {
  const world = squareWorld(500);
  world.retractedStep[at(15, 9)] = 100;
  assert.equal(edgeStrength(world, at(14, 9), 600, FRONT_AGE), EDGE.static);
});

test("non-body cells get no rim", () => {
  const world = squareWorld(2);
  assert.equal(edgeStrength(world, at(1, 1), 100, FRONT_AGE), 0);
});
