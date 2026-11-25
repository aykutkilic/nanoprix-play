// Airplane mode: ⌘⇧D seven times, and one flies about the city (the same again: back to the car, which waits).
// W S fly where one looks, A D to the sides, R up, F down, Shift ten times as fast; the mouse looks about, as in Quake.
import { t } from './i18n.js';
const TIMES = 7, WITHIN = 1500, SPEED = 8, FAST = 10, TURN = 0.0022, STEEP = Math.PI / 2 - 0.02, TOP = 380, BEYOND = 250;
export class Fly {
  constructor(game, el) {
    this.game = game; this.el = el; this.on = false; this.count = 0; this.last = 0;
    this.eye = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, speed: 0, steer: 0, slip: 0, turbo: 0, prog: 0, high: true };
    addEventListener('keydown', (e) => this.knock(e), true);
    document.addEventListener('mousemove', (e) => { if (!this.on || !this.locked || Math.abs(e.movementX) + Math.abs(e.movementY) > 600) return; const q = this.eye; q.yaw = Math.atan2(Math.sin(q.yaw - e.movementX * TURN), Math.cos(q.yaw - e.movementX * TURN)); q.pitch = Math.max(-STEEP, Math.min(STEEP, q.pitch - e.movementY * TURN)); });
    // (Esc lets the mouse go: a click on the picture takes it again)
    addEventListener('pointerdown', (e) => { if (this.on && !this.locked && !(e.target.closest && e.target.closest('button, input, .panel, #find'))) this.grab(); });
  }
  get locked() { return document.pointerLockElement === this.el; }
  grab() { try { const p = this.el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* a click will do it */ } }
  knock(e) {
    if (/^(Meta|Shift)/.test(e.code)) return; if (e.code !== 'KeyD' || !e.metaKey || !e.shiftKey || e.ctrlKey || e.altKey) { this.count = 0; return; }
    e.preventDefault(); if (e.repeat) return; // (else the browser would make bookmarks)
    const now = performance.now(); this.count = now - this.last < WITHIN ? this.count + 1 : 1; this.last = now; if (this.count < TIMES) return;
    this.count = 0; if (this.on) this.stop(); else this.start();
  }
  start() {
    const G = this.game, V = G.view, focus = G.trip.me || G.me || G.leader(); if (!G.active || !focus || this.on) return;
    const q = this.eye; if (V.camera === V.persp) { const p = V.persp.position, m = V.persp.matrixWorld.elements; Object.assign(q, { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-m[8], -m[10]), pitch: Math.max(-STEEP, Math.min(STEEP, Math.asin(Math.max(-1, Math.min(1, -m[9]))))) }); } else Object.assign(q, { x: focus.x - Math.sin(focus.yaw) * 4, y: focus.y + 2.5, z: focus.z - Math.cos(focus.yaw) * 4, yaw: focus.yaw, pitch: -0.3 });
    Object.assign(q, { vx: 0, vy: 0, vz: 0, speed: 0 }); if (G.auto1) G.toggleAuto(); this.on = true; G.input.flying = true; G.input.keys.clear(); V.flying = true; this.grab();
    G.hud.flash(`✈<small>${t('flyKeys')}</small>`, 6000);
  }
  stop(quiet = false) {
    if (!this.on) return; const G = this.game, V = G.view, me = G.me; this.on = false; G.input.flying = false; G.input.keys.clear(); V.flying = false; V.cam.init = false; G.audio.air(0, 0); if (this.locked) document.exitPointerLock();
    if (quiet) return; if (me && Math.hypot(me.x - this.eye.x, me.z - this.eye.z) > 150) V.world.prime(me.x, me.z, 150); G.hud.flash(`<small>${t('flyOff')}</small>`, 1600);
  }
  frame(dt) {
    const q = this.eye, W = this.game.view.world, K = this.game.input.keys, h = (c) => (K.has(c) ? 1 : 0), b = W.bounds;
    const f = h('KeyW') - h('KeyS'), s = h('KeyD') - h('KeyA'), u = h('KeyR') - h('KeyF'), sx = Math.sin(q.yaw), sz = Math.cos(q.yaw), cp = Math.cos(q.pitch);
    let x = sx * cp * f - sz * s, y = Math.sin(q.pitch) * f + u, z = sz * cp * f + sx * s; const l = Math.hypot(x, y, z), v = l > 1e-6 ? (SPEED * (K.has('ShiftLeft') || K.has('ShiftRight') ? FAST : 1)) / l : 0, a = 1 - Math.exp(-dt * 10);
    q.vx += (x * v - q.vx) * a; q.vy += (y * v - q.vy) * a; q.vz += (z * v - q.vz) * a;
    x = q.x + q.vx * dt; z = q.z + q.vz * dt; if (b) { x = Math.max(b.x0 - BEYOND, Math.min(b.x1 + BEYOND, x)); z = Math.max(b.z0 - BEYOND, Math.min(b.z1 + BEYOND, z)); }
    q.x = x; q.z = z; q.y = Math.min(TOP, Math.max(q.y + q.vy * dt, Math.max(0, W.height(x, z)) + 0.5)); q.speed = Math.hypot(q.vx, q.vy, q.vz); return q;
  }
}
