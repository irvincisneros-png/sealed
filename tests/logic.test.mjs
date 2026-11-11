import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGrid, setCell, getCell, fromAscii, toAscii, solidArea, outerRingEmpty, cloneGrid } from '../src/logic/grid.js';
import { trace, allSlots, oppositeSide, slotStart } from '../src/logic/trace.js';
import { xray, weigh, thermal, checkModel, makeObservation, probeKey, dataFit } from '../src/logic/probes.js';
import { match, stars, score, rankFor, counterEvidence, reflection, REFLECTIONS } from '../src/logic/score.js';
import { rng, generateVault, dailySeed } from '../src/logic/generate.js';
import { encodeVault, decodeVault } from '../src/logic/codec.js';
import { QUESTIONS } from '../src/data/questions.js';
import { CARDS } from '../src/data/cards.js';

const g8 = () => makeGrid(8);
const ex = (g, side, i) => trace(g, { side, i });

test('trace: empty grid goes straight through', () => {
  const g = g8();
  for (const s of allSlots(8)) {
    const r = trace(g, s);
    assert.equal(r.kind, 'through');
    assert.deepEqual(r.exit, { side: oppositeSide(s.side), i: s.i });
    assert.equal(r.steps, 7);
  }
});
test('trace: reflected off a full block, with distance', () => {
  const g = g8(); setCell(g, 3, 4, 1);
  const r = ex(g, 'W', 4);
  assert.equal(r.kind, 'reflected');
  assert.deepEqual(r.exit, { side: 'W', i: 4 });
  assert.equal(r.steps, 5); // in 3 cells, then back 2 cells
  assert.equal(ex(g, 'S', 3).kind, 'reflected');
  assert.equal(ex(g, 'W', 3).kind, 'through');
});
test('trace: triangle turns the ball both ways (NE)', () => {
  const g = g8(); setCell(g, 3, 3, 2); // NE: c=(1,1)
  // from W moving east: meets slope, turns south, leaves the bottom
  let r = ex(g, 'W', 3); assert.deepEqual(r.exit, { side: 'S', i: 3 }); assert.equal(r.kind, 'deflected');
  // from S moving north: turns west, leaves the west edge
  r = ex(g, 'S', 3); assert.deepEqual(r.exit, { side: 'W', i: 3 }); assert.equal(r.kind, 'deflected');
  // flat faces reverse: from E (moving west) and N (moving south)
  r = ex(g, 'E', 3); assert.equal(r.kind, 'reflected');
  r = ex(g, 'N', 3); assert.equal(r.kind, 'reflected');
});
test('trace: every triangle orientation, sloped side turns and flat side reverses', () => {
  // [value, entry side that meets the slope, expected exit side/dir]
  const cases = [
    [2, 'W', 'S'], [2, 'S', 'W'],
    [3, 'W', 'N'], [3, 'N', 'W'],
    [4, 'E', 'N'], [4, 'N', 'E'],
    [5, 'E', 'S'], [5, 'S', 'E'],
  ];
  for (const [v, side, exitSide] of cases) {
    const g = g8(); setCell(g, 4, 4, v);
    const r = ex(g, side, 4);
    assert.equal(r.kind, 'deflected', `v${v} from ${side}`);
    assert.equal(r.exit.side, exitSide, `v${v} from ${side}`);
    assert.equal(r.exit.i, 4);
  }
  const flat = [[2, 'E'], [2, 'N'], [3, 'E'], [3, 'S'], [4, 'W'], [4, 'S'], [5, 'W'], [5, 'N']];
  for (const [v, side] of flat) {
    const g = g8(); setCell(g, 4, 4, v);
    assert.equal(ex(g, side, 4).kind, 'reflected', `flat v${v} from ${side}`);
  }
});
test('trace: deflected ball can bounce off a block behind the triangle', () => {
  const g = g8(); setCell(g, 3, 3, 2); setCell(g, 3, 2, 1);
  const r = ex(g, 'W', 3); // turns south, hits the block, comes back up and the slope turns it back west
  assert.deepEqual(r.exit, { side: 'W', i: 3 });
  assert.equal(r.kind, 'reflected');
  assert.equal(r.steps, 7);
});
test('trace: reversible on 200 random grids and never lost', () => {
  const r = rng(42);
  for (let t = 0; t < 200; t++) {
    const n = r() < 0.5 ? 8 : 10;
    const g = makeGrid(n);
    for (let k = 0; k < n * n; k++) if (r() < 0.35) g.cells[k] = 1 + Math.floor(r() * 5);
    for (const s of allSlots(n)) {
      const a = trace(g, s);
      assert.notEqual(a.kind, 'lost');
      const b = trace(g, a.exit);
      assert.notEqual(b.kind, 'lost');
      assert.deepEqual(b.exit, s, `grid ${t} slot ${s.side}${s.i}`);
      assert.equal(b.steps, a.steps);
    }
  }
});
test('trace: path points start and end on the edge', () => {
  const g = g8(); setCell(g, 3, 3, 2);
  const r = ex(g, 'W', 3);
  assert.deepEqual(r.pts[0], [0, 3.5]);
  assert.deepEqual(r.pts[r.pts.length - 1], [3.5, 0]);
});

