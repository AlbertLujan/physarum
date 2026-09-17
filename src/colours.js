/** Parts of the dish whose colour the viewer can change, in the order the colour panel shows them. */
export const COLOUR_LAYERS = Object.freeze([
  { key: "agar", label: "Agar" },
  { key: "slime", label: "Slime" },
  { key: "trace", label: "Vein traces" },
  { key: "light", label: "Light" },
  { key: "wall", label: "Barriers" },
  { key: "film", label: "Front film" },
  { key: "thinVein", label: "Thin veins" },
  { key: "vein", label: "Thick veins" },
  { key: "rim", label: "Advancing edge" },
  { key: "massLight", label: "Food mass" },
  { key: "massDeep", label: "Mass folds" },
]);

export const DEFAULT_PRESET = "natural";

/**
 * Ready-made palettes. "natural" is modelled on darkfield photographs of Physarum; the others are for fun.
 * Colours are [r, g, b] with channels 0..255.
 */
export const COLOUR_PRESETS = Object.freeze({
  natural: {
    label: "Natural",
    colours: {
      agar: [14, 15, 12], slime: [52, 54, 38], trace: [96, 104, 100], light: [156, 150, 112], wall: [120, 124, 118],
      film: [150, 162, 40], thinVein: [140, 146, 36], vein: [230, 216, 66], rim: [238, 224, 36],
      massLight: [255, 224, 40], massDeep: [240, 168, 20],
    },
  },
  bioluminescent: {
    label: "Bioluminescent",
    colours: {
      agar: [2, 10, 20], slime: [10, 40, 60], trace: [30, 80, 100], light: [80, 120, 140], wall: [90, 110, 120],
      film: [20, 120, 140], thinVein: [30, 150, 190], vein: [120, 240, 255], rim: [200, 255, 255],
      massLight: [140, 255, 220], massDeep: [40, 160, 200],
    },
  },
  neon: {
    label: "Neon",
    colours: {
      agar: [8, 6, 20], slime: [40, 20, 60], trace: [70, 40, 110], light: [120, 110, 160], wall: [150, 150, 170],
      film: [0, 180, 160], thinVein: [0, 140, 200], vein: [0, 255, 230], rim: [255, 60, 200],
      massLight: [255, 80, 220], massDeep: [160, 40, 255],
    },
  },
  ember: {
    label: "Ember",
    colours: {
      agar: [18, 8, 6], slime: [60, 24, 14], trace: [90, 50, 40], light: [150, 110, 90], wall: [120, 110, 100],
      film: [170, 60, 20], thinVein: [200, 80, 20], vein: [255, 170, 40], rim: [255, 230, 120],
      massLight: [255, 210, 90], massDeep: [230, 70, 20],
    },
  },
  iodineStain: {
    label: "Iodine stain",
    colours: {
      agar: [236, 226, 200], slime: [210, 195, 160], trace: [170, 150, 120], light: [255, 250, 230], wall: [90, 80, 70],
      film: [150, 90, 40], thinVein: [140, 80, 40], vein: [90, 40, 20], rim: [120, 50, 20],
      massLight: [110, 50, 30], massDeep: [70, 30, 20],
    },
  },
  monochrome: {
    label: "Monochrome",
    colours: {
      agar: [10, 10, 10], slime: [45, 45, 45], trace: [90, 90, 90], light: [150, 150, 150], wall: [120, 120, 120],
      film: [130, 130, 130], thinVein: [150, 150, 150], vein: [235, 235, 235], rim: [255, 255, 255],
      massLight: [250, 250, 250], massDeep: [170, 170, 170],
    },
  },
});

/**
 * @param {string} hex colour in #rrggbb form
 * @returns {number[]|null} [r, g, b], or null when the string is not a 6-digit hex colour
 */
export function hexToRgb(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  return match ? match.slice(1).map((pair) => parseInt(pair, 16)) : null;
}

/**
 * @param {number[]} rgb [r, g, b] with channels 0..255
 * @returns {string} #rrggbb
 */
export function rgbToHex(rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Build a complete palette from stored hex values, taking anything missing or invalid from the default preset.
 * @param {Record<string, string>|null} stored layer key → #rrggbb
 * @returns {Record<string, number[]>} fresh copy, safe to edit
 */
export function resolveColours(stored) {
  const base = COLOUR_PRESETS[DEFAULT_PRESET].colours;
  const colours = {};
  for (const { key } of COLOUR_LAYERS) colours[key] = hexToRgb(stored?.[key]) ?? [...base[key]];
  return colours;
}

/**
 * @param {Record<string, number[]>} colours
 * @returns {string|null} key of the preset with exactly these colours, or null for a custom mix
 */
export function matchingPreset(colours) {
  const same = (a, b) => a.every((channel, k) => channel === b[k]);
  const found = Object.entries(COLOUR_PRESETS).find(([, preset]) => COLOUR_LAYERS.every(({ key }) => same(colours[key], preset.colours[key])));
  return found ? found[0] : null;
}
