// Probe definitions, observations, and live model checking. Pure logic.
import { trace, slotKey } from './trace.js';
import { getCell, cellArea, solidArea } from './grid.js';

export const COSTS = { bounce: 10, xray: 25, scale: 15, thermal: 60 };
export const PROBE_TYPES = ['bounce', 'xray', 'scale', 'thermal'];

export function xray(grid, { axis, i }) {
  let t = 0;
  for (let k = 0; k < grid.n; k++) t += axis === 'row' ? cellArea(getCell(grid, k, i)) : cellArea(getCell(grid, i, k));
  return t;
}
export function weigh(grid) { return solidArea(grid); }
export function thermal(grid) {
  const m = grid.n / 2;
  const out = [];
  for (let by = 0; by < m; by++) {
    const row = [];
    for (let bx = 0; bx < m; bx++) {
      let a = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) a += cellArea(getCell(grid, bx * 2 + dx, by * 2 + dy));
      row.push(Math.round(a) / 4); // a is a multiple of 0.5; a/4 is the fraction; round to nearest quarter
    }
    out.push(row);
  }
  return out;
}

export function probeKey(spec) {
  switch (spec.type) {
    case 'bounce': return 'b:' + slotKey(spec.slot);
    case 'xray': return 'x:' + spec.axis + spec.i;
    case 'scale': return 's';
    default: return 't';
  }
}
export function probeCost(spec) { return COSTS[spec.type]; }

export function runProbe(grid, spec) {
  switch (spec.type) {
    case 'bounce': { const r = trace(grid, spec.slot); return { exit: r.exit, kind: r.kind, steps: r.steps }; }
    case 'xray': return xray(grid, spec);
    case 'scale': return weigh(grid);
    default: return thermal(grid);
  }
}
export function makeObservation(grid, spec, id = 0) { return { ...spec, id, result: runProbe(grid, spec) }; }

export function resultsEqual(type, a, b) {
  if (type === 'bounce') return a.exit.side === b.exit.side && a.exit.i === b.exit.i && a.kind === b.kind && a.steps === b.steps;
  if (type === 'thermal') return a.length === b.length && a.every((row, y) => row.every((v, x) => Math.abs(v - b[y][x]) < 1e-9));
  return Math.abs(a - b) < 1e-9;
}

// Re-run every collected observation on the student's model. Free and live.
export function checkModel(model, observations) {
  return observations.map(obs => {
    const predicted = runProbe(model, obs);
    return { obs, predicted, ok: resultsEqual(obs.type, obs.result, predicted) };
  });
}
export function dataFit(model, observations) {
  const r = checkModel(model, observations);
  return { ok: r.filter(x => x.ok).length, total: r.length };
}

// Human-readable one-liners (Year 8 reading level).
export function slotLabel(s) { return s.side + (s.i + 1); }
export function describeObservation(obs) {
  switch (obs.type) {
    case 'bounce': {
      const r = obs.result;
      const k = r.kind === 'reflected' ? 'came straight back' : r.kind === 'through' ? 'went straight through' : 'was deflected';
      return `Ball ${slotLabel(obs.slot)} to ${slotLabel(r.exit)}: ${k}, ${r.steps} ticks`;
    }
    case 'xray': return `X-ray ${obs.axis} ${obs.i + 1}: ${fmt(obs.result)} thick`;
    case 'scale': return `Scale: ${fmt(obs.result)} blocks of material`;
    default: return 'Thermal camera: blurry heat map';
  }
}
export function fmt(v) { return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); }

// Probe keys look like 'b:W3' (0-based index), 'x:row5', 's', 't'.
export function specFromKey(key) {
  if (key === 's') return { type: 'scale' };
  if (key === 't') return { type: 'thermal' };
  if (key.startsWith('b:')) return { type: 'bounce', slot: { side: key[2], i: Number(key.slice(3)) } };
  if (key.startsWith('x:')) return { type: 'xray', axis: key.slice(2, 5), i: Number(key.slice(5)) };
  throw new Error('bad probe key ' + key);
}
