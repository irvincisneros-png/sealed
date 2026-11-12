import * as THREE from 'three';
import { Stage } from './render/scene.js';
import { ProbeFx } from './render/probesFx.js';
import { Blueprint, playReveal } from './render/blueprint.js';
import { LID_TOP, worldToCell } from './render/vault.js';
import { CASES } from './data/cases.js';
import { CARDS, MODEL_TYPES, cardById } from './data/cards.js';
import { ICONS } from './ui/icons.js';
import * as save from './state/save.js';
import { caseSession, freePlaySession, buildSession } from './state/game.js';
import { sfx, arm as armAudio, setMuted, isMuted } from './audio/sfx.js';
import { openModelMatch } from './ui/modelMatch.js';
import { createCoach } from './ui/coach.js';
import { dateKey, dateLabel, dailyVault, DAILY_N, DAILY_BUDGET } from './logic/daily.js';
import { validateVault, challengeLink, parseChallengeHash, codeSeed, BUILD_N } from './logic/build.js';
import { allSlots } from './logic/trace.js';
import * as logic from './logic/index.js';
import { describeObservation, COSTS } from './logic/probes.js';
import { stars as starsFor } from './logic/score.js';

save.load();
setMuted(save.get().settings.muted); armAudio();
const $app = document.getElementById('app');
const stage = new Stage(document.getElementById('stage'), save.get().settings.quality);
const fx = new ProbeFx(stage), bp = new Blueprint(stage);
let session = null, playing = null, mmHandle = null, resultsOpen = false, builtLink = '', tool = 'bounce', kb = null, modelMode = false, paintTool = 'block', hud = null, revealObj = null, revealSafe = { l: 0, r: 0, t: 0, b: 0 };
const state = { screen: 'title', get session() { return session; } };
// Public case list for debugging: no maps or grids, so the hidden object cannot be read before the reveal.
const PUBLIC_CASES = CASES.map(({ id, name, blurb, n, budget, probes }) => ({ id, name, blurb, n, budget, probes }));
window.__sealed = { state, logic: { ...logic, CASES: PUBLIC_CASES }, stage };
stage.setN(8); fx.attach(stage.vault); bp.attach(stage.vault); bp.hide(); stage.setMode('idle'); stage.start();

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
// Leaving any screen: stop the Model Match clock and the tutorial.
function teardown() { mmHandle?.destroy(); mmHandle = null; coach.stop(false); resultsOpen = false; }
function show(name, node) { teardown(); $app.innerHTML = ''; state.screen = name; if (node) $app.appendChild(node); stage.setSafeArea({ l: 0, r: 0, t: 0, b: 0 }); }
const toast = t => { const e = document.getElementById('toast'); e.textContent = t; e.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);background:#10151b;border:1px solid #ffb020;padding:8px 16px;border-radius:99px;z-index:9'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.cssText = 'display:none', 2200); };
const coachCtx = () => {
  const own = session ? session.ownObservations : [];
  return { obsCount: own.length, sides: new Set(own.filter(o => o.slot).map(o => o.slot.side)).size, modelMode, painted: session ? session.paintedCells : 0, revealed: !!session && session.phase === 'reveal' };
};
const coach = createCoach({
  getCtx: coachCtx, isTouch: () => matchMedia('(pointer: coarse)').matches,
  tabFor: id => document.querySelector(`.tabs [data-t="${id}"]`),
  onChange: () => { if (hud) layout(); },
  onEnd: () => save.markSeenCoach(),
});
// Mute button: fixed top-right, so it is on every screen. Setting persists through save.js.
const muteBtn = document.createElement('button');
muteBtn.id = 'mute'; muteBtn.className = 'btn'; muteBtn.type = 'button';
document.body.appendChild(muteBtn);
const SPK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/>';
function paintMute() {
  const m = isMuted();
  muteBtn.innerHTML = m ? SPK + '<path d="M17 9l5 6M22 9l-5 6"/></svg>' : SPK + '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  muteBtn.setAttribute('aria-pressed', String(m)); muteBtn.setAttribute('aria-label', m ? 'Sound is off. Turn sound on' : 'Sound is on. Turn sound off'); muteBtn.title = m ? 'Sound off' : 'Sound on';
}
muteBtn.onclick = () => { const m = !isMuted(); setMuted(m); save.setSetting('muted', m); paintMute(); if (!m) sfx.blip(); };
paintMute();
function resetStage(n) { clearReveal(); stage.setN(n); fx.attach(stage.vault); bp.attach(stage.vault); }
function clearReveal() { if (revealObj) { revealObj.destroy(); revealObj = null; } stage.spill.intensity = 0; const v = stage.vault; if (v) { v.lid.position.set(0, 0, 0); v.platform.position.y = -1.1; v.latches.forEach(l => l.userData.bar.position.set(0, 0, 0)); } }

