/**
 * Placeable items. Nutrient and scent values are relative model units, ranked from lab practice:
 * oat flakes are the standard Physarum culture food; sugars are strong chemoattractants; yeast and
 * fungal tissue are natural prey. Salt and quinine are documented chemorepellents; the plasmodium
 * is photophobic under white light.
 */
export const SUBSTANCES = Object.freeze({
  inoculum: { kind: "inoculum", label: "Inóculo de plasmodio", hint: "Trozo de moho vivo" },
  oat: { kind: "food", label: "Copo de avena", hint: "Alimento de laboratorio estándar", radiusMm: 2.6, nutrient: 120, scent: 1 },
  glucose: { kind: "food", label: "Gota de glucosa", hint: "Poco alimento, mucho olor", radiusMm: 3.2, nutrient: 20, scent: 2.4 },
  yeast: { kind: "food", label: "Levadura", hint: "Muy nutritiva", radiusMm: 2, nutrient: 160, scent: 1.2 },
  mushroom: { kind: "food", label: "Trozo de seta", hint: "Presa natural, olor suave", radiusMm: 3.6, nutrient: 110, scent: 0.7 },
  strawberry: { kind: "food", label: "Trozo de fresa", hint: "Azúcares, olor intenso", radiusMm: 3.2, nutrient: 50, scent: 1.8 },
  salt: { kind: "repellent", label: "Cristal de sal", hint: "NaCl, se disuelve en el agar", radiusMm: 1.4, amount: 500 },
  quinine: { kind: "repellent", label: "Quinina", hint: "Amarga, repelente fuerte", radiusMm: 1.4, amount: 1100 },
  light: { kind: "light", label: "Luz blanca", hint: "Pinta una zona iluminada" },
  wall: { kind: "wall", label: "Barrera", hint: "Pinta paredes o laberintos" },
  erase: { kind: "erase", label: "Borrar", hint: "Quita comida, luz, sal y barreras" },
});
