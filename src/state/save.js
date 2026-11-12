// localStorage persistence. Everything is wrapped in try/catch: the game works without it.
import { rankFor } from '../logic/score.js';
import { CARDS, cardsForCase } from '../data/cards.js';

const KEY = 'sealed.v1';
const blank = () => ({ stars: {}, best: {}, cards: [], mm: { best: 0, bestStreak: 0 }, daily: {}, settings: { quality: 'med', muted: false }, seenHow: false });
let data = blank();
let memoryOnly = false;

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const numMap = v => { const o = {}; if (isObj(v)) for (const [k, x] of Object.entries(v)) if (k !== '__proto__' && isNum(x)) o[k] = x; return o; };
const DAILY_KEYS = ['match', 'stars', 'left', 'score'];
const dailyMap = v => {
  const o = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (k !== '__proto__' && isObj(x) && DAILY_KEYS.every(f => isNum(x[f]))) o[k] = Object.fromEntries(DAILY_KEYS.map(f => [f, x[f]]));
  return o;
};
// Pure: turn whatever was parsed from storage into a valid save, falling back to defaults per field.
export function sanitise(parsed) {
  const d = blank(), p = isObj(parsed) ? parsed : {};
  const known = new Set(CARDS.map(c => c.id));
  d.stars = numMap(p.stars);
  d.best = numMap(p.best);
  d.daily = dailyMap(p.daily);
  d.cards = Array.isArray(p.cards) ? [...new Set(p.cards.filter(c => typeof c === 'string' && known.has(c)))] : [];
  // cards that were renamed or replaced: re-grant the current cards for any case already cleared
  for (const id of Object.keys(d.stars)) if (d.stars[id] >= 1) for (const c of cardsForCase(Number(id))) if (!d.cards.includes(c.id)) d.cards.push(c.id);
  const s = isObj(p.settings) ? p.settings : {}, m = isObj(p.mm) ? p.mm : {};
  d.settings = { quality: ['low', 'med', 'high'].includes(s.quality) ? s.quality : d.settings.quality, muted: typeof s.muted === 'boolean' ? s.muted : d.settings.muted };
  d.mm = { best: isNum(m.best) ? m.best : 0, bestStreak: isNum(m.bestStreak) ? m.bestStreak : 0 };
  d.seenHow = p.seenHow === true;
  return d;
}
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = sanitise(JSON.parse(raw));
  } catch { memoryOnly = true; data = blank(); }
  return data;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { memoryOnly = true; } }
export const get = () => data;
export const isMemoryOnly = () => memoryOnly;
export function reset() { data = blank(); persist(); }

export const starsFor = id => data.stars[id] || 0;
export const totalStars = () => Object.values(data.stars).reduce((a, b) => a + b, 0);
export const rank = () => rankFor(totalStars());
export const caseUnlocked = id => id === 1 || starsFor(id - 1) >= 1;
export const dailyUnlocked = () => starsFor(3) >= 1;
export const matchUnlocked = () => starsFor(4) >= 1;
export const hasCard = id => data.cards.includes(id);

export function recordCase(caseId, result) {
  const first = starsFor(caseId) === 0 && result.stars >= 1;
  data.stars[caseId] = Math.max(starsFor(caseId), result.stars);
  data.best[caseId] = Math.max(data.best[caseId] || 0, result.score);
  const newCards = [];
  if (result.stars >= 1) for (const c of cardsForCase(caseId)) if (!hasCard(c.id)) { data.cards.push(c.id); newCards.push(c.id); }
  persist();
  return { first, newCards };
}
export function recordDaily(dateKey, result) {
  const prev = data.daily[dateKey];
  if (!prev || result.score > prev.score) data.daily[dateKey] = { match: Math.round(result.match), stars: result.stars, left: result.budgetLeft, score: result.score };
  persist();
}
export function recordMatch(score, streak) {
  data.mm.best = Math.max(data.mm.best, score); data.mm.bestStreak = Math.max(data.mm.bestStreak, streak); persist();
}
export function unlockCard(id) { if (!hasCard(id)) { data.cards.push(id); persist(); return true; } return false; }
export function setSetting(k, v) { data.settings[k] = v; persist(); }
export function markSeenHow() { data.seenHow = true; persist(); }
