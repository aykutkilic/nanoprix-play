// Traffic lights where OSM has them, each way; zebra crossings, stop lines.
import * as THREE from './vendor/three.module.min.js';
import { frame, zebras } from '../shared/signplan.js';
import { weathered } from './weather.js';
import { lightAt } from '../shared/streets.js';
import { junctionPaint } from '../shared/corners.js';
import { inSetts, inCobbles } from './squares.js';
export function buildSignals(W) {
  const { root, net } = W, st = net.streets; if (!st) return;
  const posts = [], heads = [], lamps = [], out = {}, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const pos = [], col = [], idx = [], yAt = (x, z, y) => { const q = net.at(x, z, y + 0.2, null, out); return (q && Math.abs(q.h - y) < 0.5 ? q.h : y) + 0.052; };
  const quad = (f, u0, u1, s0, s1, c) => { const b = pos.length / 3, rx = -f.dz, rz = f.dx; for (const [u, s] of [[u0, s0], [u1, s0], [u0, s1], [u1, s1]]) { const x = f.x + rx * u + f.dx * s, z = f.z + rz * u + f.dz * s; pos.push(x, yAt(x, z, f.y), z); col.push(c, c, c); } idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); };
  const zebra = (r, s) => { const f = frame(r, s, 1); for (let u = -r.hw + 0.3; u < r.hw - 0.25; u += 0.34) quad(f, u, u + 0.18, -0.45, 0.45, 0.62); };
  for (const { r, s } of zebras(net)) zebra(r, s);
  // where roads meet: stop lines, broken ones where a side street gives way, and arrows on the lanes (shared/corners.js)
  { const setts = inSetts(W.A), cobbled = inCobbles(W.A), tri = (f, pts, c) => { const b = pos.length / 3, rx = -f.dz, rz = f.dx; for (const [u, s] of pts) { const x = f.x + rx * u + f.dx * s, z = f.z + rz * u + f.dz * s; pos.push(x, yAt(x, z, f.y), z); col.push(c, c, c); } idx.push(b, b + 1, b + 2); };
    const head = (f, u, s, a) => { const ux = Math.sin(a), us = Math.cos(a), px = us, ps = -ux; tri(f, [[u + ux * 0.3, s + us * 0.3], [u + px * 0.13, s + ps * 0.13], [u - px * 0.13, s - ps * 0.13]], 0.62); };
    const bar = (f, u0, s0, u1, s1, w) => { const l = Math.hypot(u1 - u0, s1 - s0) || 1, nu = (-(s1 - s0) / l) * w, ns = ((u1 - u0) / l) * w; tri(f, [[u0 + nu, s0 + ns], [u1 + nu, s1 + ns], [u1 - nu, s1 - ns]], 0.62); tri(f, [[u0 + nu, s0 + ns], [u1 - nu, s1 - ns], [u0 - nu, s0 - ns]], 0.62); };
    // a stripe in the world, from (ax, az) to (bx, bz), w either side of its line, at the road's height there
    const line = (ax, az, bx, bz, y, w) => { const l = Math.hypot(bx - ax, bz - az) || 1, nx = (-(bz - az) / l) * w, nz = ((bx - ax) / l) * w, b = pos.length / 3; for (const [x, z] of [[ax + nx, az + nz], [bx + nx, bz + nz], [ax - nx, az - nz], [bx - nx, bz - nz]]) { pos.push(x, yAt(x, z, y), z); col.push(0.62, 0.62, 0.62); } idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); };
    for (const q of junctionPaint(net, st.signals)) {
      if (q.kind === 'gore') { // its two edges back from the nose, and chevrons between them pointing at it
        const { P, u, v, L, M, h } = q, wl = Math.hypot(u[0] + v[0], u[1] + v[1]) || 1, m = [(u[0] + v[0]) / wl, (u[1] + v[1]) / wl], cs = (u[0] * m[0] + u[1] * m[1]) || 1;
        if (setts(P[0], P[1]) || cobbled(P[0], P[1])) continue;
        // chevrons across it, from the edges in to the middle line further back, short of the kerb's nose
        for (let t = 0.55; t < M - 0.12; t += 0.4) { const e = Math.min(L, (t + 0.3) / cs), mx = P[0] + m[0] * t, mz = P[1] + m[1] * t; line(P[0] + u[0] * e, P[1] + u[1] * e, mx, mz, h, 0.03); line(P[0] + v[0] * e, P[1] + v[1] * e, mx, mz, h, 0.03); }
        continue;
      }
      const f = frame(q.r, q.s, q.dir); if (setts(f.x, f.z) || cobbled(f.x, f.z)) continue;
      if (q.kind === 'stop') quad(f, q.r.one ? 0.2 - q.r.hw : 0.08, q.r.hw - 0.2, -0.05, 0.05, 0.62); // (a one-way road's across all of it)
      else if (q.kind === 'giveway') for (let u = 0.1; u < q.r.hw - 0.25; u += 0.2) quad(f, u, u + 0.12, -0.035, 0.035, 0.62);
      else { // an arrow: a stem, and a head for each way on
        const u = q.u, turn = (w) => (w === 'left' ? -1 : 1);
        bar(f, u, -0.5, u, q.ways.includes('through') ? 0.12 : 0.0, 0.035);
        if (q.ways.includes('through')) head(f, u, 0.12, 0);
        for (const w of q.ways) if (w !== 'through') { const k = turn(w); bar(f, u, -0.06, u + k * 0.16, 0.1, 0.035); head(f, u + k * 0.16, 0.1, k * 1.1); }
      }
    }
  }
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
