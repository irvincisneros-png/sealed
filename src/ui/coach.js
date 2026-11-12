// Guided tutorial for case 1: short coach marks that advance on the student's own actions.
// STEPS is pure data plus predicates (unit-tested); createCoach() is the small DOM layer.

// ctx = { obsCount, sides, modelMode, painted, revealed }; ev = the event that triggered the check.
export const STEPS = [
  { id: 'fire', text: 'Click a brass port on the lid to fire a ball.', touch: 'Tap a brass port, then tap it again to fire.', target: null, done: (ev, c) => c.obsCount >= 1 },
  { id: 'log', text: 'Read the data log. Did your ball bounce back or go through?', target: 'log', button: 'Got it', done: ev => ev === 'logclick' || ev === 'logopen' || ev === 'gotit' },
  { id: 'side', text: 'Now fire a ball from a different side of the vault.', touch: 'Now fire a ball from a different side. Tap twice.', target: null, done: (ev, c) => c.sides >= 2 },
  { id: 'model', text: 'Switch to Model mode (press M) so you can draw.', touch: 'Tap Model mode so you can draw.', target: '#mm', done: (ev, c) => c.modelMode },
  { id: 'paint', text: 'Paint where you think the crate is. Balls that bounce back hit it.', target: null, done: (ev, c) => c.painted >= 1 },
  { id: 'submit', text: 'Fire a few more balls if you like, then press Submit model.', target: '#submit', done: (ev, c) => c.revealed },
];

export function createCoach({ getCtx, isTouch, tabFor, onChange, onEnd }) {
  let i = -1, node = null, hl = null;
  const api = {
    get active() { return i >= 0; },
    start() {
      if (i >= 0) return;
      node = document.createElement('div');
      node.id = 'coach'; node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
      i = 0; advanceWhileDone('sync'); render(); onChange?.(true);
    },
    notify(ev) {
      if (i < 0) return;
      const was = i; advanceWhileDone(ev);
      if (i >= 0 && i !== was) render();
    },
    refresh() { if (i >= 0) mark(); },
    stop(finished = false) {
      if (i < 0) return;
      i = -1; unmark(); node?.remove(); node = null; onChange?.(false); onEnd?.(finished);
    },
  };
  // A step can already be satisfied when it comes up (the student got ahead); skip those. Explicit-event steps never are.
  function advanceWhileDone(ev) {
    while (i >= 0 && i < STEPS.length && STEPS[i].done(ev, getCtx())) { i++; ev = 'sync'; }
    if (i >= STEPS.length) api.stop(true);
  }
  function render() {
    if (i < 0 || !node) return;
    const s = STEPS[i], txt = isTouch() && s.touch ? s.touch : s.text;
    node.innerHTML = `<span class="cstep" aria-hidden="true">${i + 1}/${STEPS.length}</span><span class="ctext"></span>${s.button ? `<button class="btn cgo" type="button">${s.button}</button>` : ''}<button class="btn cskip" type="button" aria-label="Skip tutorial">Skip</button>`;
    node.querySelector('.ctext').textContent = txt;
    node.querySelector('.cskip').onclick = () => api.stop(false);
    const go = node.querySelector('.cgo'); if (go) go.onclick = () => api.notify('gotit');
    mark();
  }
  function unmark() { hl?.classList.remove('coach-target'); hl = null; }
  function mark() {
    unmark();
    const s = STEPS[i]; if (!s || !s.target) return;
    const sel = s.target === 'log' ? (visible('#p-data') ? '#p-data' : tabFor('p-data')) : (visible(s.target) ? s.target : tabFor('p-tools'));
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (el) { el.classList.add('coach-target'); hl = el; }
  }
  const visible = sel => { const e = document.querySelector(sel); return !!e && e.offsetParent !== null; };
  return api;
}
