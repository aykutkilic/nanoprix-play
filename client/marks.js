// The landmarks (the ist project's models, baked by tools/landmarks.mjs), the
// suspension bridges, the Galata bridge, the Maçka cable car.
import * as THREE from './vendor/three.module.min.js';

import { weathered } from './weather.js';

function creased(pos, idx, scale, cos = 0.8) {
  // per corner: the mean of the faces round its vertex that lie within the crease angle
  const n = idx.length, P = new Float32Array(n * 3), N = new Int8Array(n * 4), F = new Float32Array(n), nv = pos.length / 3;
  const start = new Uint32Array(nv + 1); for (let k = 0; k < n; k++) start[idx[k] + 1]++; for (let k = 0; k < nv; k++) start[k + 1] += start[k];
  const list = new Uint32Array(n), fill = start.slice();
  for (let k = 0; k < n; k++) { const i = idx[k] * 3; P[k * 3] = pos[i] * scale; P[k * 3 + 1] = pos[i + 1] * scale; P[k * 3 + 2] = pos[i + 2] * scale; list[fill[idx[k]]++] = (k / 3) | 0; }
  for (let k = 0; k < n; k += 3) { const a = k * 3, ux = P[a + 3] - P[a], uy = P[a + 4] - P[a + 1], uz = P[a + 5] - P[a + 2], vx = P[a + 6] - P[a], vy = P[a + 7] - P[a + 1], vz = P[a + 8] - P[a + 2]; F[k] = uy * vz - uz * vy; F[k + 1] = uz * vx - ux * vz; F[k + 2] = ux * vy - uy * vx; }
  for (let k = 0; k < n; k++) {
    const f = ((k / 3) | 0) * 3, l0 = Math.hypot(F[f], F[f + 1], F[f + 2]) || 1; let x = 0, y = 0, z = 0;
    for (let q = start[idx[k]]; q < start[idx[k] + 1]; q++) { const g = list[q] * 3, l = Math.hypot(F[g], F[g + 1], F[g + 2]) || 1; if ((F[f] * F[g] + F[f + 1] * F[g + 1] + F[f + 2] * F[g + 2]) / (l0 * l) > cos) { x += F[g]; y += F[g + 1]; z += F[g + 2]; } }
    const l = Math.hypot(x, y, z) || 1; N[k * 4] = (x / l) * 127; N[k * 4 + 1] = (y / l) * 127; N[k * 4 + 2] = (z / l) * 127;
  }
  return { P, N };
}
export function buildMarks(W) {
  const { root, A, night, net, height } = W, L = A.landmarks, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide, shadowSide: THREE.BackSide });
  stone.onBeforeCompile = (s) => {
    s.uniforms.uNight = night;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vKind; varying vec3 vL; varying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = floor(color.a * 255.0 + 0.5); vL = (modelMatrix * vec4(position, 0.0)).xyz; vP = (modelMatrix * vec4(position, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying float vKind; varying vec3 vL; varying vec3 vP;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (vKind > 0.5 && vKind < 1.5) roughnessFactor = 0.15; if (vKind > 1.5 && vKind < 2.5) roughnessFactor = 0.3;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (vKind > 1.5 && vKind < 2.5) metalnessFactor = 0.9;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uNight > 0.0) {
          if (vKind > 0.5 && vKind < 1.5) { vec3 c = floor(vP * 3.1); float r = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); totalEmissiveRadiance += mix(vec3(1.0, 0.56, 0.20), vec3(1.0, 0.78, 0.46), r) * uNight * step(0.35, r) * 1.1; }
          else if (vKind < 0.5) totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.66, 0.34) * uNight * (0.30 + 1.15 * exp(-max(vL.y, 0.0) * 0.28)) * (1.0 - 0.6 * abs(normalize(cross(dFdx(vP), dFdy(vP))).y));
          else if (vKind > 2.5) totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.6; }`);
  };
  weathered(stone, { snow: 0.88, wet: 0.2, shine: 0.5 });
  W.marks = [];
  for (const m of L.items) {
    const { P, N } = creased(L.pos.subarray(m.v0 * 3, (m.v0 + m.vn) * 3), L.idx.subarray(m.i0, m.i0 + m.in), m.q);
    const n = m.in, C = new Uint8Array(n * 4), I = new Int16Array(n * 4); void P;
    for (let k = 0; k < n; k++) { const v = m.v0 + L.idx[m.i0 + k], i = v * 4; for (let q = 0; q < 4; q++) C[k * 4 + q] = L.col[i + q]; for (let q = 0; q < 3; q++) I[k * 4 + q] = L.pos[v * 3 + q]; } // (colours already linear, as glTF's are; the fourth: what kind of thing it is)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(I, 4)); g.setAttribute('normal', new THREE.BufferAttribute(N, 4, true)); g.setAttribute('color', new THREE.BufferAttribute(C, 4, true)); g.computeBoundingSphere();
    const o = new THREE.Mesh(g, stone); o.position.set(m.x, m.y, m.z); o.scale.setScalar(m.q); o.castShadow = o.receiveShadow = true; o.name = m.name; root.add(o); o.updateMatrix(); o.matrixAutoUpdate = false; W.keeper.add(o, m.top > 9 ? 9 : m.top > 4 || m.hero ? 2.2 : 1.12);
    W.marks.push({ ...m, obj: o });
    if (W.coast(m.x, m.z) < 10) W.light(m.x, m.z, Math.min(6, m.r * 0.6), 0.5);
  }
  const mat = W.mat, lit = W.lit, piece = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  // ------------------------------------------------------------ the two bridges over the Bosphorus
  W.bridgeLights = [];
  for (const [id, topY] of [['bogaz', 19], ['fsm', 18.4], ['yss', 37]]) {
    const r = net.byId.get(id); if (!r) continue;
    let i0 = -1, i1 = -1; for (let i = 0; i < r.n; i++) if (W.coast(r.p[i * 3], r.p[i * 3 + 1]) < -0.4) { if (i0 < 0) i0 = i; i1 = i; }
    i0 = Math.max(2, i0 - 4); i1 = Math.min(r.n - 3, i1 + 4);
    const g = new THREE.Group(); root.add(g);
    const a = V(r.p[i0 * 3], 0, r.p[i0 * 3 + 1]), b = V(r.p[i1 * 3], 0, r.p[i1 * 3 + 1]), dir = b.clone().sub(a), span = dir.length(), yaw = Math.atan2(dir.x, dir.z); dir.normalize();
    const side = V(dir.z, 0, -dir.x), steel = mat('#aab2b8', { metalness: 0.55, roughness: 0.42 }), portal = lit(steel.clone(), '#3a62ff', 0.5), cable = lit(steel.clone(), '#ff2d55', 3.2), hw = r.hw + 0.42;
    const deck = (t) => { const i = Math.min(r.n - 1.001, Math.max(0, i0 + t * (i1 - i0))), k = Math.floor(i), f = i - k; return r.p[k * 3 + 2] * (1 - f) + r.p[k * 3 + 5] * f; };
    const centre = (t) => { const i = Math.min(r.n - 1.001, Math.max(0, i0 + t * (i1 - i0))), k = Math.floor(i), f = i - k; return V(r.p[k * 3] * (1 - f) + r.p[k * 3 + 3] * f, 0, r.p[k * 3 + 1] * (1 - f) + r.p[k * 3 + 4] * f); };
    for (const [p, t] of [[a, 0], [b, 1]]) {
      const base = Math.min(0.5, height(p.x, p.z)) - 0.6, H = topY - base, dy = deck(t);
      for (const s of [-1, 1]) { const leg = piece(new THREE.BoxGeometry(0.55, H, 0.8), portal, p.x + side.x * s * hw, base + H / 2, p.z + side.z * s * hw, g); leg.rotation.y = yaw; }
      for (const y of [dy - 0.75, (dy + topY) / 2 + 0.6, topY - 0.5]) { const bar = piece(new THREE.BoxGeometry(hw * 2, 0.7, 0.6), portal, p.x, y, p.z, g); bar.rotation.y = yaw; }
    }
    const back = 24, hang = [];
    for (const s of [-1, 1]) {
      const pts = [];
      for (let k = -8; k <= 72; k++) { const t = k / 64; let y, c; if (t < 0 || t > 1) { const e = t < 0 ? -t : t - 1, f = Math.min(1, e * 8); const q = t < 0 ? a.clone().addScaledVector(dir, -f * back) : b.clone().addScaledVector(dir, f * back); c = q; y = topY + (Math.max(height(q.x, q.z), deck(t < 0 ? 0 : 1) - 0.5) - topY) * f; } else { c = centre(t); const u = t * 2 - 1, low = deck(0.5) + 0.55; y = low + (topY - low) * u * u; if (k % 2 === 0 && k > 1 && k < 63) hang.push([c.x + side.x * s * hw, deck(t), c.z + side.z * s * hw, y - deck(t)]); } pts.push(V(c.x + side.x * s * hw, y, c.z + side.z * s * hw)); }
      piece(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.11, 6), cable, 0, 0, 0, g);
    }
    const hi = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4).translate(0, 0.5, 0), cable, hang.length), M = new THREE.Matrix4(); hang.forEach(([x, y, z, h], k) => { M.makeScale(1, h, 1).setPosition(x, y, z); hi.setMatrixAt(k, M); }); hi.computeBoundingSphere(); g.add(hi);
    // the box girder under the deck
    const gp = [], gi = []; for (let k = 0; k <= 60; k++) { const t = k / 60, c = centre(t), y = deck(t); for (const [o, dy] of [[-hw, -0.05], [-hw * 0.6, -0.5], [hw * 0.6, -0.5], [hw, -0.05]]) gp.push(c.x + side.x * o, y + dy, c.z + side.z * o); if (k < 60) for (let q = 0; q < 3; q++) { const n = k * 4 + q; gi.push(n, n + 4, n + 1, n + 1, n + 4, n + 5); } }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setIndex(gi); gg.computeVertexNormals(); const gm = steel.clone(); gm.side = THREE.DoubleSide; const girder = new THREE.Mesh(gg, gm); girder.castShadow = true; g.add(girder);
    W.bridgeLights.push(cable, portal);
    const mid = centre(0.5); for (let k = 0; k <= 12; k++) { const c = centre(k / 12); W.light(c.x, c.z, 3, 0.5); } W.spot(mid.x, 3, mid.z, '#6a7cff', 40, 60);
  }
  W.updates.push((dt, now) => { if (night.value > 0) W.bridgeLights.forEach((m, k) => m.emissive.setHSL(((now / 24000) + k * 0.08) % 1, 0.9, 0.5)); });
  // ------------------------------------------------------------ the Galata bridge: its restaurants below and fishermen above
  { const r = net.byId.get('galata'), m1 = lit(mat('#6d3a2c'), '#ff8a3a', 1.1), rodM = mat('#3a2a1a'), coats = ['#32425a', '#7a3b34', '#4d5b3c', '#c9a13a'].map((c) => mat(c));
    for (let i = 2; i < r.n - 2; i++) { const a = i * 3, x = r.p[a], z = r.p[a + 1], y = r.p[a + 2]; if (W.coast(x, z) > -0.8) continue; const dx = r.p[a + 3] - x, dz = r.p[a + 4] - z, l = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
      for (const s of [-1, 1]) { const nx = (-dz / l) * s, nz = (dx / l) * s; if (Math.abs(i - r.n / 2) > 4) { const o = piece(new THREE.BoxGeometry(0.55, 0.28, 0.98), m1, x + nx * (r.hw - 0.1), y - 0.42, z + nz * (r.hw - 0.1), root); o.rotation.y = yaw; }
        if ((i * 7 + s) % 3 === 0) { piece(new THREE.CapsuleGeometry(0.055, 0.16, 4, 8), coats[(i + (s > 0 ? 2 : 0)) % 4], x + nx * (r.hw + 0.42), y + 0.2, z + nz * (r.hw + 0.42), root); const rod = piece(new THREE.CylinderGeometry(0.008, 0.014, 1.4, 5), rodM, x + nx * (r.hw + 1.0), y + 0.6, z + nz * (r.hw + 1.0), root); rod.rotation.set(0, Math.atan2(nx, nz), 0); rod.rotateX(0.95); } } } }
  // ------------------------------------------------------------ the Maçka – Taşkışla cable car (OSM way 280627255)
  { const P = A.map.teleferik, ends = [P[0], P[P.length - 1]], tower = mat('#8f9aa2', { metalness: 0.5, roughness: 0.5 }), hall = lit(mat('#e9e2d2'), '#ffd28a', 0.5), red = mat('#b8322a', { roughness: 0.4 });
    const pts = P.map(([x, z], k) => { const e = k === 0 || k === P.length - 1; return V(x, height(x, z) + (e ? 1.0 : 2.7), z); }), yaw = Math.atan2(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]), side = V(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(0.5);
    for (const [x, z] of ends) { const y = height(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; root.add(g); piece(new THREE.BoxGeometry(1.9, 0.75, 2.2), hall, 0, 0.35, 0, g); piece(new THREE.BoxGeometry(2.2, 0.12, 2.6), red, 0, 1.75, 0, g); for (const [a, b] of [[-0.9, -1], [0.9, -1], [-0.9, 1], [0.9, 1]]) piece(new THREE.BoxGeometry(0.12, 1.0, 0.12), tower, a, 1.2, b, g); }
    for (let k = 1; k < P.length - 1; k++) { const p = pts[k], gy = height(p.x, p.z); piece(new THREE.CylinderGeometry(0.07, 0.14, p.y - gy + 0.1, 8), tower, p.x, (p.y + gy) / 2, p.z, root); const bar = piece(new THREE.BoxGeometry(1.3, 0.1, 0.14), tower, p.x, p.y + 0.05, p.z, root); bar.rotation.y = yaw; }
    const sag = (k, f) => { const p = pts[k].clone().lerp(pts[k + 1], f); p.y -= Math.sin(f * Math.PI) * 0.22; return p; }, lineM = mat('#23262a');
    const way = []; for (let k = 0; k + 1 < pts.length; k++) for (let q = 0; q < 10; q++) way.push(sag(k, q / 10)); way.push(pts[pts.length - 1]);
    const curves = [-1, 1].map((s) => new THREE.CatmullRomCurve3(way.map((p) => p.clone().addScaledVector(side, s)))); for (const c of curves) piece(new THREE.TubeGeometry(c, 80, 0.02, 4), lineM, 0, 0, 0, root);
    const cab = () => { const g = new THREE.Group(); piece(new THREE.BoxGeometry(0.4, 0.42, 0.5), mat(['#f2f2ee', '#d8342c'][cabs.length % 2], { roughness: 0.35 }), 0, -0.6, 0, g); piece(new THREE.BoxGeometry(0.41, 0.2, 0.51), lit(mat('#26343f', { roughness: 0.15, metalness: 0.4 }), '#ffca7a', 2.2), 0, -0.55, 0, g); piece(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4), lineM, 0, -0.2, 0, g); root.add(g); return g; };
    const cabs = []; for (let k = 0; k < 8; k++) cabs.push(cab());
    W.updates.push((dt, now) => { cabs.forEach((c, k) => { const t = ((now / 42000 + k / 8) % 1) * 2, f = t < 1 ? t : 2 - t; curves[t < 1 ? 0 : 1].getPointAt(f, c.position); c.rotation.y = yaw + (t < 1 ? 0 : Math.PI); c.rotation.z = Math.sin(now / 900 + k) * 0.03; }); });
    W.teleferik = pts[2];
  }
}
