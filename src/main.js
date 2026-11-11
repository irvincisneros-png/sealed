import * as THREE from 'three';
import { Stage } from './render/scene.js';
import { ProbeFx } from './render/probesFx.js';
import { Blueprint, playReveal } from './render/blueprint.js';
import { LID_TOP, worldToCell } from './render/vault.js';
import { CASES } from './data/cases.js';
import { CARDS, MODEL_TYPES, cardById } from './data/cards.js';
import { ICONS } from './ui/icons.js';
import * as save from './state/save.js';
import { caseSession } from './state/game.js';
import * as logic from './logic/index.js';
import { describeObservation, COSTS } from './logic/probes.js';
import { stars as starsFor } from './logic/score.js';

save.load();
const $app = document.getElementById('app');
const stage = new Stage(document.getElementById('stage'), save.get().settings.quality);
const fx = new ProbeFx(stage), bp = new Blueprint(stage);
let session = null, tool = 'bounce', modelMode = false, paintTool = 'block', hud = null, revealObj = null;
const state = { screen: 'title', get session() { return session; } };
window.__sealed = { state, logic: { ...logic, CASES }, stage };
stage.setN(8); fx.attach(stage.vault); bp.attach(stage.vault); bp.hide(); stage.setMode('idle'); stage.start();

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
function show(name, node) { $app.innerHTML = ''; state.screen = name; if (node) $app.appendChild(node); stage.setSafeArea({ l: 0, r: 0, t: 0, b: 0 }); }
const toast = t => { const e = document.getElementById('toast'); e.textContent = t; e.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);background:#10151b;border:1px solid #ffb020;padding:8px 16px;border-radius:99px;z-index:9'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.cssText = 'display:none', 2200); };
function resetStage(n) { clearReveal(); stage.setN(n); fx.attach(stage.vault); bp.attach(stage.vault); }
function clearReveal() { if (revealObj) { revealObj.destroy(); revealObj = null; } stage.spill.intensity = 0; const v = stage.vault; if (v) { v.lid.position.set(0, 0, 0); v.platform.position.y = -1.1; v.latches.forEach(l => l.userData.bar.position.set(0, 0, 0)); } }

