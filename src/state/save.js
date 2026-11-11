// localStorage persistence. Everything is wrapped in try/catch: the game works without it.
import { rankFor } from '../logic/score.js';
import { cardsForCase } from '../data/cards.js';

const KEY = 'sealed.v1';
const blank = () => ({ stars: {}, best: {}, cards: [], mm: { best: 0, bestStreak: 0 }, daily: {}, settings: { quality: 'med', muted: false }, seenHow: false });
let data = blank();
let memoryOnly = false;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw); data = { ...blank(), ...p, settings: { ...blank().settings, ...(p.settings || {}) }, mm: { ...blank().mm, ...(p.mm || {}) } }; }
  } catch { memoryOnly = true; }
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
