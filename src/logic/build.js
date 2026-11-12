// Build a Vault: validation and challenge links. Pure logic.
import { solidArea, outerRingEmpty } from './grid.js';
import { encodeVault, decodeVault } from './codec.js';
import { MIN_FRAC, MAX_FRAC } from './daily.js';

export const BUILD_N = 10;
const blocks = v => (Math.round(v * 2) / 2);

// -> { ok, problems: [string], percent } where each problem tells the student what to fix.
export function validateVault(g) {
  const problems = [];
  const n = g.n, total = n * n, area = solidArea(g);
  const percent = Math.round((area / total) * 1000) / 10;
  if (!outerRingEmpty(g)) {
    problems.push('Clear the outer ring. The edge cells must stay empty so balls can roll in.');
  }
  if (area / total < MIN_FRAC) {
    const need = blocks(Math.ceil((MIN_FRAC * total - area) * 2) / 2);
    problems.push(area === 0 ? 'The vault is empty. Paint an object inside it.' : `Too small (${percent}% solid). Add about ${need} more block${need === 1 ? '' : 's'}. A triangle counts as half.`);
  } else if (area / total > MAX_FRAC) {
    const cut = blocks(Math.ceil((area - MAX_FRAC * total) * 2) / 2);
    problems.push(`Too big (${percent}% solid). Remove about ${cut} block${cut === 1 ? '' : 's'}. A triangle counts as half.`);
  }
  return { ok: problems.length === 0, problems, percent };
}

export const HASH_PREFIX = '#v=';
export function challengeLink(base, g) { return base.split('#')[0] + HASH_PREFIX + encodeVault(g); }
// '#v=<code>' -> { code, grid } for a playable vault, null if the hash is not a challenge link at all,
// or { code, grid: null } when it is one but the code is broken or not a fair vault.
export function parseChallengeHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(HASH_PREFIX)) return null;
  const code = hash.slice(HASH_PREFIX.length);
  const g = decodeVault(code);
  if (!g || g.n !== BUILD_N || !validateVault(g).ok) return { code, grid: null };
  return { code, grid: g };
}
// Small stable number from a code string, used as the counter-evidence seed.
export function codeSeed(code) { let h = 2166136261; for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) || 1; }
