/**
 * Canvas drawings of placeable substances, centred on the origin.
 * Shapes vary per item through a hash of its position so two oat flakes never look identical.
 */

const TAU = Math.PI * 2;

/** Deterministic 0..1 values derived from an item's position. */
function variation(item) {
  let seed = Math.floor(item.x * 73856093) ^ Math.floor(item.y * 19349663);
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function blob(ctx, r, rand, lumps, wobble) {
  ctx.beginPath();
  for (let k = 0; k <= lumps; k++) {
    const a = (k / lumps) * TAU;
    const rr = r * (1 - wobble / 2 + rand() * wobble);
    k === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

function speckle(ctx, r, rand, count, size, color) {
  ctx.fillStyle = color;
  for (let k = 0; k < count; k++) {
    const a = rand() * TAU, d = Math.sqrt(rand()) * r * 0.8;
    ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, size, size);
  }
}

const DRAWERS = {
  oat(ctx, r, rand) {
    ctx.rotate(rand() * TAU);
    ctx.scale(1, 0.72);
    blob(ctx, r, rand, 14, 0.18);
    ctx.fillStyle = "#d8c08e"; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.08); ctx.strokeStyle = "#a88a55"; ctx.stroke();
    ctx.strokeStyle = "rgba(150,120,70,0.45)"; ctx.lineWidth = Math.max(0.6, r * 0.05);
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(-r * 0.7, k * r * 0.22); ctx.lineTo(r * 0.7, k * r * 0.18); ctx.stroke(); }
  },
  glucose(ctx, r) {
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, "rgba(255,255,255,0.75)"); grad.addColorStop(1, "rgba(255,255,255,0.12)");
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = "rgba(140,130,100,0.5)"; ctx.lineWidth = Math.max(0.8, r * 0.05); ctx.stroke();
  },
  yeast(ctx, r, rand) {
    blob(ctx, r, rand, 18, 0.3);
    ctx.fillStyle = "#efe4c6"; ctx.fill();
    ctx.strokeStyle = "#c9b688"; ctx.lineWidth = Math.max(0.8, r * 0.06); ctx.stroke();
    speckle(ctx, r, rand, 30, Math.max(1, r * 0.1), "rgba(170,140,90,0.55)");
  },
  mushroom(ctx, r, rand) {
    ctx.rotate(rand() * TAU);
    blob(ctx, r, rand, 10, 0.25);
    ctx.fillStyle = "#b09474"; ctx.fill();
    ctx.strokeStyle = "rgba(80,60,40,0.55)"; ctx.lineWidth = Math.max(0.6, r * 0.04);
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI - Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, r * 0.1); ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); ctx.stroke(); }
  },
  strawberry(ctx, r, rand) {
    ctx.rotate(rand() * TAU);
    blob(ctx, r, rand, 12, 0.2);
    ctx.fillStyle = "#c73a44"; ctx.fill();
    speckle(ctx, r, rand, 14, Math.max(1, r * 0.1), "#f1d36a");
  },
  salt(ctx, r, rand) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fbfbf8"; ctx.strokeStyle = "rgba(120,120,120,0.6)"; ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const s = r * (0.5 + rand() * 0.5);
      ctx.save(); ctx.translate((rand() - 0.5) * r, (rand() - 0.5) * r); ctx.rotate(rand() * TAU);
      ctx.fillRect(-s / 2, -s / 2, s, s); ctx.strokeRect(-s / 2, -s / 2, s, s); ctx.restore();
    }
  },
  quinine(ctx, r, rand) {
    ctx.fillStyle = "rgba(220,240,225,0.4)";
    ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, TAU); ctx.fill();
    blob(ctx, r, rand, 12, 0.4);
    ctx.fillStyle = "#f4f6ee"; ctx.fill();
    speckle(ctx, r, rand, 12, Math.max(1, r * 0.12), "rgba(150,170,150,0.7)");
  },
};

/**
 * Draw an item at the current origin.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{type: string, x: number, y: number}} item
 * @param {number} radius in device pixels
 */
export function drawSubstance(ctx, item, radius) {
  const draw = DRAWERS[item.type];
  if (draw) draw(ctx, radius, variation(item));
}

/** Draw a substance into a small standalone canvas (tool icons). */
export function renderIcon(canvas, type) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  drawSubstance(ctx, { type, x: 11, y: 7 }, canvas.width * (type === "salt" || type === "quinine" ? 0.2 : 0.38));
}
