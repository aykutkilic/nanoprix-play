// The inside of things: the driver's seat of the car, a bus, a tram, a train, a ship. The outside of what one sits in is
// left out (transit.js, the car's glass) and this is drawn in its stead, posed as the outside would be; the camera sits
// in it (view.js: the camera `inside`). The mouse (dragged) and, as a passenger, the arrows turn the head; Space changes the seat.
import * as THREE from './vendor/three.module.min.js';
import { isGlass } from './carmodels.js';
import { rng } from './realism.js';
import { Parts, LAMP, lit, rider, seat, COATS, SKINS, HAIRS } from './trim.js';
import { CAR, cockpit, cut } from './cockpit.js';
import { setGlow } from './dash.js';
import { Mirror } from './mirror.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0), BACK = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI), PI = Math.PI;
// ---------------------------------------------------------------- the coach of a bus, a tram, a train
// w half width; y0 floor, yb–yt windows, y1 ceiling; z0 back, z1 front; accent: the line's colour
function coach(k, accent, seed) {
  const S = COACH[k], { w, y0, yb, yt, y1, z0, z1 } = S, P = new Parts(), R = rng(seed * 7919 + 13), L = z1 - z0, zm = (z0 + z1) / 2, wall = S.wall || '#dfe2e2', low = S.low || '#c8cccd', rail = S.rail || '#e8b21c', dark = '#3d434a';
  P.box(w * 2, 0.014, L, 0, y0 - 0.007, zm, S.floor || '#5b5e63'); P.box(0.16, 0.003, L * 0.96, 0, y0 + 0.001, zm, S.floor2 || '#6d7075'); P.box(w * 2 - 0.06, 0.014, L, 0, y1 + 0.007, zm, S.roof || '#eceeee');
  for (const s of [1, -1]) {
    P.box(0.014, yb - y0, L, s * w, (y0 + yb) / 2, zm, low); P.box(0.018, 0.016, L, s * (w - 0.004), yb, zm, S.sill || '#9aa0a4'); P.box(0.014, y1 - yt, L, s * w, (yt + y1) / 2, zm, wall); P.box(0.05, 0.012, L, s * (w - 0.02), y1 - 0.012, zm, wall, 0, 0, -s * 0.7);
    for (const z of S.posts) P.box(0.016, yt - yb, S.postW || 0.026, s * w, (yb + yt) / 2, z, S.post || '#474d54'); P.glass(L, yt - yb, s * w, (yb + yt) / 2, zm, PI / 2);
    for (const z of S.doors) if (S.both || s < 0) { P.box(0.02, yt - y0, 0.022, s * (w - 0.002), (yt + y0) / 2, z - 0.11, dark); P.box(0.02, yt - y0, 0.022, s * (w - 0.002), (yt + y0) / 2, z + 0.11, dark); P.box(0.02, yt - y0, 0.012, s * (w - 0.002), (yt + y0) / 2, z, dark); P.box(0.018, 0.02, 0.22, s * (w - 0.002), y0 + 0.02, z, '#e8b21c'); P.box(0.02, 0.05, 0.2, s * (w - 0.004), yt + 0.03, z, accent); P.rod([s * (w - 0.03), y0, z - 0.13], [s * (w - 0.03), y1, z - 0.13], 0.006, rail); }
    P.rod([s * w * 0.45, y1 - 0.075, z0 + 0.06], [s * w * 0.45, y1 - 0.075, z1 - (S.cab || 0.3)], 0.006, rail); if (!S.old) for (let z = z0 + 0.2; z < z1 - 0.4; z += 0.16) { P.box(0.004, 0.035, 0.007, s * w * 0.45, y1 - 0.094, z, '#55595e'); P.box(0.006, 0.006, 0.034, s * w * 0.45, y1 - 0.124, z, '#22262a'); P.box(0.006, 0.02, 0.006, s * w * 0.45, y1 - 0.114, z + 0.015, '#22262a'); P.box(0.006, 0.02, 0.006, s * w * 0.45, y1 - 0.114, z - 0.015, '#22262a'); }
    P.lamp(0.026, 0.006, L * 0.86, s * w * 0.55, y1 - 0.002, zm);
  }
  // the back: a wall with a window, or a door to the next car
  for (const s of [1, -1]) P.box(w - 0.075, y1 - y0, 0.016, s * (w + 0.075) / 2, (y0 + y1) / 2, z0, wall); P.box(0.15, yb - y0, 0.016, 0, (y0 + yb) / 2, z0, S.gang ? '#3a3d42' : low); P.box(0.15, y1 - yt, 0.016, 0, (yt + y1) / 2, z0, wall);
  // seats, and who sits there
  const tall = y0 + 0.11; for (const [x, z, yaw, who] of S.seats) { seat(P, x, tall, z, S.seatW || 0.1, S.seat || accent, yaw); if (who !== 0 && R() < (who || 0.5)) rider(P, x, tall + 0.012, z + 0.01 * Math.cos(yaw), yaw, R); } for (const [x, z] of S.stand || []) if (R() < 0.5) rider(P, x, y0, z, R() * 6.28, R, false);
  for (const [x, z] of S.poles || []) P.rod([x, y0, z], [x, y1, z], 0.007, rail);
  // the front: what the driver sees through
  const f = z1; P.box(w * 2, yb - 0.02 - y0, 0.016, 0, (y0 + yb - 0.02) / 2, f, low); P.box(w * 2, y1 - yt - 0.03, 0.02, 0, (yt + 0.03 + y1) / 2, f - 0.004, dark); for (const s of [1, -1]) P.box(0.03, yt - yb + 0.1, 0.03, s * (w - 0.012), (yb + yt) / 2, f - 0.004, dark); P.glass(w * 2, yt - yb, 0, (yb + yt) / 2, f);
  if (S.drive) { const dx = S.drive[0], dz = S.drive[1]; P.box(w * 2 - 0.03, 0.05, 0.11, 0, yb - 0.045, f - 0.07, '#1b1e22'); P.box(0.17, 0.035, 0.06, dx, yb - 0.005, f - 0.06, '#2a2e33', -0.4); for (const e of [-0.04, 0.04]) P.put(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 16).rotateX(PI / 2 - 0.4).translate(dx + e, yb + 0.004, f - 0.088), '#46545e'); P.box(0.003, 0.016, 0.002, dx - 0.04, yb + 0.012, f - 0.092, '#ff8a3c', -0.4, 0, 0.5); P.box(0.003, 0.016, 0.002, dx + 0.04, yb + 0.012, f - 0.092, '#ff8a3c', -0.4, 0, -0.7); seat(P, dx, tall, dz, 0.12, '#2a2d33', 0, 0.2); if (S.wheel) { P.put(new THREE.TorusGeometry(0.058, 0.008, 8, 24).rotateX(-PI / 2 + 0.6).translate(dx, yb - 0.005, f - 0.15), '#15171a'); P.rod([dx, yb - 0.06, f - 0.1], [dx, yb - 0.01, f - 0.148], 0.008, '#15171a'); } else { P.put(new THREE.SphereGeometry(0.011, 12, 8).translate(dx - 0.1, yb - 0.004, f - 0.06), '#c8102e'); P.rod([dx + 0.07, yb - 0.02, f - 0.1], [dx + 0.07, yb + 0.03, f - 0.1], 0.008, '#15171a'); } P.box(0.012, yt - y0 - 0.06, 0.2, dx - 0.085 * Math.sign(dx || 1), (y0 + yb) / 2 - 0.03, dz - 0.02, '#8d9296'); rider(P, dx, tall + 0.012, dz + 0.005, 0, rng(5), true); }
  if (S.validator) { const [x, z] = S.validator; P.rod([x, y0, z], [x, y1, z], 0.007, rail); P.box(0.034, 0.06, 0.026, x, y0 + 0.24, z - 0.02, '#f0c419'); P.box(0.026, 0.026, 0.004, x, y0 + 0.25, z - 0.034, '#1b3f8f'); }
  if (S.old) { P.box(w * 2, 0.02, L, 0, y1 - 0.03, zm, '#7a5030'); for (const z of S.posts) P.box(w * 2, 0.02, 0.02, 0, y1 - 0.02, z, '#5c3a20'); }
  return P.group();
}
// the boxes are as the outside of each is (transit.js); seats: [x, z, yaw, how likely taken]
const rows = (x, zs, yaw = 0, who) => zs.flatMap((z) => [1, -1].map((s) => [s * x, z, yaw, who])), bench = (x, zs, who) => zs.flatMap((z) => [1, -1].map((s) => [s * x, z, -s * PI / 2, who])), span = (a, b, n) => Array.from({ length: n }, (_, k) => a + ((b - a) * k) / (n - 1));
const COACH = {
  bus: { w: 0.243, y0: 0.13, yb: 0.375, yt: 0.625, y1: 0.71, z0: -0.85, z1: 0.85, posts: span(-0.84, 0.6, 6), doors: [0.02, 0.56], drive: [0.13, 0.62], wheel: 1, cab: 0.4, seats: [...rows(0.17, [-0.72, -0.56, -0.4, -0.24]), [0.17, 0.08, 0], [0.17, 0.24, 0, 0], [-0.17, 0.3, 0, 0]], stand: [[0.0, -0.1], [-0.03, 0.2]], poles: [[0.09, -0.16], [-0.09, 0.14]], seat: '#24508f', floor: '#565a60', validator: [-0.16, 0.62], look: [[-0.06, 0.52, 0.4, 0, -0.03], [0.15, 0.5, -0.17, 1.05, -0.03], [0, 0.56, -0.6, 0, -0.06], [0.13, 0.475, 0.625, 0, -0.04]] },
  mbus: { w: 0.283, y0: 0.14, yb: 0.415, yt: 0.685, y1: 0.775, z0: -0.85, z1: 0.85, posts: span(-0.84, 0.6, 6), doors: [-0.5, 0.1, 0.62], drive: [0.15, 0.62], wheel: 1, cab: 0.4, seats: [...rows(0.2, [-0.74, -0.3, -0.15], 0, 0.8), [0.2, 0.1, 0], [0.2, 0.26, 0, 0], [0.2, -0.5, 0], [-0.2, 0.34, 0, 0]], stand: [[0, -0.6], [0.05, -0.2], [-0.06, 0.05], [0.02, 0.24]], poles: [[0.1, -0.3], [-0.1, 0.22], [0.1, 0.22]], seat: '#8a1c26', wall: '#e6e2dc', validator: [-0.2, 0.66], look: [[-0.07, 0.565, 0.4, 0, -0.03], [0.19, 0.55, -0.17, 1.05, -0.03], [0, 0.62, -0.7, 0, -0.06], [0.15, 0.5, 0.625, 0, -0.03]] },
  tram: { w: 0.243, y0: 0.11, yb: 0.305, yt: 0.6, y1: 0.69, z0: -0.82, z1: 0.82, posts: span(-0.8, 0.5, 4), doors: [-0.4, 0.4], both: 1, drive: [0, 0.64], cab: 0.36, seats: [...rows(0.17, [-0.7, -0.12, 0.06], 0, 0.6), ...rows(0.17, [0.22], PI, 0.4)], stand: [[0, -0.42], [0.06, -0.3], [-0.05, 0.36]], poles: [[0.08, -0.22], [-0.08, 0.2]], seat: '#2d4f7c', gang: 1, look: [[-0.1, 0.475, 0.42, 0, -0.04], [0.15, 0.45, 0.0, 1.0, -0.03], [0, 0.53, -0.6, 0, -0.05], [0, 0.445, 0.65, 0, -0.04]] },
  old: { w: 0.208, y0: 0.13, yb: 0.375, yt: 0.625, y1: 0.69, z0: -0.69, z1: 0.69, posts: span(-0.62, 0.62, 5), doors: [-0.54, 0.54], both: 1, drive: [0.0, 0.5], cab: 0.3, old: 1, wall: '#8a5a34', low: '#7a4c2a', sill: '#c79a3e', post: '#6d4426', roof: '#e8dcc0', floor: '#5a3d26', floor2: '#6b4a2e', rail: '#c79a3e', seatW: 0.085, seat: '#8a5a34', seats: [...rows(0.14, [-0.36, -0.2, -0.04, 0.12, 0.28], 0, 0.45)], stand: [[0, -0.5]], poles: [], look: [[-0.1, 0.505, 0.36, 0, -0.04], [0.125, 0.5, -0.08, 1.15, -0.03], [0, 0.54, -0.5, 0, -0.05], [0, 0.47, 0.51, 0, -0.04]] },
  metro: { w: 0.31, y0: 0.14, yb: 0.45, yt: 0.665, y1: 0.8, z0: -1.28, z1: 1.28, posts: span(-1.24, 0.95, 7), postW: 0.05, doors: [-0.78, 0, 0.78], both: 1, drive: [0.1, 1.06], cab: 0.34, seats: bench(0.25, [-1.12, -1.0, -0.55, -0.43, -0.31, -0.19, 0.23, 0.35, 0.47, 0.59], 0.55), stand: [[0, -0.8], [0.08, -0.1], [-0.07, 0.1], [0.05, 0.7], [-0.1, 0.84]], poles: [[0, -0.78], [0, 0], [0, 0.78]], seatW: 0.11, gang: 1, look: [[-0.12, 0.6, 0.92, 0, -0.03], [0.2, 0.56, 0.06, 1.2, -0.02], [0, 0.63, -1.1, 0, -0.05], [0.1, 0.5, 1.07, 0, -0.02]] },
  fun: { w: 0.242, y0: 0.14, yb: 0.45, yt: 0.665, y1: 0.8, z0: -0.71, z1: 0.71, posts: span(-0.66, 0.5, 4), doors: [-0.35, 0.35], both: 1, cab: 0.2, seats: bench(0.185, [-0.06, 0.06, -0.6, 0.6], 0.6), stand: [[0, -0.3], [0.06, 0.2]], poles: [[0, -0.35], [0, 0.35]], seatW: 0.1, look: [[0, 0.6, 0.4, 0, -0.03], [0.14, 0.56, 0.06, 1.2, -0.02], [0, 0.63, -0.55, 0, -0.04]] },
};
COACH.rail = { ...COACH.metro, seat: '#1c4f9c', rail: '#d9dde0', low: '#cfd6da' };
// where in the train it is: the first car, and over what length it is laid on the line (as transit.js does)
const LEAD = (K, way) => (way.kind === 'mbus' ? [0.84, 0.62] : way.kind === 'bus' || way.kind === 'old' ? [0, 0.5] : [((K.cars - 1) / 2) * K.pitch, K.pitch * 0.33]);
// ---------------------------------------------------------------- a ship's: places on her (looked up in her model), and a saloon where there is room for one
// [x, y, z (to the bow), yaw, pitch, saloon?]
const SHIP = {
  classic: { look: [[0, 1.08, 2.75, 0, -0.06], [0.42, 0.985, 0.2, 1.25, -0.02, 1], [0, 0.99, -2.0, 0, -0.03, 1], [0, 1.31, 1.42, 0, -0.06]], room: { w: 0.53, y0: 0.81, yb: 0.905, yt: 1.045, y1: 1.095, z0: -2.7, z1: 1.9 } },
  motor: { look: [[0, 0.49, 1.75, 0, -0.04], [0.34, 0.385, 0.2, 1.25, -0.01, 1], [0, 0.76, -0.95, 0, -0.06], [0, 0.66, 1.2, 0, -0.04]], room: { w: 0.44, y0: 0.24, yb: 0.33, yt: 0.435, y1: 0.465, z0: -1.55, z1: 1.35 } },
  seabus: { look: [[0, 0.68, 1.3, 0, -0.03, 1], [0.5, 0.66, 0, 1.25, -0.02, 1], [0, 0.67, -1.6, 0, -0.02, 1], [0, 1.22, 0.42, 0, -0.05]], room: { w: 0.62, y0: 0.5, yb: 0.6, yt: 0.745, y1: 0.8, z0: -1.85, z1: 1.45, blue: 1 } },
  car_ferry: { look: [[1.38, 1.36, 1.2, 0.25, -0.06], [1.4, 1.36, 0, 1.45, -0.06], [0, 0.72, 3.5, 0, -0.04], [0, 1.72, 0.34, 0, -0.1]], room: null }, dolmus: { look: [[0, 0.48, 1.0, 0, -0.04]], room: null },
};
function saloon(kind) {
  const S = SHIP[kind].room; if (!S) return null; const { w, y0, yb, yt, y1, z0, z1 } = S, P = new Parts(), L = z1 - z0, zm = (z0 + z1) / 2, R = rng(77), wood = S.blue ? '#e4e8ea' : '#f0e6cf', sill = S.blue ? '#9fb2bf' : '#8a5a34', bc = S.blue ? '#1f4f86' : '#7a4c2a', h = yb - y0;
  P.box(w * 2, 0.01, L, 0, y0 - 0.005, zm, S.blue ? '#47566a' : '#6b4a2e'); P.box(w * 2, 0.008, L, 0, y1 + 0.004, zm, '#f4f2ea'); for (const s of [1, -1]) { P.box(0.012, h, L, s * w, (y0 + yb) / 2, zm, wood); P.box(0.012, y1 - yt, L, s * w, (y1 + yt) / 2, zm, wood); P.box(0.02, 0.012, L, s * (w - 0.004), yb, zm, sill); for (let z = z0; z <= z1 + 0.01; z += L / 11) P.box(0.012, yt - yb, 0.02, s * w, (yb + yt) / 2, z, sill); P.glass(L, yt - yb, s * w, (yb + yt) / 2, zm, PI / 2); P.lamp(0.02, 0.003, L * 0.9, s * w * 0.45, y1 - 0.001, zm); }
  for (const z of [z0, z1]) { for (const s of [1, -1]) { P.box(w - 0.08, h, 0.01, s * (w + 0.08) / 2, (y0 + yb) / 2, z, wood); P.box(w - 0.08, y1 - yt, 0.01, s * (w + 0.08) / 2, (yt + y1) / 2, z, wood); P.box(0.02, y1 - y0, 0.014, s * 0.09, (y0 + y1) / 2, z, sill); P.box(0.014, yt - yb, 0.012, s * w * 0.6, (yb + yt) / 2, z, sill); } }
  for (let z = z0 + 0.3; z < z1 - 0.25; z += 0.34) for (const s of [1, -1]) for (const [x, n] of S.blue ? [[0.44, 2], [0.18, 1]] : [[0.32, 2]]) { const bw = S.blue ? 0.2 : 0.3; P.box(bw, 0.012, 0.09, s * x, y0 + 0.055, z, bc); P.box(bw, 0.075, 0.014, s * x, y0 + 0.095, z - 0.05, bc); P.box(bw * 0.7, 0.05, 0.03, s * x, y0 + 0.028, z, '#4a3020'); for (let k = 0; k < n; k++) if (R() < 0.4) small(P, s * (x - bw / 4 + (k * bw) / 2), y0 + 0.06, z, R); }
  return P.group();
}
const small = (P, x, y, z, R) => { const coat = COATS[Math.floor(R() * COATS.length)]; P.put(new THREE.CapsuleGeometry(0.025, 0.045, 3, 8).translate(x, y + 0.045, z), coat); P.put(new THREE.SphereGeometry(0.02, 8, 6).translate(x, y + 0.115, z), SKINS[Math.floor(R() * 3)]); P.put(new THREE.SphereGeometry(0.021, 8, 6).translate(x, y + 0.122, z - 0.004), HAIRS[Math.floor(R() * 4)]); };
// ---------------------------------------------------------------- the board over the aisle: the line, and the next stop
class Display {
  constructor() { this.cv = document.createElement('canvas'); this.cv.width = 512; this.cv.height = 96; this.tx = new THREE.CanvasTexture(this.cv); this.tx.colorSpace = THREE.SRGBColorSpace; this.tx.anisotropy = 4; this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 96 / 512), new THREE.MeshBasicMaterial({ map: this.tx, fog: false, toneMapped: false })); this.mesh.rotation.y = PI; this.mesh.frustumCulled = false; this.was = ''; }
  show(ref, color, text, sub) { const k = `${ref}|${text}|${sub}`; if (k === this.was) return; this.was = k; const g = this.cv.getContext('2d'); g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, 512, 96); g.fillStyle = color || '#c8102e'; g.fillRect(0, 0, 92, 96); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 36px "Arial Narrow", Arial, sans-serif'; g.fillText(ref, 46, 50, 84); g.textAlign = 'left'; g.fillStyle = '#9fb0bd'; g.font = '600 24px "Arial Narrow", Arial, sans-serif'; g.fillText(sub, 108, 25, 396); g.fillStyle = '#ffb21c'; g.font = '800 40px "Arial Narrow", Arial, sans-serif'; g.fillText(text, 108, 65, 396); this.tx.needsUpdate = true; }
}
// ================================================================
const A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 }, E = new THREE.Euler(), Q = new THREE.Quaternion(), QL = new THREE.Quaternion(), Pv = V(0, 0, 0);
export class Cabin {
  constructor(view, el) {
    this.view = view; this.scene = view.scene; this.key = ''; this.g = null; this.seats = []; this.n = 0; this.yaw = 0; this.pitch = 0; this.pos = V(0, 0, 0); this.quat = new THREE.Quaternion(); this.on = false; this.glasses = []; this.picked = new Map(); this.drag = null; this.sway = 0; this.hood = new THREE.Object3D(); this.display = new Display();
    el.addEventListener('pointerdown', (e) => { if (!this.on || (e.button && e.button !== 2)) return; this.drag = [e.clientX, e.clientY, e.pointerId]; }); addEventListener('pointerup', () => { this.drag = null; }); addEventListener('pointercancel', () => { this.drag = null; }); el.addEventListener('contextmenu', (e) => { if (this.on) e.preventDefault(); });
    addEventListener('pointermove', (e) => { if (!this.drag || !this.on || e.pointerId !== this.drag[2]) return; this.yaw += (e.clientX - this.drag[0]) * 0.0042; this.pitch += (e.clientY - this.drag[1]) * 0.0036; this.drag[0] = e.clientX; this.drag[1] = e.clientY; this.clamp(); });
  }
  clamp() { this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)); this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch)); }
  // nothing to sit in
  leave() { if (this.key) { this.drop(); this.key = ''; } this.on = false; this.view.cabin = null; const W = this.view.world; if (W) W.inside = null; }
  drop() { if (this.g) { this.scene.remove(this.g); this.g.traverse((o) => { if (o.geometry && o.parent !== this.display.mesh && o !== this.display.mesh) o.geometry.dispose(); }); this.display.mesh.removeFromParent(); this.g = null; } for (const o of this.glasses) o.visible = true; this.glasses.length = 0; if (this.model) this.model.userData.far = null; this.model = null; this.pit = null; if (this.skin) { this.skin[0].geometry = this.skin[1]; this.skin = null; } if (this.mirror) this.mirror.on = false; }
  enter(key, kind, seats, make) { if (this.key === key) return; this.drop(); this.key = key; this.kind = kind; this.seats = seats; this.n = Math.min(this.picked.get(kind) || 0, seats.length - 1); this.yaw = this.pitch = 0; const r = make(); if (r) { this.g = r; this.scene.add(r); } this.view.cam.init = false; }
  turn() { if (!this.on) return; if (this.flip) this.flip(); else this.nextSeat(); }
  nextSeat() { if (!this.on || this.seats.length < 2) return; this.n = (this.n + 1) % this.seats.length; this.picked.set(this.kind, this.n); this.yaw = this.pitch = 0; }
  // the place and the turn of what one sits in → the eye's
  seatAt(p, q, dt, v, sway = 0) {
    const s = this.seats[this.n]; this.sway += dt * (1 + Math.min(12, Math.abs(v)) * 0.8); const k = sway * Math.min(1, Math.abs(v) / 4), sx = Math.sin(this.sway * 2.3) * 0.0016 * k, sy = (Math.sin(this.sway * 5.1) + Math.sin(this.sway * 3.3)) * 0.0011 * k;
    this.pos.set(s[0] + sx, s[1] + sy, s[2]).applyQuaternion(q).add(p); QL.setFromEuler(E.set(-(s[4] || 0) - this.pitch * 0, s[3] + this.yaw, 0, 'YXZ')); this.quat.copy(q).multiply(QL); QL.setFromEuler(E.set(-this.pitch, 0, 0)); this.quat.multiply(QL).multiply(BACK); this.on = true; this.view.cabin = this;
  }
  // how bright it is in here: lamps at night and below ground
  bright(night, under) { lit.value = 0.26 + 0.28 * Math.max(Math.min(1, night), under ? 0.85 : 0); LAMP.color.setRGB(1.15, 1.1, 1.0).multiplyScalar(0.75 + 0.5 * Math.max(night, under ? 1 : 0)); }
  look(inp, dt) { this.yaw -= inp.steer * dt * 1.7; this.pitch += (inp.brake - inp.gas) * -dt * 1.0; this.clamp(); if (inp.drift && !this.was) this.turn(); this.was = inp.drift; }
  // ---- the car. m: its model as it stands now; c: how it goes
  car(m, kind, c, dt, night, under, d = {}, now = 0) {
    const S = CAR[kind] || CAR.taksi; this.enter(`car:${kind}:${m.id}`, 'car', [[...S.eye, 0, S.pitch ?? -0.035], [-Math.abs(S.eye[0]) || 0.001, S.eye[1], S.eye[2], 0, S.pitch ?? -0.02], ...(S.open ? [] : [[0, S.ry - 0.06, S.rb + 0.02, 0, -0.06]])], () => { this.pit = cockpit(kind, (this.mirror ||= new Mirror())); return this.pit.g; }); if (!this.glasses.length) m.traverse((o) => { if (o.isMesh && isGlass(o.material)) { o.visible = false; this.glasses.push(o); } }); for (const o of this.glasses) o.visible = false;
    if (this.model !== m) { this.model = m; if (!S.open) { const skin = m.userData.body.children.find((o) => o.isMesh && o.material === m.userData.paint); if (skin) { this.skin = [skin, skin.geometry]; skin.geometry = cut(kind, skin.geometry); } } }
    const b = m.userData.body; m.updateWorldMatrix(true, false); if (b) { b.updateWorldMatrix(false, false); b.matrixWorld.decompose(Pv, Q, this.hood.scale); } else m.matrixWorld.decompose(Pv, Q, this.hood.scale);
    this.g.position.copy(Pv); this.g.quaternion.copy(Q); this.pit.update(c, dt, d, now, night, under);
    if (!S.open || S.glass) { const M = this.mirror; M.on = true; (M.at ||= V(0, 0, 0)).set(0, S.high || S.ry - 0.04, S.tail).applyQuaternion(Q).add(Pv); (M.q ||= new THREE.Quaternion()).copy(Q); M.hide = [this.g, m]; }
    if (!this.drag && Math.abs(c.speed || 0) > 1.5) { const k = Math.min(1, dt * 1.6); this.yaw -= this.yaw * k; this.pitch -= this.pitch * k; } this.bright(night * 0.5, under); setGlow(night, under); this.seatAt(Pv, Q, dt, c.speed || 0, 1);
  }
  // the navigation's screen, if one sits where it can be read
  get screen() { return this.on && this.pit && this.pit.nav && this.n < 2 && innerWidth > innerHeight * 1.35 ? this.pit.nav : null; }
  // ---- what goes by the timetable: the run p/run of a service, as it is now (w)
  transit(p, run, w, dt, night, under, stop, sub) {
    const way = p.way, K = way.K, [d, s] = LEAD(K, way), kind = COACH[way.kind] ? way.kind : 'bus', S = COACH[kind]; this.enter(`${p.no}:${run}`, kind, S.look.filter((q) => q), () => { const g = coach(kind, way.color || '#c8102e', p.no * 31 + run); const o = this.display.mesh; o.position.set(0, (S.yt + S.y1) / 2 + 0.005, S.z1 - (S.cab || 0.3) + 0.02); const sc = Math.min(S.w * 1.15, (S.y1 - S.yt) * 5.2); o.scale.set(sc, sc, 1); g.add(o); return g; });
    way.at(w.l + d + s, A); way.at(w.l + d - s, B); const yaw = Math.atan2(A.x - B.x, A.z - B.z), pt = Math.atan2(A.y - B.y, s * 2); Pv.set((A.x + B.x) / 2, (A.y + B.y) / 2 + 0.04, (A.z + B.z) / 2); Q.setFromEuler(E.set(-pt, yaw, 0, 'YXZ')); this.g.position.copy(Pv); this.g.quaternion.copy(Q);
    this.display.show(p.ref, way.color, stop, sub); this.view.world.inside = this.inside ||= {}; this.inside.p = p; this.inside.run = run; this.inside.l = w.l; this.bright(night, under); this.seatAt(Pv, Q, dt, w.v || 0, 1);
  }
  // ---- a ship (how she lies: ships.js), dir: −1, a car ferry going the other way about; car: one's own, on her deck
  ship(S, T, now, dt, night, dir, own = null) {
    const W = this.view.world, D = SHIP[S.kind] || SHIP.classic, seats = D.look.map((q) => (dir < 0 ? [-q[0], q[1], -q[2], q[3] + PI, q[4], q[5]] : q)); this.enter(`ship:${S.k}:${dir}:${own ? 1 : 0}`, own ? 'carferry' : S.kind, seats, () => { const g = saloon(S.kind) || new THREE.Group(); return g; });
    const o = W.shipPose(S, T, now, this.hood); this.g.position.copy(o.position); this.g.quaternion.copy(o.quaternion); const room = (this.g.visible = !!this.seats[this.n][5]); W.inside = room ? (this.hull ||= {}) : null; if (room) this.hull.ship = S.k; /* (her windows would show from behind) */ this.bright(night, false); this.seatAt(o.position, o.quaternion, dt, 0); return true;
  }
}