test('xray / weigh / thermal fixtures', () => {
  const g = fromAscii(['........', '.111....', '.1121...', '.1114...', '........', '........', '........', '........']);
  // rows from the north: y=6 '.111....' y=5 '.1121...' y=4 '.1114...'
  assert.equal(xray(g, { axis: 'row', i: 6 }), 3);
  assert.equal(xray(g, { axis: 'row', i: 5 }), 3.5);
  assert.equal(xray(g, { axis: 'col', i: 4 }), 1 + 0.5 + 0.5 - 0.5 + 0.5 * 0 + 0 || 0);
  assert.equal(weigh(g), 3 + 3.5 + 3.5);
  const t = thermal(g);
  assert.equal(t.length, 4); assert.equal(t[0].length, 4);
  assert.deepEqual(t.flat().every(v => [0, 0.25, 0.5, 0.75, 1].includes(v)), true);
  // block (0..1, 4..5) holds cells (1,4)=1, (1,5)=1 => 2/4 = 0.5
  assert.equal(t[2][0], 0.5);
  const full = makeGrid(8); full.cells.fill(1);
  assert.deepEqual(thermal(full).flat(), new Array(16).fill(1));
  assert.equal(weigh(full), 64);
});
test('thermal quantises a lone triangle to 0.25 steps', () => {
  const g = makeGrid(8); setCell(g, 0, 0, 2);
  assert.equal(thermal(g)[0][0], 0.25 * Math.round(0.5)); // 0.5/4 = 0.125 -> rounds to nearest quarter
});

test('match: identical, disjoint, triangle vs full', () => {
  const a = fromAscii(['....', '.11.', '.11.', '....']);
  assert.equal(match(a, a), 100);
  assert.equal(match(makeGrid(4), makeGrid(4)), 100);
  const b = fromAscii(['1...', '....', '....', '....']);
  assert.equal(match(a, b), 0);
  const tri = makeGrid(4), full = makeGrid(4);
  setCell(tri, 1, 1, 2); setCell(full, 1, 1, 1);
  assert.equal(match(tri, full), 50);
  const opp = makeGrid(4); setCell(opp, 1, 1, 4); // SW vs NE share nothing
  assert.equal(match(tri, opp), 0);
  const adj = makeGrid(4); setCell(adj, 1, 1, 3); // NE (N+E) vs SE (S+E) share E
  assert.ok(Math.abs(match(tri, adj) - 100 / 3) < 1e-9);
});
test('stars, score, rank, reflection', () => {
  assert.deepEqual([59.9, 60, 80, 95].map(stars), [0, 1, 2, 3]);
  assert.equal(score(87.4, 110, true), 874 + 110 + 50);
  assert.equal(score(50, 200, true), 500 + 50);
  assert.equal(rankFor(0), 'Intern'); assert.equal(rankFor(4), 'Field Tech'); assert.equal(rankFor(9), 'Analyst'); assert.equal(rankFor(18), 'Chief Modeller');
  assert.equal(reflection(80, 5, 5), REFLECTIONS.fitNotReal);
  assert.equal(reflection(97, 5, 5), REFLECTIONS.close);
  assert.equal(reflection(97, 4, 5), REFLECTIONS.misfit);
});

