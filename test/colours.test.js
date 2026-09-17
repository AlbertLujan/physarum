import { test } from "node:test";
import assert from "node:assert/strict";
import { COLOUR_LAYERS, COLOUR_PRESETS, DEFAULT_PRESET, hexToRgb, rgbToHex, resolveColours, matchingPreset } from "../src/colours.js";

const isChannel = (v) => Number.isInteger(v) && v >= 0 && v <= 255;

test("hex and rgb conversions round-trip", () => {
  assert.deepEqual(hexToRgb("#e6d842"), [230, 216, 66]);
  assert.equal(rgbToHex([230, 216, 66]), "#e6d842");
  assert.equal(rgbToHex([0, 0, 0]), "#000000");
  assert.equal(hexToRgb("not a colour"), null);
  assert.equal(hexToRgb("#abc"), null);
});

test("every preset defines a valid colour for every editable layer", () => {
  for (const [key, preset] of Object.entries(COLOUR_PRESETS)) {
    assert.ok(preset.label, `${key} has no label`);
    for (const { key: layer } of COLOUR_LAYERS) {
      const rgb = preset.colours[layer];
      assert.ok(Array.isArray(rgb) && rgb.length === 3 && rgb.every(isChannel), `${key}.${layer} is not an rgb triple`);
    }
  }
});

test("the natural preset keeps the original specimen colours", () => {
  const natural = COLOUR_PRESETS[DEFAULT_PRESET].colours;
  assert.deepEqual(natural.agar, [14, 15, 12]);
  assert.deepEqual(natural.vein, [230, 216, 66]);
  assert.deepEqual(natural.massLight, [255, 224, 40]);
});

test("resolving stored colours fills gaps from the default and ignores bad or unknown values", () => {
  const colours = resolveColours({ vein: "#ff0000", film: "oops", ghost: "#00ff00" });
  assert.deepEqual(colours.vein, [255, 0, 0]);
  assert.deepEqual(colours.film, COLOUR_PRESETS[DEFAULT_PRESET].colours.film);
  assert.equal(colours.ghost, undefined);
  assert.deepEqual(resolveColours(null), COLOUR_PRESETS[DEFAULT_PRESET].colours);
});

test("resolved colours are copies, so editing them never changes a preset", () => {
  const colours = resolveColours({});
  colours.vein[0] = 1;
  assert.equal(COLOUR_PRESETS[DEFAULT_PRESET].colours.vein[0], 230);
});

test("a palette is recognised as a preset only when every layer matches", () => {
  assert.equal(matchingPreset(resolveColours({})), DEFAULT_PRESET);
  assert.equal(matchingPreset(resolveColours({ vein: "#010203" })), null);
});
