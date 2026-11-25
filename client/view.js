// The renderer: sky, sun with a shadow that follows the car, day and night,
// cameras, post-processing. (Light levels are the board game's.)
import * as THREE from './vendor/three.module.min.js';
import { SUN_DIR, HAZE, NIGHT_HAZE, QUALITY, Post, FrameWatch, startQuality, makeSky, skyEnvironment, pixelRatio, gfxChoice, setGfxChoice } from './realism.js';
import { WEATHER } from '../shared/weather.js';
import { cut } from './weather.js';
import { forget } from './gpu.js';
export const CAMS = ['chase', 'near', 'inside', 'diorama', 'iso', 'top'];
const THIN = { diorama: 0.42, top: 0.42 }; // (from high up the fog is thinner)
const DUSK = new THREE.Color().setRGB(0.95, 0.52, 0.30), tmpC = new THREE.Color();
export class View {
  constructor(el) {
    const q = startQuality(); this.el = el;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: !QUALITY[q.level].post, powerPreference: 'high-performance' }));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    this.post = new Post(r); el.appendChild(r.domElement);
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2(HAZE.clone(), 0.0021);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.35, 2600);
    this.persp = this.camera; this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 420); this.zoom = 1;
    addEventListener('wheel', (e) => { if (!e.target.closest || !e.target.closest('.panel')) this.zoom = Math.max(0.5, Math.min(2.6, this.zoom * Math.exp(e.deltaY * 0.0012))); }, { passive: true });
    this.sky = makeSky(); this.scene.add(this.sky);
    this.envSky = skyEnvironment(r, '#27505f'); this.envNight = skyEnvironment(r, '#0a1420', 1);
    const s = (this.sun = new THREE.DirectionalLight('#ffe3bf', 3.4)); s.castShadow = true; s.shadow.bias = -0.0011; s.shadow.normalBias = 0.09; s.shadow.radius = 2.2;
    this.scene.add(s, s.target); this.shadowR = 42;
    this.hemi = new THREE.HemisphereLight('#cfe0f2', '#a08a6c', 1); this.scene.add(this.hemi);
    this.headlight = new THREE.SpotLight('#ffe9c0', 0, 26, 0.5, 0.65, 1.1); this.scene.add(this.headlight, this.headlight.target);
    this.night = 0; this.cam = { mode: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), yaw: 0, shake: 0, init: false, fov: 60 };
    try { this.cam.mode = Math.max(0, CAMS.indexOf(localStorage.getItem('nanoprix.cam') || 'chase')); } catch { /* */ }
    this.tiltOn = true; try { this.tiltOn = localStorage.getItem('nanoprix.tilt') !== '0'; } catch { /* */ }
    this.watch = q.fixed ? null : new FrameWatch(q.level, (l) => this.setQuality(l));
    this.setQuality(q.level); this.applyNight(0);
    addEventListener('resize', () => this.resize());
    // the graphics card may take its context away (too much asked of it, the machine asleep): then all is made anew, on less
    const cv = r.domElement; cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; this.losses = (this.losses || 0) + 1; });
    cv.addEventListener('webglcontextrestored', () => this.restore());
  }
  // every shader there is, made before it is needed (a scene of its own: only what is in it)
  warm(part = null) { const r = this.renderer, was = r.getRenderTarget(); try { if (this.quality.post && this.post.main) r.setRenderTarget(this.post.main); if (part) r.compile(part, this.camera, this.scene); else r.compile(this.scene, this.camera); } finally { r.setRenderTarget(was); } }
  restore() {
    forget(this.scene, [this.envSky, this.envNight, this.sun.shadow.map && this.sun.shadow.map.texture, this.sky.material, ...this.post.targets(), ...this.post.materials()]);
    if (this.world.remake) this.world.remake();
    this.post.main = null; this.post.w = 0; this.sun.shadow.map = null; this.envSky = skyEnvironment(this.renderer, '#27505f'); this.envNight = skyEnvironment(this.renderer, '#0a1420', 1);
    if (gfxChoice() === 'auto' && this.level !== 'low') this.setQuality(this.level === 'high' ? 'medium' : 'low'); else this.resize();
    this.light(); this.lost = false; if (this.onRestored) this.onRestored();
  }
  setQuality(level) { this.level = level; this.quality = QUALITY[level]; const n = level === 'low' ? 1024 : level === 'medium' ? 2048 : 3072; this.sun.shadow.mapSize.set(n, n); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } this.far = level === 'low' ? 230 : level === 'medium' ? 340 : 460; this.resize(); }
  chooseQuality(v) { setGfxChoice(v); const q = startQuality(); this.watch = q.fixed ? null : new FrameWatch(q.level, (l) => this.setQuality(l)); this.setQuality(q.level); }
  get gfx() { return gfxChoice(); }
  resize() {
    const w = innerWidth, h = innerHeight, pr = pixelRatio(this.quality, w, h); this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h); this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
    if (this.quality.post) this.post.setSize(Math.round(w * pr), Math.round(h * pr), this.quality.samples);
  }
  // 0 day … 1 night, with a little dusk on the way – under whatever weather
  applyNight(k) { this.night = k; this.light(); }
  setWeather(w, flash = 0) { this.wx = w; this.flashing = flash; this.light(); }
  light() {
    const k = this.night, w = this.wx || CALM, o = w.cloud, fl = this.flashing || 0, mix = (a, b) => a + (b - a) * k, dusk = Math.max(0, 1 - Math.abs(k - 0.45) / 0.4) * (1 - o * 0.8);
    this.scene.environment = k > 0.5 ? this.envNight : this.envSky;
    this.scene.environmentIntensity = (k > 0.5 ? 0.55 + (k - 0.5) * 1.5 : 0.85 * (1 - k * 1.75)) * (1 - 0.38 * o);
    const U = this.sky.material.uniforms; U.uNight.value = k; U.uCloud.value = o; U.uFlash.value = fl; U.uMist.value = Math.min(1, w.fog / 0.016);
    this.scene.fog.color.copy(HAZE).lerp(tmpC.copy(GREY).lerp(WHITE, w.snow * 0.45), o * 0.9).lerp(tmpC.copy(NIGHT_HAZE).lerp(NIGHT_GREY, o).multiplyScalar(1 + Math.min(0.9, w.fog * 45)), k).lerp(tmpC.copy(DUSK).multiplyScalar(0.5), dusk * 0.35);
    if (fl > 0) this.scene.fog.color.lerp(tmpC.setRGB(0.75, 0.8, 0.95), fl * 0.3);
    U.uGround.value.copy(this.scene.fog.color);
    this.fogDay = FOG + w.fog * (this.flying ? 0.42 : (THIN[CAMS[this.cam.mode]] ?? 1)); this.scene.fog.density = this.camera === this.ortho ? 0.0004 + w.fog * 0.15 : this.fogDay;
    this.sun.color.set('#ffe0b8').lerp(tmpC2.set('#ff9a52'), dusk * 0.8).lerp(tmpC2.set('#c9d4e2'), o * (1 - k)).lerp(tmpC2.set('#8fb0ff'), Math.max(0, k * 2 - 1));
    this.sun.intensity = mix(3.9, 0.9) * (1 - 0.84 * o) + fl * 3.2; this.hemi.intensity = mix(1.25 + o * 0.75, 0.16 + o * 0.05) + fl * 1.4; this.hemi.color.set('#cfe0f2').lerp(tmpC2.set('#d7dbe0'), o).lerp(tmpC2.set('#6f86c8'), k); this.hemi.groundColor.set('#a08a6c').lerp(tmpC2.set('#e2e6ec'), w.snow * 0.8 * (1 - k)).lerp(tmpC2.set('#3a2a1e'), k);
    this.post.exposure = mix(1.32 - w.snow * 0.16, 1.25); this.renderer.toneMappingExposure = this.post.exposure * 0.6; this.post.bloom = mix(0.2 + o * 0.06, 0.42 + o * 0.08);
    if (this.world && this.nightSet !== k) { this.nightSet = k; this.world.setNight(k); }
  }
  nextCam() { this.cam.mode = (this.cam.mode + 1) % CAMS.length; this.cam.init = false; try { localStorage.setItem(this.riding ? 'nanoprix.camRide' : 'nanoprix.cam', CAMS[this.cam.mode]); } catch { /* */ } return CAMS[this.cam.mode]; }
  // as a passenger one has a camera of one's own: from inside, until one chooses another
  ride(on) { if (!!this.riding === on) return; this.riding = on; let m = on ? 'inside' : 'chase'; try { m = localStorage.getItem(on ? 'nanoprix.camRide' : 'nanoprix.cam') || m; } catch { /* */ } this.cam.mode = Math.max(0, CAMS.indexOf(m)); this.cam.init = false; this.light(); }
  // the camera in what one sits in (cabin.js), right where it is: nothing lags
  within(c, dt, back) {
    this.usePersp(0.05, 0.2); this.look = null; const K = this.cam, q = this.cabin, P = this.camera; P.position.copy(q.pos); P.quaternion.copy(q.quat); if (back) P.quaternion.multiply(tmpQ.setFromAxisAngle(tmpV.set(0, 1, 0), Math.PI)); K.pos.copy(q.pos); K.look.set(c.x, c.y, c.z); K.yaw = c.yaw; K.init = false;
    const s = (K.shake = Math.max(0, K.shake - dt * 3)) * 0.012; P.position.x += (Math.random() - 0.5) * s; P.position.y += (Math.random() - 0.5) * s; const fov = 66 + (c.boosting ? 5 : 0); K.fov += (fov - K.fov) * Math.min(1, dt * 6); if (Math.abs(P.fov - K.fov) > 0.02) { P.fov = K.fov; P.updateProjectionMatrix(); }
    this.shadowAt(c.x + Math.sin(c.yaw) * 12, c.y, c.z + Math.cos(c.yaw) * 12, 38); this.post.focus = 12; this.post.tilt = 0;
  }
  // near: on foot the camera comes close to walls
  usePersp(near = 0.35, ao = 0.6) { this.post.ao.uniforms.uRadius.value = ao; this.close = false; this.leaves(null); if (this.persp.near !== near) { this.persp.near = near; this.persp.updateProjectionMatrix(); } if (this.camera !== this.persp) { this.camera = this.persp; this.scene.fog.density = this.fogDay ?? FOG; } }
  // the isometric view: no perspective, always from the south-east, so north is up to the left
  isometric(c, dt) {
    const K = this.cam, v = Math.hypot(c.vx, c.vz), a = K.init ? Math.min(1, dt * 5) : 1, lead = 0.42;
    const tx = c.x + c.vx * lead, tz = c.z + c.vz * lead; if (!K.init) K.iso = { x: tx, y: c.y, z: tz, h: 9 };
    const I = (K.iso ||= { x: tx, y: c.y, z: tz, h: 9 }); I.x += (tx - I.x) * a; I.z += (tz - I.z) * a; I.y += (c.y - I.y) * a; I.h += ((8.5 + v * 0.22) * this.zoom - I.h) * Math.min(1, dt * 3); K.init = true;
    const o = (this.camera = this.ortho), h = I.h, w = (h * innerWidth) / innerHeight; Object.assign(o, { left: -w, right: w, top: h, bottom: -h }); o.updateProjectionMatrix();
    K.shake = Math.max(0, K.shake - dt * 3); const s = K.shake * 0.1, D = 150;
    o.position.set(I.x + D * ISO.x + (Math.random() - 0.5) * s, I.y + D * ISO.y, I.z + D * ISO.z + (Math.random() - 0.5) * s); o.lookAt(I.x, I.y, I.z);
    this.scene.fog.density = 0.0004 + (this.wx || CALM).fog * 0.15; this.look = I; this.shadowAt(I.x, I.y, I.z, Math.max(38, w * 1.15)); this.post.focus = D; this.post.tilt = this.tiltOn ? 0.7 : 0;
  }
  // follow a car; dt in s
  follow(c, dt, back = false) {
    if (this.cabin && CAMS[this.cam.mode] === 'inside') { this.within(c, dt, back); return; }
    const rig = this.rig, deep = !!rig && (rig.kind === 'tube' || rig.kind === 'hall' || rig.kind === 'pass'); if (CAMS[this.cam.mode] === 'iso' && !deep) { this.close = false; this.leaves(null); this.isometric(c, dt); return; }
    this.usePersp(rig && rig.kind === 'walk' && rig.solid && /chase|near|inside/.test(CAMS[this.cam.mode]) ? 0.14 : deep && rig.kind !== 'tube' ? 0.1 : 0.35); this.look = null;
    const K = this.cam, m = deep ? 'chase' : CAMS[K.mode] === 'inside' ? 'near' : CAMS[K.mode], v = Math.hypot(c.vx, c.vz), dir = v > 1.2 ? Math.atan2(c.vx, c.vz) : c.yaw;
    let d = dir - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > 1.8) d = 0;
    const want = c.yaw + d * 0.45 + (back ? Math.PI : 0);
    if (!K.init) { K.yaw = want; }
    let e = want - K.yaw; e = Math.atan2(Math.sin(e), Math.cos(e)); K.yaw += e * Math.min(1, dt * (back ? 30 : m === 'diorama' || m === 'top' ? 2.2 : 6.2));
    const S = { chase: [3.7 + v * 0.05, 1.55 + v * 0.012, 2.4, 58 + v * 0.9, 0.35], near: [2.35 + v * 0.03, 0.85, 3.2, 64 + v * 0.9, 0.3], diorama: [13.5 + v * 0.16, 11.5 + v * 0.1, 3.2 + v * 0.16, 34, 0], top: [5.5, 26 + v * 0.3, 2 + v * 0.25, 36, 0] }[m]; if (this.aboard && (m === 'chase' || m === 'near')) { S[0] = 9.5; S[1] = 4.6; S[2] = 1; S[3] = 52; S[4] = 0.6; } if (rig && (m === 'chase' || m === 'near')) { const q = { walk: [2.3, 0.95, 1.5, 58, 0.3], pass: [1.7, 0.6, 1.5, 66, 0.3], ship: [9.5, 4.6, 1, 52, 0.6], hall: [2.0, 0.75, 1.6, 64, 0.3], bus: [5.2, 2.2, 2.4, 58, 0.5], train: [9, 3.4, 4, 56, 0.7], tube: [3.0, 0.8, 4, 66, 0.4] }[rig.kind]; for (let k = 0; k < 5; k++) S[k] = q[k]; } const sx = Math.sin(K.yaw), sz = Math.cos(K.yaw);
    const shy = !!rig && rig.kind === 'walk' && !!rig.solid && (m === 'chase' || m === 'near'), eyeY = c.y + 0.42; let px0 = 0, pz0 = 0; if (shy) this.swing(c, rig.solid, S, eyeY, dt); else K.swing = K.side = 0; { const y = K.yaw + (K.swing || 0); px0 = Math.sin(y); pz0 = Math.cos(y); }
    const zm = m === 'diorama' || m === 'top' ? this.zoom : 1, px = c.x - px0 * S[0] * zm, pz = c.z - pz0 * S[0] * zm; let py = c.y + S[1] * zm;
    if (this.world && !deep && !(this.under && (m === 'chase' || m === 'near'))) py = Math.max(py, this.world.height(px, pz) + 0.5);
    let qx = px, qz = pz; if (this.under && (m === 'chase' || m === 'near')) { const n = this.world.net, q = n.at(px, pz, c.y + 0.15, null, (this.q0 ||= {})); if (q && q.road.tunnel) { const i = q.i * 3, P = q.road.p, cx = P[i] + (P[i + 3] - P[i]) * q.t, cz = P[i + 1] + (P[i + 4] - P[i + 1]) * q.t, k = q.d > 1.1 ? 1.1 / q.d : 1; qx = cx + (px - cx) * k; qz = cz + (pz - cz) * k; py = Math.min(py, q.h + 1.42); } }
    if (deep && rig.kind === 'pass') { const p = rig.eye(px, pz, K.yaw); qx = p.x; qz = p.z; py = p.y; } else if (deep && rig.kind === 'tube') { const p = rig.back(back ? -2 : S[0]); qx = p.x; qz = p.z; py = p.y + S[1]; } else if (deep) { const f = rig.f, dx = px - f[0], dz = pz - f[2], al = Math.max(-8, Math.min(8, dx * f[3] + dz * f[4])), g = rig.way.frame(rig.s + al), u = Math.max(-1.72, Math.min(1.72, -(px - g[0]) * g[4] + (pz - g[2]) * g[3])); qx = g[0] - g[4] * u; qz = g[2] + g[3] * u; py = Math.min(py, g[1] + 1.5); }
    const a = K.init ? Math.min(1, dt * 14) : 1, ay = K.init ? Math.min(1, dt * 7) : 1;
    K.pos.x += (qx - K.pos.x) * a; K.pos.z += (qz - K.pos.z) * a; K.pos.y += (py - K.pos.y) * ay;
    const ahead = S[2] * Math.max(0.1, Math.cos(K.swing || 0)) ** 2 * (K.swing || shy ? 0.25 + 0.75 * (K.pull ?? 1) : 1), lx = c.x + sx * ahead, lz = c.z + sz * ahead, ly = c.y + S[4] + 0.25; if (!K.init) K.look.set(lx, ly, lz); K.look.x += (lx - K.look.x) * Math.min(1, dt * 16); K.look.z += (lz - K.look.z) * Math.min(1, dt * 16); K.look.y += (ly - K.look.y) * Math.min(1, dt * 8);
    K.init = true; K.shake = Math.max(0, K.shake - dt * 3); const s = K.shake * 0.12;
    this.camera.position.set(K.pos.x + (Math.random() - 0.5) * s, K.pos.y + (Math.random() - 0.5) * s, K.pos.z + (Math.random() - 0.5) * s);
    if (shy) { this.leaves(c, c.y + 0.28); const P = this.camera.position, t = rig.solid.sight(c.x, eyeY, c.z, P.x, P.y, P.z), k = K.pull ?? 1; K.pull = t < k ? t : k + (t - k) * Math.min(1, dt * 4); P.set(c.x + (P.x - c.x) * K.pull, eyeY + (P.y - eyeY) * K.pull, c.z + (P.z - c.z) * K.pull); this.close = P.distanceTo(tmpV.set(c.x, eyeY, c.z)) < 0.42; } else { K.pull = 1; }
    this.camera.lookAt(K.look);
    K.fov += (S[3] + (c.boosting ? 7 : 0) - K.fov) * Math.min(1, dt * 4); if (Math.abs(this.camera.fov - K.fov) > 0.02) { this.camera.fov = K.fov; this.camera.updateProjectionMatrix(); }
    this.shadowAt(c.x + sx * 12, c.y, c.z + sz * 12, m === 'top' || m === 'diorama' ? 46 : 38);
    const dist = this.camera.position.distanceTo(tmpV.set(c.x, c.y, c.z)); this.post.focus = dist; this.post.tilt = this.tiltOn ? (m === 'diorama' || m === 'top' ? 1 : 0.5) : 0;
  }
  leaves(c, y) { const u = this.world && this.world.leafCut; if (u) { if (c) u.value.set(c.x, y, c.z, 1); else u.value.w = 0; } }
  // on foot: the side to look from where there is room between houses and trees, straight behind if there is
  swing(c, solid, S, y, dt) {
    const K = this.cam; let best = -9, off = 0; for (let k = -4; k <= 4; k++) { const a = k * 0.36, w = K.yaw + a, t = solid.sight(c.x, y, c.z, c.x - Math.sin(w) * S[0], c.y + S[1], c.z - Math.cos(w) * S[0]), s = t - Math.abs(a) * 0.28 - (solid.post(c.x, c.z, c.x - Math.sin(w) * S[0], c.z - Math.cos(w) * S[0], y + 0.2) ? 0.25 : 0) + (k === (K.side || 0) ? 0.1 : 0); if (s > best) { best = s; off = k; } }
    K.side = off; const w = off * 0.36; K.swing = K.init ? (K.swing || 0) + (w - (K.swing || 0)) * Math.min(1, dt * 4) : w;
  }
  // airplane mode (fly.js): the camera is where one flies
  fly(q) {
    this.usePersp(); this.look = null; const c = this.camera, cp = Math.cos(q.pitch), sx = Math.sin(q.yaw) * cp, sy = Math.sin(q.pitch), sz = Math.cos(q.yaw) * cp;
    c.position.set(q.x, q.y, q.z); c.lookAt(q.x + sx, q.y + sy, q.z + sz); if (c.fov !== 72) { c.fov = 72; c.updateProjectionMatrix(); }
    const g = Math.max(0, this.world.height(q.x, q.z)), up = q.y - g, R = Math.min(150, 42 + up * 0.9), d = R * 0.7; this.shadowAt(q.x + Math.sin(q.yaw) * d, g, q.z + Math.cos(q.yaw) * d, Math.round(R / 12) * 12);
    this.post.focus = 20; this.post.tilt = 0;
  }
  shadowAt(x, y, z, R = 42) {
    if (R > 150) R = 150; const s = this.sun, n = s.shadow.mapSize.x, step = (2 * R) / n; // (stepped, so the edges do not crawl)
    const k = 8 * step; x = Math.round(x / k) * k; z = Math.round(z / k) * k;
    s.target.position.set(x, y, z); s.position.set(x, y, z).addScaledVector(SUN_DIR, 90);
    const c = s.shadow.camera; if (c.right !== R) { Object.assign(c, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 220 }); c.updateProjectionMatrix(); }
  }
  lightCar(c) { const k = Math.max(this.night, (this.wx ? Math.min(1, this.wx.fog * 60 + this.wx.rain * 0.4) : 0) * 0.5); this.headlight.intensity = k * 26; if (k <= 0) return; const sx = Math.sin(c.yaw), sz = Math.cos(c.yaw); this.headlight.position.set(c.x + sx * 0.6, c.y + 0.4, c.z + sz * 0.6); this.headlight.target.position.set(c.x + sx * 8, c.y - 0.6, c.z + sz * 8); }
  // under ground: from far cameras, what is in the way is cut away
  setUnder(on, c) {
    this.under = on; const m = CAMS[this.cam.mode]; cut.at.value.w = on && (m === 'diorama' || m === 'iso' || m === 'top') ? 1 : 0;
    if (!cut.at.value.w) return; this.camera.updateMatrixWorld(); cut.cam.value.copy(this.camera.matrixWorld); cut.at.value.set(c.x, c.y, c.z, m === 'iso' ? Math.max(7, this.ortho.top * 1.25) : m === 'top' ? 9 * this.zoom : 8 * this.zoom);
    if (this.camera === this.ortho) cut.dir.value.set(ISO.x, ISO.y, ISO.z).normalize(); else cut.dir.value.copy(this.camera.position).sub(tmpV.set(c.x, c.y, c.z)).normalize();
  }
  render(dt, now) {
    if (this.lost) return; this.camera.updateMatrixWorld(); cut.cam.value.copy(this.camera.matrixWorld);
    this.sky.position.copy(this.camera.position); this.sky.material.uniforms.uTime.value = now / 1000;
    if (this.world) { const f = Math.min(this.far, this.camera === this.ortho ? 1e3 : 2.9 / this.scene.fog.density); this.world.update(dt, now, this.look || this.camera.position, f); }
    if (this.quality.post) this.post.render(this.scene, this.camera); else { this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera); }
    if (this.watch) this.watch.frame(now);
  }
}
const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), ISO = new THREE.Vector3(1, Math.SQRT2 * Math.tan(Math.asin(1 / Math.sqrt(3))), 1).normalize(), FOG = 0.0021, CALM = WEATHER.clear, GREY = new THREE.Color().setRGB(0.52, 0.55, 0.58), WHITE = new THREE.Color().setRGB(0.78, 0.81, 0.85), NIGHT_GREY = new THREE.Color().setRGB(0.062, 0.060, 0.064), tmpC2 = new THREE.Color();
