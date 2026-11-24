// What a race puts on the road: the start gate, barriers across the side
// roads, chevrons at the bends, simits, the traffic.
import * as THREE from './vendor/three.module.min.js';
import { makeTrafficModel, animateCar } from './carmodels.js';
import { Crowd } from './crowd.js';
import { drawnAt } from './roads.js';
import { trafficAt } from '../shared/traffic.js';
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
export class CourseView {
  constructor(scene, net, course, simits, traffic, world) { this.net = net;
    this.g = new THREE.Group(); scene.add(this.g); this.course = course; this.simits = simits; this.traffic = traffic; this.scene = scene; this.disposables = [];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const add = (geo, mat, x, y, z, p = this.g) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); this.disposables.push(geo, mat); return o; };
    // the gate and the line
    const s = course.place(0, 0), W = s.hw * 2 + 1.2, gate = new THREE.Group(); gate.position.set(s.x, s.y, s.z); gate.rotation.y = s.yaw; this.g.add(gate);
    const red = new THREE.MeshStandardMaterial({ color: '#c8242a', roughness: 0.5 }), check = canvasTex(512, 64, (g, w, h) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * 32, y * 32, 32, 32); } });
    for (const k of [-1, 1]) add(new THREE.CylinderGeometry(0.12, 0.15, 2.6, 12), red, k * W / 2, 1.3, 0, gate);
    const banner = canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#c8242a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 70px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NANOPRIX  ☾★  İSTANBUL', w / 2, h / 2 + 6); });
    const bm = new THREE.MeshStandardMaterial({ map: banner, emissiveMap: banner, emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.7 }); add(new THREE.BoxGeometry(W, W / 8, 0.16), [red, red, red, red, bm, bm], 0, 2.6, 0, gate);
    const line = add(new THREE.PlaneGeometry(s.hw * 2 - 0.2, 0.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: check, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -6 }), 0, 0.065, 0, gate); line.castShadow = false; line.rotation.x = -Math.atan(s.slope);
    // barriers: across every road that is not raced but opens onto it
    const blocks = [], out = {}, gates = [];
    // the side streets that meet the course: a plain barrier over each mouth
    const plain = [], o2 = {}; for (const r of net.spurs) { let was = null; for (let i = 0; i < r.n; i++) { const x = r.p[i * 3], z = r.p[i * 3 + 1], y = r.p[i * 3 + 2], q = net.at(x, z, y + 0.2, course.only, o2), on = !!q && q.inside > -0.45 && Math.abs(q.h - y) < 0.7; if (was !== null && on !== was) { const k = on ? i - 1 : i, a = Math.max(0, k - 1) * 3, b = Math.min(r.n - 1, k + 1) * 3, dx = r.p[b] - r.p[a], dz = r.p[b + 1] - r.p[a + 1], l = Math.hypot(dx, dz) || 1; for (const u of [-0.42, 0.28]) plain.push([r.p[k * 3] - (dz / l) * u, r.p[k * 3 + 2], r.p[k * 3 + 1] + (dx / l) * u, Math.atan2(dx, dz)]); } was = on; } }
    for (const r of net.main) {
      if (course.only.has(r.index)) continue;
      for (const [h, dir] of [[r.a, 1], [r.b, -1]]) {
        const raced = [...course.only].some((i) => net.roads[i].a === h || net.roads[i].b === h); if (!raced) continue;
        // back from the hub until off the raced ground
        for (let k = 1; k < Math.min(r.n - 2, 22); k++) {
          const i = dir > 0 ? k : r.n - 1 - k, x = r.p[i * 3], z = r.p[i * 3 + 1], y = r.p[i * 3 + 2], a = (i + dir) * 3, dx = (r.p[a] - x) * dir, dz = (r.p[a + 1] - z) * dir, l = Math.hypot(dx, dz) || 1; let clear = true;
          for (const u of [-1, -0.5, 0, 0.5, 1]) { const q = net.at(x - (dz / l) * u * r.hw, z + (dx / l) * u * r.hw, y + 0.2, course.only, out); if (q && q.inside > -0.15 && Math.abs(q.h - y) < 0.8) clear = false; }
          if (clear || k === 21) { for (let u = -r.hw + 0.35; u < r.hw - 0.2; u += 0.72) blocks.push([x - (dz / l) * u, y, z + (dx / l) * u, Math.atan2(dx, dz)]); gates.push({ x, y, z, dx: dx / l, dz: dz / l, hub: h, hw: r.hw }); break; }
        }
      }
    }
    const rw = canvasTex(128, 32, (g) => { for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#f4f1ea' : '#c8242a'; g.fillRect(k * 32, 0, 32, 32); } });
    const inst = (geo, mat, list, put) => { if (!list.length) return null; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((o, k) => { put(o, k, m); m.setMatrixAt(k, M); }); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; this.g.add(m); this.disposables.push(geo, mat); return m; };
    inst(new THREE.BoxGeometry(0.66, 0.34, 0.26).translate(0, 0.17, 0), new THREE.MeshStandardMaterial({ map: rw, roughness: 0.6, emissive: '#ffffff', emissiveMap: rw, emissiveIntensity: 0.08 }), [...blocks, ...plain], ([x, y, z, a]) => M.compose(V(x, y, z), Q.setFromAxisAngle(UP, a), V(1, 1, 1)));
    // ---- the turns: which way the race goes at a hub, and how sharply
    const T = (this.uT = { value: 0 }), N8 = this.uNight = { value: 0 }, turns = [];
    for (const hid of new Set(gates.map((q) => q.hub).concat([...course.only].flatMap((i) => [net.roads[i].a, net.roads[i].b])))) { const h = net.hubs.get(hid); let bi = -1, bd = 1e9; for (let i = 0; i < course.n; i++) { const d = Math.hypot(course.x[i] - h.x, course.z[i] - h.z); if (d < bd) { bd = d; bi = i; } } if (bd > 6) continue; const sAt = course.s[bi], A = course.place(sAt - 9, 0, {}), B = course.place(sAt + 9, 0, {}), an = Math.atan2(A.dx * B.dz - A.dz * B.dx, A.dx * B.dx + A.dz * B.dz); turns.push({ hub: hid, s: sAt, an, out: B, x: h.x, z: h.z, r: h.r || 3 }); } // (an > 0: to the right)
    // amber lamps on the barriers, every other one at a time, like a level crossing's
    const lampM = new THREE.MeshBasicMaterial({ toneMapped: false }); lampM.onBeforeCompile = (q) => { q.uniforms.uT = T; q.vertexShader = q.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPh; varying float vPh;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPh = aPh;'); q.fragmentShader = q.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT; varying float vPh;').replace('#include <color_fragment>', 'float on = smoothstep(0.1, 0.5, sin(uT * 8.5 + vPh * 3.14159)); diffuseColor.rgb = mix(vec3(0.16, 0.07, 0.01), vec3(7.0, 2.9, 0.15), on);'); };
    const lg = new THREE.SphereGeometry(0.085, 10, 8); lg.setAttribute('aPh', new THREE.InstancedBufferAttribute(Float32Array.from(blocks, (_, k) => k % 2), 1)); inst(lg, lampM, blocks, ([x, y, z]) => M.makeTranslation(x, y + 0.43, z)); inst(new THREE.CylinderGeometry(0.05, 0.06, 0.07, 8), new THREE.MeshStandardMaterial({ color: '#1b1c1f' }), blocks, ([x, y, z]) => M.makeTranslation(x, y + 0.365, z));
    // arrow boards of running lamps: on the barriers and on the outside of the bends
    const led = (k) => canvasTex(192, 64, (g, w, h) => { g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; for (let c = 0; c < 3; c++) for (let i = 0; i < 7; i++) { const yy = 8 + i * 8, xx = 18 + c * 62 + (3 - Math.abs(3 - i)) * 9; for (const o of [0, 9]) { g.beginPath(); g.arc(k > 0 ? xx + o : w - xx - o, yy, 3.6, 0, 7); g.fill(); } } });
    const boards = [[], []], posts = [], addBoard = (x, y, z, a, right, big = 1) => { boards[right ? 0 : 1].push([x, y, z, a, big]); };
    for (const q of gates) { const t = turns.find((e) => e.hub === q.hub); if (!t) continue; const fx = t.x - q.x, fz = t.z - q.z, l = Math.hypot(fx, fz) || 1, rx = fz / l, rz = -fx / l, right = t.out.dx * rx + t.out.dz * rz > 0; addBoard(q.x, q.y + 0.36, q.z, Math.atan2(fx, fz), right, q.hw > 2 ? 1.5 : 1.15); }
    for (let i = 0, last = -99; i < course.n; i++) { if (course.s[i] - last < 2.6) continue; const a = (i - 5 + course.n) % course.n, b = (i + 5) % course.n, v = [course.x[i] - course.x[a], course.z[i] - course.z[a]], w = [course.x[b] - course.x[i], course.z[b] - course.z[i]], an = Math.atan2(v[0] * w[1] - v[1] * w[0], v[0] * w[0] + v[1] * w[1]); if (Math.abs(an) < 0.5) continue; last = course.s[i]; let p = null; for (const e of [0.28, 1.2, 2.2, 3.4]) { const c = course.place(course.s[i], -Math.sign(an) * (course.hw[i] + e)), q = net.at(c.x, c.z, c.y, course.only, out); if (!(q && q.inside > -0.1)) { p = c; break; } } if (!p) continue; addBoard(p.x, p.y + 0.42, p.z, p.yaw + Math.PI, an > 0, 0.85); posts.push([p.x, p.y, p.z]); }
    boards.forEach((L, k) => { const tx = led(k ? -1 : 1), m = new THREE.MeshStandardMaterial({ map: tx, color: '#2a2a2c', side: THREE.DoubleSide, roughness: 0.5 }); m.onBeforeCompile = (q) => { q.uniforms.uT = T; q.fragmentShader = q.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n { float u = ${k ? '1.0 - vMapUv.x' : 'vMapUv.x'}, c = floor(u * 3.0), ph = fract(uT * 1.15) * 4.2; float on = step(c, ph - 0.2) * step(ph, 3.9); totalEmissiveRadiance += texture2D(map, vMapUv).r * vec3(5.2, 2.2, 0.12) * (0.05 + on); }`); }; inst(new THREE.PlaneGeometry(1.2, 0.4).translate(0, 0.2, 0), m, L, ([x, y, z, a, b]) => M.compose(V(x, y, z), Q.setFromAxisAngle(UP, a), V(b, b, b))); });
    inst(new THREE.BoxGeometry(0.05, 0.6, 0.05).translate(0, 0.3, 0), new THREE.MeshStandardMaterial({ color: '#2a2b2e' }), posts, ([x, y, z]) => M.makeTranslation(x, y, z));
    // and arrows running along the road through each turn
    const ag = new THREE.BufferGeometry(), chev = (o) => [[-0.62, o - 0.42], [0, o], [0.62, o - 0.42], [0.62, o - 0.12], [0, o + 0.3], [-0.62, o - 0.12]], ap = []; { const c = chev(0); for (const [i, j, k] of [[0, 4, 1], [0, 5, 4], [1, 4, 2], [2, 4, 3]]) for (const q of [i, j, k]) ap.push(c[q][0], 0, c[q][1]); } ag.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
    const arrows = []; for (const t of turns) { if (Math.abs(t.an) < 0.38 && !gates.some((q) => q.hub === t.hub)) continue; const reach = Math.min(16, t.r + 8); for (let s = t.s - reach; s <= t.s + reach * 0.7; s += 1.25) { const p = course.place(s, course.line[course.idx(s)] * 0.35, {}), q = net.at(p.x, p.z, p.y + 0.2, course.only, out); arrows.push([p.x, (q ? q.h : p.y) + 0.05, p.z, p.yaw, p.slope, s - t.s]); } }
    ag.setAttribute('aS', new THREE.InstancedBufferAttribute(Float32Array.from(arrows, (e) => e[5]), 1));
    const am = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -8 }); am.onBeforeCompile = (q) => { q.uniforms.uT = T; q.uniforms.uN = N8; q.vertexShader = q.vertexShader.replace('#include <common>', '#include <common>\nattribute float aS; varying float vS;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = aS;'); q.fragmentShader = q.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT, uN; varying float vS;').replace('#include <color_fragment>', 'float w = fract(vS * 0.16 - uT * 1.25), on = smoothstep(0.55, 1.0, w); diffuseColor = vec4(vec3(2.6, 1.15, 0.06) * (0.35 + on * 1.5) * (1.0 - uN * 0.35), 0.16 + on * 0.78);'); };
    const arrowsM = inst(ag, am, arrows, ([x, y, z, a, sl]) => M.compose(V(x, y, z), Q.setFromEuler(new THREE.Euler(-Math.atan(sl), a, 0, 'YXZ')), V(1, 1, 1))); if (arrowsM) { arrowsM.castShadow = arrowsM.receiveShadow = false; arrowsM.renderOrder = 2; }
    this.turns = turns.length; this.gates = gates; this.crowd = world ? new Crowd(this.g, world, net, course) : null;
    // simits
    this.sm = new THREE.InstancedMesh(new THREE.TorusGeometry(0.26, 0.1, 10, 22), new THREE.MeshStandardMaterial({ color: '#c8772a', roughness: 0.5, emissive: '#b8641a', emissiveIntensity: 0.35 }), Math.max(1, simits.length)); this.sm.castShadow = true; this.sm.frustumCulled = false; this.sm.count = simits.length; this.g.add(this.sm); this.disposables.push(this.sm.geometry, this.sm.material);
    this.tm = traffic.map((v) => { const m = makeTrafficModel(v.kind); m.visible = false; this.g.add(m); return m; });
  }
  update(now, t, car) {
    this.uT.value = (now / 1000) % 1000; this.uNight.value = this.night || 0;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), S = new THREE.Vector3();
    this.simits.forEach((q, k) => { const near = Math.abs(q.x - car.x) + Math.abs(q.z - car.z) < 160, on = near && now > q.taken; M.compose(P.set(q.x, q.y + 0.42 + Math.sin(now / 300 + k) * 0.06, q.z), Q.setFromAxisAngle(UP, now / 600 + k), S.setScalar(on ? 1 : 0.0001)); this.sm.setMatrixAt(k, M); }); this.sm.instanceMatrix.needsUpdate = true;
    this.near = []; this.traffic.forEach((v, k) => { const o = trafficAt(v, this.course, t, (v.o ||= {})), d = Math.hypot(o.x - car.x, o.z - car.z), m = this.tm[k]; m.visible = d < 170; if (!m.visible) return; m.position.set(o.x, o.y + drawnAt(this.net, o.x, o.z, o.y) - 0.004, o.z); m.rotation.set(-Math.atan(o.slope || 0), o.yaw, 0, 'YXZ'); if (d < 60) animateCar(m, o, Math.min(0.1, (now - (this.was || now)) / 1000) || 0.016, this.night || 0); if (d < 6) this.near.push(o); }); this.was = now;
  }
  dispose() { if (this.crowd) this.crowd.dispose(); this.g.traverse((o) => o.isInstancedMesh && o.dispose()); this.scene.remove(this.g); for (const d of this.disposables) for (const x of [].concat(d)) { if (x.map) x.map.dispose(); if (x.dispose) x.dispose(); } }
}

// Traffic over the whole city, for a cruise: only what is near has a model.
export class CityView {
  constructor(scene, groups, net) { this.net = net; this.scene = scene; this.groups = groups; this.pool = []; this.near = []; }
  update(now, t, car) {
    this.near = []; const seen = [];
    for (const { course, list } of this.groups) for (const v of list) { const o = trafficAt(v, course, t, (v.o ||= {})), d = Math.hypot(o.x - car.x, o.z - car.z); if (d < 150) seen.push([d, v, o]); }
    seen.sort((a, b) => a[0] - b[0]); const free = this.pool.filter((m) => !seen.some(([, v]) => m.v === v)); for (const m of free) m.v = null;
    seen.slice(0, 40).forEach(([d, v, o]) => {
      let m = this.pool.find((k) => k.v === v) || this.pool.find((k) => !k.v && k.kind === v.kind);
      if (!m) { m = { kind: v.kind, o: makeTrafficModel(v.kind) }; this.scene.add(m.o); this.pool.push(m); } m.v = v;
      m.o.visible = true; m.o.position.set(o.x, o.y + drawnAt(this.net, o.x, o.z, o.y) - 0.004, o.z); m.o.rotation.set(-Math.atan(o.slope || 0), o.yaw, 0, 'YXZ'); if (d < 60) animateCar(m.o, o, Math.min(0.1, (now - (this.was || now)) / 1000) || 0.016, this.night || 0); if (d < 12) this.near.push(o);
    });
    for (const m of this.pool) if (!m.v) m.o.visible = false; this.was = now;
  }
  dispose() { for (const m of this.pool) this.scene.remove(m.o); this.pool = []; }
}
