import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES } from '../src/data/cases.js';
import { outerRingEmpty, bounds, makeGrid, setCell, toAscii, solidArea } from '../src/logic/grid.js';
import { specFromKey, probeCost, makeObservation, checkModel, probeKey } from '../src/logic/probes.js';
import { match } from '../src/logic/score.js';
import { counterEvidence } from '../src/logic/score.js';

for (const c of CASES) {
  test(`case ${c.id} ${c.name}: map is valid, ring empty, area sensible`, () => {
    assert.equal(c.grid.n, c.n);
    assert.ok(outerRingEmpty(c.grid));
    const f = solidArea(c.grid) / (c.n * c.n);
    assert.ok(f >= 0.08 && f <= 0.35, 'area ' + f);
  });
  test(`case ${c.id} ${c.name}: scripted probes fit the budget and only use allowed probes`, () => {
    const specs = c.script.map(specFromKey);
    const cost = specs.reduce((a, s) => a + probeCost(s), 0);
    assert.ok(cost <= c.budget, `cost ${cost} > budget ${c.budget}`);
    for (const s of specs) assert.ok(c.probes.includes(s.type), `${s.type} not allowed`);
    assert.equal(new Set(c.script).size, c.script.length, 'duplicate probe');
  });
  test(`case ${c.id} ${c.name}: the scripted model reaches >= 95% and explains all data`, () => {
    const obs = c.script.map((k, i) => makeObservation(c.grid, specFromKey(k), i + 1));
    const solution = c.solution ?? c.grid;
    assert.ok(checkModel(solution, obs).every(r => r.ok));
    assert.ok(match(solution, c.grid) >= 95);
  });
  test(`case ${c.id} ${c.name}: the scripted probes carry information (a naive filled box is caught)`, () => {
    const b = bounds(c.grid);
    const box = makeGrid(c.n);
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) setCell(box, x, y, 1);
    const obs = c.script.map((k, i) => makeObservation(c.grid, specFromKey(k), i + 1));
    const bad = checkModel(box, obs).filter(r => !r.ok).length;
    if (c.id === 1) assert.equal(bad, 0); // the crate really is a box
    else assert.ok(bad > 0, 'box model passes everything');
    assert.ok(match(box, c.grid) < 100 || c.id === 1);
  });
}
test('later cases: a lazy model gets counter-evidence that exposes it', () => {
  for (const c of CASES.slice(1)) {
    const b = bounds(c.grid);
    const box = makeGrid(c.n);
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) setCell(box, x, y, 1);
    const ce = counterEvidence(box, c.grid, [], 3, c.seed);
    assert.ok(ce.length > 0, `case ${c.id}`);
    for (const s of ce) assert.equal(checkModel(box, [makeObservation(c.grid, s, 1)])[0].ok, false);
  }
});
test('case 4: bounce alone cannot see the hollow, x-ray can', () => {
  const c = CASES[3];
  const b = bounds(c.grid);
  const box = makeGrid(c.n);
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) setCell(box, x, y, 1);
  const bounceObs = c.script.filter(k => k.startsWith('b:')).map((k, i) => makeObservation(c.grid, specFromKey(k), i));
  assert.ok(checkModel(box, bounceObs).every(r => r.ok), 'box explains all bounce data');
  const xr = makeObservation(c.grid, specFromKey('x:row4'), 99);
  assert.equal(checkModel(box, [xr])[0].ok, false);
});
