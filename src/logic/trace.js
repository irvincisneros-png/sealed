// Bounce-ball probe. Pure logic, no DOM.
import { CORNER, getCell, inside } from './grid.js';

export const SIDES = ['N', 'E', 'S', 'W'];
export function allSlots(n) {
  const out = [];
  for (const side of SIDES) for (let i = 0; i < n; i++) out.push({ side, i });
  return out;
}
export const slotKey = s => s.side + s.i;
export function sameSlot(a, b) { return a.side === b.side && a.i === b.i; }
export function oppositeSide(side) { return { N: 'S', S: 'N', E: 'W', W: 'E' }[side]; }

// Start position (just outside the grid) and travel direction for a launch slot.
export function slotStart(n, slot) {
  const i = slot.i;
  switch (slot.side) {
    case 'W': return { x: -1, y: i, dx: 1, dy: 0 };
    case 'E': return { x: n, y: i, dx: -1, dy: 0 };
    case 'S': return { x: i, y: -1, dx: 0, dy: 1 };
    default: return { x: i, y: n, dx: 0, dy: -1 };
  }
}
// The slot a ball leaves through when it moves out of the grid from (x, y) with direction (dx, dy).
function exitSlot(x, y, dx, dy) {
  if (dx === 1) return { side: 'E', i: y };
  if (dx === -1) return { side: 'W', i: y };
  if (dy === 1) return { side: 'N', i: x };
  return { side: 'S', i: x };
}

/**
 * trace(grid, slot) -> { exit, kind, path, pts, steps }
 * path: cells entered (in order). pts: polyline in grid units (cell centre = x + 0.5), for the reveal replay.
 * steps: number of cell moves made (the "echo time" the student sees).
 */
export function trace(grid, slot) {
  const n = grid.n;
  let { x, y, dx, dy } = slotStart(n, slot);
  const clamp = v => Math.min(n, Math.max(0, v));
  const edge = () => [clamp(x + 0.5 + dx * 0.5), clamp(y + 0.5 + dy * 0.5)];
  const path = [];
  const pts = [edge()];
  let steps = 0;
  const limit = 4 * n * n;
  for (let count = 0; count < limit; count++) {
    const nx = x + dx, ny = y + dy;
    if (!inside(grid, nx, ny)) {
      const exit = exitSlot(x, y, dx, dy);
      pts.push(edge());
      let kind;
      if (exit.side === slot.side && exit.i === slot.i) kind = 'reflected';
      else if (exit.side === oppositeSide(slot.side) && exit.i === slot.i) kind = 'through';
      else kind = 'deflected';
      return { exit, kind, path, pts, steps };
    }
    const v = getCell(grid, nx, ny);
    let enter = v === 0;
    let turn = null;
    if (v >= 2) {
      const [cx, cy] = CORNER[v];
      if (dx * cx + dy * cy > 0) { enter = true; turn = [cx, cy]; } // sloped face: 90 degree turn
    }
    if (enter) {
      x = nx; y = ny; steps++; path.push([x, y]); pts.push([x + 0.5, y + 0.5]);
      if (turn) { dx -= turn[0]; dy -= turn[1]; }
    } else { // blocked: bounce straight back
      pts.push(edge());
      const here = inside(grid, x, y) ? getCell(grid, x, y) : 0;
      if (here >= 2) { // inside a triangle: the way back passes the slope again, which turns the ball back the way it came
        const [cx, cy] = CORNER[here];
        dx = -dx - cx; dy = -dy - cy;
        pts.push([x + 0.5, y + 0.5]);
      } else { dx = -dx; dy = -dy; }
    }
  }
  return { exit: slot, kind: 'lost', path, pts, steps };
}
