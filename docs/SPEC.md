# SEALED — crack the vault without opening it

Year 8 Data Science (NSW), dot points:

- **8.2.2** A scientific model is a representation based on data and observations of real-world phenomena.
- **8.2.3** Examples of the types of models used by scientists.

Browser game, static site (GitHub Pages later). Vanilla ES modules, vendored three r170 in `vendor/three/`, no build step, no network calls. Australian English. Dev: `python3 devserver.py 8490`.

## The idea in one line

Something is sealed in a vault. You can't open it. You buy probes, collect observations, draw a model of what's inside, check the model against your data, revise it when new data arrives, then the vault opens and your model is overlaid on the real thing.

The learning point the reveal must land every time: **your model was built from your observations; it matched the data you had; it is still a representation, not the object.** More and better data gives a better model.

## Core rules (pure logic, `src/logic/`, unit-tested with `node --test`)

### Grid and pieces
Vault floor is an N×N grid (N = 8 or 10 per case). Coordinates: x east 0..N-1, y north 0..N-1. Cell values:

| value | piece | solid region |
|---|---|---|
| 0 | empty | — |
| 1 | full block | whole cell |
| 2 | NE triangle | half-cell touching the NE corner, corner vector c = (1, 1) |
| 3 | SE triangle | c = (1, -1) |
| 4 | SW triangle | c = (-1, -1) |
| 5 | NW triangle | c = (-1, 1) |

The hidden object and the student's model use the same representation, so every probe can be run on both.

### Slots
4N launch slots around the edge: `{side: 'N'|'E'|'S'|'W', i: 0..N-1}`. A ball from side W slot i enters row y=i travelling east (1,0); S slot i enters column x=i travelling north; and so on.

### Probe 1 — Bounce ball
`trace(grid, slot) -> {exit: slot, kind: 'through'|'reflected'|'deflected', path: [cells]}`

Ball moves cell to cell with direction d. On attempting to enter a cell:
- empty → enter, continue.
- full → do not enter; reverse direction.
- triangle with corner vector c: if d·c > 0 (it meets the sloped face) → enter, new d = d − c (a 90° turn), continue from that cell. Otherwise (it meets a flat face) → do not enter; reverse.