function title() {
  clearReveal(); stage.setMode('idle'); bp.hide();
  const dOk = save.dailyUnlocked(), mOk = save.matchUnlocked(), today = save.get().daily[dateKey()], mm = save.get().mm;
  const dSub = dOk ? (today ? `${dateLabel()} · your best ${today.match}% ${stars(today.stars)}` : `${dateLabel()} · a new vault every day`) : 'Locked: earn a star on case 3, The Prism';
  const mSub = mOk ? `Best score: ${mm.best}` : 'Locked: earn a star on case 4, The Ring';
  const s = el(`<section class="screen"><h1>SEALED</h1><p class="tag">Crack the vault without opening it.</p><span class="badge">Rank: ${save.rank()} · ${save.totalStars()}★</span>
  <div class="menu"><button class="btn primary" id="play">Play</button>
  <button class="btn" id="daily" ${dOk ? '' : 'aria-disabled="true"'}>Daily Vault<small>${dSub}</small></button>
  <button class="btn" id="build">Build a Vault<small>Paint a vault and send a friend the link</small></button>
  <button class="btn" id="match" ${mOk ? '' : 'aria-disabled="true"'}>Model Match<small>${mSub}</small></button>
  <button class="btn" id="cards">Model Cards (${save.get().cards.length}/12)</button><button class="btn" id="how">How to play</button></div>
  <p class="foot">8.2.2 A scientific model is a representation based on data and observations of real-world phenomena. 8.2.3 Examples of the types of models used by scientists.</p></section>`);
  s.querySelector('#play').onclick = cases; s.querySelector('#cards').onclick = cardsScreen; s.querySelector('#how').onclick = how;
  s.querySelector('#daily').onclick = () => dOk ? startDaily() : toast('Earn a star on case 3, The Prism, to unlock the Daily Vault.');
  s.querySelector('#match').onclick = () => mOk ? startMatch() : toast('Earn a star on case 4, The Ring, to unlock Model Match.');
  s.querySelector('#build').onclick = buildMode;
  show('title', s);
}
function startMatch() {
  show('match'); mmHandle = openModelMatch($app, { save, sfx, onExit: title });
}
function notice(heading, text) { // friendly dialog over the current screen
  const m = el(`<div class="modal" role="alertdialog" aria-modal="true" aria-label="${heading}"><div class="card"><h2>${heading}</h2><p>${text}</p><button class="btn primary" id="ok">OK</button></div></div>`);
  $app.appendChild(m); const ok = m.querySelector('#ok'); ok.onclick = () => m.remove(); ok.focus();
}
function how() {
  const s = el(`<section class="screen"><h2>How to play</h2><div class="card" style="text-align:left"><p>Something is sealed in the vault. You cannot open it.</p><p><b>1. Probe.</b> Pick a tool, then click a brass port. Each probe costs money.</p><p><b>2. Read the data.</b> Balls that hit something come back. Slanted faces turn them. Ticks show how long the trip took.</p><p><b>3. Model.</b> Switch to Model mode and paint what you think is inside. The check tells you how many observations your model explains.</p><p><b>4. Submit.</b> The vault opens and your model is laid over the real thing.</p><button class="btn primary" id="b">Back</button></div></section>`);
  s.querySelector('#b').onclick = title; show('how', s);
}
function cases() {
  clearReveal(); stage.setMode('idle');
  const s = el(`<section class="screen"><h2>Cases</h2><div class="grid"></div><button class="btn" id="b">Back</button></section>`);
  const g = s.querySelector('.grid');
  for (const c of CASES) {
    const un = save.caseUnlocked(c.id);
    const d = el(`<button class="door" ${un ? '' : 'disabled'}><b>${c.id}. ${c.name}</b><span class="stars">${stars(save.starsFor(c.id))}</span><span>${un ? c.blurb : 'Locked. Earn a star on the last case.'}</span><small>Best: ${save.get().best[c.id] || '-'} · Budget $${c.budget}</small></button>`);
    if (un) d.onclick = () => startCase(c);
    g.appendChild(d);
  }
  s.querySelector('#b').onclick = title; show('cases', s);
}
function cardsScreen() {
  const s = el(`<section class="screen" style="justify-content:flex-start"><h2>Model Cards</h2><p class="tag">Win cases to collect cards about the types of scientific models.</p><div class="grid"></div><button class="btn" id="b">Back</button></section>`);
  const g = s.querySelector('.grid');
  for (const c of CARDS) {
    const has = save.hasCard(c.id);
    g.appendChild(el(has ? `<div class="mc">${ICONS[c.icon]}<b>${c.name}</b><em>${MODEL_TYPES[c.type].name}</em><p><b>Represents:</b> ${c.represents}</p><p><b>Built from:</b> ${c.builtFrom}</p><p><b>Leaves out:</b> ${c.leavesOut}</p></div>` : `<div class="mc locked"><b>Locked</b><p>Clear case ${c.unlockCase} to unlock.</p></div>`));
  }
  s.querySelector('#b').onclick = title; show('cards', s);
}

