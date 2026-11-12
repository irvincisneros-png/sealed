import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitise, load, get } from '../src/state/save.js';
import { Session } from '../src/state/game.js';
import { CASES } from '../src/data/cases.js';
import { makeGrid, setCell } from '../src/logic/grid.js';

const blank = sanitise(null);

test('sanitise: junk at the top level gives the defaults', () => {
  for (const bad of [null, undefined, 5, 'x', [], true, [1, 2]]) assert.deepEqual(sanitise(bad), blank);
});

test('sanitise: malformed fields fall back one by one', () => {
  const cases = [
    { stars: null }, { stars: [] }, { stars: 'a' }, { stars: { 1: 'x', 2: null, 3: NaN } },
    { best: 7 }, { cards: {} }, { cards: null }, { cards: 'globe' }, { cards: [1, null, {}] },
    { settings: null }, { settings: [] }, { settings: { quality: 'ultra', muted: 'yes' } },
    { mm: 'x' }, { mm: { best: 'a', bestStreak: null } }, { daily: [] }, { daily: { '2026-11-12': 5 } }, { daily: { a: { match: 'x' } } },
    { seenHow: 'true' },
  ];
  for (const c of cases) {
    const d = sanitise(c);
    assert.deepEqual(d, blank, JSON.stringify(c));
  }
});

test('sanitise: good fields are kept, bad neighbours dropped', () => {
  const d = sanitise({
    stars: { 1: 3, 2: 'x' }, best: { 1: 900, 2: null }, cards: ['globe', 7, 'nope', 'globe'],
    settings: { quality: 'high', muted: true }, mm: { best: 5, bestStreak: 'z' },
    daily: { '2026-11-12': { match: 80.4, stars: 2, left: 100, score: 950, extra: 1 }, bad: { match: 1 } }, seenHow: true,
  });
  assert.deepEqual(d.stars, { 1: 3 });
  assert.deepEqual(d.best, { 1: 900 });
  assert.ok(d.cards.includes('globe') && !d.cards.includes('nope') && d.cards.filter(c => c === 'globe').length === 1);
  assert.deepEqual(d.settings, { quality: 'high', muted: true });
  assert.deepEqual(d.mm, { best: 5, bestStreak: 0 });
  assert.deepEqual(d.daily, { '2026-11-12': { match: 80.4, stars: 2, left: 100, score: 950 } });
  assert.equal(d.seenHow, true);
});

test('sanitise: cleared cases always have their current cards', () => {
  const d = sanitise({ stars: { 6: 1 }, cards: ['sharkmap'] });
  assert.ok(d.cards.includes('windtunnel') && !d.cards.includes('sharkmap'));
});

test('sanitise: __proto__ keys do not pollute', () => {
  const d = sanitise(JSON.parse('{"stars":{"__proto__":{"x":1},"1":2},"daily":{"__proto__":{"match":1,"stars":1,"left":1,"score":1}}}'));
  assert.deepEqual(d.stars, { 1: 2 });
  assert.deepEqual(d.daily, {});
  assert.equal({}.x, undefined);
});

test('load works with no localStorage (node) and returns defaults', () => {
  assert.deepEqual(load(), blank);
  assert.deepEqual(get(), blank);
});

test('the truth grid is not reachable from a session before the reveal', () => {
  const c = CASES[0];
  const s = new Session({ mode: 'case', caseId: c.id, name: c.name, n: c.n, budget: c.budget, probes: c.probes, truth: c.grid, seed: c.seed });
  assert.equal(s.truth, null);
  assert.equal(s.def, undefined);
});

test('empty counter-evidence does not count as survived when the model fails its own data', () => {
  const c = CASES[1];
  const s = new Session({ mode: 'case', caseId: c.id, name: c.name, n: c.n, budget: 1000, probes: ['bounce', 'xray'], truth: c.grid, seed: c.seed });
  // exhaust every probe so counter-evidence is empty
  for (let i = 0; i < c.n; i++) for (const side of ['W', 'E', 'N', 'S']) s.fire({ type: 'bounce', slot: { side, i } });
  for (let i = 0; i < c.n; i++) { s.fire({ type: 'xray', axis: 'row', i }); s.fire({ type: 'xray', axis: 'col', i }); }
  // a deliberately wrong model: one stray block
  const wrong = makeGrid(c.n); setCell(wrong, 0, 0, 1);
  s.model.cells = wrong.cells.slice(); s.paint(c.n - 1, c.n - 1, 'block'); s.paint(c.n - 1, c.n - 1, 'block');
  let ev = null; s.on('newdata', (team, bad) => { ev = { team, bad }; });
  const r = s.submit();
  assert.equal(r.stage, 'newdata');
  assert.equal(s.survived, false);
  assert.equal(ev.team.length, 0);
  assert.ok(ev.bad.length > 0);
  s.acknowledgeNewData();
  assert.equal(s.submit().stage, 'reveal');
});
