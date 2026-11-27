// Traffic lights where OSM has them, each way; zebra crossings, stop lines.
import * as THREE from './vendor/three.module.min.js';
import { frame, zebras } from '../shared/signplan.js';
import { weathered } from './weather.js';
import { lightAt } from '../shared/streets.js';
export function buildSignals(W) {
  const { root, net } = W, st = net.streets; if (!st) return;
  const posts = [], heads = [], lamps = [], out = {}, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const pos = [], col = [], idx = [], yAt = (x, z, y) => { const q = net.at(x, z, y + 0.2, null, out); return (q && Math.abs(q.h - y) < 0.5 ? q.h : y) + 0.052; };
  const quad = (f, u0, u1, s0, s1, c) => { const b = pos.length / 3, rx = -f.dz, rz = f.dx; for (const [u, s] of [[u0, s0], [u1, s0], [u0, s1], [u1, s1]]) { const x = f.x + rx * u + f.dx * s, z = f.z + rz * u + f.dz * s; pos.push(x, yAt(x, z, f.y), z); col.push(c, c, c); } idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); };
  const zebra = (r, s) => { const f = frame(r, s, 1); for (let u = -r.hw + 0.3; u < r.hw - 0.25; u += 0.34) quad(f, u, u + 0.18, -0.45, 0.45, 0.62); };
  for (const { r, s } of zebras(net)) zebra(r, s);
  for (const q of st.signals) {
    const r = q.r; if (q.s < 2.5 || q.s > r.len - 2.5) continue; // (its zebra: zebras, above)
    for (const dir of [1, -1]) {
      const f = frame(r, q.s - dir * 0.85, dir), rx = -f.dz, rz = f.dx, yaw = Math.atan2(-f.dx, -f.dz); quad(f, 0.1, r.hw - 0.22, -0.07, 0.07, 0.62);
      const px = f.x + rx * (r.hw + 0.3), pz = f.z + rz * (r.hw + 0.3), k = net.at(px, pz, f.y, null, out); if (k && k.inside > -0.1 && Math.abs(k.h - f.y) < 0.8) continue;
      const wide = r.style !== 'lane' && r.style !== 'street'; posts.push([px, f.y - 0.3, pz, yaw, 0.09, wide ? 2.75 : 1.75, 0.09]); (W.posts ||= []).push([px, f.y, pz, 0.06, 1.4]);
      const head = (x, y, z) => { heads.push([x, y, z, yaw]); [0.2, 0, -0.2].forEach((dy, i) => lamps.push({ x: x - f.dx * 0.1, y: y + dy, z: z - f.dz * 0.1, yaw, i, q })); };
      head(px - f.dx * 0.1, f.y + 1.2, pz - f.dz * 0.1);
      if (wide) { const reach = r.hw * 0.62; posts.push([px - (rx * reach) / 2, f.y + 2.36, pz - (rz * reach) / 2, yaw, reach, 0.07, 0.07]); head(px - rx * reach - f.dx * 0.06, f.y + 2.2, pz - rz * reach - f.dz * 0.06); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, emissive: '#b07a3c', emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, side: THREE.DoubleSide }), paint = new THREE.Mesh(g, pm); W.glow.push([pm, 0.5]); weathered(pm, { snow: 0.75, wet: 0.25, shine: 0.3 }); paint.receiveShadow = true; paint.frustumCulled = false; root.add(paint);
  const dark = W.mat('#23272a', { roughness: 0.6 }), inst = (geo, mat, L, put) => { const o = new THREE.InstancedMesh(geo, mat, L.length); L.forEach((e, k) => { put(e); o.setMatrixAt(k, M); }); o.frustumCulled = false; root.add(o); return o; };
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), W.mat('#6d7377', { metalness: 0.4, roughness: 0.5 }), posts, ([x, y, z, a, w, h, d]) => M.compose(V(x, y, z), Q.setFromAxisAngle(UP, a), V(w, h, d))).castShadow = true;
  inst(new THREE.BoxGeometry(0.26, 0.7, 0.14), dark, heads, ([x, y, z, a]) => M.compose(V(x, y, z), Q.setFromAxisAngle(UP, a), V(1, 1, 1))).castShadow = true;
  const L = inst(new THREE.CircleGeometry(0.082, 14), new THREE.MeshBasicMaterial({ toneMapped: false }), lamps, (e) => M.compose(V(e.x, e.y, e.z), Q.setFromAxisAngle(UP, e.yaw), V(1, 1, 1)));
  const ON = [new THREE.Color(5.5, 0.35, 0.2), new THREE.Color(5, 2.4, 0.15), new THREE.Color(0.2, 4.6, 1.3)], OFF = [new THREE.Color(0.09, 0.012, 0.01), new THREE.Color(0.08, 0.045, 0.006), new THREE.Color(0.008, 0.06, 0.02)];
  lamps.forEach((e, k) => L.setColorAt(k, OFF[e.i])); let last = '';
  // time: the cruise's clock – or null, in a race, when they only flash amber
  W.setLights = (time, now) => {
    const key = time === null ? `f${Math.floor(now / 600) % 2}` : st.signals.map((q) => lightAt(q, time)[0]).join(''); if (key === last) return; last = key;
    lamps.forEach((e, k) => { const s = time === null ? (Math.floor(now / 600) % 2 ? 'amber' : '') : lightAt(e.q, time); L.setColorAt(k, (e.i === 0 && s === 'red') || (e.i === 1 && s === 'amber') || (e.i === 2 && s === 'green') ? ON[e.i] : OFF[e.i]); }); L.instanceColor.needsUpdate = true;
  };
}
