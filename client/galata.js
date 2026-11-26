// The Galata bridge (1994): the road and the T1 on its deck, wide pavements lined with anglers, their rods over the rail
// and their lines down to the water; under it, on either side, a lower level of restaurants and cafés along a promenade,
// with stairs down to it from the pavements; the opening span in the middle on its two great piers. One may walk on all of it.
import * as THREE from './vendor/three.module.min.js';
import { kit, kitMaterial, box, cyl, ball } from './squares.js';

const KERB = 1.75, WALK = 2.72, EDGE = 2.82, SHOP = [0.62, 2.22], PROM = 2.78, FLOOR = 0.3, OPEN = 4.4, STAIR = 1.9, HOLE = [2.0, 2.5];
export function buildGalata(W) {
  const net = W.net, r = net.byId.get('galata'); if (!r) return; const coast = W.coast, R = rngOf(31);
  // the deck: from where it leaves the land to where it reaches it again
  let i0 = -1, i1 = -1; for (let i = 0; i < r.n; i++) if (r.bridge[i] && coast(r.p[i * 3], r.p[i * 3 + 1]) < 0.4) { if (i0 < 0) i0 = i; i1 = i; } if (i0 < 0) return;
  const s0 = r.s[i0], s1 = r.s[i1], mid = (s0 + s1) / 2;
  const F = (s) => { let i = 0; while (i + 2 < r.n && r.s[i + 1] < s) i++; const t = Math.max(0, Math.min(1, (s - r.s[i]) / (r.s[i + 1] - r.s[i] || 1))), a = i * 3, dx = r.p[a + 3] - r.p[a], dz = r.p[a + 4] - r.p[a + 1], l = Math.hypot(dx, dz) || 1; return { x: r.p[a] + dx * t, z: r.p[a + 1] + dz * t, y: r.p[a + 2] + (r.p[a + 5] - r.p[a + 2]) * t, dx: dx / l, dz: dz / l, yaw: Math.atan2(dx, dz) }; };
  const at = (f, u) => [f.x - f.dz * u, f.z + f.dx * u]; // (u: to the left of the way, metres in units)
  // where the restaurants are, and the stairs down to them: each row from just off the shore to the opening span
  const rows = [[s0 + 2.2, mid - OPEN - 0.6], [mid + OPEN + 0.6, s1 - 2.2]], stairs = []; for (const [a, b] of rows) stairs.push([a, a + STAIR, -1], [b - STAIR, b, 1]); // (-1: going down towards the row's far end)
  const inRow = (s) => rows.some(([a, b]) => s > a && s < b), stairAt = (s) => stairs.find(([a, b]) => s >= a && s <= b), shops = (s) => inRow(s) && !stairAt(s);
  const L = [], put = (g, c, e = 0) => L.push([g, c, e]), part = (f, u, du, y0, y1, ds, c, e = 0) => { const [x, z] = at(f, u); put(box(du, y1 - y0, ds).rotateY(f.yaw).translate(x, (y0 + y1) / 2, z), c, e); };
  const STONE = '#b9b1a3', CONC = '#a29b8f', DARK = '#6f6a62', RAIL = '#4a6470', STEEL = '#55697a', CREAM = '#e9dfc9';
  const D = 0.5; // (built in pieces this long)
  for (let s = s0; s < s1 - 1e-3; s += D) {
    const f = F(s + D / 2), y = f.y, ds = D + 0.02, bascule = Math.abs(s + D / 2 - mid) < OPEN, st = stairAt(s + D / 2);
    // the deck's belly, and over the opening its steel
    part(f, 0, KERB * 2, y - 0.34, y - 0.03, ds, bascule ? STEEL : CONC);
    for (const sd of [1, -1]) {
      const u = (q) => q * sd;
      // the kerb, the pavement (with the stairs' hole), its face to the water
      part(f, u(KERB + 0.05), 0.1, y - 0.03, y + 0.13, ds, STONE);
      if (st) { part(f, u((KERB + 0.1 + HOLE[0]) / 2), HOLE[0] - KERB - 0.1, y - 0.18, y + 0.12, ds, '#c9c1b1'); part(f, u((HOLE[1] + EDGE) / 2), EDGE - HOLE[1], y - 0.18, y + 0.12, ds, '#c9c1b1'); }
      else part(f, u((KERB + 0.1 + EDGE) / 2), EDGE - KERB - 0.1, y - 0.18, y + 0.12, ds, '#c9c1b1');
      part(f, u(EDGE + 0.03), 0.06, y - (bascule ? 0.42 : 0.3), y + 0.12, ds, bascule ? STEEL : '#d8d1c2');
      // the rail
      part(f, u(WALK), 0.02, y + 0.36, y + 0.38, ds, RAIL); part(f, u(WALK), 0.01, y + 0.22, y + 0.23, ds, RAIL); part(f, u(WALK), 0.012, y + 0.12, y + 0.36, ds, '#5d7884');
      if (Math.round(s / D) % 2 === 0) { const [x, z] = at(f, u(WALK)); put(cyl(0.012, 0.012, 0.26, x, y + 0.12, z, 6), RAIL); }
      // the stair: steps down, walls, a rail round the hole
      if (st) { const [a, b, dir] = st, k0 = (s - a) / (b - a), k1 = (s + D - a) / (b - a); for (let k = 0; k < 4; k++) { const t = (k0 + ((k + 0.5) / 4) * (k1 - k0)), q = dir < 0 ? 1 - t : t, h = FLOOR + (y + 0.12 - FLOOR) * q, g = F(s + (k + 0.5) * D / 4); part(g, u((HOLE[0] + HOLE[1]) / 2), HOLE[1] - HOLE[0], h - 0.04, h, D / 4 + 0.01, '#bdb5a6'); }
        for (const e of HOLE) { part(f, u(e), 0.04, FLOOR, y + 0.12, ds, '#cfc8b9'); part(f, u(e), 0.02, y + 0.3, y + 0.32, ds, RAIL); } }
      // the lower level: a floor, the restaurants with their fronts to the water, awnings, a rail along the promenade
      if (inRow(s + D / 2)) {
        part(f, u((0 + EDGE) / 2), EDGE, FLOOR - 0.1, FLOOR, ds, '#a8a092');
        if (shops(s + D / 2)) { part(f, u((SHOP[0] + SHOP[1]) / 2), SHOP[1] - SHOP[0], FLOOR, y - 0.34, ds, CREAM); const n = Math.floor((s - s0) / 2.6), hue = ['#a3322b', '#1f5d7a', '#2e6b3c', '#7a4b26', '#253a5a'][(n * 3 + (sd > 0 ? 1 : 0)) % 5];
          part(f, u(SHOP[1] + 0.005), 0.02, FLOOR + 0.06, FLOOR + 0.42, ds * 0.97, '#ffd89a', 0.85); part(f, u(SHOP[1] + 0.012), 0.02, FLOOR + 0.47, FLOOR + 0.56, ds, hue, 0.35);
          const [x, z] = at(f, u(SHOP[1] + 0.2)); put(box(0.42, 0.015, ds).rotateZ(0.32 * sd).rotateY(f.yaw).translate(x, FLOOR + 0.44, z), hue);
          if (Math.round(s / D) % 3 === 1) { const [tx, tz] = at(f, u(SHOP[1] + 0.36)); put(cyl(0.08, 0.08, 0.012, tx, FLOOR + 0.13, tz, 10), '#f4efe4'); put(cyl(0.008, 0.008, 0.13, tx, FLOOR, tz, 5), DARK); for (const q of [-0.13, 0.13]) { const [cx, cz] = at(F(s + D / 2 + q), u(SHOP[1] + 0.36)); put(box(0.05, 0.09, 0.05, cx, FLOOR + 0.045, cz), '#3b3027'); } }
        } else part(f, u((SHOP[0] + HOLE[0]) / 2), HOLE[0] - SHOP[0], FLOOR, y - 0.34, ds, CREAM);
        part(f, u(PROM), 0.015, FLOOR + 0.2, FLOOR + 0.22, ds, RAIL); if (Math.round(s / D) % 2 === 0) { const [x, z] = at(f, u(PROM)); put(cyl(0.01, 0.01, 0.2, x, FLOOR, z, 6), RAIL); }
        if (Math.round(s / D) % 4 === 0) { const [x, z] = at(f, u(SHOP[1] + 0.25)); put(ball(0.04, x, y - 0.4, z, 8), '#fff0c8', 1.4); }
        part(f, u(SHOP[0] - 0.02), 0.04, FLOOR, y - 0.34, ds, '#9b9488');
      }
    }
    // lamps: tall, with two arms, on either side by turns
    if (Math.round(s / D) % 6 === 0) for (const sd of [1, -1]) { const [x, z] = at(f, (WALK - 0.06) * sd), c = Math.cos(f.yaw), n = Math.sin(f.yaw); put(cyl(0.03, 0.02, 1.35, x, y + 0.12, z, 8), '#2f3a40'); for (const e of [-1, 1]) { put(box(0.3, 0.018, 0.018).rotateY(f.yaw + Math.PI / 2).translate(x + n * e * 0.15, y + 1.42, z + c * e * 0.15), '#2f3a40'); put(ball(0.05, x + n * e * 0.3, y + 1.38, z + c * e * 0.3, 8), '#fff1cf', 1.6); } if (Math.round(s / D) % 12 === 0) W.light(x, z, 1.1, 0.8); }
  }
  // the piers: two round legs in the water, and under the opening span's ends two great ones that hold its machinery
  for (let s = s0 + 1.6; s < s1 - 1; s += 3.6) { if (Math.abs(s - mid) < OPEN + 1.2) continue; const f = F(s); for (const sd of [1, -1]) { const [x, z] = at(f, 1.3 * sd); put(cyl(0.3, 0.26, (inRow(s) ? FLOOR - 0.1 : f.y - 0.34) + 1.6, x, -1.6, z, 14), CONC); } }
  for (const e of [-1, 1]) { const f = F(mid + e * (OPEN + 0.4)); const [x, z] = at(f, 0); put(box(EDGE * 2 + 0.4, f.y - 0.34 + 1.6, 1.6).rotateY(f.yaw).translate(x, (f.y - 0.34 - 1.6) / 2, z), '#9e978b'); for (const sd of [1, -1]) { const [px, pz] = at(f, (EDGE + 0.05) * sd); put(box(0.08, 0.36, 0.5).rotateY(f.yaw).translate(px, f.y - 0.2, pz), '#2a3d4a', 0.5); } }
  { const f = F(mid); for (const sd of [1, -1]) { const [x, z] = at(f, (KERB - 0.2) * sd); put(box(0.02, 0.006, 0.14).rotateY(f.yaw).translate(x, f.y + 0.012, z), '#e8c64a'); } } // (where the two leaves meet)
  const M = kitMaterial(W), mesh = new THREE.Mesh(kit(L), M); mesh.castShadow = mesh.receiveShadow = true; mesh.geometry.computeBoundingSphere(); W.still.add(mesh);
  // ---------------------------------------------------------------- the anglers
  const coatP = [], restP = []; for (let s = s0 + 0.6; s < s1 - 0.6; s += 0.36) for (const sd of [1, -1]) { if (stairAt(s) || R() < 0.42) continue; const f = F(s), [x, z] = at(f, (WALK - 0.2) * sd), yaw = f.yaw + (sd > 0 ? -Math.PI / 2 : Math.PI / 2) + (R() - 0.5) * 0.35, k = R() < 0.3 ? 1 : 0; (k ? restP : coatP).push([x, f.y + 0.12, z, yaw, Math.floor(R() * 99)]); }
  const mk = (sit) => { const C = [], O = [], H = sit ? 0.0 : 0.1, coat = '#ffffff', a = (u, v, w) => [u, v, w];
    C.push([new THREE.CapsuleGeometry(0.05, 0.12, 3, 10).scale(1.1, 1, 0.8).translate(0, H + 0.16, 0), coat]);
    for (const e of [1, -1]) { const arm = new THREE.CylinderGeometry(0.015, 0.014, 0.14, 6).rotateX(-1.1).translate(e * 0.05, H + 0.2, 0.06); C.push([arm, coat]); }
    O.push([ball(0.04, 0, H + 0.31, 0.005, 10), '#d9a77f'], [new THREE.CylinderGeometry(0.044, 0.044, 0.03, 12).translate(0, H + 0.345, 0), '#2a2d33'], [new THREE.CylinderGeometry(0.05, 0.05, 0.006, 12).translate(0, H + 0.335, 0.025), '#2a2d33']);
    if (sit) { O.push([box(0.12, 0.1, 0.12, 0, 0.05, -0.02), '#3a6e8f']); for (const e of [1, -1]) O.push([box(0.035, 0.035, 0.12, e * 0.025, 0.1, 0.05), '#2c3142'], [box(0.03, 0.1, 0.03, e * 0.025, 0.05, 0.1), '#2c3142']); }
    else for (const e of [1, -1]) O.push([box(0.034, 0.12, 0.034, e * 0.024, 0.06, 0), '#2c3142']);
    // the rod: from the hands out over the rail and up; the line from its tip to the water
    const h = [0, H + 0.2, 0.13], tip = [0, H + 0.9, 1.05], rod = new THREE.Vector3(...tip).sub(new THREE.Vector3(...h)), l = rod.length(); O.push([new THREE.CylinderGeometry(0.004, 0.009, l, 5).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), rod.clone().normalize())).translate(h[0] + rod.x / 2, h[1] + rod.y / 2, h[2] + rod.z / 2), '#1f1a14']);
    O.push([new THREE.CylinderGeometry(0.0022, 0.0022, 2.2, 3).translate(tip[0], tip[1] - 1.1, tip[2]), '#d9dde0'], [box(0.07, 0.08, 0.07, -0.12, 0.04, 0.04), '#3f7fbf'], [box(0.06, 0.012, 0.02, 0.06, H + 0.21, 0.15), '#6b5a3e']); void a;
    return [kit(C), kit(O)]; };
  const tint = new THREE.Color(), COATS = ['#32425a', '#7a3b34', '#4d5b3c', '#c9a13a', '#2b2b30', '#8a8f96', '#b7522f', '#5b4a6b', '#1f3550', '#6d6252'], Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  const anglers = new THREE.Group(); [[coatP, mk(false)], [restP, mk(true)]].forEach(([list, [cg, og]]) => { if (!list.length) return; for (const [g, col] of [[cg, true], [og, false]]) { const m = new THREE.InstancedMesh(g, M, list.length); list.forEach(([x, y, z, yaw, c], k) => { Mx.compose(P.set(x, y, z), Q.setFromAxisAngle(UP, yaw), S); m.setMatrixAt(k, Mx); if (col) m.setColorAt(k, tint.set(COATS[c % COATS.length])); }); m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); anglers.add(m); } for (const [x, y, z] of list) (W.posts ||= []).push([x, y, z, 0.09, 0.5]); });
  W.still.add(anglers);
  const c = F(mid); W.updates.push((dt, now, cam, far) => { const d = Math.hypot(cam.x - c.x, cam.z - c.z) - (s1 - s0) / 2; mesh.visible = d < (far || 300); anglers.visible = d < Math.min(120, (far || 300) * 0.6); });
  // ---------------------------------------------------------------- where one walks: the pavements, the stairs, the promenade below
  W.walkOn.push((x, z, y) => {
    let best = null, bd = 9; for (let i = Math.max(0, i0 - 1); i < Math.min(r.n - 1, i1 + 1); i++) { const a = i * 3, dx = r.p[a + 3] - r.p[a], dz = r.p[a + 4] - r.p[a + 1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - r.p[a]) * dx + (z - r.p[a + 1]) * dz) / l2)), d = Math.hypot(x - r.p[a] - dx * t, z - r.p[a + 1] - dz * t); if (d < bd) { bd = d; best = [i, t, (-(x - r.p[a]) * dz + (z - r.p[a + 1]) * dx) / Math.sqrt(l2)]; } }
    if (!best || bd > EDGE) return null; const [i, t, u0] = best, s = r.s[i] + (r.s[i + 1] - r.s[i]) * t; if (s < s0 || s > s1) return null; const yd = r.p[i * 3 + 2] + (r.p[i * 3 + 5] - r.p[i * 3 + 2]) * t + 0.12, u = Math.abs(u0), H = [], st = stairAt(s);
    if (u > KERB + 0.05 && u < WALK - 0.03 && !(st && u > HOLE[0] && u < HOLE[1])) H.push(yd);
    if (st && u > HOLE[0] + 0.04 && u < HOLE[1] - 0.04) { const q = (s - st[0]) / (st[1] - st[0]); H.push(FLOOR + (yd - FLOOR) * (st[2] < 0 ? 1 - q : q)); }
    if (inRow(s) && ((u > SHOP[1] + 0.02 && u < PROM - 0.03) || (!shops(s) && u > HOLE[0] && u < PROM - 0.03))) H.push(FLOOR);
    let b = null; for (const h of H) if (Math.abs(h - y) < 0.62 && (b === null || Math.abs(h - y) < Math.abs(b - y))) b = h; return b;
  });
}
function rngOf(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
