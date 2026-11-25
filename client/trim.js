// What the insides are made of: one mesh a cabin, coloured by corner; and who sits there.
import * as THREE from './vendor/three.module.min.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0), PI = Math.PI;
// ---------------------------------------------------------------- what it is made of: one mesh a cabin, coloured by corner; lit from inside at night and below ground
export const lit = { value: 0 };
export const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, envMapIntensity: 0.55 }); const own = (s) => { s.uniforms.uLit = lit; s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLit;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uLit;'); };
trim.onBeforeCompile = own; export const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85, envMapIntensity: 1.1 }); metal.onBeforeCompile = own;
const pane = new THREE.MeshBasicMaterial({ color: '#9fc4d2', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
export class Parts {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.glow = []; this.panes = []; this.c = new THREE.Color(); }
  put(g, color) { const q = g.index ? g.toNonIndexed() : g; this.pos.push(...q.attributes.position.array); this.nor.push(...q.attributes.normal.array); this.c.set(color); for (let i = 0; i < q.attributes.position.count; i++) this.col.push(this.c.r, this.c.g, this.c.b); return this; }
  box(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); return this.put(g.translate(x, y, z), color); }
  rod(a, b, r, color) { const A = V(...a), B = V(...b), d = B.clone().sub(A), l = d.length(), g = new THREE.CylinderGeometry(r, r, l, 8); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); return this.put(g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), color); }
  lamp(w, h, d, x, y, z) { this.glow.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z)); return this; }
  glass(w, h, x, y, z, ry = 0) { this.panes.push(new THREE.PlaneGeometry(w, h).rotateY(ry).translate(x, y, z)); return this; }
  // a profile [z, y] … drawn out along x, smooth where it is not sharp; ends closed or not
  sweep(pts, x0, x1, color, close = true) { const n = pts.length, pos = [], nor = [], N = pts.map((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy) || 1; return [dy / l, -dz / l]; }); for (let i = 0; i + 1 < n; i++) { const A = pts[i], B = pts[i + 1], dz = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dz, dy) || 1, f = [dy / l, -dz / l], m = (q) => (q[0] * f[0] + q[1] * f[1] > 0.82 ? q : f), na = m(N[i]), nb = m(N[i + 1]), v = (x, q, o) => { pos.push(x, q[1], q[0]); nor.push(0, o[1], o[0]); }; v(x0, A, na); v(x1, A, na); v(x1, B, nb); v(x0, A, na); v(x1, B, nb); v(x0, B, nb); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); this.put(g, color); if (close) for (const [x, s] of [[x0, -1], [x1, 1]]) { const c = [pts.reduce((q, e) => q + e[0], 0) / n, pts.reduce((q, e) => q + e[1], 0) / n], P2 = [], N2 = []; for (let i = 0; i + 1 < n; i++) { const tri = [c, pts[i], pts[i + 1]]; for (const e of s > 0 ? tri : tri.slice().reverse()) { P2.push(x, e[1], e[0]); N2.push(s, 0, 0); } } const e = new THREE.BufferGeometry(); e.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); e.setAttribute('normal', new THREE.Float32BufferAttribute(N2, 3)); this.put(e, color); } return this; }
  group(mat = trim) {
    const g = new THREE.Group(), b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); b.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); b.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); const m = new THREE.Mesh(b, mat); m.castShadow = m.receiveShadow = true; g.add(m);
    for (const l of this.glow) { const o = new THREE.Mesh(l, LAMP); g.add(o); } for (const p of this.panes) { const o = new THREE.Mesh(p, pane); o.renderOrder = 3; g.add(o); } g.traverse((o) => { o.frustumCulled = false; }); return g;
  }
}
export const LAMP = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.1, 1.0), fog: false });
// Cabins borrow the trim materials and baked hand meshes across camera changes.
export const sharedInteriorResources = new WeakSet([trim, metal, pane, LAMP]);

export function disposeInterior(group) {
  group.removeFromParent();
  group.userData.disposed = true;
  const owned = new Set();
  group.traverse(({ geometry, material }) => {
    if (geometry && !sharedInteriorResources.has(geometry)) owned.add(geometry);
    if (material && !sharedInteriorResources.has(material)) {
      owned.add(material);
      if (material.map) owned.add(material.map);
    }
  });
  for (const resource of owned) resource.dispose();
}

export const COATS = ['#32425a', '#7a3b34', '#4d5b3c', '#c9a13a', '#2b2b30', '#8a8f96', '#b7522f', '#5b4a6b'], SKINS = ['#d9a77f', '#c48f68', '#e3b892'], HAIRS = ['#2a1a12', '#15110e', '#5a3a22', '#8a8580'];
// somebody who sits (or stands) there: seen close to, so with a head and arms
export function rider(P, x, y, z, yaw, R, sit = true) {
  const coat = COATS[Math.floor(R() * COATS.length)], skin = SKINS[Math.floor(R() * 3)], hair = HAIRS[Math.floor(R() * 4)], c = Math.cos(yaw), s = Math.sin(yaw), at = (u, v, w) => [x + u * c + w * s, y + v, z - u * s + w * c], blob = (r, p, color, sx = 1, sy = 1, sz = 1) => P.put(new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz).rotateY(yaw).translate(...p), color), b = sit ? 0.0 : 0.16;
  P.put(new THREE.CapsuleGeometry(0.036, 0.075, 3, 10).scale(1.12, 1, 0.82).rotateY(yaw).translate(...at(0, b + 0.085, 0)), coat); blob(0.03, at(0, b + 0.205, 0.004), skin, 0.9, 1.1, 1); blob(0.032, at(0, b + 0.216, -0.004), hair, 0.95, 0.92, 1); for (const e of [1, -1]) P.rod(at(e * 0.046, b + 0.13, 0), at(e * 0.05, b + 0.055, 0.035), 0.013, coat);
  if (sit) for (const e of [1, -1]) { P.rod(at(e * 0.02, 0.03, 0.01), at(e * 0.022, 0.03, 0.085), 0.016, '#2c3142'); P.rod(at(e * 0.022, 0.03, 0.085), at(e * 0.022, -0.06, 0.09), 0.014, '#2c3142'); } else for (const e of [1, -1]) P.rod(at(e * 0.018, b + 0.04, 0), at(e * 0.02, 0, 0), 0.016, '#2c3142');
}
export const seat = (P, x, y, z, w, color, yaw = 0, back = 0.15) => { const c = Math.cos(yaw), s = Math.sin(yaw); P.box(w, 0.022, 0.1, x, y, z, color, 0, yaw); P.box(w, back, 0.018, x - s * 0.055, y + back / 2, z - c * 0.055, color, 0, yaw); P.box(w * 0.5, 0.09, 0.05, x, y - 0.055, z, '#3a3d42', 0, yaw); };
