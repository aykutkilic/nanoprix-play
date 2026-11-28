// Airplane mode: ⌘⇧D seven times, and one flies about the city (the same again: back to the car, which waits).
// W S fly where one looks, A D to the sides, R up, F down, Shift ten times as fast; the mouse looks about, as in Quake.
// C (or F2) looks down isometrically instead, from the south-east as the isometric camera does, on the point one looked at:
// W A S D move it about the screen, R and F (and the wheel) zoom out and in; C again flies on from there.
import { t } from './i18n.js';
const TIMES = 7, WITHIN = 1500, SPEED = 8, FAST = 10, TURN = 0.0022, STEEP = Math.PI / 2 - 0.02, TOP = 380, BEYOND = 250;
// the isometric camera's way of looking (view.js' ISO: from (1, 1, 1)), its half height per unit of distance at the fly view's 72°
const ISO_YAW = Math.atan2(-1, -1), ISO_PITCH = -Math.asin(1 / Math.sqrt(3)), HALF = Math.tan((36 * Math.PI) / 180), H0 = 3;
// (no wider than what is drawn about the middle: view.far, the picture's corners some 2.2 half heights away)
const H1 = (V) => V.far / (2.2 * V.zoom);
export class Fly {
  constructor(game, el) {
    this.game = game; this.el = el; this.on = false; this.iso = false; this.count = 0; this.last = 0;
    this.eye = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, speed: 0, steer: 0, slip: 0, turbo: 0, prog: 0, high: true };
    addEventListener('keydown', (e) => this.knock(e), true);
    document.addEventListener('mousemove', (e) => { if (!this.on || this.iso || !this.locked || Math.abs(e.movementX) + Math.abs(e.movementY) > 600) return; const q = this.eye; q.yaw = Math.atan2(Math.sin(q.yaw - e.movementX * TURN), Math.cos(q.yaw - e.movementX * TURN)); q.pitch = Math.max(-STEEP, Math.min(STEEP, q.pitch - e.movementY * TURN)); });
    // (Esc lets the mouse go: a click on the picture takes it again)
    addEventListener('pointerdown', (e) => { if (this.on && !this.iso && !this.locked && !(e.target.closest && e.target.closest('button, input, .panel, #find'))) this.grab(); });
  }
  get locked() { return document.pointerLockElement === this.el; }
  grab() { try { const p = this.el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* a click will do it */ } }
  knock(e) {
    if (this.on && !this.game.input.menu && (e.code === 'KeyC' || e.code === 'F2') && !e.metaKey && !e.ctrlKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '')) { e.preventDefault(); if (!e.repeat) this.turn(); return; }
    if (/^(Meta|Shift)/.test(e.code)) return; if (e.code !== 'KeyD' || !e.metaKey || !e.shiftKey || e.ctrlKey || e.altKey) { this.count = 0; return; }
    e.preventDefault(); if (e.repeat) return; // (else the browser would make bookmarks)
    const now = performance.now(); this.count = now - this.last < WITHIN ? this.count + 1 : 1; this.last = now; if (this.count < TIMES) return;
    this.count = 0; if (this.on) this.stop(); else this.start();
  }
  start() {
    const G = this.game, V = G.view, focus = G.trip.me || G.me || G.leader(); if (!G.active || !focus || this.on) return;
    const q = this.eye; if (V.camera === V.persp) { const p = V.persp.position, m = V.persp.matrixWorld.elements; Object.assign(q, { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-m[8], -m[10]), pitch: Math.max(-STEEP, Math.min(STEEP, Math.asin(Math.max(-1, Math.min(1, -m[9]))))) }); } else Object.assign(q, { x: focus.x - Math.sin(focus.yaw) * 4, y: focus.y + 2.5, z: focus.z - Math.cos(focus.yaw) * 4, yaw: focus.yaw, pitch: -0.3 });
    Object.assign(q, { vx: 0, vy: 0, vz: 0, speed: 0, iso: false }); this.iso = false; if (G.auto1) G.toggleAuto(); this.on = true; G.input.flying = true; G.input.keys.clear(); V.flying = true; this.grab();
    G.hud.flash(`✈<small>${t('flyKeys')}</small>`, 6000);
  }
  stop(quiet = false) {
    if (!this.on) return; const G = this.game, V = G.view, me = G.me; this.on = false; this.iso = this.eye.iso = false; G.input.flying = false; G.input.keys.clear(); V.flying = false; V.cam.init = false; G.audio.air(0, 0); if (this.locked) document.exitPointerLock();
    if (quiet) return; if (me && Math.hypot(me.x - this.eye.x, me.z - this.eye.z) > 150) V.world.prime(me.x, me.z, 150); G.hud.flash(`<small>${t('flyOff')}</small>`, 1600);
  }
  // from flying to the isometric view of where one looked, and back to flying, looking at the same place as the isometric view did
  turn() {
    const q = this.eye, G = this.game, W = G.view.world, g = Math.max(0, W.height(q.x, q.z));
    if (!this.iso) {
      const up = Math.max(1, q.y - g), far = q.pitch < -0.05 ? Math.min(400, up / Math.tan(-q.pitch)) : Math.min(400, up * 2);
      const x = q.x + Math.sin(q.yaw) * far, z = q.z + Math.cos(q.yaw) * far; this.iso = q.iso = true;
      Object.assign(q, { x, z, y: Math.max(0, W.height(x, z)), h: Math.max(H0, Math.min(H1(G.view), Math.hypot(up, far) * HALF)), vx: 0, vy: 0, vz: 0 }); if (this.locked) document.exitPointerLock();
    } else {
      const R = (q.h * G.view.zoom) / HALF, k = R / Math.sqrt(3); this.iso = q.iso = false;
      Object.assign(q, { x: q.x + k, y: Math.min(TOP, q.y + k), z: q.z + k, yaw: ISO_YAW, pitch: ISO_PITCH, vx: 0, vy: 0, vz: 0 }); this.grab();
    }
    G.view.cam.init = false; G.hud.flash(`<small>${t(this.iso ? 'flyIso' : 'flyKeys')}</small>`, this.iso ? 4000 : 2500);
  }
  frame(dt) {
    if (this.iso) return this.glide(dt);
    const q = this.eye, W = this.game.view.world, K = this.game.input.keys, h = (c) => (K.has(c) ? 1 : 0), b = W.bounds;
    const f = h('KeyW') - h('KeyS'), s = h('KeyD') - h('KeyA'), u = h('KeyR') - h('KeyF'), sx = Math.sin(q.yaw), sz = Math.cos(q.yaw);
    // (W, A, S, D keep the height, wherever one looks: only R and F climb and sink)
    let x = sx * f - sz * s, y = u, z = sz * f + sx * s; const l = Math.hypot(x, y, z), v = l > 1e-6 ? (SPEED * (K.has('ShiftLeft') || K.has('ShiftRight') ? FAST : 1)) / l : 0, a = 1 - Math.exp(-dt * 10);
    q.vx += (x * v - q.vx) * a; q.vy += (y * v - q.vy) * a; q.vz += (z * v - q.vz) * a;
    x = q.x + q.vx * dt; z = q.z + q.vz * dt; if (b) { x = Math.max(b.x0 - BEYOND, Math.min(b.x1 + BEYOND, x)); z = Math.max(b.z0 - BEYOND, Math.min(b.z1 + BEYOND, z)); }
    q.x = x; q.z = z; q.y = Math.min(TOP, Math.max(q.y + q.vy * dt, Math.max(0, W.height(x, z)) + 0.5)); q.speed = Math.hypot(q.vx, q.vy, q.vz); return q;
  }
  // isometric: the point looked at moves about the screen (W up the screen, D to its right), as fast as the view is wide; R and F zoom
  glide(dt) {
    const q = this.eye, V = this.game.view, W = V.world, K = this.game.input.keys, h = (c) => (K.has(c) ? 1 : 0), b = W.bounds;
    const f = h('KeyW') - h('KeyS'), s = h('KeyD') - h('KeyA'), u = h('KeyR') - h('KeyF'), sx = Math.sin(ISO_YAW), sz = Math.cos(ISO_YAW), fast = K.has('ShiftLeft') || K.has('ShiftRight');
    q.h = Math.max(H0, Math.min(H1(V), q.h * Math.exp(u * dt * (fast ? 2.4 : 1.2))));
    let x = sx * f - sz * s, z = sz * f + sx * s; const l = Math.hypot(x, z), v = l > 1e-6 ? (Math.max(SPEED, q.h * V.zoom * 1.1) * (fast ? 4 : 1)) / l : 0, a = 1 - Math.exp(-dt * 10);
    q.vx += (x * v - q.vx) * a; q.vz += (z * v - q.vz) * a; q.vy = 0;
    x = q.x + q.vx * dt; z = q.z + q.vz * dt; if (b) { x = Math.max(b.x0 - BEYOND, Math.min(b.x1 + BEYOND, x)); z = Math.max(b.z0 - BEYOND, Math.min(b.z1 + BEYOND, z)); }
    q.x = x; q.z = z; q.y += (Math.max(0, W.height(x, z)) - q.y) * Math.min(1, dt * 6); q.speed = Math.hypot(q.vx, q.vz); return q;
  }
}
