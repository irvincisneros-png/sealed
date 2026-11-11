// The strongbox: brushed-steel body, brass ports with LEDs, glass-topped lid, latches, lift platform.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { brushedSteel, etchedGrid, engraveTexture } from './textures.js';
import { allSlots, slotKey } from '../logic/trace.js';

export const LID_TOP = 0.35;
export const LEDGE_Y = 0;
export const FLOOR_Y = -1.1;
export const BODY_H = 1.5;

export const cellToWorld = (n, x, y) => new THREE.Vector3(x - n / 2 + 0.5, 0, -(y - n / 2 + 0.5));
export const worldToCell = (n, p) => ({ x: Math.floor(p.x + n / 2), y: Math.floor(-p.z + n / 2) });

export function portFrame(n, slot) {
  const half = n / 2, d = half + 0.62, i = slot.i;
  switch (slot.side) {
    case 'W': return { pos: new THREE.Vector3(-d, 0, -(i - half + 0.5)), out: new THREE.Vector3(-1, 0, 0), rotY: -Math.PI / 2 };
    case 'E': return { pos: new THREE.Vector3(d, 0, -(i - half + 0.5)), out: new THREE.Vector3(1, 0, 0), rotY: Math.PI / 2 };
    case 'S': return { pos: new THREE.Vector3(i - half + 0.5, 0, d), out: new THREE.Vector3(0, 0, 1), rotY: 0 };
    default: return { pos: new THREE.Vector3(i - half + 0.5, 0, -d), out: new THREE.Vector3(0, 0, -1), rotY: Math.PI };
  }
}
// where a ball enters/leaves: the dark mouth on the port's outer face
export function portMouth(n, slot) { const f = portFrame(n, slot); return f.pos.clone().addScaledVector(f.out, 0.22).setY(0.14); }
export function portStart(n, slot) { const f = portFrame(n, slot); return f.pos.clone().addScaledVector(f.out, 0.22 + 0.62).setY(0.13); }

export function createMaterials(aniso) {
  const body = brushedSteel({ base: 118, seed: 5, repeat: [3, 1] });
  const lidSteel = brushedSteel({ base: 150, seed: 9, repeat: [2, 2] });
  const dark = brushedSteel({ base: 62, seed: 21, repeat: [2, 2], streak: 16 });
  const m = {
    body: new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 0.95, roughness: 0.42, map: body.map, roughnessMap: body.rough, bumpMap: body.bump, bumpScale: 0.6 }),
    lid: new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.95, roughness: 0.36, map: lidSteel.map, roughnessMap: lidSteel.rough, bumpMap: lidSteel.bump, bumpScale: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x8c949c, metalness: 0.9, roughness: 0.55, map: dark.map, roughnessMap: dark.rough, bumpMap: dark.bump, bumpScale: 0.4 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xcfa45c, metalness: 1, roughness: 0.22 }),
    brassDull: new THREE.MeshStandardMaterial({ color: 0xa87a32, metalness: 1, roughness: 0.45 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b141c, metalness: 0.1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, reflectivity: 0.6 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x020304 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9, metalness: 0 }),
  };
  for (const t of [body, lidSteel, dark]) for (const k of Object.values(t)) k.anisotropy = aniso;
  return m;
}

export const LED = { idle: 0xffa21a, hover: 0xfff0b0, off: 0x2a2014, green: 0x2ee86a, red: 0xff4a3a };

export class Vault {
  constructor(n, quality) {
    this.n = n;
    this.group = new THREE.Group();
    this.mats = createMaterials(quality.aniso);
    this.ports = new Map();       // slotKey -> { group, led, ledMat, hit, slot }
    this.hits = [];
    this.build();
  }

  build() {
    const { n, mats, group } = this;
    const half = n / 2, cav = half + 0.02, B = half + 1.75, T = B - cav;
    const add = (geo, mat, x, y, z, { cast = true, receive = true, parent = group } = {}) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
    };
    const rb = (w, h, d, r = 0.07, s = 3) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    this.B = B; this.half = half;

