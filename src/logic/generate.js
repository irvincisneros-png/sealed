// Seeded vault generator. Pure logic.
import { makeGrid, getCell, setCell, solidArea, outerRingEmpty } from './grid.js';

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return f;
}
export function shuffle(arr, r) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function dailySeed(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// triangle value for a corner whose two outward neighbours are empty
const TRI_FOR = [{ v: 2, a: [0, 1], b: [1, 0] }, { v: 3, a: [0, -1], b: [1, 0] }, { v: 4, a: [0, -1], b: [-1, 0] }, { v: 5, a: [0, 1], b: [-1, 0] }];

function build(r, n, difficulty) {
  const g = makeGrid(n);
  const blobs = 1 + (difficulty >= 2 ? Math.floor(r() * 2) : 0) + (difficulty >= 3 ? 1 : 0);
  const lo = 1, hi = n - 2;
  for (let b = 0; b < blobs; b++) {
    const cells = [[2 + Math.floor(r() * (n - 4)), 2 + Math.floor(r() * (n - 4))]];
    setCell(g, cells[0][0], cells[0][1], 1);
    const target = Math.round(n * n * (0.07 + r() * 0.07 + (difficulty >= 2 ? 0.02 : 0)));
    let guard = 0;
    while (cells.length < target && guard++ < 400) {
      const [cx, cy] = cells[Math.floor(r() * cells.length)];
      const [dx, dy] = DIRS[Math.floor(r() * 4)];
      const x = cx + dx, y = cy + dy;
      if (x < lo || y < lo || x > hi || y > hi || getCell(g, x, y)) continue;
      setCell(g, x, y, 1); cells.push([x, y]);
    }
  }
  // chamfer convex corners into triangles
  const p = 0.25 + difficulty * 0.12;
  const snapshot = g.cells.slice();
  for (let y = lo; y <= hi; y++) for (let x = lo; x <= hi; x++) {
    if (snapshot[y * n + x] !== 1) continue;
    for (const t of shuffle(TRI_FOR, r)) {
      const e1 = snapshot[(y + t.a[1]) * n + x + t.a[0]], e2 = snapshot[(y + t.b[1]) * n + x + t.b[0]];
      const s1 = snapshot[(y - t.a[1]) * n + x - t.a[0]], s2 = snapshot[(y - t.b[1]) * n + x - t.b[0]];
      if (e1 === 0 && e2 === 0 && s1 === 1 && s2 === 1 && r() < p) { setCell(g, x, y, t.v); break; }
    }
  }
  // optional hollow: a full cell with all 8 neighbours full
  if (difficulty >= 2) {
    const spots = [];
    for (let y = lo; y <= hi; y++) for (let x = lo; x <= hi; x++) {
      let ok = getCell(g, x, y) === 1;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (getCell(g, x + dx, y + dy) !== 1) { ok = false; break; }
      if (ok) spots.push([x, y]);
    }
    if (spots.length && r() < 0.8) { const [x, y] = spots[Math.floor(r() * spots.length)]; setCell(g, x, y, 0); }
  }
  return g;
}

export function generateVault(seed, n = 10, difficulty = 2) {
  const r = rng(seed * 2654435761 + n * 31 + difficulty);
  for (let attempt = 0; attempt < 80; attempt++) {
    const g = build(r, n, difficulty);
    const frac = solidArea(g) / (n * n);
    if (frac >= 0.08 && frac <= 0.35 && outerRingEmpty(g)) return g;
  }
  // deterministic fallback: an off-centre block
  const g = makeGrid(n);
  const s = Math.max(2, Math.round(n * 0.4));
  for (let y = 2; y < 2 + s; y++) for (let x = 3; x < 3 + s; x++) setCell(g, x, y, 1);
  return g;
}