// ---------- case screen
function startCase(c) { play({ kind: 'case', make: () => caseSession(c), back: cases, retry: () => startCase(c) }); }
function startDaily() {
  const d = new Date(), dv = dailyVault(d), name = `Daily ${dateLabel(d)}`;
  const o = { kind: 'daily', key: dv.key, make: () => freePlaySession({ mode: 'daily', name, truth: dv.grid, seed: dv.seed }), back: title };
  o.retry = () => play(o); play(o);
}
// A challenge vault from a #v= link. The decoded grid lives only in this closure and in the session's private field.
function startShared(parsed) {
  const o = { kind: 'shared', make: () => freePlaySession({ mode: 'shared', name: 'Challenge vault', truth: parsed.grid, seed: codeSeed(parsed.code) }), back: () => { clearHash(); title(); } };
  o.retry = () => play(o); play(o);
}
const clearHash = () => { if (location.hash) history.replaceState(null, '', location.pathname + location.search); };
function play(o) {
  teardown(); playing = o; session = o.make(); resetStage(session.n); armed = null; state.hov = null; revealSafe = { l: 0, r: 0, t: 0, b: 0 };
  modelMode = false; tool = 'bounce'; kb = null; bp.show(); bp.setModel(session.model); bp.setModeVisual(false); stage.setMode('play');
  session.on('probe', obs => {
    if (obs.type === 'bounce') sfx.launch(); else if (obs.type === 'xray') sfx.xray(); else sfx.blip();
    fx.play(obs).then(() => { drawLog(); if (obs.type === 'bounce') (obs.result.kind === 'deflected' ? sfx.ping : sfx.clunk)(); coach.notify('probe'); });
    updateHud();
  });
  session.on('model', () => { bp.setModel(session.model); updateHud(); drawLog(); coach.notify('paint'); });
  session.on('newdata', (obs, bad) => { sfx.alert(); newDataModal(obs, bad); });
  session.on('reveal', r => doReveal(r));
  buildHud();
  if (session.caseId === 1 && !save.get().seenCoach) coach.start();
}
function buildHud() {
  const c = session;
  $app.innerHTML = ''; state.screen = 'case';
  hud = el(`<div id="hud"><div class="topbar"><button class="btn" id="back">Back</button><span class="title">${c.caseId ? c.caseId + '. ' : ''}${c.name}</span><span class="chip" id="budget"></span></div>
  <div class="panel pl active" id="p-tools"></div><div class="panel pr" id="p-data"></div><div class="hint" id="hint"></div>
  <div class="tabs"><button class="btn" data-t="p-tools">Probes / Model</button><button class="btn" data-t="p-data">Data</button></div></div>`);
  $app.appendChild(hud);
  hud.querySelector('#back').onclick = () => { playing.back(); bp.hide(); fx.clear(); };
  hud.querySelectorAll('.tabs .btn').forEach(b => b.onclick = () => { hud.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === b.dataset.t)); layout(); coach.refresh(); if (b.dataset.t === 'p-data') coach.notify('logopen'); });
  layout(); updateHud(); drawLog();
}
const narrow = () => innerWidth <= 760;
function layout() {
  const c = coach.active ? (narrow() ? 84 : 64) : 0; // room for the tutorial bubble
  if (narrow()) stage.setSafeArea({ l: 0, r: 0, t: 52 + c, b: session?.mode === 'build' ? innerHeight * 0.54 : innerHeight * 0.46 + 44 }); else stage.setSafeArea({ l: 262, r: session?.mode === 'build' ? 20 : 302, t: 56 + c, b: 60 });
}
addEventListener('resize', () => { if (state.screen === 'case' && !hud) { if (resultsOpen) revealSafe = dockSafe(); stage.setSafeArea(revealSafe); } else if (state.screen === 'case') { layout(); const a = hud.querySelector('.panel.active'); if (!narrow()) hud.querySelectorAll('.panel').forEach(p => p.classList.add('active')); else if (!a) hud.querySelector('#p-tools').classList.add('active'); } });
const TOOLS = { bounce: ['Bounce ball', 10], xray: ['X-ray', 25], scale: ['Scale', 15], thermal: ['Thermal', 60] };
const paintMarkup = () => '<div class="tools">' + [['block', '■ Block'], ['ne', '◥ NE'], ['se', '◢ SE'], ['sw', '◣ SW'], ['nw', '◤ NW'], ['erase', 'Eraser']].map(([k, n]) => `<button class="btn ${paintTool === k ? 'sel' : ''}" data-paint="${k}">${n}</button>`).join('') + '</div><div class="tools"><button class="btn" id="undo">Undo</button><button class="btn" id="clr">Clear</button></div>';
function wirePaint(p) {
  p.querySelectorAll('[data-paint]').forEach(b => b.onclick = () => { paintTool = b.dataset.paint; session.mode === 'build' ? updateBuildHud() : updateHud(); });
  const u = p.querySelector('#undo'); if (u) { u.onclick = () => session.undo(); p.querySelector('#clr').onclick = () => session.clearModel(); }
}
function updateHud() {
  const c = session; if (!hud) return;
  hud.querySelector('#budget').textContent = `$${c.left}`;
  const p = hud.querySelector('#p-tools'), cur = p.querySelector('.tools');
  let html = '<h2 style="font-size:.9rem">Probes</h2><div class="tools">';
  Object.entries(TOOLS).forEach(([k, [n, cost]], i) => { if (c.allowed.includes(k)) html += `<button class="btn ${!modelMode && tool === k ? 'sel' : ''}" data-tool="${k}" ${c.canAfford(k) && !modelMode ? '' : 'disabled'}>${i + 1} ${n}<small>$${cost}</small></button>`; });
  html += `</div><button class="btn ${modelMode ? 'sel' : ''}" id="mm">${modelMode ? 'Model mode ON (M)' : 'Model mode (M)'}</button>`;
  if (modelMode) {
    html += paintMarkup();
  }
  const fit = c.fit;
  html += `<div class="readout">${fit.total ? `Your model explains ${fit.ok} of ${fit.total} observations` : 'No observations yet'}</div>`;
  const prob = c.submitProblem;
  html += `<button class="btn primary" id="submit" ${prob ? 'disabled' : ''}>${c.phase === 'final' ? 'Final submit' : 'Submit model'}</button>${prob ? `<small style="color:var(--dim)">${prob}</small>` : ''}`;
  p.innerHTML = html;
  p.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; modelMode = false; modeVisual(); if (tool === 'scale' || tool === 'thermal') fireGlobal(tool); updateHud(); });
  wirePaint(p);
  p.querySelector('#mm').onclick = toggleModel;
  p.querySelector('#submit').onclick = () => { const r = session.submit(); if (!r.ok) toast(r.reason); };
  hud.querySelector('#hint').textContent = modelMode ? 'Click or drag on the lid to paint your model. Arrow keys move, Enter paints.' : tool === 'xray' ? 'Click a brass port: the X-ray measures that whole row or column.' : tool === 'bounce' ? 'Click a brass port to roll a ball in.' : 'Pick a tool, or switch to Model mode.';
  if (c.phase === 'final') hud.querySelector('#hint').textContent = 'Revise your model, then press Final submit.';
  coach.refresh();
}
function modeVisual() { disarm(); bp.setModeVisual(modelMode); fx.setDimmed(modelMode); stage.setMode(modelMode ? 'blueprint' : 'play'); if (!modelMode) bp.setGhost(null); coach.notify('mode'); }
function toggleModel() { modelMode = !modelMode; modeVisual(); updateHud(); }
function fireGlobal(type) { const r = session.fire({ type }); if (!r.ok) toast(r.reason); }
function drawLog() {
  const p = hud?.querySelector('#p-data'); if (!p) return;
  const checks = session.checks, has = session.paintedCells > 0;
  p.innerHTML = '<h2 style="font-size:.9rem">Data log</h2><ul class="log"></ul>';
  const ul = p.querySelector('ul');
  for (const o of session.observations) {
    if (o.shown === false || (!o.shown && !o.team)) continue;
    const ch = checks.find(x => x.obs === o);
    const li = el(`<li class="${o.team ? 'team' : ''}" style="--c:${o.colour || '#888'}"><span>#${o.id} ${describeObservation(o)}</span>${has ? `<span class="ok ${ch.ok ? 'good' : 'bad'}">${ch.ok ? '✓' : '✗'}</span>` : ''}</li>`);
    li.onmouseenter = () => fx.setHighlight(o.id); li.onmouseleave = () => fx.setHighlight(null);
    li.onclick = () => { coach.notify('logclick'); if (o.type === 'thermal') fx.toggleThermal(); fx.setHighlight(o.id); setTimeout(() => fx.setHighlight(null), 1200); };
    ul.appendChild(li);
  }
  if (!ul.children.length) ul.appendChild(el('<li style="cursor:default">Nothing yet. Fire a probe.</li>'));
  coach.refresh();
}
function newDataModal(obs, bad = []) {
  const li = (o, c) => `<li style="--c:${c}"><span>#${o.id} ${describeObservation(o)}</span></li>`;
  const own = bad.length ? `<p>Your own data already disagrees with your model. These observations do not fit it:</p><ul class="log">${bad.map(o => li(o, o.colour || '#E69F00')).join('')}</ul>` : '';
  const team = obs.length ? `<p>A second team ran ${obs.length} more probe${obs.length === 1 ? '' : 's'}. Their results don't fit your model.</p><ul class="log">${obs.map(o => li(o, '#56B4E9')).join('')}</ul>` : '';
  const m = el(`<div class="modal"><div class="card"><h2>${obs.length ? 'New data arrives' : 'Your model has a problem'}</h2>${obs.length ? team + own : own + '<p>Scientists change the model, not the data. Revise your model, then submit again.</p>'}<button class="btn primary" id="ok">Revise my model</button></div></div>`);
  $app.appendChild(m);
  m.querySelector('#ok').onclick = () => { m.remove(); session.acknowledgeNewData(); for (const o of obs) { o.shown = true; fx.play(o, { instant: true }); } drawLog(); updateHud(); };
}
const dockSafe = () => narrow() ? { l: 0, r: 0, t: 52, b: Math.round(innerHeight * 0.44) } : { l: 0, r: 372, t: 56, b: 0 };
function doReveal(r) {
  coach.notify('reveal'); sfx.unlock();
  hud?.remove(); hud = null; revealSafe = dockSafe(); stage.setSafeArea(revealSafe); bp.hide();
  const rec = session.caseId ? save.recordCase(session.caseId, r) : { newCards: [] };
  if (session.mode === 'daily') save.recordDaily(playing.key, r);
  revealObj = playReveal(stage, stage.vault, session.truth, session.model, () => resultsCard(r, rec));
}
// Compact results panel: docked right on desktop, bottom sheet on a phone, so the green/red/amber overlay stays visible.
function resultsCard(r, rec) {
  resultsOpen = true; revealSafe = dockSafe(); stage.setSafeArea(revealSafe);
  const day = session.mode === 'daily' ? save.get().daily[playing.key] : null;
  const m = el(`<aside class="dock" role="region" aria-label="Results"><div class="dhead"><div class="big"><span id="pct">0</span>%</div><span class="stars" role="img" aria-label="${r.stars} of 3 stars">${stars(r.stars)}</span></div>
  <div class="dline">Data fit ${r.fitOk}/${r.fitTotal} · $${r.budgetLeft} left · Score <b>${r.score}</b></div>
  <div class="dline">Rank: ${save.rank()}${day ? ` · Best today: ${day.match}% ${stars(day.stars)}` : ''}${r.survived ? ' · <span class="good">✓ Survived every test</span>' : r.revised && r.draftMatch != null ? ` · Draft ${Math.round(r.draftMatch)}% to final ${Math.round(r.match)}%` : ''}</div>
  <p class="refl"><i>${r.reflection}</i></p>
  <details class="legend"><summary>What do the colours mean?</summary><ul><li><b>Green</b>: model and object agree.</li><li><b>Red</b>: only in your model.</li><li><b>Amber</b>: your model missed it.</li></ul></details>
  <div class="row"><button class="btn" id="copy">Copy result</button><button class="btn" id="retry">${session.mode === 'case' ? 'Retry' : 'Play again'}</button><button class="btn primary" id="next">Continue</button></div></aside>`);
  $app.appendChild(m);
  const pct = m.querySelector('#pct');
  if (stage.reduced) pct.textContent = Math.round(r.match);
  else { const t0 = performance.now(); (function tick() { const f = Math.min(1, (performance.now() - t0) / 1200); pct.textContent = Math.round(r.match * f); if (f < 1) requestAnimationFrame(tick); })(); }
  for (let i = 0; i < r.stars; i++) setTimeout(() => sfx.star(i), 300 + i * 260);
  m.querySelector('#copy').onclick = () => { const s = `SEALED ${session.name} — ${Math.round(r.match)}% ${'★'.repeat(r.stars)} — $${r.budgetLeft} left`; const ok = () => toast('Copied'); navigator.clipboard ? navigator.clipboard.writeText(s).then(ok, () => toast(s)) : toast(s); };
  m.querySelector('#retry').onclick = () => playing.retry();
  m.querySelector('#next').onclick = () => { m.remove(); resultsOpen = false; if (rec.newCards.length) cardUnlock(rec.newCards); else playing.back(); };
  m.querySelector('#next').focus({ preventScroll: true });
}
function cardUnlock(ids) {
  const m = el(`<div class="modal"><div class="card"><h2>Model cards unlocked</h2><div class="grid" style="grid-template-columns:1fr">${ids.map(id => { const c = cardById(id); return `<div class="mc">${ICONS[c.icon]}<b>${c.name}</b><em>${MODEL_TYPES[c.type].name}</em><p><b>Represents:</b> ${c.represents}</p><p><b>Built from:</b> ${c.builtFrom}</p><p><b>Leaves out:</b> ${c.leavesOut}</p></div>`; }).join('')}</div><button class="btn primary" id="ok">Back to cases</button></div></div>`);
  $app.appendChild(m); sfx.star(1); m.querySelector('#ok').onclick = cases;
}

