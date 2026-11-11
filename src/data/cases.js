// The six hand-authored cases. Maps: first line is the NORTH row. '.' empty, 1 block, 2 NE, 3 SE, 4 SW, 5 NW triangle.
// `script` is a probe list (0-based keys) that the unit tests use to prove each case can be solved within budget.
import { fromAscii } from '../logic/grid.js';

const range = (side, a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(`b:${side}${i}`); return o; };
const xr = (axis, a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(`x:${axis}${i}`); return o; };

export const CASES = [
  {
    id: 1, name: 'The Crate', n: 8, budget: 200, probes: ['bounce'],
    blurb: 'A crate is sealed in the vault. Where is it?',
    teaches: 'Balls that hit something come back. Balls that miss go straight through.',
    map: [
      '........',
      '..111...',
      '..111...',
      '..111...',
      '........',
      '........',
      '........',
      '........',
    ],
    script: [...range('W', 0, 7), ...range('S', 0, 7)],
  },
  {
    id: 2, name: 'The Bracket', n: 8, budget: 220, probes: ['bounce'],
    blurb: 'A metal bracket. Choose your shots well and you need fewer of them.',
    teaches: 'Good probes beat lots of probes.',
    map: [
      '........',
      '..1.....',
      '..1.....',
      '..1.....',
      '..1.....',
      '..1111..',
      '........',
      '........',
    ],
    script: [...range('W', 1, 7), ...range('E', 1, 7)],
  },
  {
    id: 3, name: 'The Prism', n: 8, budget: 240, probes: ['bounce'],
    blurb: 'Something with slanted sides. Watch where the balls come out.',
    teaches: 'A slanted face turns a ball. The exit tells you about the slope.',
    map: [
      '........',
      '...34...',
      '..3114..',
      '.311114.',
      '.211115.',
      '..2115..',
      '...25...',
      '........',
    ],
    script: [...range('W', 1, 6), ...range('E', 1, 6), ...range('N', 2, 5), ...range('S', 2, 5)],
  },
  {
    id: 4, name: 'The Ring', n: 10, budget: 300, probes: ['bounce', 'xray'],
    blurb: 'Balls bounce off the outside. What is on the inside?',
    teaches: 'Bounce balls cannot see inside. A new kind of data can change your model.',
    map: [
      '..........',
      '..........',
      '.111111...',
      '.1....1...',
      '.1....1...',
      '.1....1...',
      '.1....1...',
      '.111111...',
      '..........',
      '..........',
    ],
    script: [...range('W', 2, 7), ...range('E', 2, 7), ...xr('row', 2, 7)],
  },
  {
    id: 5, name: 'The Pair', n: 10, budget: 320, probes: ['bounce', 'xray', 'scale'],
    blurb: 'Two objects in one vault. One has a slanted side.',
    teaches: 'The same data can fit more than one model. Test yours.',
    map: [
      '..........',
      '.111......',
      '.111......',
      '.111......',
      '..........',
      '....1115..',
      '....11111.',
      '....11111.',
      '..........',
      '..........',
    ],
    script: [...range('W', 1, 8), ...range('E', 1, 8), ...range('S', 1, 8), ...range('N', 5, 7), 's'],
  },
  {
    id: 6, name: 'The Relic', n: 10, budget: 380, probes: ['bounce', 'xray', 'scale', 'thermal'],
    blurb: 'An old relic with a notch and a hole inside. Use every tool.',
    teaches: 'Combine different kinds of data. The thermal camera is blurry on purpose.',
    map: [
      '..........',
      '.311114...',
      '.111111...',
      '.11..11...',
      '.11..11...',
      '.111111...',
      '.111.11...',
      '.21..15...',
      '..........',
      '..........',
    ],
    script: [...range('W', 1, 8), ...range('E', 1, 8), ...xr('row', 5, 6), ...xr('col', 3, 4), 's', 't'],
  },
];
for (const c of CASES) { c.grid = fromAscii(c.map); c.seed = c.id * 7919; }
export const caseById = id => CASES.find(c => c.id === id);
