import { Simulation } from "./simulation.js";
import { DishRenderer } from "./renderer.js";
import { PRESETS } from "./presets.js";
import { SUBSTANCES } from "./substances.js";
import { renderIcon } from "./sprites.js";

const TOOL_GROUPS = [
  { label: "Siembra", tools: ["inoculum"] },
  { label: "Alimentos", tools: ["oat", "glucose", "yeast", "mushroom", "strawberry"] },
  { label: "Repelentes", tools: ["salt", "quinine", "light"] },
  { label: "Placa", tools: ["wall", "erase"] },
];
const BRUSH_TOOLS = new Set(["light", "wall", "erase"]);
const WARMUP_STEPS = 200;
/** Simulation steps attempted per animation frame for each speed setting. */
const STEPS_PER_FRAME = [1, 2, 3, 5, 8, 12, 18, 26];
/** Frame time budget: slow speeds keep 60 fps, fast speeds trade frame rate for simulated time. */
const frameBudgetMs = (speed) => (speed <= 2 ? 12 : Math.min(60, 12 + speed * 6));

const $ = (id) => document.getElementById(id);
const state = {
  sim: null, preset: "ring", tool: "oat", running: true, speed: 2,
  pointer: null, painting: false, lastPaint: null, palette: null, frames: 0,
  rate: { steps: 0, since: performance.now(), stepsPerSecond: 0 },
};
const renderer = new DishRenderer($("dish"));

/* ---------- Setup ---------- */

function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  return { ink: token("--ink"), glass: token("--glass"), glassEdge: token("--glass-edge"), shadow: token("--dish-shadow") };
}

function loadPreset(key) {
  state.preset = key;
  state.sim = new Simulation({ seed: Math.floor(Math.random() * 1e9) });
  PRESETS[key].build(state.sim);
  state.sim.step(WARMUP_STEPS);
  renderer.setSimulation(state.sim);
  $("preset-description").textContent = PRESETS[key].description;
  updateStats();
}

function buildToolTray() {
  const tray = $("tools");
  for (const group of TOOL_GROUPS) {
    const section = document.createElement("section");
    section.className = "tool-group";
    const heading = Object.assign(document.createElement("h3"), { className: "label", textContent: group.label });
    const list = Object.assign(document.createElement("div"), { className: "tool-list" });
    list.append(...group.tools.map(createToolButton));
    section.append(heading, list);
    tray.append(section);
  }
  document.querySelectorAll("canvas.tool-icon").forEach((c) => renderIcon(c, c.dataset.type));
  selectTool(state.tool);
}

function createToolButton(type) {
  const s = SUBSTANCES[type];
  const button = Object.assign(document.createElement("button"), { type: "button", className: "tool", id: `tool-${type}` });
  button.dataset.tool = type;
  const icon = /^(inoculum|light|wall|erase)$/.test(type)
    ? Object.assign(document.createElement("span"), { className: `tool-icon swatch swatch-${type}` })
    : Object.assign(document.createElement("canvas"), { className: "tool-icon" });
  icon.dataset.type = type;
  icon.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.className = "tool-text";
  text.append(Object.assign(document.createElement("span"), { className: "tool-name", textContent: s.label }),
    Object.assign(document.createElement("span"), { className: "tool-hint", textContent: s.hint }));
  button.append(icon, text);
  button.addEventListener("click", () => selectTool(type));
  return button;
}

function selectTool(type) {
  state.tool = type;
  document.querySelectorAll(".tool").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === type)));
  $("brush-field").hidden = !(BRUSH_TOOLS.has(type) || type === "inoculum");
  $("dish-hint").textContent = BRUSH_TOOLS.has(type) ? "Arrastra sobre la placa para pintar" : "Haz clic en la placa para colocar";
}

function buildPresetMenu() {
  const select = $("preset");
  select.replaceChildren(...Object.entries(PRESETS).map(([key, p]) => Object.assign(document.createElement("option"), { value: key, textContent: p.label })));
  select.value = state.preset;
}

/* ---------- Interaction ---------- */

function brushCells() {
  return Number($("brush").value) / state.sim.world.mmPerCell;
}

function applyTool(x, y) {
  const brush = state.tool === "inoculum" ? brushCells() * 1.2 : brushCells();
  state.sim.place(state.tool, x, y, brush);
}

/** Paint along the segment from the last point so fast drags leave no gaps. */
function paintTo(point) {
  const from = state.lastPaint ?? point;
  const spacing = Math.max(1, brushCells() * 0.5);
  const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / spacing));
  for (let k = 1; k <= steps; k++) applyTool(from.x + ((point.x - from.x) * k) / steps, from.y + ((point.y - from.y) * k) / steps);
  state.lastPaint = point;
}