// ---------- input
const canvas = document.getElementById('stage');
let painting = false, paintPointer = null;
function cellAt(e) { const p = stage.lidPoint(e, LID_TOP); if (!p) return null; const c = worldToCell(session.n, p); return c.x >= 0 && c.y >= 0 && c.x < session.n && c.y < session.n ? c : null; }
const ringCell = c => session.mode === 'build' && (c.x === 0 || c.y === 0 || c.x === session.n - 1 || c.y === session.n - 1);
function portSpec(slot) { return tool === 'xray' ? { type: 'xray', axis: slot.side === 'W' || slot.side === 'E' ? 'row' : 'col', i: slot.i } : { type: 'bounce', slot }; }
// Ports are small on a phone, so pick the nearest one to the pointer in screen space instead of ray-testing a tiny hitbox.
const PICK_RADIUS = 28, _v = new THREE.Vector3();
function pickPort(e) {
  const r = canvas.getBoundingClientRect(); let best = null, bd = PICK_RADIUS;
  for (const p of stage.vault.ports.values()) {
    p.hit.getWorldPosition(_v); _v.project(stage.camera);
    if (_v.z > 1) continue;
    const d = Math.hypot((_v.x * 0.5 + 0.5) * r.width + r.left - e.clientX, (-_v.y * 0.5 + 0.5) * r.height + r.top - e.clientY);
    if (d < bd) { bd = d; best = p.slot; }
  }
  return best;
}
const portLabel = slot => slot.side + (slot.i + 1);
// Touch: the first tap selects a port (highlight + label), the second tap on the same port fires.
let armed = null;
function disarm() { if (armed) { stage.vault.setPortHover(armed, false); fx.setAim(null); armed = null; if (hud && session) updateHud(); } }
function setHover(slot) {
  if (state.hov && state.hov !== slot) stage.vault.setPortHover(state.hov, false);
  state.hov = slot || null;
  if (slot) stage.vault.setPortHover(slot, true);
  fx.setAim(slot ? portSpec(slot) : null);
}
canvas.addEventListener('pointerdown', e => {
  if (state.screen !== 'case' || !session || !hud) return;
  if (painting) return; // one stroke at a time: ignore extra fingers
  if (modelMode) { const c = cellAt(e); if (c) { painting = true; paintPointer = e.pointerId; canvas.setPointerCapture(e.pointerId); session.beginStroke(); if (session.paint(c.x, c.y, paintTool)) sfx.tick(); } return; }
  if (tool !== 'bounce' && tool !== 'xray') return;
  const slot = pickPort(e);
  if (e.pointerType === 'touch') {
    if (!slot) { disarm(); return; }
    if (armed !== slot) { // first tap: select
      if (armed) stage.vault.setPortHover(armed, false);
      armed = slot; setHover(slot);
      hud.querySelector('#hint').textContent = `${portLabel(slot)} — tap again to fire`;
      return;
    }
    disarm(); setHover(null);
  }
  if (slot) { const r = session.fire(portSpec(slot)); if (!r.ok) toast(r.reason); }
});
canvas.addEventListener('pointermove', e => {
  if (state.screen !== 'case' || !session) return;
  if (painting && e.pointerId !== paintPointer) return;
  if (modelMode) { const c = cellAt(e); bp.setGhost(c && !ringCell(c) ? c : null); if (painting && c && session.paint(c.x, c.y, paintTool)) sfx.tick(); return; }
  if (e.pointerType === 'touch') return; // no hover on touch; selection is by tap
  setHover((tool === 'bounce' || tool === 'xray') ? pickPort(e) : null);
});
function endPaint(e) { if (painting && e.pointerId === paintPointer) { painting = false; paintPointer = null; session?.endStroke(); } }
addEventListener('pointerup', endPaint);
addEventListener('pointercancel', endPaint);
canvas.addEventListener('lostpointercapture', endPaint);
const typing = e => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.ctrlKey || e.metaKey || e.altKey;
addEventListener('keydown', e => {
  if (state.screen !== 'case' || !session || !hud || session.phase === 'reveal' || typing(e)) return;
  const build = session.mode === 'build', onBtn = e.target?.tagName === 'BUTTON';
  if (!build && (e.key === 'm' || e.key === 'M')) { toggleModel(); return; }
  const k = build ? null : ['bounce', 'xray', 'scale', 'thermal'][Number(e.key) - 1];
  if (k && session.allowed.includes(k)) { tool = k; modelMode = false; modeVisual(); if (k === 'scale' || k === 'thermal') fireGlobal(k); updateHud(); return; }
  const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
  if (modelMode) { // keyboard painting: arrows move a cursor cell, Enter or Space paints, Backspace erases
    if (arrow) {
      e.preventDefault(); document.activeElement?.blur?.();
      const lo = build ? 1 : 0, hi = session.n - 1 - (build ? 1 : 0);
      kb = kb || { x: Math.floor(session.n / 2), y: Math.floor(session.n / 2) };
      kb = { x: Math.max(lo, Math.min(hi, kb.x + arrow[0])), y: Math.max(lo, Math.min(hi, kb.y + arrow[1])) };
      bp.setGhost(kb);
    } else if (kb && !onBtn && (e.key === 'Enter' || e.key === ' ' || e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault(); session.beginStroke();
      if (session.paint(kb.x, kb.y, e.key === 'Backspace' || e.key === 'Delete' ? 'erase' : paintTool)) sfx.tick();
      session.endStroke();
    }
    return;
  }
  if (arrow && (arrow[0] !== 0) && (tool === 'bounce' || tool === 'xray')) { // keyboard port picking: Left/Right walk round the rim, Enter fires
    e.preventDefault(); document.activeElement?.blur?.();
    const list = allSlots(session.n), cur = state.hov ? list.findIndex(s => s.side === state.hov.side && s.i === state.hov.i) : -1;
    setHover(list[(cur + arrow[0] + list.length) % list.length]);
    hud.querySelector('#hint').textContent = `${portLabel(state.hov)} selected. Press Enter to fire, or Left and Right to move.`;
  } else if (e.key === 'Enter' && !onBtn && state.hov && (tool === 'bounce' || tool === 'xray')) {
    e.preventDefault(); const r = session.fire(portSpec(state.hov)); if (!r.ok) toast(r.reason);
  }
});

// ---------- build a vault
function buildMode() {
  teardown(); playing = { kind: 'build', back: title }; session = buildSession(); builtLink = '';
  resetStage(BUILD_N); armed = null; state.hov = null; kb = null; revealSafe = { l: 0, r: 0, t: 0, b: 0 };
  paintTool = 'block'; modelMode = true; bp.show(); bp.setModel(session.model); modeVisual();
  session.on('model', () => { builtLink = ''; bp.setModel(session.model); updateBuildHud(); });
  $app.innerHTML = ''; state.screen = 'case';
  hud = el(`<div id="hud"><div class="topbar"><button class="btn" id="back">Back</button><span class="title">Build a Vault</span></div>
  <div class="panel pl active build" id="p-tools"></div></div>`);
  $app.appendChild(hud);
  hud.querySelector('#back').onclick = () => { bp.hide(); fx.clear(); title(); };
  layout(); updateBuildHud();
}
function updateBuildHud() {
  const p = hud?.querySelector('#p-tools'); if (!p) return;
  const v = validateVault(session.model);
  p.innerHTML = `<h2 style="font-size:.9rem">Paint your vault</h2><small style="color:var(--dim)">Click or drag on the lid. The outer ring stays empty. Arrow keys move, Enter paints.</small>${paintMarkup()}
  <div class="readout">${v.percent}% solid · needs 8 to 35%</div>
  ${v.ok ? '<div class="good">✓ Ready to share</div>' : `<ul class="problems">${v.problems.map(t => `<li>✗ ${t}</li>`).join('')}</ul>`}
  <button class="btn primary" id="share">Copy challenge link</button>
  ${builtLink ? `<input class="link" id="link" readonly aria-label="Challenge link" value="${builtLink}">` : ''}
  <small style="color:var(--dim)">Anyone who opens the link plays your vault with $${DAILY_BUDGET} and every probe. The link contains your design.</small>`;
  wirePaint(p);
  p.querySelector('#share').onclick = () => {
    const v2 = validateVault(session.model);
    if (!v2.ok) { toast(v2.problems[0]); p.querySelector('.problems')?.scrollIntoView?.({ block: 'nearest' }); return; }
    const grid = session.sealVault(); if (!grid) { toast('Paint an object first.'); return; }
    builtLink = challengeLink(location.href, grid); updateBuildHud();
    const inp = hud.querySelector('#link'); inp?.focus(); inp?.select();
    if (navigator.clipboard) navigator.clipboard.writeText(builtLink).then(() => toast('Link copied'), () => toast('Copy the link from the box'));
    else toast('Copy the link from the box');
  };
}

// ---------- challenge links: #v=<code> on load and on hashchange
function routeHash() {
  const r = parseChallengeHash(location.hash);
  if (!r) return false;
  if (!r.grid) { clearHash(); title(); notice('That link did not work', 'The vault code is broken or incomplete. It may have been cut short when it was copied. Ask your friend to send the link again.'); return true; }
  startShared(r); return true;
}
addEventListener('hashchange', routeHash);
if (!routeHash()) title();
