import { remainingFood } from "./simulation.js";
import { drawSubstance } from "./sprites.js";
import { HALO_SCALE } from "./world.js";

/**
 * Specimen colours, modelled on darkfield photographs of Physarum: clear agar over a black stage,
 * a translucent olive film at the fronts, luminous yellow veins and crumpled yellow-orange masses on food.
 * The dish content looks the same in both page themes.
 */
const AGAR = [14, 15, 12];
const SLIME = [52, 54, 38];
const LIT = [74, 74, 60];
const WALL = [120, 124, 118];
const FILM = [150, 162, 40];
const VEIN = [230, 216, 66];
const MASS_LIGHT = [255, 224, 40];
const MASS_DEEP = [240, 168, 20];
const THIN_VEIN = [140, 146, 36];
const TRACE = [96, 104, 100];
const GLOSS = [150, 162, 168];
const WRINKLE_CELLS = 3;

const mix = (a, b, t) => a + (b - a) * t;

/**
 * Draws a Simulation as a top-down photograph of a Petri dish.
 */
export class DishRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.geometry = { cx: 0, cy: 0, radius: 1, dpr: 1 };
  }

  /** Bind a simulation and allocate its pixel buffers. */
  setSimulation(sim) {
    this.sim = sim;
    const { size, coarseSize } = sim.world;
    this.base = makeLayer(size);
    this.plasm = makeLayer(size);
    this.signals = makeLayer(coarseSize);
    this.grain = new Float32Array(size * size).map(() => (Math.random() - 0.5) * 3);
    this.wrinkle = valueNoise(size, WRINKLE_CELLS);
    this.gloss = valueNoise(size, 5);
    this.massShape = new Float32Array(size * size);
    this.shapeVersion = -1;
  }

  /** Match the backing store to the element size. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const rim = 12 * dpr;
    this.geometry = { cx: this.canvas.width / 2, cy: this.canvas.height / 2, radius: Math.max(0, Math.min(this.canvas.width, this.canvas.height) / 2 - rim), dpr };
  }

  /**
   * Convert a pointer position (CSS px relative to the canvas) to grid coordinates.
   * @returns {{x: number, y: number, inside: boolean}}
   */
  toGrid(px, py) {
    const { cx, cy, radius, dpr } = this.geometry;
    const size = this.sim.world.size;
    const x = ((px * dpr - (cx - radius)) / (radius * 2)) * size;
    const y = ((py * dpr - (cy - radius)) / (radius * 2)) * size;
    return { x, y, inside: Math.hypot(x - size / 2, y - size / 2) < size / 2 - 1 };
  }

  /**
   * Render one frame.
   * @param {{palette: object, showSignals: boolean, brush: null|{x: number, y: number, radius: number}}} view
   */
  draw(view) {
    const { ctx, canvas } = this;
    const { cx, cy, radius } = this.geometry;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (radius <= 0) return;
    this.drawDishShadow(view.palette);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
    this.blit(this.paintBase(), radius);
    this.drawItems();
    this.blit(this.paintPlasmodium(), radius);
    if (view.showSignals) this.blit(this.paintSignals(), radius);
    ctx.restore();
    this.drawRim(view.palette);
    this.drawScaleBar(view.palette);
    if (view.brush) this.drawBrush(view.brush, view.palette);
  }

  blit(layer, radius) {
    const { cx, cy } = this.geometry;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.ctx.drawImage(layer.canvas, cx - radius, cy - radius, radius * 2, radius * 2);
  }

  /** Agar, extracellular slime traces, illuminated zones and barriers. */
  paintBase() {
    const { slime, light, wall, dishMask, trace } = this.sim.world;
    const px = this.base.image.data;
    for (let i = 0; i < slime.length; i++) {
      const o = i * 4, g = this.grain[i];
      const shine = Math.max(0, this.gloss[i] - 0.8) * 0.5;
      const s = Math.min(1, slime[i]) * 0.55, l = light[i] * 0.6, t = Math.min(1, trace[i] * 1.6) * 0.8;
      let r = mix(AGAR[0] + g, GLOSS[0], shine), gr = mix(AGAR[1] + g, GLOSS[1], shine), b = mix(AGAR[2] + g, GLOSS[2], shine);
      r = mix(r, SLIME[0], s); gr = mix(gr, SLIME[1], s); b = mix(b, SLIME[2], s);
      r = mix(r, TRACE[0], t); gr = mix(gr, TRACE[1], t); b = mix(b, TRACE[2], t);
      r = mix(r, LIT[0], l); gr = mix(gr, LIT[1], l); b = mix(b, LIT[2], l);
      if (wall[i] && !dishMask[i]) { r = WALL[0] + g; gr = WALL[1] + g; b = WALL[2] + g; }
      px[o] = r; px[o + 1] = gr; px[o + 2] = b; px[o + 3] = 255;
    }
    return commit(this.base);
  }

  /**
   * Plasmodium: translucent olive film where the sheet is young (fainter once it withdraws), luminous veins
   * whose opacity follows vein strength, and wrinkled masses engulfing food.
   */
  paintPlasmodium() {
    const { body, age, vein, mass } = this.sim.world;
    const { frontAge } = this.sim.params.growth;
    const shape = this.refreshMassShape();
    const px = this.plasm.image.data;
    for (let i = 0; i < body.length; i++) {
      const o = i * 4;
      if (!body[i]) { px[o + 3] = 0; continue; }
      const film = age[i] < frontAge * 3 ? 0.55 : 0.1;
      const v = Math.min(1, vein[i] * 1.6);
      const tone = Math.min(1, vein[i] * 1.8);
      const vr = mix(THIN_VEIN[0], VEIN[0], tone), vg = mix(THIN_VEIN[1], VEIN[1], tone), vb = mix(THIN_VEIN[2], VEIN[2], tone);
      px[o] = mix(FILM[0], vr, v) + this.grain[i]; px[o + 1] = mix(FILM[1], vg, v) + this.grain[i]; px[o + 2] = mix(FILM[2], vb, v);
      px[o + 3] = Math.max(film, v) * 255;
      const cover = massCoverage(mass[i], shape[i]);
      if (cover > 0) this.shadeMass(px, o, i, cover);
    }
    return commit(this.plasm);
  }

  /**
   * Crumpled texture blended over the film/vein colour: bright ridges and deeper orange folds from a fine value
   * noise. As the mass thins, folds dull first and the colour sinks back into the film.
   */
  shadeMass(px, o, i, cover) {
    const w = this.wrinkle[i];
    const fold = Math.min(1, Math.max(0, (w - 0.35) * 1.8)) * (0.4 + 0.6 * cover);
    const gap = w < 0.12 ? 0.35 : 1;
    const t = cover * gap;
    px[o] = mix(px[o], mix(MASS_DEEP[0], MASS_LIGHT[0], fold), t);
    px[o + 1] = mix(px[o + 1], mix(MASS_DEEP[1], MASS_LIGHT[1], fold), t);
    px[o + 2] = mix(px[o + 2], mix(MASS_DEEP[2], MASS_LIGHT[2], fold), t);
    px[o + 3] = mix(px[o + 3], 255, t);
  }

  /** Irregular outline for food masses: distance to the item centre perturbed by the wrinkle noise. */
  refreshMassShape() {
    const { world } = this.sim;
    if (this.shapeVersion === world.version) return this.massShape;
    this.massShape.fill(0);
    const size = world.size;
    for (const item of world.items) {
      if (item.kind !== "food") continue;
      const haloRadius = item.radius * HALO_SCALE;
      for (const i of item.halo) {
        const d = Math.hypot((i % size) - item.x, ((i / size) | 0) - item.y) / haloRadius;
        this.massShape[i] = Math.max(this.massShape[i], 1 - d + (this.wrinkle[i] - 0.5) * 0.7);
      }
    }
    this.shapeVersion = world.version;
    return this.massShape;
  }

  /** Chemical signals: attractant from food in blue, dissolved repellent in magenta. */
  paintSignals() {
    const { chemo, repel } = this.sim.world;
    const px = this.signals.image.data;
    for (let i = 0; i < chemo.length; i++) {
      const o = i * 4, a = Math.min(1, chemo[i] * 0.9), r = Math.min(1, repel[i] * 0.5);
      const total = Math.max(a, r);
      px[o] = mix(40, 200, r / (a + r || 1)); px[o + 1] = mix(110, 40, r / (a + r || 1)); px[o + 2] = mix(230, 160, r / (a + r || 1));
      px[o + 3] = total * 150;
    }
    return commit(this.signals);
  }

  drawItems() {
    const { ctx, sim } = this;
    const scale = (this.geometry.radius * 2) / sim.world.size;
    const { cx, cy, radius } = this.geometry;
    for (const item of sim.world.items) {
      const left = item.kind === "food" ? remainingFood(sim.world, item) : 1;
      ctx.save();
      ctx.translate(cx - radius + item.x * scale, cy - radius + item.y * scale);
      ctx.globalAlpha = 0.6 + 0.4 * left;
      if (left < 1) ctx.filter = `saturate(${0.3 + 0.7 * left}) brightness(${0.85 + 0.15 * left})`;
      drawSubstance(ctx, item, item.radius * scale * (0.75 + 0.25 * left));
      ctx.restore();
    }
  }

  drawDishShadow(palette) {
    const { ctx } = this;
    const { cx, cy, radius, dpr } = this.geometry;
    ctx.save();
    ctx.shadowColor = palette.shadow;
    ctx.shadowBlur = 24 * dpr;
    ctx.shadowOffsetY = 6 * dpr;
    ctx.fillStyle = `rgb(${AGAR.join(",")})`;
    ctx.beginPath(); ctx.arc(cx, cy, radius + 6 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** Glass wall of the dish with a soft specular highlight. */
  drawRim(palette) {
    const { ctx } = this;
    const { cx, cy, radius, dpr } = this.geometry;
    ctx.save();
    ctx.lineWidth = 7 * dpr;
    ctx.strokeStyle = palette.glass;
    ctx.beginPath(); ctx.arc(cx, cy, radius + 3 * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2 * dpr;
    ctx.strokeStyle = palette.glassEdge;
    ctx.beginPath(); ctx.arc(cx, cy, radius + 6.5 * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath(); ctx.arc(cx, cy, radius - 5 * dpr, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();
    ctx.restore();
  }

  /** 10 mm bar drawn on the bench, bottom right of the dish. */
  drawScaleBar(palette) {
    const { ctx, sim } = this;
    const { cx, cy, radius, dpr } = this.geometry;
    const length = (10 / sim.params.dishMm) * radius * 2;
    const x = cx + radius * 0.62, y = cy + radius * 0.93;
    ctx.save();
    ctx.strokeStyle = palette.ink; ctx.fillStyle = palette.ink; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + length, y); ctx.stroke();
    ctx.font = `${11 * dpr}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("10 mm", x + length / 2, y - 4 * dpr);
    ctx.restore();
  }

  drawBrush(brush, palette) {
    const { ctx, sim } = this;
    const { cx, cy, radius, dpr } = this.geometry;
    const scale = (radius * 2) / sim.world.size;
    ctx.save();
    ctx.strokeStyle = palette.ink; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2 * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath(); ctx.arc(cx - radius + brush.x * scale, cy - radius + brush.y * scale, Math.max(3 * dpr, brush.radius * scale), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

/**
 * Smooth value noise in [0, 1] with lattice spacing `cell`.
 * @returns {Float32Array}
 */
function valueNoise(size, cell) {
  const lattice = Math.ceil(size / cell) + 2;
  const values = Float32Array.from({ length: lattice * lattice }, Math.random);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = y / cell, y0 = gy | 0, fy = gy - y0;
    for (let x = 0; x < size; x++) {
      const gx = x / cell, x0 = gx | 0, fx = gx - x0;
      const top = mix(values[y0 * lattice + x0], values[y0 * lattice + x0 + 1], fx);
      const bottom = mix(values[(y0 + 1) * lattice + x0], values[(y0 + 1) * lattice + x0 + 1], fx);
      out[y * size + x] = mix(top, bottom, fy);
    }
  }
  return out;
}

/**
 * How strongly a cell shows as food mass. A thinning mass (low `mass`) shrinks toward the centre of the
 * food because cells near the irregular outline (low `shape`) drop out first.
 * @returns {number} 0..1
 */
function massCoverage(mass, shape) {
  if (mass <= 0.02) return 0;
  const edge = 0.15 + (1 - mass) * 0.75;
  return Math.min(1, Math.max(0, (shape - edge) / 0.15)) * Math.min(1, mass * 1.6);
}

function makeLayer(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  return { canvas, ctx, image: ctx.createImageData(size, size) };
}

function commit(layer) {
  layer.ctx.putImageData(layer.image, 0, 0);
  return layer;
}