    // body: base + ring of four bars (the cavity inside is only visible once the lid is off)
    add(rb(2 * B, 0.4, 2 * B, 0.1), mats.dark, 0, -BODY_H + 0.2, 0);
    add(rb(2 * B, BODY_H, T, 0.09), mats.body, 0, -BODY_H / 2, -(cav + T / 2));
    add(rb(2 * B, BODY_H, T, 0.09), mats.body, 0, -BODY_H / 2, cav + T / 2);
    add(rb(T, BODY_H, 2 * cav, 0.09), mats.body, -(cav + T / 2), -BODY_H / 2, 0);
    add(rb(T, BODY_H, 2 * cav, 0.09), mats.body, cav + T / 2, -BODY_H / 2, 0);
    // chunky feet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.34, 0.4, 0.14, 20), mats.rubber, sx * (B - 0.55), -BODY_H - 0.01, sz * (B - 0.55), { receive: false });
    // inner cavity walls for the reveal (dark, so they read as depth)
    const inner = new THREE.Group(); group.add(inner); this.inner = inner;
    const wallMat = mats.dark;
    for (const [w, d, x, z] of [[2 * cav, 0.04, 0, -cav + 0.02], [2 * cav, 0.04, 0, cav - 0.02], [0.04, 2 * cav, -cav + 0.02, 0], [0.04, 2 * cav, cav - 0.02, 0]]) add(new THREE.BoxGeometry(w, BODY_H - 0.4, d), wallMat, x, -BODY_H / 2 + 0.2, z, { parent: inner, cast: false });

