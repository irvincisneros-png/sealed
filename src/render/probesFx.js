// Probe effects: ball bearing + trail, glowing numbered arcs, x-ray sweep, scale pulse, thermal projection.
import * as THREE from 'three';
import { portMouth, portStart, portFrame, cellToWorld, LID_TOP, disposeObject } from './vault.js';
import { labelTexture, heatTexture } from './textures.js';
import { PROBE_COLOURS } from '../state/game.js';
import { fmt } from '../logic/probes.js';

const XRAY_COLOUR = '#56B4E9';
const BOUNCE_COLOURS = PROBE_COLOURS.filter(c => c !== XRAY_COLOUR && c !== '#FFFFFF');
const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));

export function colourFor(obs) {
  if (obs.colour) return obs.colour;
  if (obs.type === 'xray') obs.colour = XRAY_COLOUR;
  else if (obs.type === 'scale') obs.colour = '#FFFFFF';
  else if (obs.type === 'thermal') obs.colour = '#FF8A3D';
  else obs.colour = BOUNCE_COLOURS[(obs.id - 1) % BOUNCE_COLOURS.length];
  return obs.colour;
}

const xrayVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const xrayFrag = `varying vec2 vUv; uniform float uTime; uniform vec3 uColor; uniform float uAlpha;
void main(){
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float top = smoothstep(1.0, 0.55, vUv.y);
  float scan = 0.62 + 0.38 * sin(vUv.y * 70.0 - uTime * 14.0);
  float a = edge * (0.15 + 0.85 * top) * scan * uAlpha;
  gl_FragColor = vec4(uColor * (1.0 + 0.8 * (1.0 - vUv.y)), a);
}`;

