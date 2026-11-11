// Blueprint painting prisms + reveal (artefact, hologram overlay, lid opening).
import * as THREE from 'three';
import { cellToWorld, LID_TOP, FLOOR_Y } from './vault.js';
import { wedgeSets } from '../logic/score.js';
import { blueprintGrid } from './textures.js';
import { CORNER } from '../logic/grid.js';

const H = 0.48;
function shape(v) {
  const s = new THREE.Shape();
  if (v === 1) { s.moveTo(-H, -H); s.lineTo(H, -H); s.lineTo(H, H); s.lineTo(-H, H); }
  else { const [sx, sy] = CORNER[v]; s.moveTo(sx * H, sy * H); s.lineTo(-sx * H, sy * H); s.lineTo(sx * H, -sy * H); }
  s.closePath(); return s;
}
const geoCache = new Map();
function prism(v, depth, bevel) {
  const k = v + ':' + depth;
  if (!geoCache.has(k)) {
    const g = new THREE.ExtrudeGeometry(shape(v), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2); geoCache.set(k, g);
  }
  return geoCache.get(k);
}

export class Blueprint {
  constructor(stage) {
    this.stage = stage; this.group = new THREE.Group(); this.cells = new THREE.Group(); this.group.add(this.cells);
    stage.scene.add(this.group);
    this.mat = new THREE.MeshPhysicalMaterial({ color: 0x35d0e6, emissive: 0x0a7f96, emissiveIntensity: 0.8, transparent: true, opacity: 0.6, roughness: 0.2, metalness: 0.1, clearcoat: 1 });
    this.holo = null;
  }
  attach(vault) {
    this.vault = vault; this.n = vault.n;
    if (this.holo) this.group.remove(this.holo);
    this.holo = new THREE.Mesh(new THREE.PlaneGeometry(this.n, this.n), new THREE.MeshBasicMaterial({ map: blueprintGrid(this.n), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }));
    this.holo.rotation.x = -Math.PI / 2; this.holo.position.y = LID_TOP + 0.015; this.holo.renderOrder = 1;
    this.group.add(this.holo);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.05, 0.96), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.4, depthWrite: false }));
    this.ghost.visible = false; this.group.add(this.ghost);
    this.setModel(null);
  }
  setModeVisual(on) { this.on = on; this.holo.material.opacity = on ? 1 : 0; this.mat.opacity = on ? 0.7 : 0.3; }
  setGhost(cell) {
    if (!cell || !this.on) { this.ghost.visible = false; return; }
    const p = cellToWorld(this.n, cell.x, cell.y); this.ghost.position.set(p.x, LID_TOP + 0.04, p.z); this.ghost.visible = true;
  }
  setModel(model) {
    while (this.cells.children.length) this.cells.remove(this.cells.children[0]);
    if (!model) return;
    for (let y = 0; y < model.n; y++) for (let x = 0; x < model.n; x++) {
      const v = model.cells[y * model.n + x]; if (!v) continue;
      const m = new THREE.Mesh(prism(v, 0.22, 0.025), this.mat); const p = cellToWorld(model.n, x, y);
      m.position.set(p.x, LID_TOP + 0.03, p.z); this.cells.add(m);
    }
  }
  hide() { this.group.visible = false; }
  show() { this.group.visible = true; }
}

// ---- reveal
export function playReveal(stage, vault, truth, model, onDone) {
  const n = truth.n;
  const art = new THREE.Group(); art.visible = false;
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a24a, metalness: 1, roughness: 0.28 });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = truth.cells[y * n + x]; if (!v) continue;
    const m = new THREE.Mesh(prism(v, 0.8, 0.04), gold); const p = cellToWorld(n, x, y);
    m.position.set(p.x, 0, p.z); m.castShadow = m.receiveShadow = true; art.add(m);
  }
  vault.platform.add(art);
  // hologram of the model, coloured by wedge
  const sets = wedgeSets(model, truth);
  const bufs = { both: [], modelOnly: [], missed: [] };
  const wedge = [[1, 0, 1], [2, 1, 0], [4, 0, -1], [8, -1, 0]]; // bit, dx, dy of the wedge centre direction (N,E,S,W)
  const corners = { 1: [[-.5, .5], [.5, .5]], 2: [[.5, .5], [.5, -.5]], 4: [[.5, -.5], [-.5, -.5]], 8: [[-.5, -.5], [-.5, .5]] };
  sets.forEach((s, i) => {
    const cx = i % n, cy = Math.floor(i / n), p = cellToWorld(n, cx, cy);
    for (const k of ['both', 'modelOnly', 'missed']) for (const bit of [1, 2, 4, 8]) if (s[k] & bit) {
      const [a, b] = corners[bit];
      bufs[k].push(p.x, 0, p.z, p.x + a[0], 0, p.z - a[1], p.x + b[0], 0, p.z - b[1]);
    }
  });
  const holo = new THREE.Group(); holo.visible = false;
  const cols = { both: 0x2ee86a, modelOnly: 0xff4a3a, missed: 0xffb020 };
  for (const k in bufs) if (bufs[k].length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(bufs[k], 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: cols[k], transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    holo.add(m);
  }
  holo.position.y = 0.92; vault.platform.add(holo);
  stage.setMode('reveal');
  let t = 0;
  const lidY0 = vault.lid.position.y, lidZ0 = vault.lid.position.z;
  const slide = -(n + 1.6);
  const ease = x => x * x * (3 - 2 * x);
  vault.setAllLeds(0x2ee86a, 2.2);
  const off = stage.addUpdater(dt => {
    t += dt;
    const e1 = Math.min(1, t / 0.8), e2 = Math.min(1, Math.max(0, (t - 0.8) / 1.4)), e3 = Math.min(1, Math.max(0, (t - 2.2) / 0.5));
    for (const l of vault.latches) l.userData.bar.position.copy(l.userData.bar.userData.dir).multiplyScalar(0.8 * ease(e1));
    vault.lid.position.y = lidY0 + 0.5 * ease(Math.min(1, e1 + e2)) - 1.45 * ease(e3);
    vault.lid.position.z = lidZ0 + slide * ease(e2);
    stage.spill.intensity = 40 * ease(e2);
    if (t > 2.0) { art.visible = true; vault.platform.position.y = FLOOR_Y + 0.75 * ease(Math.min(1, (t - 2.0) / 1.2)); }
    if (t > 3.3 && !holo.visible) { holo.visible = true; onDone?.(); off(); }
  });
  return { art, holo, destroy() { vault.platform.remove(art, holo); } };
}