    // lift platform (rises at the reveal)
    this.platform = new THREE.Group(); group.add(this.platform);
    this.platform.position.y = FLOOR_Y;
    add(rb(2 * cav - 0.04, 0.12, 2 * cav - 0.04, 0.03, 2), mats.dark, 0, -0.06, 0, { parent: this.platform });
    const floorGrid = etchedGrid(n, { px: 48, colour: '255,190,90', alpha: 0.2, ticks: false });
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(n, n), new THREE.MeshBasicMaterial({ map: floorGrid, transparent: true, depthWrite: false, opacity: 0.9 }));
    fg.rotation.x = -Math.PI / 2; fg.position.y = 0.003; this.platform.add(fg);

    // ledge: rivets, corner plates, name plate, dial
    const rivetGeo = new THREE.SphereGeometry(0.055, 10, 8);
    const rivets = [];
    const step = 0.8;
    for (let t = -B + 0.45; t <= B - 0.4; t += step) { rivets.push([t, -B + 0.13], [t, B - 0.13], [-B + 0.13, t], [B - 0.13, t]); }
    const ri = new THREE.InstancedMesh(rivetGeo, mats.brassDull, rivets.length);
    const dm = new THREE.Object3D();
    rivets.forEach(([x, z], k) => { dm.position.set(x, LEDGE_Y + 0.01, z); dm.scale.set(1, 0.7, 1); dm.updateMatrix(); ri.setMatrixAt(k, dm.matrix); });
    ri.castShadow = true; group.add(ri);
    // etched lines on the ledge so it reads as plated
    const plate = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.1, 4), mats.dark); plate.visible = false;
    const nameTex = engraveTexture('SEALED', { w: 512, h: 128 });
    const np = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshStandardMaterial({ color: 0xd8a64b, metalness: 1, roughness: 0.35, map: null }));
    np.position.set(0, -0.62, B + 0.012); group.add(np);
    const npText = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, depthWrite: false }));
    npText.position.set(0, -0.62, B + 0.02); group.add(npText);
    // combination dial on the front
    const dial = new THREE.Group(); dial.position.set(-B * 0.55, -0.62, B + 0.02); group.add(dial);
    const dialBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.1, 40), mats.brass); dialBase.rotation.x = Math.PI / 2; dialBase.castShadow = true; dial.add(dialBase);
    const dialFace = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.14, 40), mats.dark); dialFace.rotation.x = Math.PI / 2; dial.add(dialFace);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.2, 24), mats.body); knob.rotation.x = Math.PI / 2; knob.position.z = 0.1; dial.add(knob);
    for (let k = 0; k < 24; k++) { const tk = new THREE.Mesh(new THREE.BoxGeometry(0.02, k % 4 ? 0.05 : 0.09, 0.02), mats.brass); const a = k / 24 * Math.PI * 2; tk.position.set(Math.sin(a) * 0.27, Math.cos(a) * 0.27, 0.075); tk.rotation.z = -a; dial.add(tk); }
    this.dial = dial;
    // handle bar on the front (decorative)
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 12, 28, Math.PI), mats.brass);
    handle.position.set(B * 0.5, -0.62, B + 0.05); handle.rotation.z = Math.PI / 2; handle.castShadow = true; group.add(handle);

    // lid assembly
    const lid = new THREE.Group(); this.lid = lid; group.add(lid);
    const lw = n + 0.5;
    add(rb(lw, 0.3, lw, 0.09, 4), mats.lid, 0, 0.15, 0, { parent: lid });
    const glass = add(rb(n + 0.02, 0.06, n + 0.02, 0.025, 3), mats.glass, 0, 0.3 + 0.015, 0, { parent: lid, cast: false });
    this.glass = glass;
    this.etch = new THREE.Mesh(new THREE.PlaneGeometry(n, n), new THREE.MeshBasicMaterial({ map: etchedGrid(n), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.etch.rotation.x = -Math.PI / 2; this.etch.position.y = LID_TOP + 0.002; lid.add(this.etch);
    // little lid screws on the steel border
    const screwGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(screwGeo, mats.brassDull, sx * (half + 0.12), 0.305, sz * (half + 0.12), { parent: lid, cast: false });
    // latches at the four corners
    this.latches = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(sx * (half + 0.62), 0, sz * (half + 0.62));
      add(new THREE.CylinderGeometry(0.34, 0.38, 0.1, 6), mats.brass, 0, 0.05, 0, { parent: g });
      const bar = new THREE.Group(); g.add(bar);
      add(rb(1.5, 0.14, 0.32, 0.05, 2), mats.body, 0, 0.36, 0, { parent: bar });
      const bolt = add(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 6), mats.brass, 0, 0.47, 0, { parent: bar });
      bar.rotation.y = Math.atan2(sz, -sx);
      bar.userData.base = new THREE.Vector3();
      bar.userData.dir = new THREE.Vector3(sx, 0, sz).normalize();
      g.userData = { bar, bolt, sx, sz };
      group.add(g); this.latches.push(g);
    }
    group.add(plate);

    // ports
    const housing = rb(0.64, 0.28, 0.46, 0.06, 3);
    const mouthGeo = new THREE.CircleGeometry(0.115, 24);
    const ringGeo = new THREE.TorusGeometry(0.13, 0.03, 10, 24);
    const ledGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 14);
    const hitGeo = new THREE.BoxGeometry(0.92, 0.5, 0.92);
    for (const slot of allSlots(n)) {
      const f = portFrame(n, slot);
      const g = new THREE.Group(); g.position.copy(f.pos); g.rotation.y = f.rotY; group.add(g);
      add(housing, mats.brass, 0, 0.14, 0, { parent: g });
      const mouth = new THREE.Mesh(mouthGeo, mats.hole); mouth.position.set(0, 0.14, 0.232); g.add(mouth);
      const ring = new THREE.Mesh(ringGeo, mats.brassDull); ring.position.set(0, 0.14, 0.232); ring.castShadow = true; g.add(ring);
      const ledMat = new THREE.MeshStandardMaterial({ color: LED.idle, emissive: LED.idle, emissiveIntensity: 0.35, roughness: 0.3 });
      const led = new THREE.Mesh(ledGeo, ledMat); led.position.set(0, 0.3, -0.1); g.add(led);
      // engraved label on the ledge, outside the port
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: engraveTexture(slot.side + (slot.i + 1)), transparent: true, depthWrite: false }));
      lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.006, 0.62); g.add(lbl);
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 0.2, 0.2); hit.userData.slot = slot; g.add(hit);
      this.hits.push(hit);
      this.ports.set(slotKey(slot), { group: g, led, ledMat, hit, slot, base: LED.idle, used: false });
    }
  }

  setLed(slot, colour, intensity = 1.2) {
    const p = this.ports.get(slotKey(slot)); if (!p) return;
    p.ledMat.color.set(colour); p.ledMat.emissive.set(colour); p.ledMat.emissiveIntensity = intensity;
  }
  markUsed(slot, colour) { const p = this.ports.get(slotKey(slot)); if (p) { p.used = true; p.base = colour; this.setLed(slot, colour, 1.6); } }
  resetLeds() { for (const p of this.ports.values()) { p.used = false; p.base = LED.idle; this.setLed(p.slot, LED.idle, 0.35); } }
  setPortHover(slot, on) {
    const p = this.ports.get(slotKey(slot)); if (!p) return;
    if (on) this.setLed(slot, LED.hover, 2.4); else this.setLed(slot, p.base, p.used ? 1.6 : 0.35);
  }
  setAllLeds(colour, intensity = 1.8) { for (const p of this.ports.values()) { this.setLed(p.slot, colour, intensity); } }
  // dim ports that cannot be used (e.g. wrong tool) — presentation only
  dimPorts(dim) { for (const p of this.ports.values()) { p.group.scale.y = 1; p.ledMat.emissiveIntensity = dim ? 0.1 : (p.used ? 1.6 : 0.35); } }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