function pointerGrid(event) {
  const rect = $("dish").getBoundingClientRect();
  return renderer.toGrid(event.clientX - rect.left, event.clientY - rect.top);
}

function bindCanvas() {
  const canvas = $("dish");
  canvas.addEventListener("pointerdown", (e) => {
    const p = pointerGrid(e);
    if (!p.inside) return;
    canvas.setPointerCapture(e.pointerId);
    if (BRUSH_TOOLS.has(state.tool)) { state.painting = true; state.lastPaint = null; paintTo(p); } else applyTool(p.x, p.y);
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointerGrid(e);
    state.pointer = p.inside ? p : null;
    if (state.painting && p.inside) paintTo(p);
  });
  const stop = () => { state.painting = false; state.lastPaint = null; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("pointerleave", () => { state.pointer = null; });
}

function setRunning(running) {
  state.running = running;
  $("btn-play").textContent = running ? "Pausar" : "Reanudar";
  $("btn-play").setAttribute("aria-pressed", String(!running));
}

function bindControls() {
  $("btn-play").addEventListener("click", () => setRunning(!state.running));
  $("btn-reset").addEventListener("click", () => loadPreset(state.preset));
  $("preset").addEventListener("change", (e) => loadPreset(e.target.value));
  $("speed").addEventListener("input", (e) => { state.speed = Number(e.target.value); $("speed-out").textContent = `×${state.speed}`; });
  $("brush").addEventListener("input", (e) => { $("brush-out").textContent = `${Number(e.target.value).toFixed(1)} mm`; });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) { e.preventDefault(); setRunning(!state.running); }
  });
  new ResizeObserver(() => renderer.resize()).observe($("dish"));
  const onTheme = () => { state.palette = readPalette(); };
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onTheme);
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

/* ---------- Loop ---------- */

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

function updateStats() {
  const s = state.sim.stats();
  $("stat-time").textContent = formatDuration(s.elapsedSeconds);
  $("stat-area").textContent = `${(s.areaMm2 / 100).toFixed(2)} cm²`;
  $("stat-food").textContent = s.foodRemaining == null ? "sin comida" : `${Math.round(s.foodRemaining * 100)} %`;
  $("stat-veins").textContent = `${s.veinLengthCm.toFixed(0)} cm`;
  $("stat-rate").textContent = rateLabel();
  $("stat-status").textContent = s.cells === 0 ? "El plasmodio ha muerto" : "";
}

/** Actual simulated time per second, flagged when the computer cannot reach the chosen speed. */
function rateLabel() {
  if (!state.running) return "en pausa";
  const { stepsPerSecond } = state.rate;
  const wanted = STEPS_PER_FRAME[state.speed - 1] * 60;
  const text = formatRate(stepsPerSecond * state.sim.params.secondsPerStep);
  return stepsPerSecond && stepsPerSecond < wanted * 0.7 ? `${text} · máximo de tu equipo` : text;
}

/** Simulated time per real second, e.g. "25 min/s". */
function formatRate(simSecondsPerSecond) {
  const minutes = simSecondsPerSecond / 60;
  return minutes >= 60 ? `${(minutes / 60).toFixed(1)} h/s` : `${Math.round(minutes)} min/s`;
}

function advance() {
  if (!state.running) return;
  const start = performance.now();
  const target = STEPS_PER_FRAME[state.speed - 1], budget = frameBudgetMs(state.speed);
  let done = 0;
  while (done < target && performance.now() - start < budget) { state.sim.step(1); done++; }
  trackRate(done);
}

/** Exponentially smoothed steps per second, measured over half-second windows. */
function trackRate(steps) {
  const r = state.rate, now = performance.now();
  r.steps += steps;
  if (now - r.since < 500) return;
  const measured = (r.steps * 1000) / (now - r.since);
  r.stepsPerSecond = r.stepsPerSecond ? r.stepsPerSecond * 0.5 + measured * 0.5 : measured;
  r.steps = 0; r.since = now;
}

function frame() {
  requestAnimationFrame(frame);
  advance();
  const brushing = state.pointer && (BRUSH_TOOLS.has(state.tool) || state.tool === "inoculum");
  renderer.draw({
    palette: state.palette,
    showSignals: $("show-signals").checked,
    brush: brushing ? { ...state.pointer, radius: brushCells() } : null,
  });
  if (++state.frames % 8 === 0) updateStats();
}

function start() {
  state.palette = readPalette();
  buildPresetMenu();
  buildToolTray();
  bindCanvas();
  bindControls();
  loadPreset(state.preset);
  renderer.resize();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setRunning(false);
  requestAnimationFrame(frame);
}

start();
