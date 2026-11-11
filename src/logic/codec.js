// Compact URL-safe vault codes: [n][3 cells per byte, base 6] -> base64url. Pure logic.
import { makeGrid } from './grid.js';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeVault(g) {
  const bytes = [g.n];
  for (let i = 0; i < g.cells.length; i += 3) {
    const a = g.cells[i] ?? 0, b = g.cells[i + 1] ?? 0, c = g.cells[i + 2] ?? 0;
    bytes.push(a * 36 + b * 6 + c);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1] ?? 0, b2 = bytes[i + 2] ?? 0;
    const w = (b0 << 16) | (b1 << 8) | b2;
    const left = bytes.length - i;
    out += ALPHA[(w >> 18) & 63] + ALPHA[(w >> 12) & 63];
    if (left > 1) out += ALPHA[(w >> 6) & 63];
    if (left > 2) out += ALPHA[w & 63];
  }
  return out;
}
export function decodeVault(str) {
  try {
    if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
    const vals = [...str].map(ch => ALPHA.indexOf(ch));
    const bytes = [];
    for (let i = 0; i < vals.length; i += 4) {
      const q = vals.slice(i, i + 4);
      if (q.length === 1) return null;
      const w = (q[0] << 18) | (q[1] << 12) | ((q[2] ?? 0) << 6) | (q[3] ?? 0);
      bytes.push((w >> 16) & 255);
      if (q.length > 2) bytes.push((w >> 8) & 255);
      if (q.length > 3) bytes.push(w & 255);
    }
    const n = bytes[0];
    if (!(n >= 4 && n <= 16 && n % 2 === 0)) return null;
    if (bytes.length !== 1 + Math.ceil(n * n / 3)) return null;
    const g = makeGrid(n);
    for (let i = 0; i < n * n; i += 3) {
      const b = bytes[1 + i / 3];
      if (b > 215) return null;
      const d = [Math.floor(b / 36), Math.floor(b / 6) % 6, b % 6];
      for (let k = 0; k < 3 && i + k < n * n; k++) g.cells[i + k] = d[k];
    }
    return g;
  } catch { return null; }
}
