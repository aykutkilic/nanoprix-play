// The renderer: sky, sun with a shadow that follows the car, day and night,
// cameras, post-processing. (Light levels are the board game's.)
import * as THREE from './vendor/three.module.min.js';
import { SUN_DIR, HAZE, NIGHT_HAZE, QUALITY, Post, FrameWatch, startQuality, makeSky, skyEnvironment, pixelRatio, gfxChoice, setGfxChoice } from './realism.js';
import { WEATHER } from '../shared/weather.js';
import { cut } from './weather.js';
import { forget } from './gpu.js';
export const CAMS = ['chase', 'near', 'diorama', 'iso', 'top'];
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
    this.fogDay = FOG + w.fog * [1, 1, 0.42, 1, 0.42][this.cam.mode]; this.scene.fog.density = this.camera === this.ortho ? 0.0004 + w.fog * 0.15 : this.fogDay;
    this.sun.color.set('#ffe0b8').lerp(tmpC2.set('#ff9a52'), dusk * 0.8).lerp(tmpC2.set('#c9d4e2'), o * (1 - k)).lerp(tmpC2.set('#8fb0ff'), Math.max(0, k * 2 - 1));
    this.sun.intensity = mix(3.9, 0.9) * (1 - 0.84 * o) + fl * 3.2; this.hemi.intensity = mix(1.25 + o * 0.75, 0.16 + o * 0.05) + fl * 1.4; this.hemi.color.set('#cfe0f2').lerp(tmpC2.set('#d7dbe0'), o).lerp(tmpC2.set('#6f86c8'), k); this.hemi.groundColor.set('#a08a6c').lerp(tmpC2.set('#e2e6ec'), w.snow * 0.8 * (1 - k)).lerp(tmpC2.set('#3a2a1e'), k);
    this.post.exposure = mix(1.32 - w.snow * 0.16, 1.25); this.renderer.toneMappingExposure = this.post.exposure * 0.6; this.post.bloom = mix(0.2 + o * 0.06, 0.42 + o * 0.08);
    if (this.world && this.nightSet !== k) { this.nightSet = k; this.world.setNight(k); }
  }
  nextCam() { this.cam.mode = (this.cam.mode + 1) % CAMS.length; this.cam.init = false; try { localStorage.setItem('nanoprix.cam', CAMS[this.cam.mode]); } catch { /* */ } return CAMS[this.cam.mode]; }
  usePersp() { if (this.camera !== this.persp) { this.camera = this.persp; this.scene.fog.density = this.fogDay ?? FOG; } }
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
    if (CAMS[this.cam.mode] === 'iso') { this.isometric(c, dt); return; }
    this.usePersp(); this.look = null;
    const K = this.cam, m = CAMS[K.mode], v = Math.hypot(c.vx, c.vz), dir = v > 1.2 ? Math.atan2(c.vx, c.vz) : c.yaw;
    let d = dir - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > 1.8) d = 0;
    const want = c.yaw + d * 0.45 + (back ? Math.PI : 0);
    if (!K.init) { K.yaw = want; }
    let e = want - K.yaw; e = Math.atan2(Math.sin(e), Math.cos(e)); K.yaw += e * Math.min(1, dt * (back ? 30 : m === 'diorama' || m === 'top' ? 2.2 : 6.2));
    const S = { chase: [3.7 + v * 0.05, 1.55 + v * 0.012, 2.4, 58 + v * 0.9, 0.35], near: [2.35 + v * 0.03, 0.85, 3.2, 64 + v * 0.9, 0.3], diorama: [13.5 + v * 0.16, 11.5 + v * 0.1, 3.2 + v * 0.16, 34, 0], top: [5.5, 26 + v * 0.3, 2 + v * 0.25, 36, 0] }[m]; if (this.aboard && (m === 'chase' || m === 'near')) { S[0] = 9.5; S[1] = 4.6; S[2] = 1; S[3] = 52; S[4] = 0.6; } const sx = Math.sin(K.yaw), sz = Math.cos(K.yaw);
    const zm = m === 'diorama' || m === 'top' ? this.zoom : 1, px = c.x - sx * S[0] * zm, pz = c.z - sz * S[0] * zm; let py = c.y + S[1] * zm;
    if (this.world && !(this.under && (m === 'chase' || m === 'near'))) py = Math.max(py, this.world.height(px, pz) + 0.5);
    let qx = px, qz = pz; if (this.under && (m === 'chase' || m === 'near')) { const n = this.world.net, q = n.at(px, pz, c.y + 0.15, null, (this.q0 ||= {})); if (q && q.road.tunnel) { const i = q.i * 3, P = q.road.p, cx = P[i] + (P[i + 3] - P[i]) * q.t, cz = P[i + 1] + (P[i + 4] - P[i + 1]) * q.t, k = q.d > 1.1 ? 1.1 / q.d : 1; qx = cx + (px - cx) * k; qz = cz + (pz - cz) * k; py = Math.min(py, q.h + 1.42); } }
    const a = K.init ? Math.min(1, dt * 14) : 1, ay = K.init ? Math.min(1, dt * 7) : 1;
    K.pos.x += (qx - K.pos.x) * a; K.pos.z += (qz - K.pos.z) * a; K.pos.y += (py - K.pos.y) * ay;
    const lx = c.x + sx * S[2], lz = c.z + sz * S[2], ly = c.y + S[4] + 0.25; if (!K.init) K.look.set(lx, ly, lz); K.look.x += (lx - K.look.x) * Math.min(1, dt * 16); K.look.z += (lz - K.look.z) * Math.min(1, dt * 16); K.look.y += (ly - K.look.y) * Math.min(1, dt * 8);
    K.init = true; K.shake = Math.max(0, K.shake - dt * 3); const s = K.shake * 0.12;
    this.camera.position.set(K.pos.x + (Math.random() - 0.5) * s, K.pos.y + (Math.random() - 0.5) * s, K.pos.z + (Math.random() - 0.5) * s); this.camera.lookAt(K.look);
    K.fov += (S[3] + (c.boosting ? 7 : 0) - K.fov) * Math.min(1, dt * 4); if (Math.abs(this.camera.fov - K.fov) > 0.02) { this.camera.fov = K.fov; this.camera.updateProjectionMatrix(); }
    this.shadowAt(c.x + sx * 12, c.y, c.z + sz * 12, m === 'top' || m === 'diorama' ? 46 : 38);
    const dist = this.camera.position.distanceTo(tmpV.set(c.x, c.y, c.z)); this.post.focus = dist; this.post.tilt = this.tiltOn ? (m === 'diorama' || m === 'top' ? 1 : 0.5) : 0;
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
    if (this.lost) return;
    this.sky.position.copy(this.camera.position); this.sky.material.uniforms.uTime.value = now / 1000;
    if (this.world) { const f = Math.min(this.far, this.camera === this.ortho ? 1e3 : 2.9 / this.scene.fog.density); this.world.update(dt, now, this.look || this.camera.position, f); }
    if (this.quality.post) this.post.render(this.scene, this.camera); else { this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera); }
    if (this.watch) this.watch.frame(now);
  }
}
const tmpV = new THREE.Vector3(), ISO = new THREE.Vector3(1, Math.SQRT2 * Math.tan(Math.asin(1 / Math.sqrt(3))), 1).normalize(), FOG = 0.0021, CALM = WEATHER.clear, GREY = new THREE.Color().setRGB(0.52, 0.55, 0.58), WHITE = new THREE.Color().setRGB(0.78, 0.81, 0.85), NIGHT_GREY = new THREE.Color().setRGB(0.062, 0.060, 0.064), tmpC2 = new THREE.Color();
