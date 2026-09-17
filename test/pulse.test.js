import { test } from "node:test";
import assert from "node:assert/strict";
import { pulseLevel, PULSE } from "../src/pulse.js";

test("pulse level stays between 0 and 1", () => {
  for (let t = 0; t < 10; t += 0.137) {
    for (const d of [0, 300, 1250, 5000]) {
      const level = pulseLevel(d, t);
      assert.ok(level >= 0 && level <= 1, `level ${level}`);
    }
  }
});

test("the pulse repeats every period", () => {
  const a = pulseLevel(800, 1.3), b = pulseLevel(800, 1.3 + PULSE.periodSeconds);
  assert.ok(Math.abs(a - b) < 1e-9);
});

test("the pulse travels outward: a later time matches a farther point", () => {
  const speed = PULSE.wavelength / PULSE.periodSeconds;
  const near = pulseLevel(0, 0.5);
  const far = pulseLevel(0.4 * speed, 0.9);
  assert.ok(Math.abs(near - far) < 1e-9, "the crest should move away from the source");
});

test("cells outside the routed network do not pulse", () => {
  assert.equal(pulseLevel(-1, 0.3), 1);
  assert.equal(pulseLevel(-1, 1.7), 1);
});
