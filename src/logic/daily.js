// Daily Vault: date keys, labels and a fair seeded vault. Pure logic.
import { generateVault, dailySeed } from './generate.js';
import { solidArea, outerRingEmpty, bounds } from './grid.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAILY_N = 10;
export const DAILY_BUDGET = 340;

// Local date -> 'YYYYMMDD' (also the generator seed).
export function dateKey(date = new Date()) { return String(dailySeed(date)); }
// Local date -> '12 Nov' (fixed English names so it does not depend on the device language).
export function dateLabel(date = new Date()) { return `${date.getDate()} ${MONTHS[date.getMonth()]}`; }

export const MIN_FRAC = 0.08, MAX_FRAC = 0.35;
// A vault is fair to play when: the outer ring is empty (balls can get in), it is 8-35% solid,
// and it is a real object (at least 6 solid cells, at least 2 cells across each way), not a speck.
export function isFairVault(g) {
  if (!outerRingEmpty(g)) return false;
  const frac = solidArea(g) / (g.n * g.n);
  if (frac < MIN_FRAC || frac > MAX_FRAC) return false;
  const b = bounds(g);
  if (!b || b.x1 - b.x0 < 1 || b.y1 - b.y0 < 1) return false;
  return g.cells.filter(Boolean).length >= 6;
}
// The vault for a date. Same date -> same vault on every device. Unfair seeds step to the next derived seed.
export function dailyVault(date = new Date()) {
  const seed = dailySeed(date);
  for (let k = 0; k < 50; k++) {
    const g = generateVault(seed + k * 7919, DAILY_N, 2);
    if (isFairVault(g)) return { grid: g, seed, key: dateKey(date) };
  }
  throw new Error('no fair daily vault found'); // unreachable in practice; tests cover many dates
}
