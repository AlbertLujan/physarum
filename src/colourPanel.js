import { COLOUR_LAYERS, COLOUR_PRESETS, DEFAULT_PRESET, resolveColours, rgbToHex, hexToRgb, matchingPreset } from "./colours.js";

const STORAGE_KEY = "physarum.colours";
const CUSTOM = "custom";

/**
 * Colour panel: one picker per dish layer, ready-made palettes and a reset button.
 * The chosen palette is remembered in this browser only.
 * @param {{grid: HTMLElement, presetSelect: HTMLSelectElement, resetButton: HTMLButtonElement,
 *          onChange: (colours: Record<string, number[]>) => void}} elements
 */
export function mountColourPanel({ grid, presetSelect, resetButton, onChange }) {
  let colours = resolveColours(loadStoredColours());
  fillPresetOptions(presetSelect);
  const inputs = createPickers(grid, (key, rgb) => { colours[key] = rgb; commit(); });

  presetSelect.addEventListener("change", () => {
    if (presetSelect.value === CUSTOM) return;
    colours = coloursOfPreset(presetSelect.value);
    commit();
  });
  resetButton.addEventListener("click", () => { colours = coloursOfPreset(DEFAULT_PRESET); commit(); });

  function commit() {
    for (const { key } of COLOUR_LAYERS) inputs[key].value = rgbToHex(colours[key]);
    presetSelect.value = matchingPreset(colours) ?? CUSTOM;
    storeColours(colours);
    onChange(colours);
  }
  commit();
}

function coloursOfPreset(key) {
  const hex = Object.fromEntries(Object.entries(COLOUR_PRESETS[key].colours).map(([layer, rgb]) => [layer, rgbToHex(rgb)]));
  return resolveColours(hex);
}

function fillPresetOptions(select) {
  const options = Object.entries(COLOUR_PRESETS).map(([key, preset]) => new Option(preset.label, key));
  const custom = new Option("Custom mix", CUSTOM);
  custom.disabled = true;
  select.replaceChildren(...options, custom);
}

/** @returns {Record<string, HTMLInputElement>} colour inputs by layer key */
function createPickers(grid, onPick) {
  const inputs = {};
  const fields = COLOUR_LAYERS.map(({ key, label }) => {
    const input = Object.assign(document.createElement("input"), { type: "color", id: `colour-${key}` });
    input.addEventListener("input", () => { const rgb = hexToRgb(input.value); if (rgb) onPick(key, rgb); });
    inputs[key] = input;
    const field = Object.assign(document.createElement("label"), { className: "swatch-field", htmlFor: input.id });
    field.append(input, label);
    return field;
  });
  grid.replaceChildren(...fields);
  return inputs;
}

function loadStoredColours() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function storeColours(colours) {
  try {
    const hex = Object.fromEntries(Object.entries(colours).map(([layer, rgb]) => [layer, rgbToHex(rgb)]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hex));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the palette still works for this visit.
  }
}
