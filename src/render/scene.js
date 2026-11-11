// Stage: renderer, camera rig, lighting, workshop bench, quality, main loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { workshopWood, glowSprite } from './textures.js';
import { QUALITY, FpsGuard } from './quality.js';
import { Vault, BODY_H } from './vault.js';

const MODES = {
  idle: { el: 46, dist: 1.1 },
  play: { el: 54, dist: 1.0 },
  blueprint: { el: 72, dist: 0.98 },
  reveal: { el: 58, dist: 0.78 },
};
const deg = d => d * Math.PI / 180;

export class Stage {
  constructor(canvas, qualityName = 'med') {
    this.canvas = canvas;
    this.qualityName = QUALITY[qualityName] ? qualityName : 'med';
    this.q = QUALITY[this.qualityName];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090c);
    this.scene.fog = new THREE.Fog(0x07090c, 26, 62);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 250);
    this.clock = new THREE.Clock();
    this.t = 0;
    this.updaters = new Set();
    this.mode = 'idle';
    this.cur = { ...MODES.idle, az: 0 };
    this.userAz = 0; this.userEl = 0; this.dragging = false;
    this.safe = { l: 0, r: 0, t: 0, b: 0 };
    this.vault = null; this.n = 0;
    this.target = new THREE.Vector3(0, -0.3, 0);
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.glow = glowSprite();
    this.#env(); this.#lights(); this.#bench(); this.#motes();
    this.guard = null;
    this.applyQuality();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
  }

  #env() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.75;
    pm.dispose();
  }
  #lights() {
    const key = new THREE.DirectionalLight(0xfff0dc, 2.8);
    key.position.set(-6, 15, 9);
    key.shadow.camera.left = -9; key.shadow.camera.right = 9; key.shadow.camera.top = 9; key.shadow.camera.bottom = -9;
    key.shadow.camera.near = 2; key.shadow.camera.far = 40;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 5;
    this.key = key; this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb0ff, 1.1); rim.position.set(8, 6, -10); this.scene.add(rim);
    const fill = new THREE.HemisphereLight(0x8aa2c4, 0x1c140c, 0.45); this.scene.add(fill);
    const lamp = new THREE.SpotLight(0xffe0b0, 90, 0, 0.75, 1, 1.3); lamp.position.set(2, 15, 4); lamp.target.position.set(0, -1, 0); this.scene.add(lamp, lamp.target);
    this.lamp = lamp;
    // warm light that spills out of the opened vault
    this.spill = new THREE.PointLight(0xffb55a, 0, 14, 1.6); this.spill.position.set(0, 1.4, 0); this.scene.add(this.spill);
  }
  #bench() {
    const wood = workshopWood({ repeat: [5, 5] });
    wood.map.anisotropy = 8;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0xffffff, map: wood.map, roughnessMap: wood.rough, bumpMap: wood.bump, bumpScale: 0.8, roughness: 0.85, metalness: 0 }));
    top.rotation.x = -Math.PI / 2; top.position.y = -BODY_H - 0.14; top.receiveShadow = true;
    this.benchTop = top; this.scene.add(top);
    this.props = new THREE.Group(); this.scene.add(this.props);
  }
  #buildProps(n) {
    const g = this.props;
    while (g.children.length) { const c = g.children.pop(); c.traverse?.(o => o.geometry?.dispose()); }
    const y0 = -BODY_H - 0.14;
    // cutting mat
    const S = n + 6.4;
    const matC = document.createElement('canvas'); matC.width = matC.height = 512;
    const c = matC.getContext('2d');
    c.fillStyle = '#1a2926'; c.fillRect(0, 0, 512, 512);
    c.strokeStyle = 'rgba(210,225,220,0.18)'; c.lineWidth = 1.5;
    const cells = Math.round(S);
    for (let i = 0; i <= cells; i++) { const p = i / cells * 512; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, 512); c.stroke(); c.beginPath(); c.moveTo(0, p); c.lineTo(512, p); c.stroke(); }
    c.strokeStyle = 'rgba(240,200,120,0.35)'; c.lineWidth = 4; c.strokeRect(10, 10, 492, 492);
    const mt = new THREE.CanvasTexture(matC); mt.colorSpace = THREE.SRGBColorSpace; mt.anisotropy = 8;
    const mat = new THREE.Mesh(new RoundedBoxGeometry(S, 0.08, S, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0xffffff, map: mt, roughness: 0.75, metalness: 0 }));
    mat.position.y = y0 + 0.04; mat.receiveShadow = true; mat.castShadow = false; g.add(mat);
    // steel ruler
    const rc = document.createElement('canvas'); rc.width = 1024; rc.height = 96;
    const r = rc.getContext('2d'); r.fillStyle = '#b9c0c6'; r.fillRect(0, 0, 1024, 96);
    r.fillStyle = '#20262b'; r.font = '700 26px Mulish, sans-serif';
    for (let i = 0; i <= 60; i++) { const x = 14 + i * 16.4; const len = i % 10 === 0 ? 42 : i % 5 === 0 ? 30 : 18; r.fillRect(x, 0, 2, len); if (i % 10 === 0 && i) r.fillText(String(i / 10), x - 8, 74); }
    const rt = new THREE.CanvasTexture(rc); rt.colorSpace = THREE.SRGBColorSpace; rt.anisotropy = 8;
    const ruler = new THREE.Mesh(new RoundedBoxGeometry(6.2, 0.05, 0.62, 2, 0.015), [0, 1, 2, 3, 4, 5].map(i => new THREE.MeshStandardMaterial({ color: 0xffffff, map: i === 2 ? rt : null, metalness: 0.9, roughness: 0.35 })));
    ruler.position.set(-(S / 2 - 2.4), y0 + 0.1, S / 2 + 1.2); ruler.rotation.y = 0.08; ruler.castShadow = ruler.receiveShadow = true; g.add(ruler);
    // pencil
    const pen = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0xf2b21c, roughness: 0.5 }));
    body.rotation.z = Math.PI / 2; pen.add(body);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0xe2c192, roughness: 0.8 })); cone.rotation.z = Math.PI / 2; cone.position.x = 1.25; pen.add(cone);
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x222222 })); lead.rotation.z = Math.PI / 2; lead.position.x = 1.45; pen.add(lead);
    const ferr = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 1, roughness: 0.3 })); ferr.rotation.z = Math.PI / 2; ferr.position.x = -1.18; pen.add(ferr);
    const eras = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xe58aa0, roughness: 0.9 })); eras.rotation.z = Math.PI / 2; eras.position.x = -1.3; pen.add(eras);
    pen.position.set(S / 2 - 0.5, y0 + 0.2, S / 2 - 1.2); pen.rotation.y = -0.5; pen.traverse(o => { o.castShadow = true; }); g.add(pen);
    // loose screws
    const sg = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 6), sh = new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8);
    const sm = new THREE.MeshStandardMaterial({ color: 0xaab0b6, metalness: 1, roughness: 0.35 });
    for (const [x, z, a] of [[S / 2 + 0.3, 1.0, 0.3], [S / 2 + 0.7, 1.5, 1.2], [S / 2 + 0.1, 2.0, 2.4]]) {
      const s = new THREE.Group(); const hd = new THREE.Mesh(sg, sm); hd.position.y = 0.17; const sf = new THREE.Mesh(sh, sm);
      s.add(hd, sf); s.rotation.z = Math.PI / 2; s.rotation.x = a; s.position.set(x, y0 + 0.12, z); s.traverse(o => { o.castShadow = true; }); g.add(s);
    }
  }
  #motes() {
    const N = 90, pos = new Float32Array(N * 3);
    this.moteSeeds = Array.from({ length: N }, () => [Math.random() * 20 - 10, Math.random() * 6 - 1, Math.random() * 20 - 10, Math.random() * 6.28, 0.1 + Math.random() * 0.25]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({ map: this.glow, size: 0.14, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe3b8, sizeAttenuation: true }));
    this.motes.frustumCulled = false; this.scene.add(this.motes);
  }
  #updateMotes() {
    const p = this.motes.geometry.attributes.position.array;
    this.moteSeeds.forEach((s, i) => {
      p[i * 3] = s[0] + Math.sin(this.t * s[4] + s[3]) * 0.8;
      p[i * 3 + 1] = s[1] + Math.sin(this.t * s[4] * 0.7 + s[3] * 2) * 0.5 + 1;
      p[i * 3 + 2] = s[2] + Math.cos(this.t * s[4] + s[3]) * 0.8;
    });
    this.motes.geometry.attributes.position.needsUpdate = true;
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.qualityName = name; this.q = QUALITY[name];
    this.applyQuality();
    this.resize();
  }
  applyQuality() {
    const q = this.q;
    this.renderer.shadowMap.enabled = q.shadows;
    this.key.castShadow = q.shadows;
    if (q.shadows) {
      if (this.key.shadow.mapSize.x !== q.shadowSize) { this.key.shadow.mapSize.set(q.shadowSize, q.shadowSize); this.key.shadow.map?.dispose(); this.key.shadow.map = null; }
    }
    this.motes.visible = q.motes;
    this.scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.needsUpdate = true; }); } });
  }
  watchFps(onSlow) { this.guard = new FpsGuard(onSlow); }

  // (re)build the vault for a grid size
  setN(n) {
    if (this.n === n && this.vault) return this.vault;
    if (this.vault) { this.scene.remove(this.vault.group); this.vault.dispose(); }
    this.n = n;
    this.vault = new Vault(n, this.q);
    this.scene.add(this.vault.group);
    this.#buildProps(n);
    const s = n / 2 + 3;
    Object.assign(this.key.shadow.camera, { left: -s, right: s, top: s, bottom: -s }); this.key.shadow.camera.updateProjectionMatrix();
    this.fitDist = null;
    this.onVaultBuilt?.(this.vault);
    return this.vault;
  }

  setMode(m) { this.mode = m; }
  setSafeArea(a) { this.safe = { ...this.safe, ...a }; this.resize(); }
  beginOrbit() { this.dragging = true; }
  orbitBy(dx, dy) {
    this.userAz = Math.max(-deg(25), Math.min(deg(25), this.userAz - dx * 0.006));
    this.userEl = Math.max(-deg(14), Math.min(deg(14), this.userEl + dy * 0.004));
  }
  endOrbit() { this.dragging = false; }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.W = w; this.H = h;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.q.pr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const s = this.safe;
    const availW = Math.max(120, w - s.l - s.r), availH = Math.max(120, h - s.t - s.b);
    const cx = s.l + availW / 2, cy = s.t + availH / 2;
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.k = Math.min(availH / h, availW / h);
    this.camera.updateProjectionMatrix();
  }

  #updateCamera(dt) {
    const m = MODES[this.mode] || MODES.play;
    const k = 1 - Math.exp(-dt * (this.reduced ? 12 : 3.5));
    this.cur.el += (m.el - this.cur.el) * k; this.cur.dist += (m.dist - this.cur.dist) * k;
    if (!this.dragging) { const r = Math.exp(-dt * 3); this.userAz *= r; this.userEl *= r; }
    const B = (this.vault ? this.vault.B : 6) + 0.35;
    const tanHalf = Math.tan(deg(this.camera.fov / 2));
    const theta = Math.atan(tanHalf * (this.k || 1));
    const dist = (B * 1.18 / Math.sin(theta)) * this.cur.dist;
    this.scene.fog.near = dist + 8; this.scene.fog.far = dist + 40;
    const az = this.mode === 'idle' && !this.reduced ? Math.sin(this.t * 0.12) * deg(20) : this.userAz;
    const el = deg(this.cur.el) + this.userEl;
    this.camera.position.set(
      this.target.x + dist * Math.cos(el) * Math.sin(az),
      this.target.y + dist * Math.sin(el),
      this.target.z + dist * Math.cos(el) * Math.cos(az));
    this.camera.lookAt(this.target);
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.t += dt;
      this.#updateCamera(dt);
      if (this.q.motes) this.#updateMotes();
      for (const u of this.updaters) u(dt, this.t);
      this.guard?.tick(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
  addUpdater(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  // ---- picking
  setPointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
  }
  pick(e, objects, recursive = false) { this.setPointer(e); return this.ray.intersectObjects(objects, recursive); }
  // point where the pointer ray meets the lid plane
  lidPoint(e, y) {
    this.setPointer(e);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(plane, out) ? out : null;
  }
}
