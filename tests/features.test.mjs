import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGrid, setCell, solidArea, outerRingEmpty } from '../src/logic/grid.js';
import { encodeVault } from '../src/logic/codec.js';
import { rng } from '../src/logic/generate.js';
import { dateKey, dateLabel, dailyVault, isFairVault, DAILY_N } from '../src/logic/daily.js';
import { validateVault, challengeLink, parseChallengeHash, codeSeed, BUILD_N } from '../src/logic/build.js';
import { pickQuestions, pointsFor, applyAnswer, newRound, ROUND } from '../src/logic/modelmatch.js';
import { QUESTIONS } from '../src/data/questions.js';
import { MODEL_TYPES } from '../src/data/cards.js';
import { STEPS } from '../src/ui/coach.js';
import { sanitise } from '../src/state/save.js';
import { freePlaySession, buildSession } from '../src/state/game.js';

const block = (g, x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setCell(g, x, y, 1); return g; };

// ---- Daily Vault
test('daily: date key and label use the local date', () => {
  assert.equal(dateKey(new Date(2026, 10, 12)), '20261112');
  assert.equal(dateKey(new Date(2026, 0, 5)), '20260105');
  assert.equal(dateKey(new Date(2026, 11, 31, 23, 59)), '20261231');
  assert.equal(dateLabel(new Date(2026, 10, 12)), '12 Nov');
  assert.equal(dateLabel(new Date(2027, 0, 1)), '1 Jan');
});
test('daily: same date gives the same vault, different dates differ, and every vault is fair', () => {
  const a = dailyVault(new Date(2026, 10, 12)), b = dailyVault(new Date(2026, 10, 12, 18));
  assert.deepEqual(a.grid, b.grid);
  assert.notDeepEqual(a.grid, dailyVault(new Date(2026, 10, 13)).grid);
  const seen = new Set();
  for (let d = 0; d < 800; d++) {
    const v = dailyVault(new Date(2026, 0, 1 + d));
    assert.equal(v.grid.n, DAILY_N);
    assert.ok(isFairVault(v.grid), `day ${d}`);
    assert.ok(outerRingEmpty(v.grid));
    const f = solidArea(v.grid) / 100; assert.ok(f >= 0.08 && f <= 0.35 && v.grid.cells.some(Boolean));
    seen.add(v.grid.cells.join(''));
  }
  assert.ok(seen.size > 700, 'daily vaults should rarely repeat');
});
test('daily: isFairVault rejects empty, full ring, tiny and huge vaults', () => {
  assert.equal(isFairVault(makeGrid(10)), false);
  assert.equal(isFairVault(block(makeGrid(10), 0, 0, 3, 3)), false); // touches the outer ring
  assert.equal(isFairVault(block(makeGrid(10), 4, 4, 1, 1)), false); // too small
  assert.equal(isFairVault(block(makeGrid(10), 1, 1, 8, 8)), false); // too big
  assert.equal(isFairVault(block(makeGrid(10), 3, 3, 3, 3)), true);
});

