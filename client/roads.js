// The roads as they are seen: asphalt ribbons with painted lanes, the open
// ground at junctions, kerbs and walls along every free edge, decks on piers,
// street lamps.
import * as THREE from './vendor/three.module.min.js';
import { noiseTexture } from './realism.js';
import { surf, weathered, cutAway, NONE } from './weather.js';
import { buildTube } from './tube.js';
import { pack, Batch, merge, normals } from './gpu.js';
import { inSetts, inCobbles } from './squares.js';
import { frameOf } from './parking.js';

// how far above its line a road is drawn (so that none flickers through another)
export const lift = (r) => (r.spur ? -0.003 : 0.004) + RANK[r.style] * 0.007 + (r.index % 5) * 0.0012;
// (the highest of what is drawn there: roads overlap, and a junction's round lies over them)
export const drawnAt = (net, x, z, y) => {
  let m = -1; net.around(x, z, (r, i, t, d, h) => { if (d < r.hw + 0.05 && Math.abs(h - y) < 0.5) m = Math.max(m, lift(r)); });
  for (const d of net.discs) { const dx = d.x - x, dz = d.z - z; if (dx * dx + dz * dz < d.r * d.r && Math.abs(d.h - y) < 1) m = Math.max(m, 0.04 - 0.036 * Math.max(0, Math.hypot(dx, dz) / d.r - 0.85) / 0.15); }
  return m < 0 ? 0.02 : m;
};
// the edge of a road, going out from the asphalt's rim: a kerb (a wall by a motorway or on a bridge), then the pavement
const KERB = 0.13, kerbOf = (style, bridge) => ({ H: style === 'motorway' ? 0.2 : bridge ? 0.22 : 0.13, top: 0.06, walk: style === 'motorway' ? 0.1 : 0.55 });
// how far above the rim one stands there, `o` out from it; null: that is not on it
const stepUp = (style, bridge, o, tight) => { const k = kerbOf(style, bridge); return o < -0.02 || o > KERB + (tight ? 0 : k.walk + 0.03) ? null : o < KERB + 0.005 ? k.H : k.top; };
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
        float bz = step(3.5, vRoad.w), b0 = 0.85 * bz, u = vRoad.x, hw = vRoad.z, mw = step(2.5, vRoad.w), lanes = bz > 0.5 ? 2.0 : mw > 0.5 ? 3.0 : vRoad.w > 1.5 ? 2.0 : vRoad.w > 0.5 ? 2.0 : 1.0;
        float lw = max(0.3, (hw - 0.2 - b0) / lanes), a = abs(u), dash = smoothstep(0.02, 0.0, abs(fract(vRoad.y / 2.4) - 0.5) - 0.25);
        // worn wheel tracks
        c = mix(c, vec3(0.235, 0.052, 0.040) * (0.72 + n2.b * 0.5), bz * smoothstep(0.87, 0.85, a) * 0.8 * smoothstep(0.0, 0.8, vHub)); // (the metrobüs' lanes)
        c *= 1.0 - 0.10 * exp(-pow((mod(a, lw) - lw * 0.5) / (lw * 0.26), 2.0)) * n1.g;
        float q = (a - b0) / lw, near = abs(q - floor(q + 0.5)) * lw, inner = step(0.5, q) * step(q, lanes - 0.5);
        float paint = stripe(near, 0.028) * inner * dash;
        vec3 pc = vec3(0.62);
        float edge = stripe(a - (hw - 0.16), 0.030);
        float mid = lanes > 1.5 ? stripe(a - 0.07, 0.026) : stripe(a, 0.03) * dash;
        float m = max(max(max(paint, edge), mid), stripe(a - 0.86, 0.034) * bz) * smoothstep(0.0, 0.8, vHub) * (0.65 + 0.35 * n2.g);
        pc = mix(pc, vec3(0.78, 0.52, 0.08), step(a, 0.25) * step(1.5, lanes));
        c = mix(c, pc, m * 0.9);
        // in a street one walks in: its setts, and nothing painted
        if (vRoad.w < -0.01) { float px = max(fwidth(vW.x), fwidth(vW.z)), nr = smoothstep(0.10, 0.02, px); vec2 sz = vec2(0.21, 0.13), k = vW.xz / sz; k.x += floor(k.y) * 0.5; vec2 f = min(fract(k), 1.0 - fract(k)) * sz; float t = fract(sin(dot(floor(k), vec2(127.1, 311.7))) * 43758.5453); vec3 s = mix(vec3(0.185, 0.178, 0.172), vec3(0.275, 0.263, 0.25), mix(0.5, t, nr)) * (1.0 - 0.36 * smoothstep(0.012 + px, 0.004, min(f.x, f.y)) * nr) * (0.84 + n1.r * 0.26) * (0.9 + n2.b * 0.2); c = mix(c, s, smoothstep(0.0, -0.8, vRoad.w)); }
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
    let c = !!net.transit && net.transit.mouth(x, z); if (c) return true;
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
  // does the pavement beside an edge lie on another road? (then there is only the kerb); does the edge stand over one?
  const crowded = (x, z, nx, nz, y, self, w) => { for (const o of w) { let c = false; const px = x + nx * o, pz = z + nz * o; net.around(px, pz, (r, i, t, d, h) => { if (r !== self && d < r.hw && Math.abs(h - y) < 0.9) c = true; }); if (c) return true; } return false; };
  const above = (x, z, y, self) => { let c = false; net.around(x, z, (r, i, t, d, h) => { if (r !== self && d < r.hw + 0.7 && h < y - 0.85 && h > y - 4) c = true; }); return c; };
  // where a filling station's way in or out crosses the pavement the kerb is let down (client/parking.js lays the apron over it)
  const drops = ((W.A.parking && W.A.parking.stations) || []).flatMap((s) => { const f = frameOf(s); return [-1.15, 1.15].map((a) => [f.at(a, 0), f.at(a, -8)]); });
  const dropped = (x, z) => drops.some(([[ax, az], [bx, bz]]) => { const ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez))); return Math.hypot(x - ax - ex * t, z - az - ez * t) < 0.8; });
  const profile = (p, nx, nz, y, r, side, bridge, tight) => { // nx, nz point outwards; returns the profile's points
    const at = (o, up) => [p[0] + nx * o, y + up, p[1] + nz * o], low = !bridge && r.style !== 'motorway' && dropped(p[0] + nx * 0.3, p[1] + nz * 0.3), { H, top, walk } = low ? { H: -0.02, top: -0.02, walk: 0.55 } : kerbOf(r.style, bridge);
    if (tight) { const a = [at(0, -0.02), at(0.02, H), at(0.11, H), at(KERB, -0.3)]; return bridge ? [...a, at(-r.hw * 0.4, -0.42)] : a; }
    const pts = [at(0, -0.02), at(0.02, H), at(0.11, H), at(KERB, bridge ? 0.05 : top), at(KERB + walk, top)];
    const g = height(p[0] + nx * (walk + 0.2), p[1] + nz * (walk + 0.2));
    pts.push(at(0.15 + walk, bridge ? -0.34 : Math.min(-0.2, Math.max(-3, g - y - 0.4))));
    if (bridge) pts.push(at(-r.hw * 0.4, -0.42));
    return pts;
  };
  const COLS = (r) => [r.style === 'motorway' ? RAIL : r.style === 'shore' ? SHORE : CONC, r.style === 'motorway' ? RAIL : CONC, CONC, PAVE, SIDE, SIDE];
  const batch = new Batch(), finish = (K) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(K.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(K.col, 3)); g.setIndex(K.idx); normals(g); batch.add(pack(g), kerb, 1.35); };
  W.kerbStone = kerb; kerb.side = THREE.DoubleSide; weathered(kerb, { snow: 0.9, wet: 0.35, shine: 0.4 });
  const setts = inSetts(W.A), cobbled = inCobbles(W.A); const rims = (W.rims = []), rounds = new Map(); // (where there is a kerb, for who walks)
  for (const r of net.roads) {
    const up = lift(r), LAT = [-1, -0.4, 0.4, 1], PIECE = 48, A = net.hubs.get(r.a), B = net.hubs.get(r.b);
    const frame = (i) => { const a = Math.max(0, i - 1) * 3, b = Math.min(r.n - 1, i + 1) * 3, dx = r.p[b] - r.p[a], dz = r.p[b + 1] - r.p[a + 1], l = Math.hypot(dx, dz) || 1; return [r.p[i * 3], r.p[i * 3 + 1], r.p[i * 3 + 2], dx / l, dz / l]; };
    const F = Array.from({ length: r.n }, (_, i) => frame(i));
    const S = r.spur ? F.map(([x, z]) => setts(x, z)) : r.id === 'galata' ? F.map(([x, z], i) => !!r.bridge[i] && W.coast(x, z) < 0.4) : null; // (the Galata bridge's own pavements: galata.js)
    const C = F.map(([x, z]) => cobbled(x, z)); // (setts, but its kerbs as they are)
    const edges = [1, -1].map((sd) => F.map(([x, z, y, dx, dz], i) => { const ex = x - dz * sd * r.hw, ez = z + dx * sd * r.hw, yy = hAt(ex, ez, y); return { p: [ex, ez], y: yy, nx: -dz * sd, nz: dx * sd, free: !(S && S[i]) && !(r.tunnel && (r.tunnel[i] || 0) === 2) && !covered(ex, ez, y, r), bridge: (r.bridge[i] === 1 && height(ex, ez) < y - 0.5) || above(ex, ez, yy, r), tight: r.style !== 'motorway' && crowded(ex, ez, -dz * sd, dx * sd, yy, r, [0.3, 0.6]) }; }));
    rims[r.index] = edges.map((E) => ({ f: Uint8Array.from(E, (e) => (e.free ? (e.bridge ? 2 : 1) + (e.tight ? 4 : 0) : 0)), y: Float32Array.from(E, (e) => e.y + up) }));
    for (let i0 = 0, i1 = 0; i0 < r.n - 1; i0 = i1) {
      i1 = Math.min(r.n - 1, i0 + PIECE); const tube = !!r.tunnel && r.tunnel[i0] === 2 && r.tunnel[i0 + 1] === 2; if (r.tunnel) for (let q = i0 + 1; q < i1; q++) if ((r.tunnel[q] === 2 && r.tunnel[q + 1] === 2) !== tube) { i1 = q; break; }
      const pos = [], road = [], hub = [], idx = [], K = makeKerb();
      for (let i = i0; i <= i1; i++) {
        const [x, z, y, dx, dz] = F[i], dh = A ? Math.min(Math.hypot(x - A.x, z - A.z) - (A.r || 3), Math.hypot(x - B.x, z - B.z) - (B.r || 3)) : Math.min(r.s[i] - 1.6, r.len - r.s[i]);
        for (const u of LAT) { const px = x - dz * u * r.hw, pz = z + dx * u * r.hw; pos.push(px, hAt(px, pz, y) + up, pz); road.push(u * r.hw, r.s[i], r.hw, (S && S[i] && r.spur) || C[i] ? -1 : RANK[r.style] + (r.bus ? 1 : 0)); hub.push(dh); }
        if (i < i1) { const q = (i - i0) * 4; for (let k = 0; k < 3; k++) idx.push(q + k, q + k + 1, q + k + 4, q + k + 1, q + k + 5, q + k + 4); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aRoad', new THREE.Float32BufferAttribute(road, 4)); g.setAttribute('aHub', new THREE.Float32BufferAttribute(hub, 1)); g.setIndex(idx); normals(g);
      if (g.attributes.normal.getY(0) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k]; idx[k] = idx[k + 1]; idx[k + 1] = t; } g.setIndex(idx); normals(g); }
      batch.add(pack(g), tube ? inside : asphalt, 1.6);
      edges.forEach((E, e) => { for (let i = i0; i < i1; i++) { const a = E[i], b = E[i + 1]; if (!a.free || !b.free) continue; const pa = profile(a.p, a.nx, a.nz, a.y + up, r, e, a.bridge && b.bridge, a.tight || b.tight), pb = profile(b.p, b.nx, b.nz, b.y + up, r, e, a.bridge && b.bridge, a.tight || b.tight), C = COLS(r); for (let k = 0; k + 1 < pa.length; k++) strip(K, [pa[k], pa[k + 1]], [pb[k], pb[k + 1]], C[Math.min(k, C.length - 1)]); } });
      if (K.idx.length) finish(K);
    }
    // lamps, by turns on either side (the light pools of the asphalt's shader)
    for (let s = 5, k = 0; s < r.len - 3; s += r.spur ? 20 : 10, k++) { const i = Math.min(r.n - 2, Math.round((s / r.len) * (r.n - 1))), E = edges[k % 2 ? 0 : 1][i]; if (E.free && !E.tight && !(r.tunnel && r.tunnel[i]) && !(net.transit && net.transit.over(E.p[0], E.p[1], E.y - 0.4, E.y + 1.5))) lamps.push([E.p[0] + E.nx * 0.3, E.y, E.p[1] + E.nz * 0.3, Math.atan2(-E.nx, -E.nz)]); }
    if (r.id !== 'bogaz' && r.id !== 'fsm' && r.id !== 'yss' && r.id !== 'galata') for (let i = 4; i < r.n - 4; i += 5) if (r.bridge[i]) { const [x, z, y, dx, dz] = F[i], gy = Math.max(-1.4, height(x, z)); if (y - gy > 0.9) { let under = false; net.around(x, z, (o, j, t, d, h) => { if (o !== r && d < o.hw + 0.4 && h < y - 0.6) under = true; }); if (!under && !(net.transit && net.transit.over(x, z, gy - 2, y - 0.3, 0.5))) piers.push([x, gy - 0.2, z, r.hw, y - 0.3 - gy + 0.2, Math.atan2(dx, dz)]); } }
  }
  for (const r of net.roads) if (r.tunnel) buildTube(W, r, lift);
  // ------------------------------------------------------------ junctions
  for (const d of net.discs) {
    const soft = !d.hub && setts(d.x, d.z), pos = [], road = [], hub = [], idx = [], RINGS = d.hub ? 4 : 2, SEG = d.hub ? 36 : 16, up = d.hub ? 0.04 : 0.02;
    const y0 = (x, z) => { const q = net.at(x, z, d.h + 0.3, null, out); return q && Math.abs(q.h - d.h) < 0.9 ? q.h : d.h; };
    for (let a = 0; a <= RINGS; a++) for (let b = 0; b < SEG; b++) { const R = (a / RINGS) * d.r, t = (b / SEG) * Math.PI * 2, x = d.x + Math.sin(t) * R, z = d.z + Math.cos(t) * R; pos.push(x, y0(x, z) + up - 0.036 * Math.max(0, a / RINGS - 0.85) / 0.15, z); road.push(1.1, 5, 3, soft ? -1 : 3); hub.push(-1); if (a < RINGS) { const q = a * SEG + b, n = a * SEG + ((b + 1) % SEG); idx.push(q, q + SEG, n, n, q + SEG, n + SEG); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aRoad', new THREE.Float32BufferAttribute(road, 4)); g.setAttribute('aHub', new THREE.Float32BufferAttribute(hub, 1)); g.setIndex(idx); normals(g);
    batch.add(pack(g), asphalt, 1.6, false);

    const K = makeKerb(), fake = { style: 'avenue', hw: 2 };
    const E = Array.from({ length: 49 }, (_, k) => { const t = (k / 48) * Math.PI * 2, nx = Math.sin(t), nz = Math.cos(t), x = d.x + nx * d.r, z = d.z + nz * d.r; let on = soft && setts(x, z); net.around(x, z, (r, i, tt, D, h) => { if (D < r.hw - 0.02 && Math.abs(h - d.h) < 0.9) on = true; }); if (net.transit && net.transit.mouth(x, z)) on = true; return { p: [x, z], nx, nz, y: y0(x, z), free: !on, tight: !on && crowded(x, z, nx, nz, y0(x, z), null, [0.35, 0.6]) }; });
    for (let k = 0; k < 48; k++) { const a = E[k], b = E[k + 1]; if (!a.free || !b.free) continue; const pa = profile(a.p, a.nx, a.nz, a.y, fake, 0, false, a.tight || b.tight), pb = profile(b.p, b.nx, b.nz, b.y, fake, 0, false, a.tight || b.tight), C = COLS(fake); for (let q = 0; q + 1 < pa.length; q++) strip(K, [pa[q], pa[q + 1]], [pb[q], pb[q + 1]], C[q]); }
    if (K.idx.length) finish(K);
    { const e = { d, f: Uint8Array.from(E, (q) => (q.free ? (q.tight ? 5 : 1) : 0)), y: Float32Array.from(E, (q) => q.y) }, R = d.r + 0.8; for (let a = Math.floor((d.x - R) / 8); a <= Math.floor((d.x + R) / 8); a++) for (let b = Math.floor((d.z - R) / 8); b <= Math.floor((d.z + R) / 8); b++) { const k = a * 8192 + b; if (!rounds.has(k)) rounds.set(k, []); rounds.get(k).push(e); } }
  }
  // the top of the kerb or pavement at (x, z), about y, as it is drawn; null: there is none
  const near = new Map(); W.kerbAt = (x, z, y) => {
    let best = null; const take = (h) => { if (Math.abs(h - y) < 0.7 && (best === null || h > best)) best = h; };
    near.clear(); net.around(x, z, (r, i, t, d) => { let e = near.get(r.index); if (!e) near.set(r.index, (e = { r, d: 1e9 })); if (d < e.d) { e.d = d; e.i = i; e.t = t; } }); // (of each road the stretch one is by)
    for (const { r, i, t, d } of near.values()) {
      const o = d - r.hw; if (o < -0.02 || o > 0.72 || (t <= 0 && i === 0) || (t >= 1 && i === r.n - 2)) continue; const a = i * 3, p = r.p, side = -(x - p[a]) * (p[a + 4] - p[a + 1]) + (z - p[a + 1]) * (p[a + 3] - p[a]) > 0 ? 0 : 1, e = rims[r.index][side]; if (!e.f[i] || !e.f[i + 1]) continue;
      const u = stepUp(r.style, !!(e.f[i] & e.f[i + 1] & 2), o, !!((e.f[i] | e.f[i + 1]) & 4)); if (u !== null) take(e.y[i] + (e.y[i + 1] - e.y[i]) * t + u);
    }
    for (const { d, f, y: Y } of rounds.get(Math.floor(x / 8) * 8192 + Math.floor(z / 8)) || []) { const dx = x - d.x, dz = z - d.z, a = ((Math.atan2(dx, dz) / (Math.PI * 2) + 1) % 1) * 48, k = Math.min(47, Math.floor(a)), u = stepUp('avenue', false, Math.hypot(dx, dz) - d.r, !!((f[k] | f[k + 1]) & 4)); if (u === null) continue; if (f[k] && f[k + 1]) take(Y[k] + (Y[k + 1] - Y[k]) * (a - k) + u); }
    return best;
  };
  batch.flush(W);
  // ------------------------------------------------------------ lamps and piers
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = V(0, 1, 0);
  const inst = (geo, mat, list, put, cast = true) => { if (!list.length) return null; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((o, k) => { put(o); m.setMatrixAt(k, M); }); m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false; root.add(m); return m; };
  const pole = W.mat('#2b3033', { metalness: 0.6, roughness: 0.5 }), bulb = W.lit(W.mat('#f3ead6', { roughness: 0.4 }), '#ffb05a', 7);
  const post = merge([new THREE.CylinderGeometry(0.022, 0.035, 1.25, 5).translate(0, 0.62, 0), new THREE.BoxGeometry(0.03, 0.03, 0.5).translate(0, 1.25, 0.22)]);
  const tiles = new Map(); for (const l of lamps) { const k = Math.floor(l[0] / 200) * 999 + Math.floor(l[2] / 200); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(l); if (coast(l[0], l[2]) < 5) W.light(l[0], l[2], 1.0, 1); }
  for (const L of tiles.values()) {
    const put = (dx, dy) => ([x, y, z, a]) => { M.compose(V(x + Math.sin(a) * dx, y + dy, z + Math.cos(a) * dx), Q.setFromAxisAngle(UP, a), V(1, 1, 1)); };
    for (const m of [inst(post, pole, L, put(0, 0)), inst(new THREE.BoxGeometry(0.09, 0.05, 0.2), bulb, L, put(0.42, 1.22), false)]) if (m) { m.frustumCulled = true; m.computeBoundingSphere(); m.boundingSphere && W.keeper.parts.push({ o: m, x: m.boundingSphere.center.x, z: m.boundingSphere.center.z, r: m.boundingSphere.radius, reach: 0.8, max: 1e9, off: 0, held: false }); }
  }
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), W.mat('#9a948a', { roughness: 0.9 }), piers, ([x, y, z, hw, h, a]) => M.compose(V(x, y, z), Q.setFromAxisAngle(UP, a), V(hw * 1.1, h, 0.7)));
  for (const [x, y, z] of lamps) (W.posts ||= []).push([x, y, z, 0.035, 1.25]);
  W.lampCount = lamps.length;
}