function title() {
  clearReveal(); stage.setMode('idle'); bp.hide();
  const s = el(`<section class="screen"><h1>SEALED</h1><p class="tag">Crack the vault without opening it.</p><span class="badge">Rank: ${save.rank()} · ${save.totalStars()}★</span>
  <div class="menu"><button class="btn primary" id="play">Play</button><button class="btn" id="cards">Model Cards (${save.get().cards.length}/12)</button><button class="btn" id="how">How to play</button></div>
  <p class="foot">8.2.2 A scientific model is a representation based on data and observations of real-world phenomena. 8.2.3 Examples of the types of models used by scientists.</p></section>`);
  s.querySelector('#play').onclick = cases; s.querySelector('#cards').onclick = cardsScreen; s.querySelector('#how').onclick = how;
  show('title', s);
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
function startCase(c) {
  session = caseSession(c); resetStage(c.n);
  modelMode = false; tool = 'bounce'; bp.show(); bp.setModel(session.model); bp.setModeVisual(false); stage.setMode('play');
  session.on('probe', obs => { fx.play(obs).then(() => { drawLog(); }); updateHud(); });
  session.on('model', () => { bp.setModel(session.model); updateHud(); });
  session.on('newdata', obs => { newDataModal(obs); });
  session.on('reveal', r => doReveal(r));
  buildHud();
}
function buildHud() {
  const c = session;
  $app.innerHTML = ''; state.screen = 'case';
  hud = el(`<div id="hud"><div class="topbar"><button class="btn" id="back">Back</button><span class="title">${c.caseId}. ${c.name}</span><span class="chip" id="budget"></span></div>
  <div class="panel pl active" id="p-tools"></div><div class="panel pr" id="p-data"></div><div class="hint" id="hint"></div>
  <div class="tabs"><button class="btn" data-t="p-tools">Probes / Model</button><button class="btn" data-t="p-data">Data</button></div></div>`);
  $app.appendChild(hud);
  hud.querySelector('#back').onclick = () => { cases(); bp.hide(); fx.clear(); };
  hud.querySelectorAll('.tabs .btn').forEach(b => b.onclick = () => { hud.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === b.dataset.t)); layout(); });
  layout(); updateHud(); drawLog();
}
const narrow = () => innerWidth <= 760;
function layout() {
  if (narrow()) stage.setSafeArea({ l: 0, r: 0, t: 52, b: innerHeight * 0.46 + 40 }); else stage.setSafeArea({ l: 262, r: 302, t: 56, b: 60 });
}
addEventListener('resize', () => { if (state.screen === 'case') { layout(); const a = hud.querySelector('.panel.active'); if (!narrow()) hud.querySelectorAll('.panel').forEach(p => p.classList.add('active')); else if (!a) hud.querySelector('#p-tools').classList.add('active'); } });
const TOOLS = { bounce: ['Bounce ball', 10], xray: ['X-ray', 25], scale: ['Scale', 15], thermal: ['Thermal', 60] };
function updateHud() {
  const c = session; if (!hud) return;
  hud.querySelector('#budget').textContent = `$${c.left}`;
  const p = hud.querySelector('#p-tools'), cur = p.querySelector('.tools');
  let html = '<h2 style="font-size:.9rem">Probes</h2><div class="tools">';
  Object.entries(TOOLS).forEach(([k, [n, cost]], i) => { if (c.allowed.includes(k)) html += `<button class="btn ${!modelMode && tool === k ? 'sel' : ''}" data-tool="${k}" ${c.canAfford(k) && !modelMode ? '' : 'disabled'}>${i + 1} ${n}<small>$${cost}</small></button>`; });
  html += `</div><button class="btn ${modelMode ? 'sel' : ''}" id="mm">${modelMode ? 'Model mode ON (M)' : 'Model mode (M)'}</button>`;
  if (modelMode) {
    html += '<div class="tools">' + [['block', '■ Block'], ['ne', '◥ NE'], ['se', '◢ SE'], ['sw', '◣ SW'], ['nw', '◤ NW'], ['erase', 'Eraser']].map(([k, n]) => `<button class="btn ${paintTool === k ? 'sel' : ''}" data-paint="${k}">${n}</button>`).join('') + '</div><div class="tools"><button class="btn" id="undo">Undo</button><button class="btn" id="clr">Clear</button></div>';
  }
  const fit = c.fit;
  html += `<div class="readout">${fit.total ? `Your model explains ${fit.ok} of ${fit.total} observations` : 'No observations yet'}</div>`;
  const prob = c.submitProblem;
  html += `<button class="btn primary" id="submit" ${prob ? 'disabled' : ''}>${c.phase === 'final' ? 'Final submit' : 'Submit model'}</button>${prob ? `<small style="color:var(--dim)">${prob}</small>` : ''}`;
  p.innerHTML = html;
  p.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; modelMode = false; modeVisual(); if (tool === 'scale' || tool === 'thermal') fireGlobal(tool); updateHud(); });
  p.querySelectorAll('[data-paint]').forEach(b => b.onclick = () => { paintTool = b.dataset.paint; updateHud(); });
  p.querySelector('#mm').onclick = toggleModel;
  const u = p.querySelector('#undo'); if (u) { u.onclick = () => session.undo(); p.querySelector('#clr').onclick = () => session.clearModel(); }
  p.querySelector('#submit').onclick = () => { const r = session.submit(); if (!r.ok) toast(r.reason); };
  hud.querySelector('#hint').textContent = modelMode ? 'Click or drag on the lid to paint your model.' : tool === 'xray' ? 'Click a brass port: the X-ray measures that whole row or column.' : tool === 'bounce' ? 'Click a brass port to roll a ball in.' : 'Pick a tool, or switch to Model mode.';
  if (c.phase === 'final') hud.querySelector('#hint').textContent = 'Revise your model, then press Final submit.';
}
function modeVisual() { bp.setModeVisual(modelMode); fx.setDimmed(modelMode); stage.setMode(modelMode ? 'blueprint' : 'play'); }
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
    li.onclick = () => { if (o.type === 'thermal') fx.toggleThermal(); fx.setHighlight(o.id); setTimeout(() => fx.setHighlight(null), 1200); };
    ul.appendChild(li);
  }
  if (!ul.children.length) ul.appendChild(el('<li style="cursor:default">Nothing yet. Fire a probe.</li>'));
}
function newDataModal(obs) {
  const m = el(`<div class="modal"><div class="card"><h2>New data arrives</h2><p>A second team ran 3 more probes. Their results don't fit your model.</p><ul class="log">${obs.map(o => `<li style="--c:#56B4E9"><span>#${o.id} ${describeObservation(o)}</span></li>`).join('')}</ul><button class="btn primary" id="ok">Revise my model</button></div></div>`);
  $app.appendChild(m);
  m.querySelector('#ok').onclick = () => { m.remove(); session.acknowledgeNewData(); for (const o of obs) { o.shown = true; fx.play(o, { instant: true }); } drawLog(); updateHud(); };
}
function doReveal(r) {
  hud?.remove(); hud = null; stage.setSafeArea({ l: 0, r: 0, t: 0, b: 160 }); bp.hide();
  const rec = session.caseId ? save.recordCase(session.caseId, r) : { newCards: [] };
  revealObj = playReveal(stage, stage.vault, session.truth, session.model, () => resultsCard(r, rec));
}
function resultsCard(r, rec) {
  stage.setSafeArea({ l: 0, r: 0, t: 0, b: 0 });
  const m = el(`<div class="modal" style="align-items:flex-end;background:none"><div class="card"><h2>Results</h2><div class="big"><span id="pct">0</span>% <span class="stars">${stars(r.stars)}</span></div>
  <div>Data fit: ${r.fitOk} of ${r.fitTotal} observations explained</div><div>Budget left: $${r.budgetLeft} · Score: <b>${r.score}</b> · Rank: ${save.rank()}</div>
  ${r.survived ? '<div class="good">Your model survived every test.</div>' : r.revised && r.draftMatch != null ? `<div>First draft ${Math.round(r.draftMatch)}% to final ${Math.round(r.match)}%</div>` : ''}
  <p><i>${r.reflection}</i></p><p style="color:var(--dim);font-size:.85rem">Green: model and object agree. Red: only your model. Amber: your model missed it.</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="copy">Copy result</button><button class="btn" id="retry">Retry</button><button class="btn primary" id="next">Continue</button></div></div></div>`);
  $app.appendChild(m);
  let t0 = performance.now(); const pct = m.querySelector('#pct');
  (function tick() { const f = Math.min(1, (performance.now() - t0) / 1200); pct.textContent = Math.round(r.match * f); if (f < 1) requestAnimationFrame(tick); })();
  m.querySelector('#copy').onclick = () => { const s = `SEALED ${session.name} — ${Math.round(r.match)}% ${'★'.repeat(r.stars)} — $${r.budgetLeft} left`; navigator.clipboard?.writeText(s).then(() => toast('Copied')); };
  m.querySelector('#retry').onclick = () => startCase(CASES.find(c => c.id === session.caseId));
  m.querySelector('#next').onclick = () => { m.remove(); if (rec.newCards.length) cardUnlock(rec.newCards); else { cases(); } };
}
function cardUnlock(ids) {
  const m = el(`<div class="modal"><div class="card"><h2>Model cards unlocked</h2><div class="grid" style="grid-template-columns:1fr">${ids.map(id => { const c = cardById(id); return `<div class="mc">${ICONS[c.icon]}<b>${c.name}</b><em>${MODEL_TYPES[c.type].name}</em><p><b>Represents:</b> ${c.represents}</p><p><b>Built from:</b> ${c.builtFrom}</p><p><b>Leaves out:</b> ${c.leavesOut}</p></div>`; }).join('')}</div><button class="btn primary" id="ok">Back to cases</button></div></div>`);
  $app.appendChild(m); m.querySelector('#ok').onclick = cases;
}

// ---------- input
const canvas = document.getElementById('stage');
let painting = false;
function cellAt(e) { const p = stage.lidPoint(e, LID_TOP); if (!p) return null; const c = worldToCell(session.n, p); return c.x >= 0 && c.y >= 0 && c.x < session.n && c.y < session.n ? c : null; }
function portSpec(slot) { return tool === 'xray' ? { type: 'xray', axis: slot.side === 'W' || slot.side === 'E' ? 'row' : 'col', i: slot.i } : { type: 'bounce', slot }; }
canvas.addEventListener('pointerdown', e => {
  if (state.screen !== 'case' || !session) return;
  if (modelMode) { const c = cellAt(e); if (c) { painting = true; canvas.setPointerCapture(e.pointerId); session.beginStroke(); session.paint(c.x, c.y, paintTool); } return; }
  const hit = stage.pick(e, stage.vault.hits)[0];
  if (hit && (tool === 'bounce' || tool === 'xray')) { const r = session.fire(portSpec(hit.object.userData.slot)); if (!r.ok) toast(r.reason); }
});
canvas.addEventListener('pointermove', e => {
  if (state.screen !== 'case' || !session) return;
  if (modelMode) { const c = cellAt(e); bp.setGhost(c); if (painting && c) session.paint(c.x, c.y, paintTool); return; }
  const hit = (tool === 'bounce' || tool === 'xray') ? stage.pick(e, stage.vault.hits)[0] : null;
  const slot = hit?.object.userData.slot;
  if (state.hov && (!slot || state.hov !== slot)) stage.vault.setPortHover(state.hov, false);
  state.hov = slot || null;
  if (slot) stage.vault.setPortHover(slot, true);
  fx.setAim(slot ? portSpec(slot) : null);
});
addEventListener('pointerup', () => { if (painting) { painting = false; session.endStroke(); } });
addEventListener('keydown', e => {
  if (state.screen !== 'case' || !session || session.phase === 'reveal') return;
  if (e.key === 'm' || e.key === 'M') toggleModel();
  const k = ['bounce', 'xray', 'scale', 'thermal'][Number(e.key) - 1];
  if (k && session.allowed.includes(k)) { tool = k; modelMode = false; modeVisual(); if (k === 'scale' || k === 'thermal') fireGlobal(k); updateHud(); }
});
title();