export class ProbeFx {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    this.anims = new Set();
    this.items = new Map(); // obs.id -> { group, mats[], labelSprite }
    this.speed = stage.reduced ? 0.45 : 1;
    this.sfx = null; this.onDone = null;
    this.dimmed = false; this.highlightId = null;
    stage.scene.add(this.group);
    this.#aim();
    this.unsub = stage.addUpdater(dt => this.#update(dt));
  }
  attach(vault) { this.vault = vault; this.n = vault.n; this.clear(); }
  clear() {
    for (const it of this.items.values()) { this.group.remove(it.group); disposeObject(it.group); }
    this.items.clear(); this.anims.clear();
    if (this.ball) { // rebuilt on the next bounce, so it is never left invisible or half-removed
      this.group.remove(this.ball.mesh, this.ball.trail);
      disposeObject(this.ball.mesh); disposeObject(this.ball.trail);
      this.ball = null;
    }
    this.thermalMesh = null; this.thermalItem = null;
    this.vault?.resetLeds();
    this.highlightId = null;
  }
  #aim() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x56d8ee, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.y = LID_TOP + 0.012; m.visible = false; m.renderOrder = 4;
    this.aimMesh = m; this.group.add(m);
  }
  // hovering a port or line: faint guide across the lid (shows only where the ball would travel)
  setAim(spec) {
    const m = this.aimMesh;
    if (!spec || !this.n) { m.visible = false; return; }
    const n = this.n;
    m.visible = true;
    if (spec.type === 'bounce') {
      const horiz = spec.slot.side === 'W' || spec.slot.side === 'E';
      const c = horiz ? cellToWorld(n, 0, spec.slot.i) : cellToWorld(n, spec.slot.i, 0);
      m.scale.set(horiz ? n : 0.1, horiz ? 0.1 : n, 1);
      m.position.set(horiz ? 0 : c.x, LID_TOP + 0.012, horiz ? c.z : 0);
      m.rotation.set(-Math.PI / 2, 0, horiz ? 0 : Math.PI / 2 * 0);
      if (!horiz) { m.scale.set(0.1, n, 1); }
      m.material.opacity = 0.55;
    } else {
      const horiz = spec.axis === 'row';
      const c = horiz ? cellToWorld(n, 0, spec.i) : cellToWorld(n, spec.i, 0);
      m.scale.set(horiz ? n : 0.96, horiz ? 0.96 : n, 1);
      m.position.set(horiz ? 0 : c.x, LID_TOP + 0.012, horiz ? c.z : 0);
      m.material.opacity = 0.22;
    }
  }

  // ----- public: play a probe (animated) or add a result instantly
  play(obs, { instant = false } = {}) {
    colourFor(obs);
    if (obs.type === 'bounce') return this.#bounce(obs, instant);
    if (obs.type === 'xray') return this.#xray(obs, instant);
    if (obs.type === 'scale') return this.#scale(obs, instant);
    return this.#thermal(obs, instant);
  }
  #finish(obs, resolve) { obs.shown = true; this.onDone?.(obs); resolve(); }
  #label(text, colour, pos, scale = 0.62) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, { colour, fg: colour === '#F0E442' || colour === '#FFFFFF' || colour === '#E69F00' || colour === '#56B4E9' ? '#0b0f14' : '#ffffff' }), depthTest: false, transparent: true }));
    sp.position.copy(pos); sp.scale.set(scale, scale / 2, 1); sp.renderOrder = 20; sp.userData.base = scale; return sp;
  }

  #bounce(obs, instant) {
    const n = this.n, v = this.vault, colour = colourFor(obs);
    const slotIn = obs.slot, slotOut = obs.result.exit;
    const frIn = portFrame(n, slotIn), frOut = portFrame(n, slotOut);
    const top = p => p.clone().setY(0.34);
    const a = top(frIn.pos), b = top(frOut.pos);
    const g = new THREE.Group(); const mats = [];
    let curve, labelPos;
    if (obs.result.kind === 'reflected') {
      const up = new THREE.Vector3(0, 1, 0), out = frIn.out, r = 0.34;
      const c0 = a.clone().addScaledVector(out, 0.1).addScaledVector(up, 0.12);
      const pts = []; const K = 14;
      for (let k = 0; k <= K; k++) { const t = k / K * Math.PI * 2; pts.push(c0.clone().addScaledVector(out, Math.sin(t) * r * 1.1 + r * 0.9).addScaledVector(up, (1 - Math.cos(t)) * r * 1.15)); }
      curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
      labelPos = c0.clone().addScaledVector(out, r * 0.9 + 0.1).setY(0.34 + r * 2.5 + 0.25);
    } else {
      const dist = a.distanceTo(b);
      const h = 0.75 + dist * 0.09 + (obs.id % 4) * 0.12;
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = LID_TOP + h;
      const lift = (p, f) => p.clone().lerp(mid, f).setY(0.34 + (mid.y - 0.34) * Math.pow(f, 0.6));
      curve = new THREE.CatmullRomCurve3([a, a.clone().addScaledVector(frIn.out, -0.05).setY(0.5), lift(a, 0.3), mid, lift(b, 0.3), b.clone().addScaledVector(frOut.out, -0.05).setY(0.5), b], false, 'catmullrom', 0.5);
      labelPos = mid.clone().setY(mid.y + 0.3);
    }
    const SEG = 72, RAD = 8;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, 0.04, RAD, false), new THREE.MeshBasicMaterial({ color: colour, transparent: true }));
    const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, 0.1, RAD, false), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    tube.userData.base = 1; glow.userData.base = 0.22; mats.push(tube.material, glow.material);
    tube.renderOrder = 6; glow.renderOrder = 5;
    const idxCount = tube.geometry.index.count;
    g.add(tube, glow);
    const label = this.#label('#' + obs.id, colour, labelPos); g.add(label); label.visible = false;
    g.userData = { type: 'bounce', obs, mats, label, tube, glow };
    this.group.add(g);
    const item = { group: g, mats, label, obs, base: [1, 0.22] };
    this.items.set(obs.id, item);
    const setDraw = f => { const c = Math.floor(clamp01(f) * SEG) * RAD * 6; tube.geometry.setDrawRange(0, c); glow.geometry.setDrawRange(0, c); };
    setDraw(0);
    if (!this.ball) this.#makeBall();
    return new Promise(resolve => {
      const finishNow = () => { setDraw(1); label.visible = true; v.markUsed(slotIn, colour); v.markUsed(slotOut, colour); this.#finish(obs, resolve); };
      if (instant) { finishNow(); return; }
      const S = this.speed; let t = 0, stage = 0;
      const start = portStart(n, slotIn), mouthIn = portMouth(n, slotIn), mouthOut = portMouth(n, slotOut), endOut = portStart(n, slotOut);
      const anim = dt => {
        t += dt / S;
        const ball = this.ball;
        if (t < 0.55) { // roll into the port
          if (stage < 1) { stage = 1; this.sfx?.launch(); v.setLed(slotIn, colour, 3); ball.on(colour); }
          const f = ease(t / 0.55);
          ball.set(start.clone().lerp(mouthIn, f), 1 - 0.6 * f);
        } else if (t < 1.4) { // under the lid: the arc is drawn
          if (stage < 2) { stage = 2; ball.off(); this.sfx?.clunk(); v.markUsed(slotIn, colour); }
          setDraw((t - 0.55) / 0.8);
          if (stage < 3 && t > 0.95 && obs.result.kind === 'deflected') { stage = 3; this.sfx?.ping(); }
        } else if (t < 2.0) { // pop out of the exit port
          if (stage < 4) { stage = 4; setDraw(1); ball.on(colour); this.sfx?.pop(); v.markUsed(slotOut, colour); v.setLed(slotOut, colour, 3.2); label.visible = true; }
          const f = ease((t - 1.4) / 0.6);
          ball.set(mouthOut.clone().lerp(endOut, f), 0.4 + 0.6 * Math.min(1, f * 2) - (f > 0.7 ? (f - 0.7) / 0.3 * 1 : 0));
        } else { ball.off(); v.markUsed(slotOut, colour); this.anims.delete(anim); this.#finish(obs, resolve); }
      };
      this.anims.add(anim);
    });
  }
  #makeBall() {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 28, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.06, envMapIntensity: 1.6 }));
    mesh.castShadow = true; mesh.visible = false;
    const TR = 14;
    const trail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), TR);
    trail.frustumCulled = false; trail.visible = false;
    this.group.add(mesh, trail);
    const hist = []; const dm = new THREE.Object3D();
    const ball = {
      mesh, trail,
      on: colour => { mesh.visible = true; trail.visible = true; trail.material.color.set(colour); hist.length = 0; },
      off: () => { mesh.visible = false; trail.visible = false; },
      set: (p, s = 1) => {
        mesh.position.copy(p); mesh.scale.setScalar(Math.max(0.05, s));
        hist.unshift(p.clone()); if (hist.length > TR) hist.pop();
        for (let i = 0; i < TR; i++) { const q = hist[Math.min(i, hist.length - 1)]; dm.position.copy(q); dm.scale.setScalar(Math.max(0.01, (1 - i / TR) * 0.85 * s)); dm.updateMatrix(); trail.setMatrixAt(i, dm.matrix); }
        trail.instanceMatrix.needsUpdate = true;
      },
    };
    this.ball = ball;
  }

  #xray(obs, instant) {
    const n = this.n, colour = colourFor(obs), col = new THREE.Color(colour);
    const row = obs.axis === 'row';
    const g = new THREE.Group(); const mats = [];
    const c = row ? cellToWorld(n, 0, obs.i) : cellToWorld(n, obs.i, 0);
    // persistent faint strip on the lid
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    strip.rotation.x = -Math.PI / 2; strip.position.y = LID_TOP + 0.008; strip.renderOrder = 3;
    if (row) { strip.scale.set(n, 0.9, 1); strip.position.set(0, LID_TOP + 0.008, c.z); } else { strip.scale.set(0.9, n, 1); strip.position.set(c.x, LID_TOP + 0.008, 0); }
    strip.userData.base = 0.2; mats.push(strip.material);
    // sweeping curtain
    const curtainMat = new THREE.ShaderMaterial({ vertexShader: xrayVert, fragmentShader: xrayFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uColor: { value: col }, uAlpha: { value: 0 } } });
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.95), curtainMat);
    curtain.renderOrder = 7; curtain.visible = false;
    if (row) curtain.rotation.y = Math.PI / 2;
    g.add(strip, curtain);
    const fr = portFrame(n, row ? { side: 'E', i: obs.i } : { side: 'N', i: obs.i });
    const lp = fr.pos.clone().addScaledVector(fr.out, 0.1).setY(0.8);
    const label = this.#label(fmt(obs.result), colour, lp, 0.7); label.visible = false; g.add(label);
    g.userData = { type: 'xray', obs, mats, label };
    this.group.add(g); this.items.set(obs.id, { group: g, mats, label, obs, base: [0.2] });
    return new Promise(resolve => {
      const done = () => { strip.material.opacity = 0.2; curtain.visible = false; label.visible = true; this.#restyle(); this.#finish(obs, resolve); };
      if (instant) { done(); return; }
      this.sfx?.xray();
      let t = 0; const S = this.speed;
      const anim = dt => {
        t += dt / S; const f = clamp01(t / 1.2);
        curtain.visible = true; curtainMat.uniforms.uTime.value = t; curtainMat.uniforms.uAlpha.value = Math.sin(Math.PI * Math.min(1, f)) * 1.1 + 0.15;
        const s = -n / 2 + 0.5 + f * (n - 1);
        if (row) curtain.position.set(s, LID_TOP + 0.47, c.z); else curtain.position.set(c.x, LID_TOP + 0.47, -s);
        strip.material.opacity = 0.35 * Math.sin(Math.PI * f) + 0.2 * f;
        if (t >= 1.2) { this.anims.delete(anim); this.sfx?.pop(); done(); }
      };
      this.anims.add(anim);
    });
  }

  #scale(obs, instant) {
    const n = this.n, colour = colourFor(obs);
    const g = new THREE.Group(); const mats = [];
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = LID_TOP + 0.03; ring.renderOrder = 4; g.add(ring);
    const lp = new THREE.Vector3(n / 2 + 0.2, 0.95, n / 2 + 0.85);
    const label = this.#label('Scale ' + fmt(obs.result), '#FFFFFF', lp, 1.05); label.visible = false; g.add(label);
    g.userData = { type: 'scale', obs, mats, label };
    this.group.add(g); this.items.set(obs.id, { group: g, mats, label, obs, base: [] });
    return new Promise(resolve => {
      if (instant) { label.visible = true; this.#finish(obs, resolve); return; }
      this.sfx?.scale();
      let t = 0; const S = this.speed;
      const anim = dt => {
        t += dt / S; const f = clamp01(t / 1.1);
        ring.scale.setScalar(0.2 + f * n * 0.5); ring.material.opacity = (1 - f) * 0.8;
        if (t >= 1.1) { ring.visible = false; label.visible = true; this.anims.delete(anim); this.#finish(obs, resolve); }
      };
      this.anims.add(anim);
    });
  }

  #thermal(obs, instant) {
    const n = this.n;
    const g = new THREE.Group(); const mats = [];
    const mat = new THREE.MeshBasicMaterial({ map: heatTexture(obs.result), transparent: true, opacity: 0, depthWrite: false, blending: THREE.NormalBlending });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(n, n), mat);
    plane.rotation.x = -Math.PI / 2; plane.position.y = LID_TOP + 0.02; plane.renderOrder = 2;
    plane.userData.base = 0.62; mats.push(mat);
    g.add(plane);
    const label = this.#label('Heat', '#FF8A3D', new THREE.Vector3(-n / 2 - 0.2, 0.9, n / 2 + 0.85), 0.8); label.visible = false; g.add(label);
    g.userData = { type: 'thermal', obs, mats, label, plane };
    this.group.add(g); this.items.set(obs.id, { group: g, mats, label, obs, base: [0.62] });
    this.thermalItem = g;
    return new Promise(resolve => {
      if (instant) { mat.opacity = 0.62; label.visible = true; this.#finish(obs, resolve); return; }
      this.sfx?.thermal();
      let t = 0; const S = this.speed;
      const anim = dt => {
        t += dt / S; const f = clamp01(t / 1.3);
        mat.opacity = 0.62 * ease(f);
        if (t >= 1.3) { label.visible = true; this.anims.delete(anim); this.#finish(obs, resolve); }
      };
      this.anims.add(anim);
    });
  }
  toggleThermal() { if (this.thermalItem) { this.thermalItem.visible = !this.thermalItem.visible; return this.thermalItem.visible; } return true; }

  // ----- presentation state
  setDimmed(on) { // model mode: arcs recede so the blueprint reads clearly
    this.dimmed = on; this.#restyle();
  }
  setHighlight(id) { this.highlightId = id; this.#restyle(); }
  #restyle() {
    for (const [id, it] of this.items) {
      const hl = this.highlightId === id, other = this.highlightId != null && !hl;
      const f = (this.dimmed ? 0.35 : 1) * (other ? 0.3 : 1);
      it.mats.forEach((m, k) => { m.opacity = Math.min(1, it.base[k] * f * (hl ? 1.8 : 1)); });
      it.label.scale.set(it.label.userData.base * (hl ? 1.3 : 1), it.label.userData.base * (hl ? 1.3 : 1) / 2, 1);
      it.label.material.opacity = Math.max(0.35, f);
    }
  }
  worldPosOfObs(id) { const it = this.items.get(id); return it ? it.label.position.clone() : null; }

  #update(dt) {
    for (const a of [...this.anims]) a(dt);
    if (this.aimMesh.visible) this.aimMesh.material.opacity *= 1; // static; pulse handled by time below
  }
}
