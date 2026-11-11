// Grid helpers. A grid is { n, cells } with cells a flat array, index y*n+x. y runs north.
// Cell values: 0 empty, 1 full, 2 NE tri, 3 SE tri, 4 SW tri, 5 NW tri.
export const EMPTY = 0, FULL = 1, TRI_NE = 2, TRI_SE = 3, TRI_SW = 4, TRI_NW = 5;
export const CORNER = { 2: [1, 1], 3: [1, -1], 4: [-1, -1], 5: [-1, 1] };

export function makeGrid(n) { return { n, cells: new Array(n * n).fill(0) }; }
export function cloneGrid(g) { return { n: g.n, cells: g.cells.slice() }; }
export function inside(g, x, y) { return x >= 0 && y >= 0 && x < g.n && y < g.n; }
export function getCell(g, x, y) { return inside(g, x, y) ? g.cells[y * g.n + x] : 0; }
export function setCell(g, x, y, v) { if (inside(g, x, y)) g.cells[y * g.n + x] = v; return g; }
export function cellArea(v) { return v === 0 ? 0 : v === 1 ? 1 : 0.5; }
export function solidArea(g) { let a = 0; for (const v of g.cells) a += cellArea(v); return a; }
export function isEmptyGrid(g) { return g.cells.every(v => v === 0); }
export function gridsEqual(a, b) { return a.n === b.n && a.cells.every((v, i) => v === b.cells[i]); }

// ASCII maps: first line is the NORTH row (y = n-1). '.' empty, '1' full, '2'..'5' triangles. Spaces ignored.
export function fromAscii(rows) {
  const lines = (Array.isArray(rows) ? rows : String(rows).split('\n')).map(s => s.replace(/\s+/g, '')).filter(Boolean);
  const n = lines.length;
  const g = makeGrid(n);
  lines.forEach((line, r) => {
    if (line.length !== n) throw new Error(`ascii row ${r} has length ${line.length}, expected ${n}`);
    for (let x = 0; x < n; x++) {
      const ch = line[x];
      const v = ch === '.' ? 0 : Number(ch);
      if (!(v >= 0 && v <= 5) || Number.isNaN(v)) throw new Error(`bad ascii char '${ch}'`);
      g.cells[(n - 1 - r) * n + x] = v;
    }
  });
  return g;
}
export function toAscii(g) {
  const out = [];
  for (let y = g.n - 1; y >= 0; y--) {
    let s = '';
    for (let x = 0; x < g.n; x++) { const v = g.cells[y * g.n + x]; s += v === 0 ? '.' : String(v); }
    out.push(s);
  }
  return out;
}
export function outerRingEmpty(g) {
  const n = g.n;
  for (let i = 0; i < n; i++) {
    if (getCell(g, i, 0) || getCell(g, i, n - 1) || getCell(g, 0, i) || getCell(g, n - 1, i)) return false;
  }
  return true;
}
// Axis-aligned bounding box of solid cells, or null.
export function bounds(g) {
  let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
  for (let y = 0; y < g.n; y++) for (let x = 0; x < g.n; x++) if (g.cells[y * g.n + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
