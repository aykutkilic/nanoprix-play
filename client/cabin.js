// The inside of things: the driver's seat of the car, a bus, a tram, a train, a ship. The outside of what one sits in is
// left out (transit.js, the car's glass) and this is drawn in its stead, posed as the outside would be; the camera sits
// in it (view.js: the camera `inside`). The mouse (dragged) and, as a passenger, the arrows turn the head; Space changes the seat.
import * as THREE from './vendor/three.module.min.js';
import { isGlass } from './carmodels.js';
import { rng } from './realism.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0), BACK = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI), PI = Math.PI;
// ---------------------------------------------------------------- what it is made of: one mesh a cabin, coloured by corner; lit from inside at night and below ground
const lit = { value: 0 };
const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, envMapIntensity: 0.55 }); trim.onBeforeCompile = (s) => { s.uniforms.uLit = lit; s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLit;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uLit;'); };
const pane = new THREE.MeshBasicMaterial({ color: '#9fc4d2', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
class Parts {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.glow = []; this.panes = []; this.c = new THREE.Color(); }
  put(g, color) { const q = g.index ? g.toNonIndexed() : g; this.pos.push(...q.attributes.position.array); this.nor.push(...q.attributes.normal.array); this.c.set(color); for (let i = 0; i < q.attributes.position.count; i++) this.col.push(this.c.r, this.c.g, this.c.b); return this; }
  box(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); return this.put(g.translate(x, y, z), color); }
  rod(a, b, r, color) { const A = V(...a), B = V(...b), d = B.clone().sub(A), l = d.length(), g = new THREE.CylinderGeometry(r, r, l, 8); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); return this.put(g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), color); }
  lamp(w, h, d, x, y, z) { this.glow.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z)); return this; }
  glass(w, h, x, y, z, ry = 0) { this.panes.push(new THREE.PlaneGeometry(w, h).rotateY(ry).translate(x, y, z)); return this; }
  group() {
    const g = new THREE.Group(), b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); b.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); b.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); const m = new THREE.Mesh(b, trim); m.castShadow = m.receiveShadow = true; g.add(m);
    for (const l of this.glow) { const o = new THREE.Mesh(l, LAMP); g.add(o); } for (const p of this.panes) { const o = new THREE.Mesh(p, pane); o.renderOrder = 3; g.add(o); } g.traverse((o) => { o.frustumCulled = false; }); return g;
  }
}
const LAMP = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.1, 1.0), fog: false });
const COATS = ['#32425a', '#7a3b34', '#4d5b3c', '#c9a13a', '#2b2b30', '#8a8f96', '#b7522f', '#5b4a6b'], SKINS = ['#d9a77f', '#c48f68', '#e3b892'], HAIRS = ['#2a1a12', '#15110e', '#5a3a22', '#8a8580'];
// somebody who sits (or stands) there: seen close to, so with a head and arms
function rider(P, x, y, z, yaw, R, sit = true) {
  const coat = COATS[Math.floor(R() * COATS.length)], skin = SKINS[Math.floor(R() * 3)], hair = HAIRS[Math.floor(R() * 4)], c = Math.cos(yaw), s = Math.sin(yaw), at = (u, v, w) => [x + u * c + w * s, y + v, z - u * s + w * c], blob = (r, p, color, sx = 1, sy = 1, sz = 1) => P.put(new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz).rotateY(yaw).translate(...p), color), b = sit ? 0.0 : 0.16;
  P.put(new THREE.CapsuleGeometry(0.036, 0.075, 3, 10).scale(1.12, 1, 0.82).rotateY(yaw).translate(...at(0, b + 0.085, 0)), coat); blob(0.03, at(0, b + 0.205, 0.004), skin, 0.9, 1.1, 1); blob(0.032, at(0, b + 0.216, -0.004), hair, 0.95, 0.92, 1); for (const e of [1, -1]) P.rod(at(e * 0.046, b + 0.13, 0), at(e * 0.05, b + 0.055, 0.035), 0.013, coat);
  if (sit) for (const e of [1, -1]) { P.rod(at(e * 0.02, 0.03, 0.01), at(e * 0.022, 0.03, 0.085), 0.016, '#2c3142'); P.rod(at(e * 0.022, 0.03, 0.085), at(e * 0.022, -0.06, 0.09), 0.014, '#2c3142'); } else for (const e of [1, -1]) P.rod(at(e * 0.018, b + 0.04, 0), at(e * 0.02, 0, 0), 0.016, '#2c3142');
}
const seat = (P, x, y, z, w, color, yaw = 0, back = 0.15) => { const c = Math.cos(yaw), s = Math.sin(yaw); P.box(w, 0.022, 0.1, x, y, z, color, 0, yaw); P.box(w, back, 0.018, x - s * 0.055, y + back / 2, z - c * 0.055, color, 0, yaw); P.box(w * 0.5, 0.09, 0.05, x, y - 0.055, z, '#3a3d42', 0, yaw); };
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
// ---------------------------------------------------------------- the car's: what the outside has not (it keeps its bonnet, pillars and roof)
// eye; belt: the top of the doors; wz where the windscreen starts; rf, rb the roof's front and back, its height and half width
const CAR = {
  taksi: { eye: [0.1, 0.392, -0.11], belt: 0.3, wz: 0.26, rf: 0.03, rb: -0.24, ry: 0.448, rw: 0.19, gw: 0.24, cloth: '#43474e' }, polis: { eye: [0.1, 0.392, -0.11], belt: 0.3, wz: 0.26, rf: 0.03, rb: -0.24, ry: 0.448, rw: 0.19, gw: 0.24, cloth: '#23314c' },
  klasik: { eye: [0.1, 0.4, -0.095], belt: 0.312, wz: 0.23, rf: 0.06, rb: -0.22, ry: 0.452, rw: 0.19, gw: 0.24, cloth: '#7a2f24', wood: 1 }, spor: { eye: [0.1, 0.338, -0.125], belt: 0.256, wz: 0.25, rf: 0.0, rb: -0.17, ry: 0.378, rw: 0.17, gw: 0.236, cloth: '#15161a' },
  dolmus: { eye: [0.125, 0.525, 0.17], belt: 0.412, wz: 0.5, rf: 0.42, rb: -0.58, ry: 0.585, rw: 0.23, gw: 0.27, cloth: '#3a3f47', rows: 3 }, simit: { eye: [0, 0.63, 0.14], open: 1 },
};
function cockpit(kind, R0) {
  const S = CAR[kind] || CAR.taksi, P = new Parts(); void R0; if (S.open) { const g = P.box(0.02, 0.004, 0.02, 0, 0.5, 0.36, '#222').group(); return { g, S, wheel: null, needle: null }; }
  const { belt, wz, rf, rb, ry, rw, gw } = S, ex = S.eye[0], dash = S.wood ? '#6d4426' : '#33373d', hl = S.wood ? '#d8cdb4' : '#c9ccca', zd = wz - 0.1;
  P.box(gw * 2, 0.05, 0.17, 0, belt - 0.018, zd + 0.01, dash); P.box(gw * 2, 0.012, 0.16, 0, belt + 0.01, zd + 0.02, S.wood ? '#7a4c2a' : '#2a2e33', 0.06); P.box(0.14, 0.022, 0.05, ex, belt + 0.019, zd - 0.045, '#25282c', -0.25); P.box(0.12, 0.05, 0.012, 0, belt - 0.02, zd - 0.082, '#0c1116'); P.box(0.1, 0.034, 0.004, 0, belt - 0.018, zd - 0.09, '#2f6ea5'); for (const s of [1, -1]) { P.box(0.05, 0.014, 0.004, s * (gw - 0.05), belt - 0.005, zd - 0.077, '#0c0d0f'); P.box(0.016, 0.016, -(rb - 0.08 - zd), s * (gw + 0.004), belt + 0.006, (zd + rb - 0.08) / 2, S.wood ? '#6d4426' : '#2a2c30'); P.box(0.016, 0.1, -(rb - 0.08 - zd), s * (gw + 0.006), belt - 0.05, (zd + rb - 0.08) / 2, S.cloth); }
  for (const e of [-0.032, 0.032]) P.put(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 24).rotateX(PI / 2 - 0.2).translate(ex + e, belt + 0.008, zd - 0.079), S.wood ? '#f1e6c8' : '#39424c');
  P.box(rw * 2, 0.008, rf - rb, 0, ry, (rf + rb) / 2, hl); P.box(rw * 1.9, 0.014, 0.016, 0, ry - 0.005, rf + 0.004, hl); for (const s of [1, -1]) P.box(0.11, 0.004, 0.04, s * 0.095, ry - 0.012, rf - 0.02, '#b9b4a6', 0.15);
  P.box(gw * 1.98, 0.006, zd - rb + 0.16, 0, belt + 0.003, (zd + rb) / 2 - 0.08, '#2a2c30'); // (over the body's own top)
  // the mirror, with something dark in it; the seats
  P.rod([0, ry, rf + 0.012], [0, ry - 0.02, rf + 0.022], 0.003, '#17181b'); P.box(0.076, 0.021, 0.008, 0, ry - 0.026, rf + 0.022, '#25282c'); P.box(0.07, 0.016, 0.002, 0, ry - 0.026, rf + 0.017, '#6d8896');
  const sy = belt - 0.07, sb = S.eye[2] - 0.065; for (const s of [1, -1]) { P.box(0.15, 0.03, 0.15, s * Math.abs(ex), sy, S.eye[2] + 0.02, S.cloth); P.box(0.145, 0.16, 0.035, s * Math.abs(ex), sy + 0.09, sb - 0.02, S.cloth, -0.12); if (!S.wood) P.box(0.07, 0.04, 0.025, s * Math.abs(ex), sy + 0.2, sb - 0.035, S.cloth); }
  if (S.rows) for (let k = 1; k <= S.rows; k++) { const z = sb - 0.06 - k * 0.19; for (const s of [1, -1]) { seat(P, s * 0.13, belt - 0.09, z + 0.05, 0.15, S.cloth, 0, 0.17); if ((k + s) % 3) rider(P, s * 0.13, belt - 0.08, z + 0.05, 0, rng(k * 5 + s)); } P.box(gw * 2, 0.01, 0.8, 0, belt - 0.17, rb + 0.4, '#2a2c30'); } else { P.box(gw * 1.8, 0.12, 0.05, 0, belt - 0.03, rb - 0.02, S.cloth, -0.2); P.box(gw * 1.9, 0.008, 0.18, 0, belt + 0.006, rb - 0.14, '#1d1f23'); }
  if (kind === 'taksi' || kind === 'dolmus') { P.box(0.045, 0.018, 0.025, -0.01, belt + 0.024, zd, '#25282c'); P.box(0.032, 0.008, 0.002, -0.01, belt + 0.026, zd - 0.013, '#ff5a3c'); P.rod([0, ry - 0.036, rf + 0.022], [0, ry - 0.058, rf + 0.022], 0.0007, '#1c4f9c'); P.put(new THREE.SphereGeometry(0.0055, 14, 10).scale(1, 1, 0.5).translate(0, ry - 0.063, rf + 0.022), '#1d56b8'); P.put(new THREE.SphereGeometry(0.003, 10, 8).scale(1, 1, 0.5).translate(0, ry - 0.063, rf + 0.02), '#f4f6f8'); } // (the taximeter, and a bead against the evil eye)
  const g = P.group(), W = new Parts(); W.put(new THREE.TorusGeometry(0.05, 0.0055, 10, 36), S.wood ? '#4a2c18' : '#17181b'); for (const a of [0, PI * 0.72, -PI * 0.72]) W.rod([0, 0, 0], [Math.sin(a + PI) * 0.047, Math.cos(a + PI) * 0.047, 0], 0.0045, '#2c3036'); W.put(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 20).rotateX(PI / 2), '#22252a');
  for (const a of [1.25, -1.25]) { W.put(new THREE.CapsuleGeometry(0.0085, 0.014, 4, 10).rotateZ(-a + PI / 2).translate(Math.sin(a) * 0.05, Math.cos(a) * 0.05, -0.002), '#d9a77f'); W.rod([Math.sin(a) * 0.055, Math.cos(a) * 0.05 - 0.006, -0.008], [Math.sin(a) * 0.075, -0.05, -0.06], 0.011, '#32425a'); } // (hands)
  const wheel = W.group(), col = new THREE.Group(); col.position.set(ex, belt + 0.004, zd - 0.112); col.rotation.x = 0.38; col.add(wheel); g.add(col);
  const needle = new THREE.Group(); { const N = new Parts().box(0.0025, 0.017, 0.002, 0, 0.0085, 0, '#e02a1c').group(); needle.add(N); needle.position.set(ex - 0.032, belt + 0.009, zd - 0.083); needle.rotation.x = -0.2; g.add(needle); }
  return { g, S, wheel, needle };
}
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
  drop() { if (this.g) { this.scene.remove(this.g); this.g.traverse((o) => { if (o.geometry && o.parent !== this.display.mesh && o !== this.display.mesh) o.geometry.dispose(); }); this.display.mesh.removeFromParent(); this.g = null; } for (const o of this.glasses) o.visible = true; this.glasses.length = 0; if (this.model) this.model.userData.far = null; this.model = null; this.wheel = this.needle = null; }
  enter(key, kind, seats, make) { if (this.key === key) return; this.drop(); this.key = key; this.kind = kind; this.seats = seats; this.n = Math.min(this.picked.get(kind) || 0, seats.length - 1); this.yaw = this.pitch = 0; const r = make(); if (r) { this.g = r; this.scene.add(r); } this.view.cam.init = false; }
  turn() { if (!this.on) return; if (this.flip) this.flip(); else this.nextSeat(); }
  nextSeat() { if (!this.on || this.seats.length < 2) return; this.n = (this.n + 1) % this.seats.length; this.picked.set(this.kind, this.n); this.yaw = this.pitch = 0; }
  // the place and the turn of what one sits in → the eye's
  seatAt(p, q, dt, v, sway = 0) {
    const s = this.seats[this.n]; this.sway += dt * (1 + Math.min(12, Math.abs(v)) * 0.8); const k = sway * Math.min(1, Math.abs(v) / 4), sx = Math.sin(this.sway * 2.3) * 0.0016 * k, sy = (Math.sin(this.sway * 5.1) + Math.sin(this.sway * 3.3)) * 0.0011 * k;
    this.pos.set(s[0] + sx, s[1] + sy, s[2]).applyQuaternion(q).add(p); QL.setFromEuler(E.set(-(s[4] || 0) - this.pitch * 0, s[3] + this.yaw, 0, 'YXZ')); this.quat.copy(q).multiply(QL); QL.setFromEuler(E.set(-this.pitch, 0, 0)); this.quat.multiply(QL).multiply(BACK); this.on = true; this.view.cabin = this;
  }
  // how bright it is in here: lamps at night and below ground
  bright(night, under) { lit.value = 0.2 + 0.32 * Math.max(Math.min(1, night), under ? 0.85 : 0); LAMP.color.setRGB(1.15, 1.1, 1.0).multiplyScalar(0.75 + 0.5 * Math.max(night, under ? 1 : 0)); }
  look(inp, dt) { this.yaw -= inp.steer * dt * 1.7; this.pitch += (inp.brake - inp.gas) * -dt * 1.0; this.clamp(); if (inp.drift && !this.was) this.turn(); this.was = inp.drift; }
  // ---- the car. m: its model as it stands now; c: how it goes
  car(m, kind, c, dt, night, under) {
    const S = CAR[kind] || CAR.taksi; this.enter(`car:${kind}:${m.id}`, 'car', [[...S.eye, 0, -0.035], [-Math.abs(S.eye[0]) || 0.001, S.eye[1], S.eye[2], 0, -0.02], ...(S.open ? [] : [[0, S.ry - 0.06, S.rb + 0.02, 0, -0.06]])], () => { const r = cockpit(kind); this.wheel = r.wheel; this.needle = r.needle; return r.g; }); if (!this.glasses.length) m.traverse((o) => { if (o.isMesh && isGlass(o.material)) { o.visible = false; this.glasses.push(o); } }); this.model = m; for (const o of this.glasses) o.visible = false;
    const b = m.userData.body; m.updateWorldMatrix(true, false); if (b) { b.updateWorldMatrix(false, false); b.matrixWorld.decompose(Pv, Q, this.hood.scale); } else m.matrixWorld.decompose(Pv, Q, this.hood.scale);
    this.g.position.copy(Pv); this.g.quaternion.copy(Q); if (this.wheel) this.wheel.rotation.z = (c.steer || 0) * 1.5; if (this.needle) this.needle.rotation.z = 2.2 - Math.min(1, Math.abs(c.speed || 0) / 19) * 4.4;
    if (!this.drag && Math.abs(c.speed || 0) > 1.5) { const k = Math.min(1, dt * 1.6); this.yaw -= this.yaw * k; this.pitch -= this.pitch * k; } this.bright(night * 0.5, under); this.seatAt(Pv, Q, dt, c.speed || 0, 1);
  }
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
