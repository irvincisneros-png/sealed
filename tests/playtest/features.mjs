// Browser playtest for the v1.1 features (Model Match, Daily Vault, Build a Vault, audio, tutorial, results dock, cases 5 and 6).
// Needs the dev server: python3 devserver.py 8491    then:  URL=http://localhost:8491/ OUT=/some/dir node tests/playtest/features.mjs [scenario]
import { launch } from './harness.mjs';
import { mkdirSync } from 'node:fs';
const URL_ = process.env.URL ?? 'http://localhost:8491/';
const out = process.env.OUT ?? 'playtest-shots';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && extra ? '  -> ' + extra : ''}`); };
const SAVE_ALL = { stars: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 1 }, best: {}, cards: [], mm: { best: 0, bestStreak: 0 }, daily: {}, settings: { quality: 'low', muted: false }, seenHow: true, seenCoach: true };
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const text = h => h.page.evaluate(() => document.getElementById('app').innerText);
const saved = h => h.page.evaluate(() => JSON.parse(localStorage.getItem('sealed.v1') || 'null') ?? { stars: {}, daily: {}, settings: {}, mm: {} });

// Boot with an optional pre-seeded save (null = fresh player).
async function boot({ save = null, hash = '', mobile = false, reduced = false } = {}) {
  const h = await launch({ url: URL_, hash: '', outDir: out, mobile });
  await h.page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  if (reduced) await h.page.emulateMedia({ reducedMotion: 'reduce' });
  await h.page.evaluate(d => { localStorage.clear(); if (d) localStorage.setItem('sealed.v1', JSON.stringify(d)); }, save);
  await h.page.goto('about:blank'); await h.page.goto(URL_ + hash);
  await h.page.waitForFunction(() => window.__sealed); await sleep(h, 600);
  return h;
}
const noScroll = h => h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth);
async function smallTargets(h) { // visible buttons / inputs under 44 px
  return h.page.evaluate(() => [...document.querySelectorAll('#app button, #app input, #mute, #coach button, summary')].filter(e => e.offsetParent !== null || e.id === 'mute').map(e => { const r = e.getBoundingClientRect(); return { t: (e.innerText || e.id || e.ariaLabel || '').slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(r => r.h < 43.5 || r.w < 43.5));
}
async function portXY(h, side, i) {
  return h.page.evaluate(async ({ side, i }) => {
    const THREE = await import('three'); const st = window.__sealed.stage;
    const p = [...st.vault.ports.values()].find(p => p.slot.side === side && p.slot.i === i);
    const v = new THREE.Vector3(); p.hit.getWorldPosition(v); v.project(st.camera);
    const r = document.getElementById('stage').getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top };
  }, { side, i });
}
async function cellXY(h, x, y) {
  return h.page.evaluate(async ({ x, y }) => {
    const THREE = await import('three'); const { cellToWorld, LID_TOP } = await import('/src/render/vault.js');
    const st = window.__sealed.stage, n = window.__sealed.state.session.n, w = cellToWorld(n, x, y);
    const v = new THREE.Vector3(w.x, LID_TOP, w.z).project(st.camera); const r = document.getElementById('stage').getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top };
  }, { x, y });
}
// Real mouse: click a port (desktop single click fires), or tap twice on touch.
async function clickPort(h, side, i, touch = false) {
  const p = await portXY(h, side, i);
  if (touch) { await h.page.touchscreen.tap(p.x, p.y); await sleep(h, 150); await h.page.touchscreen.tap(p.x, p.y); } else { await h.page.mouse.move(p.x, p.y); await h.page.mouse.click(p.x, p.y); }
}
async function dragCells(h, x0, y0, x1, y1) { // real drag along a row
  const a = await cellXY(h, x0, y0), b = await cellXY(h, x1, y1);
  await h.page.mouse.move(a.x, a.y); await h.page.mouse.down(); await h.page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await h.page.mouse.move(b.x, b.y, { steps: 4 }); await h.page.mouse.up();
}
async function waitDock(h) { await h.page.waitForSelector('.dock', { timeout: 25000 }); await sleep(h, 1500); }
// Fire specs and paint a model through the session API.
async function fireAndPaint(h, specs, cells) {
  await h.page.evaluate(({ specs, cells }) => {
    const s = window.__sealed.state.session; for (const sp of specs) s.fire(sp);
    s.beginStroke(); for (const [x, y, v] of cells) s.paint(x, y, v); s.endStroke();
  }, { specs, cells });
  await sleep(h, 2500);
}
async function submitToReveal(h) {
  await h.page.locator('#submit').click(); await sleep(h, 700);
  if (await h.page.locator('.modal #ok').count()) { await h.page.locator('.modal #ok').click(); await sleep(h, 300); await h.page.locator('#submit').click(); }
}
const bounceSpecs = (side, a, b) => { const o = []; for (let i = a; i <= b; i++) o.push({ type: 'bounce', slot: { side, i } }); return o; };
const noErr = (h, label = 'no console errors or warnings') => check(label, h.errors.length === 0, h.errors.join(' | '));
const external = h => h.requests.filter(u => !u.startsWith(URL_) && !u.startsWith('data:') && !u.startsWith('blob:'));

const only = process.argv[2];
const run = async (name, fn) => { if (only && only !== name) return; console.log('\n== ' + name); try { await fn(); } catch (e) { check(name + ' (exception)', false, String(e.stack ?? e).split('\n').slice(0, 3).join(' ')); } };

await run('title', async () => {
  const h = await boot();
  const t = await text(h);
  check('Daily Vault shown locked with its reason', /Daily Vault[\s\S]*Locked: earn a star on case 3/.test(t));
  check('Model Match shown locked with its reason', /Model Match[\s\S]*Locked: earn a star on case 4/.test(t));
  check('Build a Vault available from the start', /Build a Vault/.test(t));
  check('mute button visible on title', await h.page.locator('#mute').isVisible());
  await h.page.locator('#match').click({ force: true }); await sleep(h, 300);
  check('clicking a locked button explains why', /Earn a star on case 4/.test(await h.page.locator('#toast').innerText()));
  check('no network requests outside the page origin', external(h).length === 0, external(h).join(' '));
  await h.shot('title-desktop'); noErr(h); await h.close();
});

await run('modelmatch', async () => {
  const h = await boot({ save: SAVE_ALL });
  const { QUESTIONS } = await h.page.evaluate(async () => ({ QUESTIONS: (await import('/src/data/questions.js')).QUESTIONS }));
  const ans = Object.fromEntries(QUESTIONS.map(q => [q.stem, q]));
  const typeIdx = ['physical', 'diagram', 'maths', 'sim'];
  await h.page.locator('#match').click(); await sleep(h, 300);
  check('intro shows rules and Start', /10 questions in 90 seconds/.test(await text(h)));
  await h.shot('mm-intro');
  await h.page.locator('#go').click(); await sleep(h, 300);
  let seen = new Set(), wrongShown = false, sawReason = false;
  for (let q = 0; q < 10; q++) {
    const stem = (await h.page.locator('.stem').innerText()).trim(); seen.add(stem);
    const item = ans[stem]; if (!item) { check('question is from the bank: ' + stem, false); break; }
    if (q === 0) await h.shot('mm-question');
    if (q === 3) { // answer wrong on purpose
      const wrong = typeIdx.find(t => t !== item.answer);
      await h.page.locator(`.opt[data-t="${wrong}"]`).click(); await sleep(h, 200);
      const fb = await h.page.locator('#fb').innerText();
      sawReason = fb.includes(item.why) && /Not quite/.test(fb); wrongShown = (await h.page.locator('.opt.wrong').innerText()).includes('✗') && (await h.page.locator('.opt.right').innerText()).includes('✓');
      await h.shot('mm-wrong'); await h.page.locator('#next').click();
    } else if (q === 5) { // use the keyboard
      await h.page.keyboard.press(String(typeIdx.indexOf(item.answer) + 1)); await sleep(h, 900);
    } else { await h.page.locator(`.opt[data-t="${item.answer}"]`).click(); await sleep(h, 850); }
  }
  check('10 distinct questions, no repeats', seen.size === 10, String(seen.size));
  check('wrong answer shows the reason line', sawReason);
  check('wrong/right marked with ✗ / ✓ text, not colour alone', wrongShown);
  await h.page.waitForSelector('#again'); const end = await text(h);
  check('end card has score, correct count, best', /points/.test(end) && /Right answers: 9 of 10/.test(end) && /Your best score/.test(end), end.replace(/\n/g, ' | '));
  const sv = await saved(h); check('best score saved', sv.mm.best > 0 && sv.mm.bestStreak >= 3, JSON.stringify(sv.mm));
  await h.shot('mm-end');
  await h.page.locator('#again').click(); await sleep(h, 300);
  check('intro now shows the saved best', new RegExp(`Best score: ${sv.mm.best}`).test(await text(h)));
  // timeout path: start, wait out the clock by faking performance.now
  await h.page.locator('#go').click(); await sleep(h, 400);
  await h.page.evaluate(() => { const real = performance.now.bind(performance); const off = 91000; performance.now = () => real() + off; });
  await h.page.waitForSelector('#again', { timeout: 5000 });
  check('time running out ends the round', /time is up/i.test(await text(h)));
  noErr(h); await h.close();
});

await run('daily', async () => {
  const h = await boot({ save: SAVE_ALL });
  check('Daily Vault unlocked after case 3', !(await h.page.locator('#daily').getAttribute('aria-disabled')));
  await h.page.locator('#daily').click(); await sleep(h, 800);
  const top = await h.page.locator('.topbar .title').textContent();
  check('Daily topbar title and $340 budget', /^Daily \d+ \w{3}$/.test(top) && (await h.page.locator('#budget').innerText()) === '$340', top);
  check('all four probe tools offered', (await h.page.locator('[data-tool]').count()) === 4);
  await h.shot('daily-start');
  // use the real UI for scale and thermal, the API for the bounce volley
  await h.page.locator('[data-tool="scale"]').click(); await sleep(h, 2200);
  await h.page.locator('[data-tool="thermal"]').click(); await sleep(h, 3000);
  await fireAndPaint(h, [...bounceSpecs('W', 1, 8), ...bounceSpecs('S', 1, 8)], [[4, 4, 1], [5, 4, 1], [4, 5, 1], [5, 5, 1]]);
  await submitToReveal(h);
  check('new-data round happened (modal shown for the daily vault)', true);
  await waitDock(h); await h.shot('daily-results');
  const d = await h.page.locator('.dock').innerText();
  check('results dock shows match, fit, budget, best today', /%/.test(d) && /Data fit/.test(d) && /left/.test(d) && /Best today/.test(d), d.replace(/\n/g, ' | '));
  await h.page.locator('#copy').click(); await sleep(h, 300);
  const clip = await h.page.evaluate(() => navigator.clipboard.readText());
  check('copy line matches SEALED Daily <d Mon> — N% ★ — $N left', /^SEALED Daily \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) — \d+% ★{0,3} — \$\d+ left$/.test(clip), clip);
  const sv = await saved(h); const keys = Object.keys(sv.daily);
  check('daily result saved under YYYYMMDD, case stars untouched', keys.length === 1 && /^\d{8}$/.test(keys[0]) && JSON.stringify(sv.stars) === JSON.stringify(SAVE_ALL.stars), JSON.stringify(sv.daily));
  const vis = await h.page.evaluate(() => { const r = document.querySelector('.dock').getBoundingClientRect(); return { l: r.left, w: innerWidth }; });
  check('dock leaves the vault visible (docked right, narrow)', vis.l > vis.w * 0.6, JSON.stringify(vis));
  await h.page.locator('#retry').click(); await sleep(h, 600);
  check('Play again restarts the same vault with $340', (await h.page.locator('#budget').innerText()) === '$340');
  await h.page.locator('#back').click(); await sleep(h, 400);
  check('title shows today\'s best after a result', /your best \d+%/.test(await text(h)));
  noErr(h); await h.close();
});

let builtLink = '';
await run('build', async () => {
  const h = await boot(); // fresh player: Build is open from the start
  await h.page.locator('#build').click(); await sleep(h, 800);
  let t = await text(h);
  check('empty vault says what to fix', /The vault is empty/.test(t));
  await h.page.locator('#share').click(); await sleep(h, 200);
  check('Copy link on an invalid vault gives a message, no link', (await h.page.locator('#link').count()) === 0 && /empty/i.test(await h.page.locator('#toast').innerText()));
  // paint a 3x3 block with real drags at (3..5, 3..5)
  await dragCells(h, 3, 3, 5, 3); await dragCells(h, 3, 4, 5, 4); await dragCells(h, 3, 5, 5, 5);
  const painted = await h.page.evaluate(() => window.__sealed.state.session.paintedCells);
  check('painting with the mouse works (9 cells)', painted === 9, String(painted));
  // ring cell is refused
  const ring = await cellXY(h, 0, 5); await h.page.mouse.click(ring.x, ring.y);
  check('outer ring cannot be painted', (await h.page.evaluate(() => window.__sealed.state.session.paintedCells)) === 9);
  // too big -> message
  await h.page.evaluate(() => { const s = window.__sealed.state.session; s.beginStroke(); for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) s.paint(x, y, 1); s.endStroke(); });
  await sleep(h, 200); t = await text(h);
  check('too big says how much to remove', /Too big[\s\S]*Remove about/.test(t), t.replace(/\n/g, ' '));
  await h.shot('build-too-big');
  await h.page.locator('#clr').click(); await dragCells(h, 3, 3, 5, 3); await dragCells(h, 3, 4, 5, 4); await dragCells(h, 3, 5, 5, 5);
  await sleep(h, 200);
  check('valid vault shows Ready to share', /Ready to share/.test(await text(h)));
  await h.page.locator('#share').click(); await sleep(h, 400);
  builtLink = await h.page.locator('#link').inputValue();
  const clip = await h.page.evaluate(() => navigator.clipboard.readText());
  check('link is …/#v=<code> and was copied', /#v=[A-Za-z0-9_-]+$/.test(builtLink) && clip === builtLink, builtLink);
  await h.shot('build-link');
  // the opened link, same page: hashchange path
  await h.page.goto(builtLink); await sleep(h, 1200);
  check('hashchange opens the shared vault straight away', (await h.page.locator('.topbar .title').textContent()) === 'Challenge vault' && (await h.page.locator('#budget').innerText()) === '$340');
  check('all four probes in a shared vault', (await h.page.locator('[data-tool]').count()) === 4);
  const leak = await h.page.evaluate(() => { const s = window.__sealed.state.session; const dump = JSON.stringify(window.__sealed.logic.CASES) + Object.keys(window.__sealed.state).join(); return { truth: s.truth, hasKey: Object.keys(window.__sealed).join(), app: document.getElementById('app').innerHTML.includes('#v='), dump: dump.length }; });
  check('vault is not exposed before the reveal (truth null, nothing on __sealed)', leak.truth === null && leak.hasKey === 'state,logic,stage', JSON.stringify(leak));
  // play: 3x3 block at 3..5 -> fire a volley, paint the exact model, submit
  await fireAndPaint(h, [...bounceSpecs('W', 1, 8), ...bounceSpecs('S', 1, 8)], [3, 4, 5].flatMap(y => [3, 4, 5].map(x => [x, y, 1])));
  await submitToReveal(h); await waitDock(h);
  const d = await h.page.locator('.dock').innerText();
  check('exact model scores 100% with 3 stars', /100/.test(d) && (await h.page.locator('.dock .stars').getAttribute('aria-label')) === '3 of 3 stars', d.replace(/\n/g, ' | '));
  const sv = await saved(h);
  check('no stars or daily result saved for a shared vault', !Object.keys(sv.stars).length && !Object.keys(sv.daily).length, JSON.stringify(sv));
  await h.shot('shared-results');
  await h.page.locator('#next').click(); await sleep(h, 400);
  check('Continue goes to the title and clears the hash', /SEALED/.test(await text(h)) && !(await h.page.evaluate(() => location.hash)));
  noErr(h); await h.close();
  // on-load path in a brand new page
  const g = await boot({ hash: builtLink.slice(builtLink.indexOf('#')) });
  check('on-load #v= link goes straight to the vault', (await g.page.locator('.topbar .title').textContent()) === 'Challenge vault', await text(g));
  noErr(g, 'no console errors (on-load link)'); await g.close();
});

await run('invalid', async () => {
  for (const code of ['AAAA', '!!', 'zzzz1234', '']) {
    const h = await boot({ hash: '#v=' + code });
    const t = await text(h);
    check(`invalid code "${code}" shows a friendly message over the title`, /that link did not work/i.test(t) && /SEALED/.test(t), t.replace(/\n/g, ' '));
    if (code === 'AAAA') await h.shot('invalid-link');
    await h.page.locator('.modal #ok').click();
    check('hash cleared after the message', (await h.page.evaluate(() => location.hash)) === '');
    // via hashchange while on the title
    await h.page.evaluate(c => { location.hash = '#v=' + c; }, code + 'Q');
    await sleep(h, 500);
    check('hashchange with a bad code shows the message too', /that link did not work/i.test(await text(h)));
    noErr(h); await h.close();
  }
});

await run('mute', async () => {
  const h = await boot({ save: SAVE_ALL });
  await h.page.addInitScript(() => { window.__ac = { made: 0, osc: 0 }; const AC = window.AudioContext; window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ac.made++; const co = this.createOscillator.bind(this); this.createOscillator = () => { window.__ac.osc++; return co(); }; } }; });
  await h.page.reload(); await h.page.waitForFunction(() => window.__sealed); await sleep(h, 500);
  check('no AudioContext before a gesture', (await h.page.evaluate(() => window.__ac.made)) === 0);
  check('mute button visible with state on', (await h.page.locator('#mute').getAttribute('aria-pressed')) === 'false');
  await h.page.locator('#play').click(); await sleep(h, 300);
  check('AudioContext created on first gesture', (await h.page.evaluate(() => window.__ac.made)) === 1);
  await h.page.locator('.door').first().click(); await sleep(h, 800);
  const o0 = await h.page.evaluate(() => window.__ac.osc);
  await clickPort(h, 'W', 3); await sleep(h, 2500);
  const o1 = await h.page.evaluate(() => window.__ac.osc);
  check('firing a ball makes sound (oscillators created)', o1 > o0, `${o0} -> ${o1}`);
  check('mute visible in the case screen', await h.page.locator('#mute').isVisible());
  await h.page.locator('#mute').click();
  check('mute toggled', (await h.page.locator('#mute').getAttribute('aria-pressed')) === 'true' && (await saved(h)).settings.muted === true);
  const o2 = await h.page.evaluate(() => window.__ac.osc);
  await clickPort(h, 'W', 5); await sleep(h, 2500);
  check('no new sounds while muted', (await h.page.evaluate(() => window.__ac.osc)) === o2);
  await h.page.reload(); await h.page.waitForFunction(() => window.__sealed); await sleep(h, 500);
  check('mute persists across reload (button and save)', (await h.page.locator('#mute').getAttribute('aria-pressed')) === 'true' && (await saved(h)).settings.muted === true);
  await h.page.locator('#play').click(); await sleep(h, 200); await h.page.locator('.door').first().click(); await sleep(h, 600);
  const o3 = await h.page.evaluate(() => window.__ac.osc); await clickPort(h, 'W', 2); await sleep(h, 2500);
  check('still silent after reload', (await h.page.evaluate(() => window.__ac.osc)) === o3);
  const o4 = await h.page.evaluate(() => window.__ac.osc); await h.page.locator('#mute').click(); await sleep(h, 200);
  check('unmuting plays a blip and saves', (await h.page.evaluate(() => window.__ac.osc)) > o4 && (await saved(h)).settings.muted === false);
  noErr(h); await h.close();
});

await run('tutorial', async () => {
  const h = await boot({ save: { ...SAVE_ALL, stars: {}, seenCoach: false } });
  await h.page.locator('#play').click(); await sleep(h, 300); await h.page.locator('.door').first().click(); await sleep(h, 1000);
  const coach = () => h.page.locator('#coach .ctext').innerText().catch(() => '');
  const step = () => h.page.locator('#coach .cstep').innerText().catch(() => '');
  check('coach appears on the first case-1 play (step 1/6)', (await step()) === '1/6' && /brass port/.test(await coach()));
  await h.shot('coach-1');
  await clickPort(h, 'W', 3); await sleep(h, 3000);
  check('firing a ball advances to the log step', (await step()) === '2/6' && /data log/.test(await coach()), await coach());
  await h.page.locator('#coach .cgo').click(); await sleep(h, 200);
  check('"Got it" advances to the different-side step', (await step()) === '3/6');
  await clickPort(h, 'W', 5); await sleep(h, 3000);
  check('same side does not advance', (await step()) === '3/6');
  await clickPort(h, 'S', 3); await sleep(h, 3000);
  check('other side advances to Model mode', (await step()) === '4/6' && await h.page.locator('#mm.coach-target').count() === 1, await step());
  await h.page.keyboard.press('m'); await sleep(h, 300);
  check('model mode (keyboard M) advances to paint', (await step()) === '5/6');
  await dragCells(h, 3, 1, 5, 1); await sleep(h, 300);
  check('painting advances to submit', (await step()) === '6/6' && await h.page.locator('#submit.coach-target').count() === 1);
  await h.shot('coach-6');
  await h.page.evaluate(() => { const s = window.__sealed.state.session; for (const side of ['W', 'S']) for (const i of [0, 1, 2, 4, 6]) s.fire({ type: 'bounce', slot: { side, i } }); }); await sleep(h, 2500);
  await h.page.locator('#submit').click(); await waitDock(h);
  check('coach gone at the reveal and flag saved', (await h.page.locator('#coach').count()) === 0 && (await saved(h)).seenCoach === true);
  await h.page.locator('#retry').click(); await sleep(h, 800);
  check('second play of case 1 has no coach', (await h.page.locator('#coach').count()) === 0);
  await h.page.reload(); await h.page.waitForFunction(() => window.__sealed); await h.page.locator('#play').click(); await h.page.locator('.door').first().click(); await sleep(h, 600);
  check('still no coach after a reload', (await h.page.locator('#coach').count()) === 0);
  noErr(h); await h.close();
  // skip path
  const k = await boot({ save: { ...SAVE_ALL, stars: {}, seenCoach: false } });
  await k.page.locator('#play').click(); await k.page.locator('.door').first().click(); await sleep(k, 800);
  await k.page.locator('#coach .cskip').click(); await sleep(k, 200);
  check('Skip removes the coach and saves the flag', (await k.page.locator('#coach').count()) === 0 && (await saved(k)).seenCoach === true);
  noErr(k, 'no console errors (skip path)'); await k.close();
  // cases other than 1 never show it
  const j = await boot({ save: { ...SAVE_ALL, seenCoach: false } });
  await j.page.locator('#play').click(); await j.page.locator('.door').nth(1).click(); await sleep(j, 800);
  check('case 2 has no coach', (await j.page.locator('#coach').count()) === 0); await j.close();
});

for (const [id, label] of [[5, 'case5'], [6, 'case6']]) await run(label, async () => {
  const h = await boot({ save: { ...SAVE_ALL, stars: { 1: 3, 2: 3, 3: 3, 4: 3, 5: id === 6 ? 1 : 0 } } });
  await h.page.locator('#play').click(); await sleep(h, 300);
  await h.page.locator('.door').nth(id - 1).click(); await sleep(h, 1000);
  const tools = await h.page.locator('[data-tool]').allInnerTexts();
  check(`case ${id} offers ${id === 5 ? 'bounce, x-ray, scale' : 'all four probes'}`, tools.length === (id === 5 ? 3 : 4), tools.join(','));
  await h.page.locator('[data-tool="scale"]').click(); await sleep(h, 2500);
  let log = await h.page.locator('#p-data').innerText();
  check('scale probe fires from the UI and logs a reading', /Scale: [\d.]+ blocks/.test(log), log.replace(/\n/g, ' | '));
  await h.shot(`${label}-scale`);
  if (id === 6) {
    await h.page.keyboard.press('4'); await sleep(h, 3500);
    log = await h.page.locator('#p-data').innerText();
    check('thermal probe fires from the keyboard and logs', /Thermal camera/.test(log), log.replace(/\n/g, ' | '));
    await h.page.locator('#p-data li', { hasText: 'Thermal' }).click(); await sleep(h, 800);
    await h.shot(`${label}-thermal`);
    check('thermal costs $60, scale $15 (budget $305 of 380)', (await h.page.locator('#budget').innerText()) === '$305', await h.page.locator('#budget').innerText());
  }
  // xray and bounce through the real UI too
  await h.page.locator('[data-tool="xray"]').click(); await clickPort(h, 'W', 5); await sleep(h, 3000);
  log = await h.page.locator('#p-data').innerText(); check('x-ray reading logged', /X-ray row 6: [\d.]+ thick/.test(log), log.replace(/\n/g, ' | '));
  // model = the real object (read from the data module) so the flow reaches the reveal with a result worth checking
  const truth = await h.page.evaluate(async id => (await import('/src/data/cases.js')).CASES.find(c => c.id === id).grid.cells, id);
  await h.page.evaluate(({ truth, id }) => {
    const s = window.__sealed.state.session; s.fire({ type: 'bounce', slot: { side: 'W', i: 3 } }); s.fire({ type: 'bounce', slot: { side: 'S', i: 4 } });
    s.beginStroke(); truth.forEach((v, i) => { if (v) s.paint(i % 10, Math.floor(i / 10), v); }); s.endStroke();
  }, { truth, id });
  await sleep(h, 2500);
  const fit = await h.page.locator('.readout').innerText(); check('live model check reads all data', /explains (\d+) of \1 observations/.test(fit), fit);
  await submitToReveal(h); await waitDock(h);
  const d = await h.page.locator('.dock').innerText();
  check(`case ${id} reaches the reveal with results`, /100/.test(d) && /Data fit/.test(d), d.replace(/\n/g, ' | '));
  await h.shot(`${label}-reveal`);
  check('case result saved', (await saved(h)).stars[id] === 3);
  noErr(h); await h.close();
});

await run('mobile', async () => {
  const h = await boot({ save: SAVE_ALL, mobile: true });
  const shots = async (name) => { await h.shot(name); check(`${name}: no horizontal scroll at 375`, await noScroll(h)); const small = await smallTargets(h); check(`${name}: touch targets >= 44px`, small.length === 0, JSON.stringify(small)); };
  await shots('m-title');
  await h.page.locator('#match').tap(); await sleep(h, 300); await shots('m-mm-intro');
  await h.page.locator('#go').tap(); await sleep(h, 300); await shots('m-mm-question');
  await h.page.locator('.opt').first().tap(); await sleep(h, 300);
  if (await h.page.locator('#next').count()) { await shots('m-mm-wrong'); await h.page.locator('#next').tap(); }
  await sleep(h, 800); await h.page.evaluate(() => { const real = performance.now.bind(performance); performance.now = () => real() + 91000; }); await h.page.waitForSelector('#again'); await shots('m-mm-end');
  await h.page.locator('#back').tap(); await sleep(h, 300);
  await h.page.locator('#build').tap(); await sleep(h, 800); await shots('m-build');
  // paint on touch
  await h.page.evaluate(() => { const s = window.__sealed.state.session; s.beginStroke(); for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) s.paint(x, y, 1); s.endStroke(); }); await sleep(h, 300);
  await h.page.locator('#share').tap(); await sleep(h, 400); await shots('m-build-link');
  const link = await h.page.locator('#link').inputValue();
  await h.page.locator('#back').tap(); await sleep(h, 300);
  await h.page.locator('#daily').tap(); await sleep(h, 900); await shots('m-daily');
  await fireAndPaint(h, [...bounceSpecs('W', 1, 8), ...bounceSpecs('S', 1, 8)], [[4, 4, 1], [5, 4, 1], [4, 5, 1], [5, 5, 1]]);
  await h.page.locator('.tabs [data-t="p-data"]').tap(); await sleep(h, 300); await shots('m-data-tab');
  await h.page.locator('.tabs [data-t="p-tools"]').tap(); await sleep(h, 300);
  await submitToReveal(h); await waitDock(h); await shots('m-results');
  const r = await h.page.evaluate(() => { const d = document.querySelector('.dock').getBoundingClientRect(); return { top: d.top, h: innerHeight, sh: document.querySelector('.dock').scrollHeight, ch: document.querySelector('.dock').clientHeight }; });
  check('results sheet takes under half the phone screen', r.top > r.h * 0.5, JSON.stringify(r));
  await h.page.locator('.dock summary').tap(); await sleep(h, 200); await h.shot('m-results-legend');
  await h.page.goto(link); await sleep(h, 1000); await shots('m-shared');
  // tutorial on a phone
  await h.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('sealed.v1')); d.seenCoach = false; localStorage.setItem('sealed.v1', JSON.stringify(d)); });
  await h.page.goto(URL_); await h.page.reload(); await h.page.waitForFunction(() => window.__sealed); await sleep(h, 600);
  await h.page.locator('#play').tap(); await h.page.locator('.door').first().tap(); await sleep(h, 1000); await shots('m-coach-1');
  await clickPort(h, 'W', 3, true); await sleep(h, 3000);
  check('touch: tap twice fires and advances the coach', (await h.page.locator('#coach .cstep').innerText()) === '2/6');
  await h.page.locator('.tabs [data-t="p-data"]').tap(); await sleep(h, 300);
  check('opening the Data tab counts as reading the log', (await h.page.locator('#coach .cstep').innerText()) === '3/6');
  await shots('m-coach-3');
  noErr(h); await h.close();
});

await run('desktop-shots', async () => {
  const h = await boot({ save: SAVE_ALL });
  await h.page.locator('#build').click(); await sleep(h, 800); await h.page.evaluate(() => { const s = window.__sealed.state.session; s.beginStroke(); for (let y = 3; y < 6; y++) for (let x = 3; x < 7; x++) s.paint(x, y, 1); s.endStroke(); }); await sleep(h, 300);
  await h.shot('d-build'); check('build: no horizontal scroll at 1366', await noScroll(h)); check('build: targets >= 44px', (await smallTargets(h)).length === 0, JSON.stringify(await smallTargets(h)));
  await h.page.locator('#back').click(); await sleep(h, 300);
  await h.page.locator('#play').click(); await h.page.locator('.door').nth(2).click(); await sleep(h, 800);
  await fireAndPaint(h, [...bounceSpecs('W', 1, 8), ...bounceSpecs('S', 1, 8)], [[3, 3, 1], [4, 3, 1], [3, 4, 1], [4, 4, 1]]);
  await submitToReveal(h); await waitDock(h); await h.shot('d-results');
  check('results: no horizontal scroll at 1366', await noScroll(h)); check('results: targets >= 44px', (await smallTargets(h)).length === 0, JSON.stringify(await smallTargets(h)));
  noErr(h); await h.close();
});

await run('keyboard', async () => {
  const h = await boot({ save: SAVE_ALL });
  await h.page.locator('#play').click(); await h.page.locator('.door').first().click(); await sleep(h, 800);
  await h.page.keyboard.press('ArrowRight'); await h.page.keyboard.press('ArrowRight'); await h.page.keyboard.press('Enter'); await sleep(h, 2500);
  check('keyboard: arrows pick a port and Enter fires', (await h.page.evaluate(() => window.__sealed.state.session.observations.length)) === 1);
  await h.page.keyboard.press('m'); await h.page.keyboard.press('ArrowLeft'); await h.page.keyboard.press('Enter'); await h.page.keyboard.press('ArrowUp'); await h.page.keyboard.press(' ');
  check('keyboard: cursor paints in model mode', (await h.page.evaluate(() => window.__sealed.state.session.paintedCells)) === 2);
  await h.page.keyboard.press('Backspace');
  check('keyboard: Backspace erases', (await h.page.evaluate(() => window.__sealed.state.session.paintedCells)) === 1);
  await h.page.locator('#back').click(); await sleep(h, 300); await h.page.locator('#b').click(); await sleep(h, 300);
  await h.page.locator('#build').click(); await sleep(h, 800);
  for (let k = 0; k < 6; k++) await h.page.keyboard.press('ArrowLeft'); // cursor stops at the inner edge
  await h.page.keyboard.press('Enter');
  const c = await h.page.evaluate(() => { const s = window.__sealed.state.session; return { n: s.paintedCells, ring: [0, 9].some(v => s.model.cells[v * 10 + 5] || s.model.cells[5 * 10 + v]) }; });
  check('build: keyboard cursor paints inside the ring only', c.n === 1 && !c.ring, JSON.stringify(c));
  noErr(h); await h.close();
});

await run('reduced', async () => {
  const h = await boot({ save: { ...SAVE_ALL, stars: {}, seenCoach: false }, reduced: true });
  await h.page.locator('#play').click(); await h.page.locator('.door').first().click(); await sleep(h, 800);
  await h.page.keyboard.press('m'); await sleep(h, 200);
  const anim = await h.page.evaluate(() => getComputedStyle(document.querySelector('.coach-target') || document.body).animationName);
  check('reduced motion: tutorial highlight does not animate', anim === 'none', anim);
  noErr(h); await h.close();
});

const failed = results.filter(r => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILED:\n' + failed.map(f => ' - ' + f[0]).join('\n')); process.exit(1); }
