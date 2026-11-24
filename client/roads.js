// The roads as they are seen: asphalt ribbons with painted lanes, the open
// ground at junctions, kerbs and walls along every free edge, decks on piers,
// street lamps.
import * as THREE from './vendor/three.module.min.js';
import { noiseTexture } from './realism.js';
import { surf, weathered, cutAway, NONE } from './weather.js';
import { buildTube } from './tube.js';
import { pack } from './gpu.js';

// how far above its line a road is drawn (so that none flickers through another)
export const lift = (r) => (r.spur ? -0.003 : 0.004) + RANK[r.style] * 0.007 + (r.index % 5) * 0.0012;
// (the highest of what is drawn there: roads overlap, and a junction's round lies over them)
export const drawnAt = (net, x, z, y) => {
  let m = -1; net.around(x, z, (r, i, t, d, h) => { if (d < r.hw + 0.05 && Math.abs(h - y) < 0.5) m = Math.max(m, lift(r)); });
  for (const d of net.discs) { const dx = d.x - x, dz = d.z - z; if (dx * dx + dz * dz < d.r * d.r && Math.abs(d.h - y) < 1) m = Math.max(m, 0.04 - 0.036 * Math.max(0, Math.hypot(dx, dz) / d.r - 0.85) / 0.15); }
  return m < 0 ? 0.02 : m;
};
const RANK = { spur: 0, lane: 0, street: 0, shore: 1, avenue: 2, motorway: 3 };
export function buildRoads(W) {
  const { root, net, night, height, coast } = W, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const makeAsphalt = (dry) => { const asphalt = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82 });
  asphalt.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uNoise: { value: noiseTexture() }, uNight: dry ? { value: 0.5 } : night, uWet: dry ? NONE : surf.wet, uSnow: dry ? NONE : surf.snow, uRain: dry ? NONE : surf.rain, uTime: surf.time }); cutAway(s);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRoad; attribute float aHub; varying vec4 vRoad; varying float vHub; varying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad; vHub = aHub; vW = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uWet, uSnow, uRain, uTime; float gPud;
      uniform sampler2D uNoise; uniform float uNight; varying vec4 vRoad; varying float vHub; varying vec3 vW;
      float stripe(float x, float w) { float f = fwidth(x); return 1.0 - smoothstep(w, w + f * 1.2, abs(x)); }`)
      .replace('#include <map_fragment>', `
        vec4 n1 = texture2D(uNoise, vW.xz * 0.05), n2 = texture2D(uNoise, vW.xz * 0.9);
        vec3 c = mix(vec3(0.070, 0.072, 0.078), vec3(0.105, 0.102, 0.098), n1.r) * (0.80 + n2.b * 0.42);
        float u = vRoad.x, hw = vRoad.z, mw = step(2.5, vRoad.w), lanes = mw > 0.5 ? 3.0 : vRoad.w > 1.5 ? 2.0 : vRoad.w > 0.5 ? 2.0 : 1.0;
        float lw = (hw - 0.2) / lanes, a = abs(u), dash = smoothstep(0.02, 0.0, abs(fract(vRoad.y / 2.4) - 0.5) - 0.25);
        // worn wheel tracks
        c *= 1.0 - 0.10 * exp(-pow((mod(a, lw) - lw * 0.5) / (lw * 0.26), 2.0)) * n1.g;
        float q = a / lw, near = abs(q - floor(q + 0.5)) * lw, inner = step(0.5, q) * step(q, lanes - 0.5);
        float paint = stripe(near, 0.028) * inner * dash;
        vec3 pc = vec3(0.62);
        float edge = stripe(a - (hw - 0.16), 0.030);
        float mid = lanes > 1.5 ? stripe(a - 0.07, 0.026) : stripe(a, 0.03) * dash;
        float m = max(max(paint, edge), mid) * smoothstep(0.0, 0.8, vHub) * (0.65 + 0.35 * n2.g);
        pc = mix(pc, vec3(0.78, 0.52, 0.08), step(a, 0.25) * step(1.5, lanes));
        c = mix(c, pc, m * 0.9);
        // wet: dark, with puddles; white: but for the tracks of the wheels
        gPud = smoothstep(0.56, 0.70, texture2D(uNoise, vW.xz * 0.085).g * 0.7 + n1.g * 0.3) * uWet; c *= 1.0 - 0.26 * uWet; c = mix(c, c * 0.7, gPud);
        float rut = max(exp(-pow((mod(a, lw) - lw * 0.5 - 0.22) / 0.11, 2.0)), exp(-pow((mod(a, lw) - lw * 0.5 + 0.22) / 0.11, 2.0))), sn = uSnow * smoothstep(0.15, 0.5, texture2D(uNoise, vW.xz * 0.06).r * 0.5 + texture2D(uNoise, vW.xz * 0.4).g * 0.5 + smoothstep(hw * 0.55, hw, a) * 0.5 + 0.12) * (1.0 - rut * 0.5); c = mix(c, vec3(0.74, 0.78, 0.84) * (0.86 + n2.b * 0.22), sn * 0.93); gPud *= 1.0 - sn;
        diffuseColor.rgb = c;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, mix(0.36, 0.06, gPud), uWet * (1.0 - uSnow * 0.8));')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uRain > 0.05 && length(vViewPosition) < 26.0) { vec2 q = vW.xz * 4.2, id = floor(q), f = fract(q) - 0.5; float h1 = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5), age = fract(uTime * (1.0 + h1) + h1 * 9.0), rr = length(f) - age * 0.46; vec2 gr = normalize(f + 1e-4) * sin(rr * 50.0) * exp(-abs(rr) * 18.0) * (1.0 - age) * uRain * (0.12 + gPud * 0.5); normal = normalize(normal + (viewMatrix * vec4(-gr.x, 0.0, -gr.y, 0.0)).xyz); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uNight > 0.0) { float sp = mod(vRoad.y, 10.0) - 5.0, sd = floor(mod(vRoad.y / 10.0, 2.0)) * 2.0 - 1.0, d1 = length(vec2(sp, vRoad.x - sd * vRoad.z)); 
          totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.28) * uNight * (1.0 - 0.68 * uSnow) * (0.55 + 5.5 * exp(-d1 * d1 * 0.13)); }`);
  }; return asphalt; };
  const asphalt = makeAsphalt(false), inside = makeAsphalt(true); W.asphalt = asphalt; W.asphaltDry = inside;
  const kerb = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  kerb.onBeforeCompile = (s) => { s.uniforms.uNight = night; s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.30) * uNight * 0.42 * (1.0 - 0.6 * uSnow);'); };
  const out = {}, hAt = (x, z, y) => { const q = net.at(x, z, y, null, out); return q && Math.abs(q.h - y) < 0.5 ? q.h : y; };
  // is this edge point on another road's surface?
  const covered = (x, z, y, self) => {
    let c = false;
    net.around(x, z, (r, i, t, d, h) => { if (r !== self && d < r.hw - 0.06 && Math.abs(h - y) < 0.55) c = true; });
    if (c) return true;
    for (const d of net.discs) if (Math.abs(d.x - x) < d.r && Math.abs(d.z - z) < d.r && Math.hypot(d.x - x, d.z - z) < d.r - 0.02 && Math.abs(d.h - y) < 1) return true;
    return false;
  };
  const lamps = [], piers = [];
  const CONC = [0.50, 0.48, 0.45], PAVE = [0.40, 0.375, 0.345], SIDE = [0.30, 0.285, 0.265], RAIL = [0.60, 0.60, 0.58], SHORE = [0.66, 0.63, 0.57];
  const makeKerb = () => ({ pos: [], col: [], idx: [] });
  // a profile swept along an edge: pairs of points already in world space
  const strip = (K, a, b, col) => { const n = K.pos.length / 3; K.pos.push(...a[0], ...a[1], ...b[0], ...b[1]); for (let k = 0; k < 4; k++) K.col.push(...col); K.idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); };
  const profile = (p, nx, nz, y, r, side, bridge) => { // nx, nz point outwards; returns the profile's points
    const at = (o, up) => [p[0] + nx * o, y + up, p[1] + nz * o], H = r.style === 'motorway' ? 0.2 : bridge ? 0.22 : 0.13, walk = r.style === 'motorway' ? 0.1 : 0.55;
    const pts = [at(0, -0.02), at(0.02, H), at(0.11, H), at(0.13, bridge ? 0.05 : 0.06), at(0.13 + walk, 0.06)];
    const g = height(p[0] + nx * (walk + 0.2), p[1] + nz * (walk + 0.2));
    pts.push(at(0.15 + walk, bridge ? -0.34 : Math.min(-0.2, Math.max(-3, g - y - 0.4))));
    if (bridge) pts.push(at(-r.hw * 0.4, -0.42));
    return pts;
  };
  const COLS = (r) => [r.style === 'motorway' ? RAIL : r.style === 'shore' ? SHORE : CONC, r.style === 'motorway' ? RAIL : CONC, CONC, PAVE, SIDE, SIDE];
  const finish = (K) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(K.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(K.col, 3)); g.setIndex(K.idx); g.computeVertexNormals(); pack(g); const m = new THREE.Mesh(g, kerb); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); W.keeper.add(m, 1.35); };
  kerb.side = THREE.DoubleSide; weathered(kerb, { snow: 0.9, wet: 0.35, shine: 0.4 });
  for (const r of net.roads) {
    const up = lift(r), LAT = [-1, -0.4, 0.4, 1], PIECE = 48, A = net.hubs.get(r.a), B = net.hubs.get(r.b);
    const frame = (i) => { const a = Math.max(0, i - 1) * 3, b = Math.min(r.n - 1, i + 1) * 3, dx = r.p[b] - r.p[a], dz = r.p[b + 1] - r.p[a + 1], l = Math.hypot(dx, dz) || 1; return [r.p[i * 3], r.p[i * 3 + 1], r.p[i * 3 + 2], dx / l, dz / l]; };
    const F = Array.from({ length: r.n }, (_, i) => frame(i));
    const edges = [1, -1].map((sd) => F.map(([x, z, y, dx, dz], i) => { const ex = x - dz * sd * r.hw, ez = z + dx * sd * r.hw, yy = hAt(ex, ez, y); return { p: [ex, ez], y: yy, nx: -dz * sd, nz: dx * sd, free: !(r.tunnel && (r.tunnel[i] || 0) === 2) && !covered(ex, ez, y, r), bridge: r.bridge[i] === 1 && height(ex, ez) < y - 0.5 }; }));
    for (let i0 = 0, i1 = 0; i0 < r.n - 1; i0 = i1) {
      i1 = Math.min(r.n - 1, i0 + PIECE); const tube = !!r.tunnel && r.tunnel[i0] === 2 && r.tunnel[i0 + 1] === 2; if (r.tunnel) for (let q = i0 + 1; q < i1; q++) if ((r.tunnel[q] === 2 && r.tunnel[q + 1] === 2) !== tube) { i1 = q; break; }
      const pos = [], road = [], hub = [], idx = [], K = makeKerb();
      for (let i = i0; i <= i1; i++) {
        const [x, z, y, dx, dz] = F[i], dh = A ? Math.min(Math.hypot(x - A.x, z - A.z) - (A.r || 3), Math.hypot(x - B.x, z - B.z) - (B.r || 3)) : Math.min(r.s[i] - 1.6, r.len - r.s[i]);
        for (const u of LAT) { const px = x - dz * u * r.hw, pz = z + dx * u * r.hw; pos.push(px, hAt(px, pz, y) + up, pz); road.push(u * r.hw, r.s[i], r.hw, RANK[r.style]); hub.push(dh); }
        if (i < i1) { const q = (i - i0) * 4; for (let k = 0; k < 3; k++) idx.push(q + k, q + k + 1, q + k + 4, q + k + 1, q + k + 5, q + k + 4); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aRoad', new THREE.Float32BufferAttribute(road, 4)); g.setAttribute('aHub', new THREE.Float32BufferAttribute(hub, 1)); g.setIndex(idx); g.computeVertexNormals();
      if (g.attributes.normal.getY(0) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k]; idx[k] = idx[k + 1]; idx[k + 1] = t; } g.setIndex(idx); g.computeVertexNormals(); }
      pack(g); const m = new THREE.Mesh(g, tube ? inside : asphalt); m.receiveShadow = true; m.castShadow = true; m.matrixAutoUpdate = false; root.add(m); W.keeper.add(m, 1.6);
      edges.forEach((E, e) => { for (let i = i0; i < i1; i++) { const a = E[i], b = E[i + 1]; if (!a.free || !b.free) continue; const pa = profile(a.p, a.nx, a.nz, a.y + up, r, e, a.bridge && b.bridge), pb = profile(b.p, b.nx, b.nz, b.y + up, r, e, a.bridge && b.bridge), C = COLS(r); for (let k = 0; k + 1 < pa.length; k++) strip(K, [pa[k], pa[k + 1]], [pb[k], pb[k + 1]], C[Math.min(k, C.length - 1)]); } });
      if (K.idx.length) finish(K);
    }
    // lamps, by turns on either side (the light pools of the asphalt's shader)
    for (let s = 5, k = 0; s < r.len - 3; s += r.spur ? 20 : 10, k++) { const i = Math.min(r.n - 2, Math.round((s / r.len) * (r.n - 1))), E = edges[k % 2 ? 0 : 1][i]; if (E.free && !(r.tunnel && r.tunnel[i])) lamps.push([E.p[0] + E.nx * 0.3, E.y, E.p[1] + E.nz * 0.3, Math.atan2(-E.nx, -E.nz)]); }
    if (r.id !== 'bogaz' && r.id !== 'fsm' && r.id !== 'yss') for (let i = 4; i < r.n - 4; i += 5) if (r.bridge[i]) { const [x, z, y, dx, dz] = F[i], gy = Math.max(-1.4, height(x, z)); if (y - gy > 0.9) { let under = false; net.around(x, z, (o, j, t, d, h) => { if (o !== r && d < o.hw + 0.4 && h < y - 0.6) under = true; }); if (!under) piers.push([x, gy - 0.2, z, r.hw, y - 0.3 - gy + 0.2, Math.atan2(dx, dz)]); } }
  }
  for (const r of net.roads) if (r.tunnel) buildTube(W, r, lift);
  const capK = makeKerb();
  // ------------------------------------------------------------ junctions
  for (const d of net.discs) {
    const pos = [], road = [], hub = [], idx = [], RINGS = d.hub ? 4 : 2, SEG = d.hub ? 36 : 16, up = d.hub ? 0.04 : 0.02;
    const y0 = (x, z) => { const q = net.at(x, z, d.h + 0.3, null, out); return q && Math.abs(q.h - d.h) < 0.9 ? q.h : d.h; };
    for (let a = 0; a <= RINGS; a++) for (let b = 0; b < SEG; b++) { const R = (a / RINGS) * d.r, t = (b / SEG) * Math.PI * 2, x = d.x + Math.sin(t) * R, z = d.z + Math.cos(t) * R; pos.push(x, y0(x, z) + up - 0.036 * Math.max(0, a / RINGS - 0.85) / 0.15, z); road.push(1.1, 5, 3, 3); hub.push(-1); if (a < RINGS) { const q = a * SEG + b, n = a * SEG + ((b + 1) % SEG); idx.push(q, q + SEG, n, n, q + SEG, n + SEG); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aRoad', new THREE.Float32BufferAttribute(road, 4)); g.setAttribute('aHub', new THREE.Float32BufferAttribute(hub, 1)); g.setIndex(idx); g.computeVertexNormals();
    pack(g); const m = new THREE.Mesh(g, asphalt); m.receiveShadow = true; root.add(m); W.keeper.add(m, 1.35);

    const K = d.hub ? makeKerb() : capK, fake = { style: 'avenue', hw: 2 };
    const E = Array.from({ length: 49 }, (_, k) => { const t = (k / 48) * Math.PI * 2, nx = Math.sin(t), nz = Math.cos(t), x = d.x + nx * d.r, z = d.z + nz * d.r; let on = false; net.around(x, z, (r, i, tt, D, h) => { if (D < r.hw - 0.02 && Math.abs(h - d.h) < 0.9) on = true; }); return { p: [x, z], nx, nz, y: y0(x, z), free: !on }; });
    for (let k = 0; k < 48; k++) { const a = E[k], b = E[k + 1]; if (!a.free || !b.free) continue; const pa = profile(a.p, a.nx, a.nz, a.y, fake, 0, false), pb = profile(b.p, b.nx, b.nz, b.y, fake, 0, false), C = COLS(fake); for (let q = 0; q + 1 < pa.length; q++) strip(K, [pa[q], pa[q + 1]], [pb[q], pb[q + 1]], C[q]); }
    if (d.hub && K.idx.length) finish(K);
  }
  if (capK.idx.length) finish(capK);
  // ------------------------------------------------------------ lamps and piers
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = V(0, 1, 0);
  const inst = (geo, mat, list, put, cast = true) => { if (!list.length) return null; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((o, k) => { put(o); m.setMatrixAt(k, M); }); m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false; root.add(m); return m; };
  const pole = W.mat('#2b3033', { metalness: 0.6, roughness: 0.5 }), bulb = W.lit(W.mat('#f3ead6', { roughness: 0.4 }), '#ffb05a', 7);
  const tiles = new Map(); for (const l of lamps) { const k = Math.floor(l[0] / 200) * 999 + Math.floor(l[2] / 200); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(l); if (coast(l[0], l[2]) < 5) W.light(l[0], l[2], 1.0, 1); }
  for (const L of tiles.values()) {
    const put = (dx, dy) => ([x, y, z, a]) => { M.compose(V(x + Math.sin(a) * dx, y + dy, z + Math.cos(a) * dx), Q.setFromAxisAngle(UP, a), V(1, 1, 1)); };
    for (const m of [inst(new THREE.CylinderGeometry(0.022, 0.035, 1.25, 5).translate(0, 0.62, 0), pole, L, put(0, 0)), inst(new THREE.BoxGeometry(0.03, 0.03, 0.5).translate(0, 1.25, 0.22), pole, L, put(0, 0), false), inst(new THREE.BoxGeometry(0.09, 0.05, 0.2), bulb, L, put(0.42, 1.22), false)]) if (m) { m.frustumCulled = true; m.computeBoundingSphere(); }
  }
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), W.mat('#9a948a', { roughness: 0.9 }), piers, ([x, y, z, hw, h, a]) => M.compose(V(x, y, z), Q.setFromAxisAngle(UP, a), V(hw * 1.1, h, 0.7)));
  W.lampCount = lamps.length;
}
