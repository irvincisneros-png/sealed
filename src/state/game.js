// Case session state machine: probing -> draft -> (newdata -> final) -> reveal. No DOM, no three.
import { makeGrid, cloneGrid, setCell, getCell, solidArea } from '../logic/grid.js';
import { runProbe, makeObservation, probeKey, probeCost, dataFit, checkModel } from '../logic/probes.js';
import { counterEvidence, match, stars, score, reflection } from '../logic/score.js';

export const TOOL_VALUE = { block: 1, ne: 2, se: 3, sw: 4, nw: 5, erase: 0 };
export const PROBE_COLOURS = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#FFFFFF'];

export class Session {
  #truth; #listeners = new Map(); #undo = [];
  constructor(def) {
    this.def = def;
    this.mode = def.mode; // 'case' | 'daily' | 'shared' | 'build'
    this.caseId = def.caseId ?? null;
    this.name = def.name;
    this.n = def.n;
    this.budget = def.budget;
    this.spent = 0;
    this.allowed = def.probes;
    this.seed = def.seed ?? 1;
    this.#truth = def.truth ?? null;
    this.phase = this.mode === 'build' ? 'building' : 'probing';
    this.observations = [];
    this.nextId = 1;
    this.model = makeGrid(def.n);
    this.draftModel = null;
    this.draftMatch = null;
    this.result = null;
    this.survived = false;
    this.newDataIds = [];
  }
  on(ev, fn) { if (!this.#listeners.has(ev)) this.#listeners.set(ev, []); this.#listeners.get(ev).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const a = this.#listeners.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(ev, ...a) { for (const f of this.#listeners.get(ev) || []) f(...a); for (const f of this.#listeners.get('change') || []) if (ev !== 'change') f(ev, ...a); }

  get left() { return this.budget - this.spent; }
  // The hidden object is never available before the reveal.
  get truth() { return this.phase === 'reveal' ? this.#truth : null; }
  get ownObservations() { return this.observations.filter(o => !o.team); }
  get firedKeys() { return this.observations.map(probeKey); }
  isFired(spec) { return this.firedKeys.includes(probeKey(spec)); }
  canAfford(type) { return this.left >= probeCost({ type }); }
  canProbe() { return this.phase === 'probing' || this.phase === 'draft' || this.phase === 'final'; }

  // Why can't this probe be fired? Returns a short reason or null.
  blockReason(spec) {
    if (!this.canProbe()) return 'Probes are closed.';
    if (!this.allowed.includes(spec.type)) return 'This tool is not in this case.';
    if (this.isFired(spec)) return 'You already have this result.';
    if (!this.canAfford(spec.type)) return 'Not enough budget.';
    return null;
  }
  fire(spec) {
    const why = this.blockReason(spec);
    if (why) return { ok: false, reason: why };
    this.spent += probeCost(spec);
    const obs = makeObservation(this.#truth, spec, this.nextId++);
    this.observations.push(obs);
    this.emit('probe', obs);
    return { ok: true, obs };
  }

  // ---- modelling
  get canEditModel() { return this.phase !== 'reveal' && this.phase !== 'newdata'; }
  paint(x, y, tool) {
    if (!this.canEditModel) return false;
    const v = typeof tool === 'number' ? tool : TOOL_VALUE[tool];
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return false;
    if (this.mode === 'build' && (x === 0 || y === 0 || x === this.n - 1 || y === this.n - 1)) return false;
    if (getCell(this.model, x, y) === v) return false;
    setCell(this.model, x, y, v);
    this.#afterEdit();
    return true;
  }
  beginStroke() { this.#undo.push(this.model.cells.slice()); if (this.#undo.length > 60) this.#undo.shift(); }
  endStroke() { // drop the snapshot if nothing changed
    const last = this.#undo[this.#undo.length - 1];
    if (last && last.every((v, i) => v === this.model.cells[i])) this.#undo.pop();
    this.emit('model');
  }
  undo() { const s = this.#undo.pop(); if (!s || !this.canEditModel) return false; this.model.cells = s; this.#afterEdit(); return true; }
  clearModel() { if (!this.canEditModel || this.model.cells.every(v => !v)) return false; this.beginStroke(); this.model.cells.fill(0); this.#afterEdit(); return true; }
  get canUndo() { return this.#undo.length > 0; }
  get paintedCells() { return this.model.cells.filter(Boolean).length; }
  #afterEdit() {
    if (this.phase === 'probing' && this.paintedCells > 0) this.phase = 'draft';
    else if (this.phase === 'draft' && this.paintedCells === 0) this.phase = 'probing';
    this.emit('model');
  }
  // live: how many of the collected observations the current model explains
  get fit() { return dataFit(this.model, this.observations); }
  get checks() { return checkModel(this.model, this.observations); }

  // ---- submit
  get submitProblem() {
    if (this.paintedCells < 1) return 'Paint at least one piece in your model.';
    if (this.ownObservations.length < 3) return 'Collect at least 3 observations first.';
    return null;
  }
  get needsNewData() { return this.mode !== 'build' && this.caseId !== 1 && this.phase !== 'final'; }
  submit() {
    if (this.submitProblem || !(this.phase === 'probing' || this.phase === 'draft' || this.phase === 'final')) return { ok: false, reason: this.submitProblem || 'Cannot submit now.' };
    if (this.phase !== 'final' && this.caseId !== 1) {
      this.draftModel = cloneGrid(this.model);
      this.draftMatch = match(this.model, this.#truth);
      const ce = counterEvidence(this.model, this.#truth, this.observations.map(o => o), 3, this.seed);
      if (ce.length === 0) { this.survived = true; return this.#finish(); }
      this.newDataIds = [];
      for (const spec of ce) {
        const obs = makeObservation(this.#truth, spec, this.nextId++);
        obs.team = true; this.observations.push(obs); this.newDataIds.push(obs.id);
      }
      this.phase = 'newdata';
      this.emit('newdata', this.observations.filter(o => o.team));
      return { ok: true, stage: 'newdata' };
    }
    return this.#finish();
  }
  acknowledgeNewData() { if (this.phase === 'newdata') { this.phase = 'final'; this.emit('phase'); } }
  #finish() {
    const t = this.#truth;
    if (!this.draftModel) { this.draftModel = cloneGrid(this.model); this.draftMatch = match(this.model, t); }
    const m = match(this.model, t);
    const fit = dataFit(this.model, this.observations);
    const left = this.left;
    const st = stars(m);
    this.result = {
      match: m, stars: st, fitOk: fit.ok, fitTotal: fit.total, budgetLeft: left,
      score: score(m, left, fit.ok === fit.total), draftMatch: this.draftMatch,
      revised: this.draftModel && this.caseId !== 1,
      reflection: reflection(m, fit.ok, fit.total), survived: this.survived,
    };
    this.phase = 'reveal';
    this.emit('reveal', this.result);
    return { ok: true, stage: 'reveal', result: this.result };
  }

  // ---- build a vault
  sealVault() { // returns the painted grid if valid
    if (this.mode !== 'build') return null;
    if (solidArea(this.model) < 3) return null;
    return cloneGrid(this.model);
  }
}

export function caseSession(c) {
  return new Session({ mode: 'case', caseId: c.id, name: c.name, n: c.n, budget: c.budget, probes: c.probes, truth: c.grid, seed: c.seed });
}
export function freePlaySession({ mode, name, truth, seed }) {
  return new Session({ mode, caseId: null, name, n: truth.n, budget: 340, probes: ['bounce', 'xray', 'scale', 'thermal'], truth, seed });
}
export function buildSession() { return new Session({ mode: 'build', name: 'Build a Vault', n: 10, budget: 0, probes: [], truth: null, seed: 1 }); }