test('checkModel reruns observations on a model', () => {
  const truth = fromAscii(['....', '.11.', '....', '....']);
  const obs = [
    makeObservation(truth, { type: 'bounce', slot: { side: 'W', i: 2 } }, 1),
    makeObservation(truth, { type: 'xray', axis: 'row', i: 2 }, 2),
    makeObservation(truth, { type: 'scale' }, 3),
    makeObservation(truth, { type: 'thermal' }, 4),
  ];
  assert.ok(checkModel(truth, obs).every(r => r.ok));
  const wrong = makeGrid(4);
  const res = checkModel(wrong, obs);
  assert.ok(res.some(r => !r.ok));
  assert.deepEqual(dataFit(truth, obs), { ok: 4, total: 4 });
});

test('counterEvidence: only differing probes, none already fired, deterministic', () => {
  const truth = fromAscii(['........', '........', '..11....', '..11....', '..1.....', '........', '........', '........']);
  const model = fromAscii(['........', '........', '..11....', '..11....', '..11....', '........', '........', '........']);
  const fired = [{ type: 'bounce', slot: { side: 'W', i: 3 } }];
  const a = counterEvidence(model, truth, fired, 3, 99);
  const b = counterEvidence(model, truth, fired, 3, 99);
  assert.deepEqual(a, b);
  assert.ok(a.length > 0 && a.length <= 3);
  for (const spec of a) {
    assert.ok(!fired.some(f => probeKey(f) === probeKey(spec)));
    const o = makeObservation(truth, spec, 1);
    assert.equal(checkModel(model, [o])[0].ok, false);
  }
  // perfect model: nothing to report
  assert.deepEqual(counterEvidence(truth, truth, [], 3, 1), []);
});
test('counterEvidence falls back to x-ray lines when bounce probes cannot tell', () => {
  // a hollow the bounce ball cannot see
  const truth = fromAscii(['........', '.1111...', '.1..1...', '.1..1...', '.1111...', '........', '........', '........']);
  const model = cloneGrid(truth); for (const [x, y] of [[2, 3], [3, 3], [2, 4], [3, 4]]) setCell(model, x, y, 1);
  const out = counterEvidence(model, truth, [], 3, 5);
  assert.ok(out.length > 0 && out.every(s => s.type === 'xray'));
});

test('codec round-trips 200 random grids', () => {
  const r = rng(7);
  for (let t = 0; t < 200; t++) {
    const n = [4, 6, 8, 10][t % 4];
    const g = makeGrid(n);
    for (let k = 0; k < n * n; k++) g.cells[k] = Math.floor(r() * 6);
    const code = encodeVault(g);
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(decodeVault(code), g);
  }
  assert.equal(decodeVault('!!'), null);
  assert.equal(decodeVault('AAAA'), null);
  assert.equal(decodeVault(''), null);
});
test('generator is deterministic and obeys area limits', () => {
  for (let seed = 1; seed <= 150; seed++) {
    for (const [n, d] of [[8, 1], [10, 2], [10, 3]]) {
      const g = generateVault(seed, n, d);
      assert.deepEqual(g, generateVault(seed, n, d));
      const f = solidArea(g) / (n * n);
      assert.ok(f >= 0.08 && f <= 0.35, `seed ${seed} n${n} d${d} area ${f}`);
      assert.ok(outerRingEmpty(g));
    }
  }
  assert.notDeepEqual(generateVault(1, 10, 2), generateVault(2, 10, 2));
  assert.equal(dailySeed(new Date(2026, 10, 12)), 20261112);
});

test('data banks: 12 cards (3 per type), at least 24 short questions', () => {
  assert.equal(CARDS.length, 12);
  for (const t of ['physical', 'diagram', 'maths', 'sim']) assert.equal(CARDS.filter(c => c.type === t).length, 3);
  assert.ok(QUESTIONS.length >= 24);
  for (const q of QUESTIONS) assert.ok(q.stem.split(/\s+/).length <= 20, q.stem);
  for (const t of ['physical', 'diagram', 'maths', 'sim']) assert.ok(QUESTIONS.filter(q => q.answer === t).length >= 4);
  assert.ok(QUESTIONS.filter(q => q.kind === 'what').length >= 12 && QUESTIONS.filter(q => q.kind === 'need').length >= 12);
});
