// Matching, scoring, counter-evidence. Pure logic.
import { rng, shuffle } from './generate.js';
import { allSlots, trace, slotKey } from './trace.js';
import { xray, probeKey, runProbe, resultsEqual } from './probes.js';

// Wedge bits: N=1, E=2, S=4, W=8.
const MASK = { 0: 0, 1: 15, 2: 3, 3: 6, 4: 12, 5: 9 };
export const WEDGE_MASK = MASK;
const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

export function match(model, truth) {
  let inter = 0, union = 0;
  for (let i = 0; i < truth.cells.length; i++) {
    const a = MASK[model.cells[i]], b = MASK[truth.cells[i]];
    inter += POP[a & b]; union += POP[a | b];
  }
  return union === 0 ? 100 : (inter / union) * 100;
}
// Per-cell wedge masks for the reveal colouring.
export function wedgeSets(model, truth) {
  return truth.cells.map((_, i) => {
    const a = MASK[model.cells[i]], b = MASK[truth.cells[i]];
    return { both: a & b, modelOnly: a & ~b & 15, missed: b & ~a & 15 };
  });
}

export function stars(m) { return m >= 95 ? 3 : m >= 80 ? 2 : m >= 60 ? 1 : 0; }
export function score(m, budgetLeft, fitAll) {
  return Math.round(m * 10) + (m >= 60 ? budgetLeft : 0) + (fitAll ? 50 : 0);
}
export const RANKS = [{ min: 14, name: 'Chief Modeller' }, { min: 9, name: 'Analyst' }, { min: 4, name: 'Field Tech' }, { min: 0, name: 'Intern' }];
export function rankFor(totalStars) { return RANKS.find(r => totalStars >= r.min).name; }

export const REFLECTIONS = {
  fitNotReal: "Your model explained every observation you had — and it still wasn't the real thing. A model is only as good as the data behind it.",
  close: "Enough good data and your model became a very close representation. It's still a model: it shows shape, not what the object is made of.",
  misfit: 'Your model disagreed with some of your own observations. Scientists change the model, not the data.',
};
export function reflection(matchPct, fitOk, fitTotal) {
  if (fitTotal > 0 && fitOk < fitTotal) return REFLECTIONS.misfit;
  if (matchPct >= 95) return REFLECTIONS.close;
  return REFLECTIONS.fitNotReal;
}

/**
 * New data arrives: up to k probes (bounce first, then x-ray lines) where the student's model
 * disagrees with the truth. Skips anything already fired. Deterministic for a given seed.
 */
export function counterEvidence(model, truth, alreadyFired = [], k = 3, seed = 1) {
  const fired = new Set(alreadyFired.map(a => (typeof a === 'string' ? a : probeKey(a.type ? a : { type: 'bounce', slot: a }))));
  const r = rng(seed >>> 0);
  const slots = shuffle(allSlots(truth.n), r);
  const hard = [], soft = [];
  for (const slot of slots) {
    const spec = { type: 'bounce', slot };
    if (fired.has(probeKey(spec))) continue;
    const a = trace(model, slot), b = trace(truth, slot);
    const exitDiff = a.exit.side !== b.exit.side || a.exit.i !== b.exit.i;
    if (exitDiff) hard.push(spec); else if (a.steps !== b.steps || a.kind !== b.kind) soft.push(spec);
  }
  const out = [...hard, ...soft].slice(0, k);
  if (out.length < k) {
    const lines = [];
    for (const axis of ['row', 'col']) for (let i = 0; i < truth.n; i++) lines.push({ type: 'xray', axis, i });
    for (const spec of shuffle(lines, r)) {
      if (out.length >= k) break;
      if (fired.has(probeKey(spec))) continue;
      if (Math.abs(xray(model, spec) - xray(truth, spec)) > 1e-9) out.push(spec);
    }
  }
  return out;
}
