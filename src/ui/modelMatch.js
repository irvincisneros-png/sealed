// Model Match boss round: 10 questions in 90 seconds, four type buttons, streak bonus.
import { QUESTIONS } from '../data/questions.js';
import { MODEL_TYPES, TYPE_ORDER } from '../data/cards.js';
import { rng } from '../logic/generate.js';
import { ROUND, pickQuestions, applyAnswer, newRound, pointsFor } from '../logic/modelmatch.js';

let lastStems = new Set(); // keeps the next round fresh when the bank is big enough

// host: element to render into. api: { save, sfx, onExit }. Returns { destroy }.
export function openModelMatch(host, { save, sfx, onExit }) {
  let timer = null, keyFn = null, questions = [], qi = 0, round = newRound(), left = ROUND.seconds, paused = false, locked = false, last = 0;
  const mm = () => save.get().mm;
  const close = () => { clearInterval(timer); timer = null; if (keyFn) removeEventListener('keydown', keyFn); keyFn = null; };
  const put = html => { host.innerHTML = `<section class="screen mm" aria-live="off">${html}</section>`; return host.firstElementChild; };

  function intro() {
    close();
    const s = put(`<h2>Model Match</h2><div class="card mmcard"><p>${ROUND.questions} questions in ${ROUND.seconds} seconds. Pick the type of model.</p><p>Right answers in a row score extra. The clock stops while you read a wrong answer.</p>
      <p class="dim">Best score: <b>${mm().best}</b> · Best streak: <b>${mm().bestStreak}</b></p>
      <div class="row"><button class="btn primary" id="go">Start</button><button class="btn" id="back">Back</button></div></div>`);
    s.querySelector('#go').onclick = start; s.querySelector('#back').onclick = () => { close(); onExit(); };
    s.querySelector('#go').focus();
  }
  function start() {
    const r = rng((Date.now() ^ (Math.random() * 4294967296)) >>> 0);
    questions = pickQuestions(QUESTIONS, r, ROUND.questions, lastStems);
    lastStems = new Set(questions.map(q => q.stem));
    qi = 0; round = newRound(); left = ROUND.seconds; paused = false; locked = false; last = performance.now();
    keyFn = e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = Number(e.key);
      if (k >= 1 && k <= 4 && !locked) { e.preventDefault(); answer(TYPE_ORDER[k - 1]); }
      else if ((e.key === 'Enter' || e.key === ' ') && locked && paused) { if (document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); next(); } }
    };
    addEventListener('keydown', keyFn);
    timer = setInterval(tick, 200);
    ask();
  }
  function tick() {
    const now = performance.now(), dt = (now - last) / 1000; last = now;
    if (paused) return;
    left = Math.max(0, left - dt);
    paintClock();
    if (left <= 0) finish('Time is up');
  }
  function paintClock() {
    const t = host.querySelector('#clock'), b = host.querySelector('#bar');
    if (t) t.textContent = `${Math.ceil(left)} s`;
    if (b) b.style.width = `${(left / ROUND.seconds) * 100}%`;
  }
  function ask() {
    locked = false; paused = false; last = performance.now();
    const q = questions[qi];
    const s = put(`<div class="mmtop"><span>Question ${qi + 1} of ${questions.length}</span><span>Score <b id="sc">${round.score}</b></span><span>Streak <b>${round.streak}</b></span><span class="clock">Time <b id="clock"></b></span></div>
      <div class="barwrap" aria-hidden="true"><div id="bar"></div></div>
      <div class="card mmcard"><p class="dim">${q.kind === 'what' ? 'Which type of model is this?' : 'Which type of model fits best?'}</p><p class="stem">${q.stem}</p>
      <div class="opts">${TYPE_ORDER.map((t, i) => `<button class="btn opt" data-t="${t}"><span class="num">${i + 1}</span> ${MODEL_TYPES[t].name}</button>`).join('')}</div>
      <div id="fb" class="fb" role="status" aria-live="polite"></div></div>`);
    s.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(b.dataset.t));
    paintClock();
  }
  function answer(type) {
    if (locked) return; locked = true;
    const q = questions[qi], ok = type === q.answer;
    round = applyAnswer(round, ok);
    const fb = host.querySelector('#fb');
    host.querySelectorAll('.opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.t === q.answer) { b.classList.add('right'); b.insertAdjacentHTML('beforeend', ' <span class="mark">✓ Right answer</span>'); }
      else if (b.dataset.t === type) { b.classList.add('wrong'); b.insertAdjacentHTML('beforeend', ' <span class="mark">✗ Your answer</span>'); }
    });
    host.querySelector('#sc').textContent = round.score;
    if (ok) {
      sfx.right();
      fb.innerHTML = `<b class="good">✓ Correct</b> +${pointsFor(round.streak)}${round.streak > 1 ? ` (streak ${round.streak})` : ''}`;
      const done = qi + 1 >= questions.length;
      setTimeout(() => { if (!timer) return; done ? finish('Round complete') : next(); }, 650);
    } else {
      sfx.wrong(); paused = true;
      fb.innerHTML = `<b class="bad">✗ Not quite.</b> ${q.why}<div><button class="btn primary" id="next">${qi + 1 >= questions.length ? 'See my score' : 'Next question'}</button></div>`;
      const n = fb.querySelector('#next'); n.onclick = next; n.focus();
    }
  }
  function next() {
    if (qi + 1 >= questions.length) return finish('Round complete');
    qi++; ask();
  }
  function finish(title) {
    if (!timer) return; close();
    const prev = { ...mm() };
    save.recordMatch(round.score, round.bestStreak);
    const newBest = round.score > prev.best;
    sfx.star(newBest ? 2 : 0);
    const s = put(`<h2>${title}</h2><div class="card mmcard"><div class="big">${round.score} <small>points</small></div>
      <div>Right answers: <b>${round.right}</b> of ${questions.length}${round.answered < questions.length ? ` (answered ${round.answered})` : ''}</div>
      <div>Best streak this round: <b>${round.bestStreak}</b></div>
      <div class="dim">Your best score: <b>${mm().best}</b>${newBest ? ' · <b class="good">★ New best!</b>' : ''} · Best streak: <b>${mm().bestStreak}</b></div>
      <div class="row"><button class="btn primary" id="again">Play again</button><button class="btn" id="back">Back to title</button></div></div>`);
    s.querySelector('#again').onclick = intro; s.querySelector('#back').onclick = onExit;
    s.querySelector('#again').focus();
  }
  intro();
  return { destroy: close };
}