// ---- Build a Vault
test('build: validation tells the student what to fix', () => {
  const empty = validateVault(makeGrid(10));
  assert.equal(empty.ok, false); assert.match(empty.problems[0], /empty/i);
  const small = validateVault(block(makeGrid(10), 4, 4, 2, 2));
  assert.equal(small.ok, false); assert.match(small.problems[0], /Too small.*4%.*Add about 4 more/);
  const big = validateVault(block(makeGrid(10), 1, 1, 7, 7));
  assert.equal(big.ok, false); assert.match(big.problems[0], /Too big.*49%.*Remove about 14/);
  const ring = block(makeGrid(10), 0, 4, 3, 3);
  const r = validateVault(ring);
  assert.equal(r.ok, false); assert.match(r.problems.join(' '), /outer ring/);
  const both = validateVault(block(makeGrid(10), 0, 0, 1, 1));
  assert.equal(both.problems.length, 2);
  const good = validateVault(block(makeGrid(10), 3, 3, 3, 3));
  assert.deepEqual(good, { ok: true, problems: [], percent: 9 });
});
test('build: limits are inclusive at 8 and 35 percent, triangles count half', () => {
  const g = block(makeGrid(10), 2, 2, 4, 2); assert.equal(validateVault(g).ok, true); // exactly 8
  const t = makeGrid(10); block(t, 2, 2, 2, 2); setCell(t, 5, 5, 2); setCell(t, 6, 5, 3); setCell(t, 5, 6, 4); setCell(t, 6, 6, 5); // 4 + 2 = 6 blocks
  assert.equal(validateVault(t).ok, false);
  assert.equal(validateVault(block(makeGrid(10), 1, 1, 7, 5)).ok, true); // 35 exactly
  assert.equal(validateVault(block(makeGrid(10), 1, 1, 6, 6)).ok, false); // 36
});
test('build: challenge links round-trip and bad codes are rejected', () => {
  const g = block(makeGrid(10), 3, 2, 4, 3);
  const link = challengeLink('https://example.org/sealed/?x=1#old', g);
  assert.match(link, /^https:\/\/example\.org\/sealed\/\?x=1#v=[A-Za-z0-9_-]+$/);
  const parsed = parseChallengeHash(link.slice(link.indexOf('#')));
  assert.deepEqual(parsed.grid, g);
  assert.equal(parseChallengeHash(''), null);
  assert.equal(parseChallengeHash('#other'), null);
  for (const bad of ['#v=', '#v=!!', '#v=AAAA', '#v=' + encodeVault(g).slice(0, -3), '#v=' + encodeVault(g) + 'AAAA', '#v=' + encodeVault(makeGrid(10)), '#v=' + encodeVault(block(makeGrid(8), 2, 2, 3, 3))]) {
    const p = parseChallengeHash(bad); assert.ok(p && p.grid === null, bad);
  }
  // an unfair vault (touching the ring) in a valid code is refused too
  assert.equal(parseChallengeHash('#v=' + encodeVault(block(makeGrid(10), 0, 0, 4, 4))).grid, null);
  assert.equal(codeSeed('abc'), codeSeed('abc')); assert.notEqual(codeSeed('abc'), codeSeed('abd'));
});
test('build: the build session refuses ring cells and a challenge session hides its vault', () => {
  const b = buildSession();
  assert.equal(b.paint(0, 5, 'block'), false); assert.equal(b.paint(5, 9, 'block'), false);
  assert.equal(b.paint(5, 5, 'block'), true);
  assert.equal(b.sealVault(), null); // fewer than 3 solid cells
  const s = freePlaySession({ mode: 'shared', name: 'Challenge vault', truth: block(makeGrid(10), 3, 3, 3, 3), seed: 7 });
  assert.equal(s.truth, null); assert.equal(s.budget, 340); assert.equal(s.allowed.length, 4);
  assert.ok(!JSON.stringify(s).includes('"truth"'));
});

// ---- Model Match
test('model match: bank has 24+ questions, each at most 20 words, with valid types and a reason', () => {
  assert.ok(QUESTIONS.length >= 24);
  const stems = new Set();
  for (const q of QUESTIONS) {
    assert.ok(q.stem.split(/\s+/).length <= 20, q.stem);
    assert.ok(MODEL_TYPES[q.answer], q.stem);
    assert.ok(q.why && q.why.length < 90, q.why);
    assert.ok(!stems.has(q.stem)); stems.add(q.stem);
    assert.doesNotMatch(q.stem + q.why, /\b(color|center|meter|liter|program me)\b/i);
  }
});
test('model match: a round has 10 distinct questions, balanced by kind, with no repeats', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const qs = pickQuestions(QUESTIONS, rng(seed));
    assert.equal(qs.length, ROUND.questions);
    assert.equal(new Set(qs.map(q => q.stem)).size, qs.length);
    assert.equal(qs.filter(q => q.kind === 'what').length, 5);
  }
  assert.deepEqual(pickQuestions(QUESTIONS, rng(5)), pickQuestions(QUESTIONS, rng(5)));
  assert.notDeepEqual(pickQuestions(QUESTIONS, rng(5)).map(q => q.stem), pickQuestions(QUESTIONS, rng(6)).map(q => q.stem));
});
test('model match: the next round avoids the last round when the bank allows', () => {
  const first = pickQuestions(QUESTIONS, rng(1)), avoid = new Set(first.map(q => q.stem));
  const second = pickQuestions(QUESTIONS, rng(2), 10, avoid);
  assert.equal(second.filter(q => avoid.has(q.stem)).length, 0);
});
test('model match: scoring with a streak bonus that resets and caps', () => {
  assert.equal(pointsFor(1), 10); assert.equal(pointsFor(2), 12); assert.equal(pointsFor(6), 20); assert.equal(pointsFor(7), 20); assert.equal(pointsFor(20), 20);
  let s = newRound();
  for (const ok of [true, true, false, true]) s = applyAnswer(s, ok);
  assert.deepEqual(s, { score: 10 + 12 + 0 + 10, streak: 1, bestStreak: 2, right: 3, answered: 4 });
  let p = newRound(); for (let i = 0; i < 10; i++) p = applyAnswer(p, true);
  assert.equal(p.score, 100 + 2 * (0 + 1 + 2 + 3 + 4 + 5 + 5 + 5 + 5 + 5)); assert.equal(p.bestStreak, 10);
  assert.equal(applyAnswer(newRound(), false).score, 0);
});

// ---- tutorial + save
test('coach: 5 to 6 short steps, each 15 words or fewer, advancing on the student action', () => {
  assert.ok(STEPS.length >= 5 && STEPS.length <= 6);
  for (const s of STEPS) for (const t of [s.text, s.touch].filter(Boolean)) assert.ok(t.split(/\s+/).length <= 15, t);
  const none = { obsCount: 0, sides: 0, modelMode: false, painted: 0, revealed: false };
  const by = id => STEPS.find(s => s.id === id);
  assert.equal(by('fire').done('probe', none), false); assert.equal(by('fire').done('probe', { ...none, obsCount: 1 }), true);
  assert.equal(by('log').done('probe', { ...none, obsCount: 3 }), false); assert.equal(by('log').done('gotit', none), true); assert.equal(by('log').done('logclick', none), true);
  assert.equal(by('side').done('probe', { ...none, sides: 1 }), false); assert.equal(by('side').done('probe', { ...none, sides: 2 }), true);
  assert.equal(by('model').done('mode', { ...none, modelMode: true }), true);
  assert.equal(by('paint').done('paint', { ...none, painted: 1 }), true);
  assert.equal(by('submit').done('reveal', { ...none, revealed: true }), true);
});
test('save: tutorial flag defaults off and survives sanitise only when strictly true', () => {
  assert.equal(sanitise(null).seenCoach, false);
  assert.equal(sanitise({ seenCoach: 'yes' }).seenCoach, false);
  assert.equal(sanitise({ seenCoach: true }).seenCoach, true);
});