Ball ends when it leaves the grid; exit slot is the edge cell it left through. `through` = exits the opposite side on the same line; `reflected` = exit equals entry; otherwise `deflected`. Guard: after 4N² steps return kind `'lost'` (should never happen; test that it doesn't on random grids). `path` is used only for the reveal replay, never shown before the reveal.

### Probe 2 — X-ray
`xray(grid, {axis:'row'|'col', i}) -> number` total solid thickness along the line (full = 1, triangle = 0.5). Sees hollow insides that bounce balls can't.

### Probe 3 — Scale
`weigh(grid) -> number` total solid area. Once per case.

### Probe 4 — Thermal camera
`thermal(grid) -> (N/2)×(N/2) array` each value = mean solid fraction of a 2×2 block, quantised to 0, 0.25, 0.5, 0.75, 1 (round to nearest). Blurry on purpose: low-resolution data gives a low-resolution model.

### Checking a model against data
`checkModel(model, observations) -> [{obs, predicted, ok}]` reruns every collected observation on the student's model. This is free and live.

### Match score
Split every cell by both diagonals into 4 wedges (N, E, S, W). Full = all 4; NE triangle = N+E; SE = S+E; SW = S+W; NW = N+W. `match(model, truth)` = intersection / union of wedge sets, as a percentage (both empty = 100).

### Counter-evidence ("new data arrives")
`counterEvidence(model, truth, alreadyFired, k=3)` returns up to k bounce slots (not already fired) where `trace(model)` and `trace(truth)` exit differently; if there are fewer, fill with x-ray lines that differ. Deterministic order (seeded shuffle with case seed).

### Seeded generator and share codes
- `rng(seed)` mulberry32. `generateVault(seed, N, difficulty)` builds 1–3 connected blobs with some triangle corners and optionally a hollow; must contain between 8% and 35% solid area and leave the outer ring of cells empty.
- `encodeVault(grid)` / `decodeVault(str)` — compact URL-safe string (N + base-6 digits packed to base64url). Round-trip tested.
- Daily vault seed = `YYYYMMDD` local date.

## Game flow

### Screens
1. **Title**: SEALED, tagline, Play / Daily Vault / Build a Vault / Model Cards / How to play. Rank badge. Small footer line with the two dot points.
2. **Case select**: 6 cases as vault doors with stars and best score; locked until the previous has ≥1 star.
3. **Case** (main screen): 3D vault centre; HUD = budget, probe toolbar, data log, model tools, "Check model" readout, Submit.
4. **New data** interstitial after first submit (cases 2+): "A second team ran 3 more probes. Their results don't fit your model." The counter-evidence results are added to the log for free, mismatches flagged; student revises then presses Final submit. If counter-evidence is empty (model already perfect) skip straight to reveal with a "Your model survived every test" line.
5. **Reveal**: vault lid opens (≈3 s animation); real object revealed; student model shown as a translucent hologram over it; wedges coloured: both = green, model only = red, missed = amber. Match % counts up. Then one replay of a deflected ball's true path. Results card: match %, stars, data fit (x of y observations explained), budget left, score, and one reflection sentence chosen by outcome:
   - fit all data but match < 95: "Your model explained every observation you had — and it still wasn't the real thing. A model is only as good as the data behind it."
   - match ≥ 95: "Enough good data and your model became a very close representation. It's still a model: it shows shape, not what the object is made of."
   - data fit < 100%: "Your model disagreed with some of your own observations. Scientists change the model, not the data."
6. **Card unlock**: 2 model cards flip in after each case's first clear.
7. **Model Cards** gallery + **Model Match** boss round (unlocks after case 4).

### Probing UX
- Pick a probe tool, then click an edge port (bounce) or a row/column marker (x-ray). Balls visibly roll into the port, vanish under the lid, and pop out of the exit port ≈0.8 s later. A coloured arc above the lid links entry and exit ports and stays; each bounce gets a number label matching its log row. Reflected = short loop at the port. X-ray = beam sweeps across the lid; the thickness number sits at the line's end.
- Each probe costs money: bounce $10, x-ray $25, scale $15, thermal $60. Can't fire the same bounce slot or x-ray line twice (already known). When the budget can't afford anything, only modelling remains.
- Data log panel lists observations ("#4 Ball W3 → N6 deflected", "X-ray row 5: 2.5 thick"), each with a ✓/✗ once a model exists (does the current model predict it?). Hovering/tapping a row highlights it in 3D.

### Modelling UX
- "Model" mode toggle: the lid becomes a blueprint grid. Tools: block, the four triangles (shown as icons), eraser; click or drag to paint. Undo, Clear.
- "Check model": readout "Your model explains 7 of 9 observations", live.
- Submit needs at least 1 painted cell and at least 3 observations.

### Scoring
- Stars: match ≥ 60 ★, ≥ 80 ★★, ≥ 95 ★★★.
- Score = round(match × 10) + (match ≥ 60 ? budget left : 0) + 50 if data fit is 100%.
- Final match is from the final submission. The draft match is never shown before the reveal.

### Cases (hand-authored in `src/data/cases.js`; ASCII maps the agent must author and unit-test for intended solvability)

| # | Name | N | Budget | Probes | Hidden object | Teaches |
|---|---|---|---|---|---|---|
| 1 | The Crate | 8 | $200 | bounce | 3×3 block off-centre | reflected vs through; guided tutorial with coach marks |
| 2 | The Bracket | 8 | $220 | bounce | L-shape | fewer probes needed if you choose them well |
| 3 | The Prism | 8 | $240 | bounce | diamond/triangle made with triangle pieces | deflection; a sloped face |
| 4 | The Ring | 10 | $300 | bounce, x-ray | hollow square ring | bounce can't see inside; a new kind of data changes the model |
| 5 | The Pair | 10 | $320 | bounce, x-ray, scale | two separate objects, one with a sloped side | data can fit more than one model |
| 6 | The Relic | 10 | $380 | all four | irregular object with a notch and a hollow | combine data types; thermal is blurry |

Plus **Daily Vault** (seeded, N=10, $340, all probes; available after case 3) and **Build a Vault** (paint a vault with the same tools, get a link `#v=<code>`; opening the link plays that vault with $340, all probes; no stars saved).

### Model cards (`src/data/cards.js`) — covers 8.2.3
12 cards, 3 per type. Each has: name, type, what it represents, **built from** (the data/observations), **leaves out** (a limitation), and a simple authored SVG icon (no AI images, no photos).

- **Physical**: globe; ball-and-stick molecule model; crash-test dummy.
- **Diagram / conceptual**: particle model of matter; food web; water cycle diagram.
- **Mathematical**: speed = distance ÷ time; line of best fit on a graph; mark–recapture population estimate.
- **Computer simulation**: weather forecast; bushfire spread prediction; virtual wind tunnel.

**Model Match** boss round: 10 questions in 90 s from a bank of ≥ 24. Two kinds: "Which type of model is this?" and "A scientist needs to … which type of model fits best?". Four type buttons. Streak bonus. Wrong answers show the card's one-line reason. Keep reading load low (≤ 20 words a question).

### Progression
Rank by total stars (18 max from cases): 0 Intern, 4 Field Tech, 9 Analyst, 14 Chief Modeller. Rank shows on title and results. No lives, no fail state; any case can be retried.

Save to `localStorage` key `sealed.v1` (wrapped in try/catch; game works without it): stars, best scores, cards, model-match best, daily results by date, settings.

No leaderboard backend. Results card has a "Copy result" button producing e.g. `SEALED Daily 12 Nov — 87% ★★ — $110 left` for the class to compare.

## Look and feel — this is a hard requirement, not polish for later

Owner standard: scenes must look authored and real, not primitives with flat colours. No AI-generated images.

- **Scene**: a bank-vault strongbox on a dark workshop bench, seen from a 3/4 top-down camera (slight orbit drag allowed, ±25°, snaps back). Brushed-steel body with bevelled edges, rivets, a thick frosted-glass/steel lid, brass launch ports around the rim with small status LEDs. PBR materials (MeshStandard/Physical), an environment map from `vendor/three/environments/RoomEnvironment`, soft shadows, subtle vignette, gentle dust motes. ACES tone mapping.
- **Probes**: chrome ball bearing with motion trail; arcs are glowing tubes with per-probe colours from a colour-blind-safe palette; x-ray is a cyan sheet sweep with scanline shimmer; thermal is a heat-tinted projection on the lid.
- **Blueprint mode**: lid shows a holographic cyan grid; painted pieces are translucent extruded prisms.
- **Reveal**: lid unlocks (bolts retract, LEDs go green), slides back; warm light spills out; the object is a gold/bronze artefact made by extruding the pieces with bevels (merge adjacent pieces so it reads as one object, not tiles). Camera pushes in.
- **UI**: DOM overlay, dark industrial theme, amber + cyan accents, one display font + Mulish (copy `../reflex-lab/fonts/mulish-*.ttf`; pick a free-licence display font already on disk or use a system stack). Large touch targets (≥ 44 px).
- **Audio**: small WebAudio synth blips (launch, clunk, deflect ping, x-ray hum, unlock, star chime). Mute button. No audio files.
- **Performance**: must hold 30 fps on a school Chromebook. Quality setting (Low/Med/High): caps pixel ratio (1 / 1.5 / 2), toggles shadows and motes. Default Med; auto-drop to Low if the first 2 s average under 28 fps.
- **Responsive**: works at 375×667 (HUD collapses to bottom sheet tabs: Probes / Data / Model) and at 1366×768 (Chromebook). No horizontal scroll.
- **Accessibility**: never colour alone (✓/✗ icons, numbered arcs); keyboard: 1–4 probe tools, M model mode, arrow keys + Enter to pick ports; `prefers-reduced-motion` shortens animations.

## Structure

```
index.html  styles.css  devserver.py  package.json ("test": "node --test tests/*.test.mjs")
src/main.js            boot, screen router
src/logic/             grid.js trace.js probes.js score.js generate.js codec.js (pure, no DOM)
src/data/              cases.js cards.js questions.js
src/state/             save.js game.js (case session state machine: probing → draft → newdata → final → reveal)
src/render/            scene.js vault.js probesFx.js blueprint.js reveal.js quality.js
src/ui/                hud.js log.js screens.js cardsUi.js modelMatch.js coach.js
src/audio/sfx.js
tests/                 logic.test.mjs cases.test.mjs
```

Expose `window.__sealed = { state, logic }` for playtesting only.

## Tests (must pass)

- trace: through, reflected off block, each triangle orientation turns both ways correctly, flat-face reverse, reversibility (trace from exit returns to entry) on 200 random grids, never `lost`.
- xray/weigh/thermal values on fixtures.
- match: identical = 100, disjoint = 0, triangle vs full = 50.
- counterEvidence returns only slots that actually differ and none already fired.
- codec round-trip on 200 random grids; generator obeys area limits and is deterministic per seed.
- cases: every hand-authored case can reach ≥ 95% within budget using a scripted probe list stored beside the case (proves solvability), and the outer ring is empty.

## Out of scope for v1
Accounts, online leaderboard, avatars, story text beyond one line per case, teacher dashboard.
