// What openinframap.org shows (tools/infra.mjs): power lines on TEİAŞ's galvanized lattice towers, the Bosphorus crossings red and
// white, 34.5 kV on poles, their wires sagging between; substations behind their fences; communication masts; tanks.
import * as THREE from './vendor/three.module.min.js';
import { kit, kitMaterial, box, cyl } from './squares.js';

const UP = new THREE.Vector3(0, 1, 0);
// a bar from a to b
const bar = (a, b, r) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), l = d.length(); return new THREE.CylinderGeometry(r, r, l, 5).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); };
// a lattice tower: four legs drawn in, rings and crossed braces between, arms (at heights, half lengths) across x; a peak for the earth wire
function lattice(H, base, waist, arms, color, bands = 0) {
  const L = [], levels = 7, col = (y) => (bands ? (Math.floor((y / H) * bands) % 2 ? '#e8e6e0' : '#c2312b') : color), w = (y) => base + (waist - base) * Math.min(1, y / (H * 0.6)), r = H * 0.006 + 0.008;
  for (let k = 0; k < levels; k++) { const y0 = (k / levels) * H * 0.98, y1 = ((k + 1) / levels) * H * 0.98, a = w(y0), b = w(y1), c = col((y0 + y1) / 2);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) L.push([bar([sx * a, y0, sz * a], [sx * b, y1, sz * b], r * 1.3), c]);
    for (const [p, q] of [[[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]], [[-1, 1], [1, 1]]]) { L.push([bar([p[0] * b, y1, p[1] * b], [q[0] * b, y1, q[1] * b], r * 0.8), c]); L.push([bar([p[0] * a, y0, p[1] * a], [q[0] * b, y1, q[1] * b], r * 0.6), c]); L.push([bar([q[0] * a, y0, q[1] * a], [p[0] * b, y1, p[1] * b], r * 0.6), c]); } }
  for (const [y, h] of arms) { const t = w(y), c = col(y); for (const s of [1, -1]) { L.push([bar([s * t, y, t], [s * h, y, 0], r), c], [bar([s * t, y, -t], [s * h, y, 0], r), c], [bar([s * t, y - h * 0.18, 0], [s * h, y, 0], r * 0.8), c]); L.push([box(0.03, h * 0.16, 0.03, s * h, y - h * 0.08, 0), '#5f6e74']); } }
  L.push([bar([waist, H * 0.98, waist], [0, H, 0], r), col(H)], [bar([-waist, H * 0.98, -waist], [0, H, 0], r), col(H)], [bar([waist, H * 0.98, -waist], [0, H, 0], r), col(H)], [bar([-waist, H * 0.98, waist], [0, H, 0], r), col(H)]);
  if (bands) L.push([new THREE.SphereGeometry(0.08, 8, 6).translate(0, H + 0.05, 0), '#ff3020', 1.5]);
  return kit(L);
}
const FAM = {
  380: { H: 6.0, base: 0.55, waist: 0.2, arms: [[0.66, 1.05], [0.8, 1.3], [0.93, 1.0]] }, 154: { H: 4.1, base: 0.36, waist: 0.14, arms: [[0.68, 0.62], [0.82, 0.74], [0.94, 0.6]] },
  cross: { H: 16, base: 1.3, waist: 0.36, arms: [[0.86, 2.2], [0.93, 2.6], [0.985, 2.0]], bands: 9 },
};
export function buildInfra(W) {
  const D = W.A.infra; if (!D) return; const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), mat = kitMaterial(W, { roughness: 0.55, metalness: 0.35 }), plain = kitMaterial(W), group = new THREE.Group(), wires = [];
  const towers = { 380: [], 154: [], cross: [], 34: [] }, at = (f, y, k) => ({ y: f.H * y, h: f.arms ? f.arms[k][1] : 0 });
  for (const L of D.lines) {
    const sup = L.p.map((p, i) => [p, i]).filter(([p]) => p[3]); if (sup.length < 2) continue;
    // each tower turned across the way the line goes there
    const fam = (p) => (L.v === 34 ? null : p[3] === 2 ? FAM.cross : FAM[L.v]), yawOf = (i) => { const a = L.p[Math.max(0, i - 1)], b = L.p[Math.min(L.p.length - 1, i + 1)]; return Math.atan2(b[0] - a[0], b[1] - a[1]); };
    const att = sup.map(([p, i]) => { const f = fam(p), yaw = yawOf(i), c = Math.cos(yaw), s = Math.sin(yaw), pts = []; if (!f) { towers[34].push([p[0], p[2], p[1], yaw]); for (const u of [-0.32, 0, 0.32]) pts.push([p[0] + c * u, p[2] + 1.46 + (u ? 0 : 0.12), p[1] - s * u]); } else { towers[p[3] === 2 ? 'cross' : L.v].push([p[0], p[2], p[1], yaw]); for (let k = 0; k < 3; k++) { const a = at(f, f.arms[k][0], k); for (const side of [1, -1]) pts.push([p[0] + c * a.h * side, p[2] + a.y - a.h * 0.16, p[1] - s * a.h * side]); } pts.push([p[0], p[2] + f.H, p[1]]); } return pts; });
    for (let k = 0; k + 1 < att.length; k++) { const A = att[k], B = att[k + 1], n = Math.min(A.length, B.length), span = Math.hypot(B[0][0] - A[0][0], B[0][2] - A[0][2]), sag = Math.min(4, span * (span > 50 ? 0.05 : 0.03)), seg = span > 50 ? 24 : 8; for (let q = 0; q < n; q++) { const a = A[q], b = B[q]; for (let j = 0; j < seg; j++) { const t0 = j / seg, t1 = (j + 1) / seg, y = (t) => a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t); wires.push(a[0] + (b[0] - a[0]) * t0, y(t0), a[2] + (b[2] - a[2]) * t0, a[0] + (b[0] - a[0]) * t1, y(t1), a[2] + (b[2] - a[2]) * t1); } } }
  }
  const geo = { 380: lattice(FAM[380].H, FAM[380].base, FAM[380].waist, FAM[380].arms.map(([y, h]) => [y * FAM[380].H, h]), '#9aa3a8'), 154: lattice(FAM[154].H, FAM[154].base, FAM[154].waist, FAM[154].arms.map(([y, h]) => [y * FAM[154].H, h]), '#9aa3a8'), cross: lattice(FAM.cross.H, FAM.cross.base, FAM.cross.waist, FAM.cross.arms.map(([y, h]) => [y * FAM.cross.H, h]), '#9aa3a8', FAM.cross.bands),
    34: kit([[cyl(0.06, 0.04, 1.55, 0, -0.1, 0, 6), '#a9a49a'], [box(0.8, 0.05, 0.05, 0, 1.45, 0), '#a9a49a'], ...[-0.32, 0, 0.32].map((u) => [box(0.035, 0.12, 0.035, u, u ? 1.52 : 1.64, 0), '#6c7a82'])]) };
  for (const [k, list] of Object.entries(towers)) { if (!list.length) continue; const m = new THREE.InstancedMesh(geo[k], k === '34' ? plain : mat, list.length); list.forEach(([x, y, z, yaw], i) => { M.compose(P.set(x, y - 0.1, z), Q.setFromAxisAngle(UP, yaw + Math.PI / 2), S); m.setMatrixAt(i, M); }); m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); for (const [x, y, z] of list) (W.posts ||= []).push([x, y, z, k === '34' ? 0.06 : FAM[k].base, 2]); }
  if (wires.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); g.computeBoundingSphere(); group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#30353a', transparent: true, opacity: 0.85 }))); }
  // substations: a gravel yard, a fence, gantries and transformers in rows
  { const L = []; for (const s of D.subs) { const q = s.q, n = q.length; let cx = 0, cz = 0; for (const [a, b] of q) { cx += a / n; cz += b / n; } const sh = new THREE.Shape(q.map(([a, b]) => new THREE.Vector2(a - cx, -(b - cz)))); L.push([new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(cx, s.y + 0.03, cz), '#8d877c']);
      for (let i = 0; i < n; i++) { const a = q[i], b = q[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); L.push([box(0.01, 0.22, l).rotateY(Math.atan2(b[0] - a[0], b[1] - a[1])).translate((a[0] + b[0]) / 2, s.y + 0.11, (a[1] + b[1]) / 2), '#7f8a8f']); }
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [a, b] of q) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); z0 = Math.min(z0, b); z1 = Math.max(z1, b); } const ins = (x, z) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) if ((q[i][1] > z) !== (q[j][1] > z) && x < ((q[j][0] - q[i][0]) * (z - q[i][1])) / (q[j][1] - q[i][1]) + q[i][0]) c = !c; return c; };
      for (let x = x0 + 0.5; x < x1 - 0.4; x += 0.9) for (let z = z0 + 0.5; z < z1 - 0.4; z += 1.1) { if (!ins(x, z) || !ins(x + 0.4, z) || !ins(x - 0.4, z)) continue; const k = Math.round(x * 3 + z * 7) % 3; if (k === 0) L.push([box(0.36, 0.3, 0.26, x, s.y + 0.15, z), '#6d7b6a'], [box(0.4, 0.05, 0.3, x, s.y + 0.32, z), '#55615a'], ...[-0.12, 0, 0.12].map((u) => [box(0.025, 0.16, 0.025, x + u, s.y + 0.42, z), '#c8c4b8'])); else for (const u of [-0.3, 0.3]) L.push([box(0.03, 0.75, 0.03, x + u, s.y + 0.375, z), '#9aa3a8'], [box(0.66, 0.03, 0.03, x, s.y + 0.75, z), '#9aa3a8']); } }
    if (L.length) { const m = new THREE.Mesh(kit(L), plain); m.receiveShadow = m.castShadow = true; group.add(m); } }
  // masts: slim lattice, red and white, dishes and panels at the top; tanks: white, a little domed
  { const L = []; for (const [x, z, y, h] of D.masts) { for (let k = 0; k < 6; k++) L.push([cyl(0.06 - k * 0.006, 0.055 - k * 0.006, h / 6, x, y + (k * h) / 6, z, 4), k % 2 ? '#e9e6df' : '#c2312b']); L.push([box(0.12, 0.2, 0.04, x, y + h * 0.85, z + 0.06), '#d9d6cf'], [box(0.04, 0.2, 0.12, x + 0.06, y + h * 0.78, z), '#d9d6cf'], [new THREE.SphereGeometry(0.035, 6, 4).translate(x, y + h + 0.03, z), '#ff3020', 1.5]); (W.posts ||= []).push([x, y, z, 0.08, 2]); }
    for (const [x, z, y, r, h] of D.tanks) { L.push([cyl(r, r, h, x, y - 0.1, z, 20), '#e6e3dc'], [new THREE.SphereGeometry(r, 20, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.22, 1).translate(x, y + h - 0.1, z), '#d4d1c9'], [cyl(r + 0.02, r + 0.02, 0.05, x, y + h * 0.5, z, 20), '#8c95a0']); (W.posts ||= []).push([x, y, z, r, h]); }
    if (L.length) { const m = new THREE.Mesh(kit(L), plain); m.castShadow = m.receiveShadow = true; group.add(m); } }
  W.root.add(group);
}
