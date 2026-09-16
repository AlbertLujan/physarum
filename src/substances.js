/**
 * Placeable items. Nutrient and scent values are relative model units, ranked from lab practice:
 * oat flakes are the standard Physarum culture food; sugars are strong chemoattractants; yeast and
 * fungal tissue are natural prey. Salt and quinine are documented chemorepellents; the plasmodium
 * is photophobic under white light.
 */
export const SUBSTANCES = Object.freeze({
  inoculum: { kind: "inoculum", label: "Plasmodium inoculum", hint: "A piece of live slime mould" },
  oat: { kind: "food", label: "Oat flake", hint: "Standard lab food", radiusMm: 2.6, nutrient: 120, scent: 1 },
  glucose: { kind: "food", label: "Glucose drop", hint: "Little food, strong scent", radiusMm: 3.2, nutrient: 20, scent: 2.4 },
  yeast: { kind: "food", label: "Yeast", hint: "Very nutritious", radiusMm: 2, nutrient: 160, scent: 1.2 },
  mushroom: { kind: "food", label: "Mushroom piece", hint: "Natural prey, faint scent", radiusMm: 3.6, nutrient: 110, scent: 0.7 },
  strawberry: { kind: "food", label: "Strawberry piece", hint: "Sugary, strong scent", radiusMm: 3.2, nutrient: 50, scent: 1.8 },
  salt: { kind: "repellent", label: "Salt crystal", hint: "NaCl, dissolves into the agar", radiusMm: 1.4, amount: 500 },
  quinine: { kind: "repellent", label: "Quinine", hint: "Bitter, strong repellent", radiusMm: 1.4, amount: 1100 },
  light: { kind: "light", label: "Bright light", hint: "Paint a lit area: the mould flees it" },
  wall: { kind: "wall", label: "Barrier", hint: "Paint walls or mazes" },
  erase: { kind: "erase", label: "Erase", hint: "Removes food, light, salt and walls" },
});
