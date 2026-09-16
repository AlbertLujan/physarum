/**
 * Starting scenarios. Coordinates are authored for a 400-cell dish and scaled to the grid.
 * @type {Record<string, {label: string, description: string, build: (sim: import("./simulation.js").Simulation) => void}>}
 */
export const PRESETS = {
  ring: {
    label: "Anillo de comida",
    description: "Inóculo central rodeado de avena y levadura: el moho explora y conecta las fuentes.",
    build(sim) {
      const s = scaler(sim);
      sim.place("inoculum", s(200), s(200), s(14));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        sim.place(k % 2 ? "yeast" : "oat", s(200 + Math.cos(a) * 125), s(200 + Math.sin(a) * 125));
      }
    },
  },
  maze: {
    label: "Laberinto",
    description: "Montaje de Nakagaki et al. (2000): el plasmodio llena el laberinto y hay avena en la entrada y en el centro. Observa cómo abandona los pasillos y se concentra en la comida.",
    build(sim) {
      const s = scaler(sim);
      const rings = [{ r: 55, gaps: [0.6] }, { r: 100, gaps: [3.6] }, { r: 145, gaps: [1.9, 5.2] }];
      for (const ring of rings) paintRing(sim, s(200), s(200), s(ring.r), ring.gaps, s(2.2));
      fillWithPlasmodium(sim, s(18), s(3));
      sim.place("oat", s(200), s(200));
      sim.place("oat", s(200 + Math.cos(1.2) * 172), s(200 + Math.sin(1.2) * 172));
    },
  },
  saltBarrier: {
    label: "Sal en el camino",
    description: "Glucosa detrás de una línea de sal abierta por abajo: ¿la rodea o la cruza?",
    build(sim) {
      const s = scaler(sim);
      sim.place("inoculum", s(95), s(200), s(13));
      sim.place("glucose", s(310), s(200));
      for (let y = 40; y <= 290; y += 18) sim.place("salt", s(205), s(y));
    },
  },
  fusion: {
    label: "Dos inóculos",
    description: "Dos trozos del mismo plasmodio con comida entre ambos: se encuentran y se fusionan.",
    build(sim) {
      const s = scaler(sim);
      sim.place("inoculum", s(110), s(200), s(12));
      sim.place("inoculum", s(290), s(200), s(12));
      sim.place("mushroom", s(200), s(150));
      sim.place("strawberry", s(200), s(260));
    },
  },
  empty: {
    label: "Placa vacía",
    description: "Solo el inóculo. Añade tú lo que quieras.",
    build(sim) {
      const s = scaler(sim);
      sim.place("inoculum", s(200), s(200), s(12));
    },
  },
};

function scaler(sim) {
  const k = sim.world.size / 400;
  return (v) => v * k;
}

/** Seed small plasmodium patches on a regular lattice across every free area of the dish. */
function fillWithPlasmodium(sim, spacing, radius) {
  const { size, wall } = sim.world;
  for (let y = spacing / 2; y < size; y += spacing) {
    for (let x = spacing / 2; x < size; x += spacing) {
      if (!wall[Math.floor(y) * size + Math.floor(x)]) sim.place("inoculum", x, y, radius);
    }
  }
}

/** Circular barrier with angular openings (radians, each about 0.35 rad wide). */
function paintRing(sim, cx, cy, radius, gaps, thickness) {
  const steps = Math.ceil(radius * Math.PI * 2 / Math.max(1, thickness));
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2;
    if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.18)) continue;
    sim.place("wall", cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, thickness);
  }
}
