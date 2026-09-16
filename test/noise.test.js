import { test } from "node:test";
import assert from "node:assert/strict";
import { addValueNoise, valueNoise, smoothstep, linear } from "../src/noise.js";

const counter = (values) => { let k = 0; return () => values[k++ % values.length]; };

test("value noise passes exactly through the lattice values", () => {
  const noise = valueNoise(8, 4, counter([0.1, 0.9, 0.3, 0.7, 0.5]));
  assert.ok(Math.abs(noise[0] - 0.1) < 1e-6);
  assert.ok(Math.abs(noise[4] - 0.9) < 1e-6);
});

test("octaves accumulate with their amplitude", () => {
  const out = new Float32Array(16);
  addValueNoise(out, 4, 2, () => 1, { amplitude: 0.5 });
  addValueNoise(out, 4, 2, () => 1, { amplitude: 0.25 });
  assert.ok(out.every((v) => Math.abs(v - 0.75) < 1e-6));
});

test("easing functions keep their end points", () => {
  for (const ease of [smoothstep, linear]) {
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
  }
  assert.equal(smoothstep(0.5), 0.5);
});
