// Tiny WebAudio synth. No audio files. The AudioContext is only created/resumed on the first user gesture.
let ctx = null, master = null, muted = false, armed = false, lastTick = 0;

export function setMuted(m) {
  muted = !!m;
  if (master) master.gain.value = muted ? 0 : 0.5;
}
export const isMuted = () => muted;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination); } catch { ctx = null; return false; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return true;
}
// Call once at boot: the first pointer/key/touch gesture creates and resumes the context.
export function arm() {
  if (armed) return; armed = true;
  const go = () => { ensure(); for (const ev of ['pointerdown', 'keydown', 'touchend']) removeEventListener(ev, go, true); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, go, true);
}
export const ready = () => !!ctx && ctx.state === 'running';

// One enveloped oscillator. f0 -> f1 glide over the note.
function tone({ f0, f1 = f0, dur = 0.15, type = 'sine', vol = 0.3, at = 0, attack = 0.005 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
function noise({ dur = 0.08, vol = 0.2, at = 0, freq = 800 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at, n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

export const sfx = {
  launch() { tone({ f0: 180, f1: 520, dur: 0.22, type: 'triangle', vol: 0.22 }); noise({ dur: 0.18, vol: 0.08, freq: 1500 }); },
  clunk() { tone({ f0: 130, f1: 55, dur: 0.18, type: 'sine', vol: 0.45 }); noise({ dur: 0.05, vol: 0.18, freq: 500 }); },
  ping() { tone({ f0: 1320, dur: 0.5, vol: 0.2 }); tone({ f0: 1980, dur: 0.35, vol: 0.08 }); },
  xray() { tone({ f0: 90, f1: 140, dur: 0.9, type: 'sawtooth', vol: 0.09, attack: 0.15 }); tone({ f0: 180, f1: 280, dur: 0.9, type: 'sine', vol: 0.06, attack: 0.2 }); },
  blip() { tone({ f0: 660, dur: 0.07, type: 'square', vol: 0.08 }); tone({ f0: 990, dur: 0.1, type: 'square', vol: 0.08, at: 0.08 }); },
  tick() { const n = performance.now(); if (n - lastTick < 45) return; lastTick = n; tone({ f0: 900, f1: 600, dur: 0.035, type: 'square', vol: 0.05 }); },
  alert() { for (let k = 0; k < 3; k++) tone({ f0: k % 2 ? 640 : 880, dur: 0.12, type: 'square', vol: 0.1, at: k * 0.14 }); },
  unlock() { tone({ f0: 90, f1: 60, dur: 0.5, type: 'sawtooth', vol: 0.18 }); noise({ dur: 0.4, vol: 0.1, freq: 700, at: 0.05 }); tone({ f0: 330, f1: 660, dur: 0.6, type: 'triangle', vol: 0.12, at: 0.35 }); },
  star(i = 0) { tone({ f0: 784 * Math.pow(1.26, i), dur: 0.5, vol: 0.18, at: 0 }); tone({ f0: 1568 * Math.pow(1.26, i), dur: 0.4, vol: 0.06 }); },
  right() { tone({ f0: 660, dur: 0.1, vol: 0.18 }); tone({ f0: 990, dur: 0.18, vol: 0.18, at: 0.09 }); },
  wrong() { tone({ f0: 220, f1: 150, dur: 0.28, type: 'sawtooth', vol: 0.14 }); },
};
