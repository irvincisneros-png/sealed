// Model Match round rules: question pick and scoring. Pure logic.
import { shuffle } from './generate.js';

export const ROUND = { questions: 10, seconds: 90, base: 10, streakStep: 2, streakCap: 5 };

// Pick `count` distinct questions: half "what", half "need" (as near as the bank allows), shuffled.
// `avoid` is a set of stems from the last round, used first-come to keep rounds fresh when the bank allows.
export function pickQuestions(bank, r, count = ROUND.questions, avoid = new Set()) {
  const split = kind => {
    const all = shuffle(bank.filter(q => q.kind === kind), r);
    return [...all.filter(q => !avoid.has(q.stem)), ...all.filter(q => avoid.has(q.stem))];
  };
  const a = split('what'), b = split('need');
  const half = Math.floor(count / 2);
  const out = [...a.slice(0, half), ...b.slice(0, count - half)];
  // top up from whatever is left if one kind is short
  if (out.length < count) for (const q of shuffle(bank, r)) { if (out.length >= count) break; if (!out.includes(q)) out.push(q); }
  return shuffle(out, r);
}
// Points for a right answer when `streak` is the run length including this answer (1 = first in a row).
export function pointsFor(streak) { return ROUND.base + Math.min(streak - 1, ROUND.streakCap) * ROUND.streakStep; }
export const newRound = () => ({ score: 0, streak: 0, bestStreak: 0, right: 0, answered: 0 });
export function applyAnswer(s, correct) {
  const streak = correct ? s.streak + 1 : 0;
  return { score: s.score + (correct ? pointsFor(streak) : 0), streak, bestStreak: Math.max(s.bestStreak, streak), right: s.right + (correct ? 1 : 0), answered: s.answered + 1 };
}
