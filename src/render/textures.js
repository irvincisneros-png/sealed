// Procedural canvas textures: brushed steel, workshop timber, engraved lid, labels. No image files.
import * as THREE from 'three';
import { rng } from '../logic/generate.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, repeat, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.needsUpdate = true;
  return t;
}

// Brushed steel: returns { map, rough, bump } sharing one canvas pattern. Streaks run along X.
export function brushedSteel({ base = 150, size = 512, seed = 3, repeat = [1, 1], streak = 30 } = {}) {
  const r = rng(seed);
  const c = canvas(size, size), g = c.getContext('2d');
  g.fillStyle = `rgb(${base},${base + 3},${base + 8})`; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const y = r() * size, len = 40 + r() * size * 0.8, x = r() * size;
    const l = base + (r() - 0.5) * streak * 2;
    g.strokeStyle = `rgba(${l},${l + 2},${l + 6},${0.08 + r() * 0.22})`;
    g.lineWidth = 0.5 + r() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - 0.5) * 1.2); g.stroke();
    if (x + len > size) { g.beginPath(); g.moveTo(x - size, y); g.lineTo(x - size + len, y); g.stroke(); }
  }
  // a few scratches
  for (let i = 0; i < 24; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.04 + r() * 0.08})`; g.lineWidth = 0.6;
    const x = r() * size, y = r() * size, a = r() * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (20 + r() * 80), y + Math.sin(a) * (20 + r() * 80)); g.stroke();
  }
  const map = tex(c, { repeat });
  // roughness: lighter streaks = rougher
  const rc = canvas(size, size), rg = rc.getContext('2d');
  rg.drawImage(c, 0, 0);
  rg.globalCompositeOperation = 'source-over';
  rg.fillStyle = 'rgba(70,70,70,0.55)'; rg.fillRect(0, 0, size, size);
  const rough = tex(rc, { srgb: false, repeat });
  const bump = tex(c, { srgb: false, repeat });
  return { map, rough, bump };
}

// Dark workshop timber with grain, knots and wear.
export function workshopWood({ size = 1024, seed = 11, repeat = [3, 3] } = {}) {
  const r = rng(seed);
  const c = canvas(size, size), g = c.getContext('2d');
  g.fillStyle = '#2b2118'; g.fillRect(0, 0, size, size);
  const planks = 6, ph = size / planks;
  for (let p = 0; p < planks; p++) {
    const tone = 30 + r() * 16;
    g.fillStyle = `rgb(${tone + 14},${tone + 4},${tone - 8})`; g.fillRect(0, p * ph, size, ph);
    for (let i = 0; i < 260; i++) {
      const y = p * ph + r() * ph, x = r() * size, len = 80 + r() * 500;
      const l = tone + (r() - 0.5) * 26;
      g.strokeStyle = `rgba(${l + 14},${l + 3},${l - 10},${0.18 + r() * 0.3})`;
      g.lineWidth = 0.5 + r() * 1.6;
      g.beginPath(); g.moveTo(x, y);
      g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 4, x + len * 0.7, y + (r() - 0.5) * 4, x + len, y + (r() - 0.5) * 3); g.stroke();
    }
    if (r() < 0.8) { // knot
      const kx = r() * size, ky = p * ph + ph * (0.25 + r() * 0.5);
      for (let k = 6; k > 0; k--) { g.strokeStyle = `rgba(10,6,3,${0.12 + 0.03 * (6 - k)})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(kx, ky, k * 5, k * 2.4, 0, 0, Math.PI * 2); g.stroke(); }
    }
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(0, p * ph, size, 2); // plank seam
  }
  // stains and wear
  for (let i = 0; i < 40; i++) {
    const x = r() * size, y = r() * size, rad = 20 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(0,0,0,${0.08 + r() * 0.12})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const map = tex(c, { repeat });
  const rc = canvas(size, size), rg = rc.getContext('2d');
  rg.fillStyle = '#b4b4b4'; rg.fillRect(0, 0, size, size);
  rg.globalAlpha = 0.5; rg.drawImage(c, 0, 0); rg.globalAlpha = 1;
  return { map, rough: tex(rc, { srgb: false, repeat }), bump: tex(c, { srgb: false, repeat }) };
}

// Engraved grid for the lid / floor. Transparent PNG-style canvas laid over the glass.
export function etchedGrid(n, { px = 64, colour = '120,200,220', alpha = 0.22, ticks = true } = {}) {
  const size = n * px;
  const c = canvas(size, size), g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  g.strokeStyle = `rgba(${colour},${alpha})`; g.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * px, 0); g.lineTo(i * px, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * px); g.lineTo(size, i * px); g.stroke();
  }
  g.strokeStyle = `rgba(${colour},${alpha * 1.8})`; g.lineWidth = 4; g.strokeRect(2, 2, size - 4, size - 4);
  if (ticks) {
    g.fillStyle = `rgba(${colour},${alpha * 1.6})`;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillRect(i * px + px / 2 - 1.5, j * px + px / 2 - 7, 3, 14); g.fillRect(i * px + px / 2 - 7, j * px + px / 2 - 1.5, 14, 3); }
  }
  return tex(c, { aniso: 8 });
}

// Holographic blueprint grid (brighter, with corner brackets and a soft glow).
export function blueprintGrid(n, px = 64) {
  const size = n * px;
  const c = canvas(size, size), g = c.getContext('2d');
  const fill = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75);
  fill.addColorStop(0, 'rgba(20,110,150,0.30)'); fill.addColorStop(1, 'rgba(10,60,100,0.42)');
  g.fillStyle = fill; g.fillRect(0, 0, size, size);
  g.shadowColor = 'rgba(80,220,255,0.9)'; g.shadowBlur = 6;
  g.strokeStyle = 'rgba(110,235,255,0.85)'; g.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * px, 0); g.lineTo(i * px, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * px); g.lineTo(size, i * px); g.stroke();
  }
  g.lineWidth = 5; const b = 36;
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [size, 0, -1, 1], [0, size, 1, -1], [size, size, -1, -1]]) {
    g.beginPath(); g.moveTo(x + sx * b, y); g.lineTo(x, y); g.lineTo(x, y + sy * b); g.stroke();
  }
  return tex(c, { aniso: 8 });
}

export function glowSprite(size = 64) {
  const c = canvas(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return tex(c);
}

// Rounded badge label ("#4", "2.5", "W3")
export function labelTexture(text, { colour = '#ffb020', fg = '#10151b', w = 128, h = 64, font = 800 } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  const r = h / 2 - 3;
  g.fillStyle = colour; g.beginPath(); g.roundRect(3, 3, w - 6, h - 6, r); g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
  g.fillStyle = fg; g.font = `${font} ${h * 0.56}px Mulish, system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  return tex(c);
}
// Engraved text laid on the ledge
export function engraveTexture(text, { w = 128, h = 64 } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.font = `800 ${h * 0.62}px Mulish, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillText(text, w / 2 + 1.5, h / 2 + 2.5);
  g.fillStyle = 'rgba(225,200,150,0.85)'; g.fillText(text, w / 2, h / 2 + 1);
  return tex(c);
}

// Heat map: n/2 x n/2 values (0..1) -> smooth texture (bilinear = blurry on purpose).
export function heatTexture(values) {
  const m = values.length;
  const c = canvas(m, m), g = c.getContext('2d');
  const ramp = [[0, [20, 10, 60]], [0.25, [90, 20, 120]], [0.5, [200, 50, 80]], [0.75, [250, 140, 30]], [1, [255, 240, 150]]];
  const col = v => { for (let i = 1; i < ramp.length; i++) if (v <= ramp[i][0]) { const [a, ca] = ramp[i - 1], [b, cb] = ramp[i]; const t = (v - a) / (b - a); return ca.map((x, k) => Math.round(x + (cb[k] - x) * t)); } return ramp[4][1]; };
  for (let by = 0; by < m; by++) for (let bx = 0; bx < m; bx++) {
    const [r, gg, b] = col(values[by][bx]);
    g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(bx, m - 1 - by, 1, 1); // north row at top
  }
  const t = tex(c); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}
