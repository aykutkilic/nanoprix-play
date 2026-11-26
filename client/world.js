// The diorama: terrain, sea, houses, trees, roads, landmarks, bridges, the
// cable car, boats – lit by day, floodlit by night. The look is the board
// game's (its istanbul-art.js), at this map's scale.

import * as THREE from './vendor/three.module.min.js';
import { MOON_DIR, CARTOON_MOON, noiseTexture, rng, stoneMaterial } from './realism.js';
import { surf, weathered, SWELL_GLSL, cutAway } from './weather.js';
import { readHouses } from './assets.js';
import { buildRoads } from './roads.js';
import { buildMarks } from './marks.js';
import { buildBuildings } from './buildings.js';
import { buildLife } from './life.js';
import { buildShips } from './ships.js';
import { buildSquares } from './squares.js';
import { buildGalata } from './galata.js';
import { buildWalls } from './walls.js';
import { buildInfra } from './infra.js';
import { buildGreen } from './green.js';
import { buildParking } from './parking.js';
import { buildTopkapi } from './topkapi.js';
import { buildBeacons } from './beacons.js';
import { pack, Keeper, Still, merge } from './gpu.js';
import { buildTransit } from './transit.js';
import { Transit } from '../shared/transit.js';
import { buildSigns } from './signs.js';
import { buildSignals } from './signals.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const CHUNK = 64; // grid cells across a piece of ground

export async function buildWorld(scene, A, net, onStage = () => {}) {
  const root = new THREE.Group(), still = new Still(), under = new THREE.Group(); scene.add(root); root.add(still); scene.add(under); under.userData.below = true; // (under: what is seen from a hall below – the trains, the ways down; view.js draws nothing else there)
  const g = A.map.grid, M0 = A.map.map, { height, coast } = A.ground;
  const night = { value: 0 }, time = { value: 0 }, W = { under, time, keeper: new Keeper(), still, mouths: { value: net.roads.filter((r) => r.tunnel).flatMap(() => [0, 1]).map(() => new THREE.Vector4(1e6, 1e6, 0, 1)) }, root, night, time, height, coast, net, grid: g, walkOn: [], glow: [], spots: [], updates: [], A };
  W.transit = net.transit = new Transit({ ...A.transit, islands: A.roads.islands }, A.lines);
  W.lit = (m, color, k) => { m.emissive = new THREE.Color(color); m.emissiveIntensity = 0; W.glow.push([m, k]); return m; };
  W.mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
  W.spot = (x, y, z, color, power, reach) => { const l = new THREE.PointLight(color, 0, reach, 1.6); l.position.set(x, y, z); root.add(l); W.spots.push([l, power]); return l; };
  // field textures over the whole map
  const tex = (data) => { const t = new THREE.DataTexture(data, g.w, g.h, THREE.RedFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.unpackAlignment = 1; t.needsUpdate = true; return t; };
  const shoreTex = tex(A.shore), parkTex = tex(A.park);
  const area = new THREE.Vector4(g.x0 - g.step / 2, g.z0 - g.step / 2, g.w * g.step, g.h * g.step);
  W.shoreTex = shoreTex; W.area = area;

  // ------------------------------------------------------------ terrain, in pieces, finer near the camera
  const ground = new THREE.MeshStandardMaterial({ roughness: 0.96 }); 
  const urbanTex = tex(A.urban);
  W.cut = { tex: { value: new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat) }, box: { value: new THREE.Vector4(0, 0, 1e-6, 1e-6) } }; W.cut.tex.value.needsUpdate = true; // (where something lies on the ground of its own: client/topkapi.js)
  ground.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uCut: W.cut.tex, uCutBox: W.cut.box, uNight: night, uNoise: { value: noiseTexture() }, uShore: { value: shoreTex }, uPark: { value: parkTex }, uUrban: { value: urbanTex }, uArea: { value: area }, uMouth: W.mouths });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying float vUpN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = position; vUpN = normal.y;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uMouth[' + W.mouths.value.length + '];\nuniform sampler2D uCut; uniform vec4 uCutBox;\nuniform sampler2D uNoise, uShore, uPark, uUrban; uniform vec4 uArea; uniform float uNight; varying vec3 vW; varying float vUpN; float gBump; float gUrban;')
      .replace('#include <map_fragment>', `
        { vec2 cu = (vW.xz - uCutBox.xy) / uCutBox.zw; if (cu.x > 0.0 && cu.y > 0.0 && cu.x < 1.0 && cu.y < 1.0 && texture2D(uCut, cu).r > 0.5) discard; }
        for (int k = 0; k < ${W.mouths.value.length}; k++) { vec2 md = vW.xz - uMouth[k].xy; float al = dot(md, uMouth[k].zw), la = abs(dot(md, vec2(-uMouth[k].w, uMouth[k].z))); if (al > -1.2 && al < 13.0 && la < 2.5) discard; } // (the mouths of the tunnel)
        vec2 auv = (vW.xz - uArea.xy) / uArea.zw;
        vec2 tp = vW.xz + vW.y * vec2(1.3, 0.8);
        vec4 n0 = texture2D(uNoise, tp * 0.006), n1 = texture2D(uNoise, tp * 0.026), n2 = texture2D(uNoise, tp * 0.12), n3 = texture2D(uNoise, tp * 0.55);
        float park = texture2D(uPark, auv).r; gUrban = texture2D(uUrban, auv).r * (1.0 - park);
        vec3 grass = mix(vec3(0.058, 0.108, 0.028), vec3(0.180, 0.185, 0.066), smoothstep(0.3, 0.85, n1.r * 0.55 + n2.g * 0.45));
        grass = mix(grass, vec3(0.045, 0.098, 0.026), park * 0.6) * (0.72 + n3.b * 0.56);
        vec3 soil = vec3(0.235, 0.190, 0.130) * (0.75 + n3.g * 0.5);
        vec3 c = mix(grass, soil, smoothstep(0.55, 0.8, n2.r) * 0.5 * (1.0 - park));
        vec3 town = mix(vec3(0.30, 0.275, 0.24), vec3(0.235, 0.225, 0.215), n0.r) * (0.86 + n3.g * 0.28);
        c = mix(c, town, smoothstep(0.02, 0.4, gUrban) * 0.85);
        c = mix(c, vec3(0.25, 0.225, 0.19) * (0.6 + n3.r * 0.8), smoothstep(0.88, 0.62, vUpN) * 0.9);
        float shore = (texture2D(uShore, auv).r - 0.5) * 24.0 + (n2.g - 0.5) * 0.7;
        c = mix(c, vec3(0.335, 0.32, 0.295) * (0.84 + n3.b * 0.32), smoothstep(1.5, 0.7, shore)); // (stone quays)
        c *= mix(0.45, 1.0, smoothstep(-0.10, 0.12, vW.y));
        // a wood seen from above: crowns close together, dark and mottled, where the trees themselves are not drawn
        { float wood = smoothstep(0.93, 0.995, park), crowns = smoothstep(0.35, 0.75, texture2D(uNoise, vW.xz * 0.42).r * 0.6 + texture2D(uNoise, vW.xz * 1.3).g * 0.4); vec3 canopy = mix(vec3(0.020, 0.048, 0.016), vec3(0.075, 0.118, 0.036), crowns) * (0.8 + n1.b * 0.4); c = mix(c, canopy, wood * 0.88); gBump += wood * crowns * 0.18; }
        diffuseColor.rgb = c;
        gBump = (n3.b * 0.05 + n3.g * 0.06) * (1.0 - 0.75 * smoothstep(0.02, 0.4, gUrban)) * smoothstep(0.7, 1.8, shore + park);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.58, 0.24) * uNight * (1.0 - 0.7 * uSnow) * smoothstep(0.1, 0.6, gUrban) * (0.10 + 0.5 * smoothstep(0.52, 0.8, n2.g)) * step(0.0, vW.y);`)
      .replace('#include <normal_fragment_maps>', `
        { vec3 px = dFdx(-vViewPosition), py = dFdy(-vViewPosition); vec3 r1 = cross(py, normal), r2 = cross(normal, px);
          float det = dot(px, r1), fade = smoothstep(60.0, 8.0, length(vViewPosition)); vec3 gr = sign(det) * (dFdx(gBump) * r1 + dFdy(gBump) * r2); normal = normalize(abs(det) * normal - gr * fade); }`);
  };
  weathered(ground, { snow: 0.94, wet: 0.42, shine: 0.42 });
  const cols = Math.ceil((g.w - 1) / CHUNK), rows = Math.ceil((g.h - 1) / CHUNK), pieces = [];
  const hAt = (i, j) => A.H[Math.min(g.h - 1, Math.max(0, j)) * g.w + Math.min(g.w - 1, Math.max(0, i))];
  // (the coarser ground keeps under the roads as the fine ground does: lowered where a triangle would stand out over one)
  const coarse = {}; { const on = new Uint8Array(g.w * g.h); for (const r of net.roads) for (let i = 0; i < r.n; i++) { if (r.tunnel && r.tunnel[i] === 2) continue; const x = (r.p[i * 3] - g.x0) / g.step, z = (r.p[i * 3 + 1] - g.z0) / g.step, R = (r.hw + 2.9) / g.step; for (let b = Math.max(0, Math.ceil(z - R)); b <= Math.min(g.h - 1, z + R); b++) for (let a = Math.max(0, Math.ceil(x - R)); a <= Math.min(g.w - 1, x + R); a++) if ((a - x) ** 2 + (b - z) ** 2 < R * R) on[b * g.w + a] = 1; }
    for (const d of net.discs) { const x = (d.x - g.x0) / g.step, z = (d.z - g.z0) / g.step, R = (d.r + 2.9) / g.step; for (let b = Math.max(0, Math.ceil(z - R)); b <= Math.min(g.h - 1, z + R); b++) for (let a = Math.max(0, Math.ceil(x - R)); a <= Math.min(g.w - 1, x + R); a++) on[b * g.w + a] = 1; }
    for (const { rings: [r] } of A.squares.areas) { const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]); for (let b = Math.max(0, Math.floor((Math.min(...zs) - g.z0) / g.step) - 1); b <= Math.min(g.h - 1, (Math.max(...zs) - g.z0) / g.step + 1); b++) for (let a = Math.max(0, Math.floor((Math.min(...xs) - g.x0) / g.step) - 1); a <= Math.min(g.w - 1, (Math.max(...xs) - g.x0) / g.step + 1); a++) { const x = g.x0 + a * g.step, z = g.z0 + b * g.step; let c = false, d = 99; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; d = Math.min(d, Math.hypot(r[i][0] - x, r[i][1] - z)); } if (c || d < g.step * 1.5) on[b * g.w + a] = 1; } } // (and under the squares)
    const L = []; for (let k = 0; k < on.length; k++) if (on[k]) L.push(k);
    for (const st of [2, 4]) { const w = Math.ceil((g.w - 1) / st) + 1, C = new Float32Array(w * (Math.ceil((g.h - 1) / st) + 1)); for (let k = 0; k < C.length; k++) C[k] = hAt((k % w) * st, Math.floor(k / w) * st); coarse[st] = { w, C };
      for (let pass = 0, more = true; pass < 12 && more; pass++) { more = false; for (const k of L) { const i = k % g.w, j = (k - i) / g.w, a = Math.min(w - 2, Math.floor(i / st)), b = Math.floor(j / st), p = i / st - a, q = j / st - b, c = b * w + a; if (c + w + 1 >= C.length) continue; const low = p + q <= 1, O = low ? c : c + w + 1, u = low ? p : 1 - p, v = low ? q : 1 - q, I = low ? c + 1 : c + w, Q = low ? c + w : c + 1, t = 1 - u - v, e = C[O] * t + C[I] * u + C[Q] * v - A.H[k] - 0.01; if (e > 0) { const s = e / (t * t + u * u + v * v); C[O] -= s * t; C[I] -= s * u; C[Q] -= s * v; more = true; } } } }
  }
  const makePiece = (ci, cj, st) => {
    const n = CHUNK / st, S = n + 3, pos = new Float32Array(S * S * 3), nor = new Float32Array(S * S * 3), idx = []; // (one ring of skirt round it)
    for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) {
      const skirt = a === 0 || b === 0 || a === S - 1 || b === S - 1, i = Math.min(g.w - 1, ci * CHUNK + Math.min(n, Math.max(0, a - 1)) * st), j = Math.min(g.h - 1, cj * CHUNK + Math.min(n, Math.max(0, b - 1)) * st), k = (b * S + a) * 3;
      pos[k] = g.x0 + i * g.step; pos[k + 1] = (st > 1 && i % st === 0 && j % st === 0 ? coarse[st].C[(j / st) * coarse[st].w + i / st] : hAt(i, j)) - (skirt ? 0.5 * st : 0); pos[k + 2] = g.z0 + j * g.step;
      const nx = hAt(i - 1, j) - hAt(i + 1, j), nz = hAt(i, j - 1) - hAt(i, j + 1), l = Math.hypot(nx, 2 * g.step, nz); nor[k] = nx / l; nor[k + 1] = (2 * g.step) / l; nor[k + 2] = nz / l;
      if (a < S - 1 && b < S - 1) { const q = b * S + a; idx.push(q, q + S, q + 1, q + 1, q + S, q + S + 1); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setIndex(idx); geo.computeBoundingSphere(); pack(geo);
    const m = new THREE.Mesh(geo, ground); m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; return m;
  };
  for (let cj = 0; cj < rows; cj++) for (let ci = 0; ci < cols; ci++) {
    let any = false; for (let j = 0; j <= CHUNK && !any; j += 2) for (let i = 0; i <= CHUNK && !any; i += 2) if (hAt(ci * CHUNK + i, cj * CHUNK + j) > -1.4) any = true;
    if (!any) continue;
    pieces.push({ ci, cj, x: g.x0 + (ci + 0.5) * CHUNK * g.step, z: g.z0 + (cj + 0.5) * CHUNK * g.step, lods: {}, now: null });
  }
  // (all of it coarse, once; the rest when the camera gets there)
  for (const p of pieces) { p.lods[4] = makePiece(p.ci, p.cj, 4); still.add(p.lods[4]); p.now = 4; }
  // sixteen together where all of them are far
  const supers = new Map(); for (const p of pieces) { const k = `${p.ci >> 2},${p.cj >> 2}`; if (!supers.has(k)) supers.set(k, { list: [] }); supers.get(k).list.push(p); } for (const s of supers.values()) { s.o = new THREE.Mesh(merge(s.list.map((p) => p.lods[4].geometry)), ground); s.o.geometry.computeBoundingSphere(); s.o.receiveShadow = true; s.o.visible = false; still.add(s.o); s.on = false; }
  W.updateGround = (cam, budget = 2) => { const now = performance.now();
    for (const p of pieces) {
      const d = Math.max(Math.abs(p.x - cam.x), Math.abs(p.z - cam.z)) - CHUNK * g.step / 2, want = d < 60 ? 1 : d < 190 ? 2 : 4;
      if (want === p.now) { if (p.old && now - p.oldAt > 9000) { p.old.geometry.dispose(); p.old = null; } continue; }
      if (!p.lods[want]) { if (budget-- <= 0) continue; p.lods[want] = makePiece(p.ci, p.cj, want); still.add(p.lods[want]); }
      p.lods[p.now].visible = false; p.old = p.lods[p.now]; p.oldAt = now; p.lods[want].visible = true; p.now = want;
    }
    for (const s of supers.values()) { let on = true; for (const p of s.list) if (p.now !== 4) { on = false; break; } if (on !== s.on) { s.on = on; s.o.visible = on; for (const p of s.list) p.lods[p.now].visible = !on; } else if (on) for (const p of s.list) p.lods[4].visible = false; }
  };
  // the slab the diorama stands on
  { const x0 = g.x0, z0 = g.z0, x1 = g.x0 + (g.w - 1) * g.step, z1 = g.z0 + (g.h - 1) * g.step, pos = [], idx = [], col = [];
    const wall = (pts) => { const b = pos.length / 3; pts.forEach(([x, z, i, j]) => { const y = Math.max(-1.2, hAt(i, j)); pos.push(x, y, z, x, y - Math.min(1.0, 0.4 + Math.max(0, y) * 0.1), z, x, -7, z); col.push(0.10, 0.12, 0.05, 0.22, 0.15, 0.09, 0.16, 0.10, 0.06); }); for (let k = 0; k + 1 < pts.length; k++) for (const e of [0, 1]) { const q = b + k * 3 + e; idx.push(q, q + 3, q + 1, q + 1, q + 3, q + 4, q, q + 1, q + 3, q + 1, q + 4, q + 3); } };
    const X = [], X2 = [], Z = [], Z2 = []; for (let i = 0; i < g.w; i += 4) { X.push([x0 + i * g.step, z0, i, 0]); X2.push([x0 + i * g.step, z1, i, g.h - 1]); } for (let j = 0; j < g.h; j += 4) { Z.push([x0, z0 + j * g.step, 0, j]); Z2.push([x1, z0 + j * g.step, g.w - 1, j]); }
    [X, X2, Z, Z2].forEach(wall);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
    const wood = W.mat('#4a3020', { roughness: 0.55 }), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = x1 - x0 + 24, lz = z1 - z0 + 24;
    for (const [x, z, w, d] of [[cx, z0 - 6, lx, 12], [cx, z1 + 6, lx, 12], [x0 - 6, cz, 12, lz - 24], [x1 + 6, cz, 12, lz - 24]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), wood); m.position.set(x, -4.4, z); root.add(m); }
  }
  await onStage('terrain');

  // ------------------------------------------------------------ the sea
  const LD = 2048, ld = new Uint8Array(LD * LD);
  const light = (x, z, r, power) => {
    const i0 = ((x - area.x) / area.z) * LD, j0 = ((z - area.y) / area.w) * LD, Rr = Math.max(0.8, (r / area.z) * LD), w = Math.ceil(Rr * 2.2);
    for (let j = Math.max(0, Math.floor(j0 - w)); j <= Math.min(LD - 1, j0 + w); j++) for (let i = Math.max(0, Math.floor(i0 - w)); i <= Math.min(LD - 1, i0 + w); i++) { const k = j * LD + i, v = Math.exp(-((i - i0) ** 2 + (j - j0) ** 2) / (Rr * Rr)) * power * 255; if (v > 1) ld[k] = Math.min(255, ld[k] + v); }
  };
  W.light = light;
  const lampTex = new THREE.DataTexture(ld, LD, LD, THREE.RedFormat); lampTex.magFilter = lampTex.minFilter = THREE.LinearFilter; lampTex.unpackAlignment = 1;
  W.lampTex = lampTex;
  const wake = (W.wake = { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 0, 1e4)) }); W.wakeV = { value: new Array(12).fill(0) }; // boats: x, z, heading, length; and how fast, 0 … 1
  const sea = new THREE.MeshPhysicalMaterial({ color: '#0d3f55', roughness: 0.09, metalness: 0, ior: 1.33, specularIntensity: 1, envMapIntensity: 1.15 });
  sea.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uNoise: { value: noiseTexture() }, uShore: { value: shoreTex }, uArea: { value: area }, uTime: time, uNight: night, uMoon: { value: MOON_DIR }, uLamps: { value: lampTex }, uWake: wake, uWakeV: W.wakeV, uSwell: surf.swell, uRain: surf.rain }); cutAway(s);
    s.uniforms.uEdge = { value: new THREE.Vector4(g.x0, g.z0, g.x0 + (g.w - 1) * g.step, g.z0 + (g.h - 1) * g.step) };
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vW; uniform sampler2D uShore; uniform vec4 uArea, uEdge; uniform float uTime, uSwell; ${SWELL_GLSL}`).replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec4 w4 = modelMatrix * vec4(position, 1.0); w4.xz = clamp(w4.xz, uEdge.xy, uEdge.zw); float sh = (texture2D(uShore, (w4.xz - uArea.xy) / uArea.zw).r - 0.5) * 24.0, shelter = smoothstep(-0.9, -7.9, sh); w4.y += swell(w4.xz, uTime).x * uSwell * shelter; vW = w4.xyz; transformed = w4.xyz - modelMatrix[3].xyz; }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uSwell, uRain; ${SWELL_GLSL}
        uniform sampler2D uNoise, uShore, uLamps; uniform vec4 uArea; uniform vec4 uWake[12]; uniform float uWakeV[12]; uniform float uTime, uNight; uniform vec3 uMoon; varying vec3 vW;
        float wave(vec2 p) {
          return texture2D(uNoise, p * 0.030 + vec2(uTime * 0.0060, uTime * 0.0042)).r * 1.6 + texture2D(uNoise, p * 0.085 - vec2(uTime * 0.011, -uTime * 0.007)).g * 0.62
            + texture2D(uNoise, p * 0.26 + vec2(-uTime * 0.013, uTime * 0.018)).g * 0.17;
        }`)
      .replace('#include <map_fragment>', `
        float shore = (texture2D(uShore, (vW.xz - uArea.xy) / uArea.zw).r - 0.5) * 24.0 * 0.28; if (shore > 0.45) discard;
        float deep = smoothstep(-0.05, -1.5, shore);
        vec3 wc = mix(vec3(0.060, 0.235, 0.245), vec3(0.012, 0.082, 0.135), deep);
        float big = texture2D(uNoise, vW.xz * 0.0045 + uTime * 0.0008).r;
        wc *= 0.75 + big * 0.5;
        float ring = sin(shore * 26.0 + uTime * 0.9 + texture2D(uNoise, vW.xz * 0.06).r * 9.0);
        float foam = smoothstep(-0.30, -0.03, shore) * smoothstep(0.5, 0.95, texture2D(uNoise, vW.xz * 0.22 + uTime * 0.01).g * 0.75 + ring * 0.2 + smoothstep(-0.12, 0.0, shore) * 0.4);
        // in a sea: white on the crests, streaks down the wind
        float shelter = smoothstep(-0.9, -7.9, shore / 0.28); vec3 sw = swell(vW.xz, uTime) * uSwell * shelter;
        if (uSwell > 0.1) { float crest = smoothstep(0.14, 0.42, sw.x) * smoothstep(0.35, 0.75, texture2D(uNoise, vW.xz * 0.13 + vec2(-uTime * 0.03, uTime * 0.022)).g + sw.x * 0.45); vec2 q = vec2(dot(vW.xz, vec2(0.78, -0.62)), dot(vW.xz, vec2(0.62, 0.78))); float streak = smoothstep(0.62, 0.86, texture2D(uNoise, q * vec2(0.02, 0.22) - vec2(uTime * 0.02, 0.0)).g); foam += (crest * 0.95 + streak * 0.35) * smoothstep(0.1, 0.8, uSwell); wc = mix(wc, vec3(0.075, 0.135, 0.145) * (0.8 + sw.x * 0.8), smoothstep(0.1, 1.0, uSwell) * 0.75); foam += smoothstep(-0.9, -0.1, shore) * smoothstep(0.35, 0.9, uSwell) * smoothstep(0.3, 0.8, texture2D(uNoise, vW.xz * 0.3 + uTime * 0.05).g) * 0.8; }
        // the boats' wakes: white water churned up astern, breaking up as it spreads; the two arms of the V (at 19.5°, as for any
        // ship); the bow wave and the wash along her sides. All of it as fast as she goes, and in bubbles and streaks, not paint
        for (int k = 0; k < 12; k++) {
          vec2 d = vW.xz - uWake[k].xy; float L = uWake[k].w, v = uWakeV[k]; if (v < 0.02 || dot(d, d) > L * L * 64.0) continue;
          vec2 f = vec2(sin(uWake[k].z), cos(uWake[k].z)); float a = -dot(d, f), b = dot(d, vec2(f.y, -f.x)), ab = abs(b), t = a - L * 0.45, beam = L * 0.085;
          vec2 q = vec2(a, b) * 0.9 + vec2(-uTime * 1.2, 0.0); float n1 = texture2D(uNoise, (q + uWake[k].xy) * 0.21).g, n2 = texture2D(uNoise, (q - uWake[k].xy) * 0.63).r, n3 = texture2D(uNoise, vW.xz * 1.7 + uTime * 0.05).b;
          float w = 0.0;
          if (t > 0.0) {
            float wide = beam * 1.1 + t * 0.07, churn = exp(-pow(ab / wide, 2.0)) * exp(-t / (L * 1.6)); // (the screw's white water)
            w += churn * smoothstep(0.25, 0.75, n1 * 0.55 + n2 * 0.45 + churn * 0.6) * 1.4;
            float s = beam + t * 0.354, arm = exp(-pow((ab - s) / (0.12 + t * 0.012), 2.0)) * exp(-t / (L * 3.2)); // (the V)
            w += arm * smoothstep(0.3, 0.7, n2 * 0.7 + n3 * 0.5) * 0.95;
            w += 0.22 * exp(-pow(ab / (wide * 2.2), 2.0)) * exp(-t / (L * 2.6)) * smoothstep(0.35, 0.6, n3); // (the old wake, faint)
          }
          if (abs(a) < L * 0.52) { float side = exp(-pow((ab - beam - 0.04) / 0.09, 2.0)) * smoothstep(-L * 0.5, L * 0.3, a); w += side * smoothstep(0.3, 0.6, n2 + 0.2) * 0.8; } // (along her sides)
          w += exp(-pow((a + L * 0.5) / 0.35, 2.0)) * exp(-pow(ab / (beam * 1.3), 2.0)) * (0.7 + 0.5 * n3); // (her bow)
          foam += w * smoothstep(0.0, 0.6, v);
        }
        foam = min(foam, 1.0);
        diffuseColor.rgb = mix(wc, vec3(0.80, 0.85, 0.86), foam * 0.72);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uNight > 0.0) {
          vec3 look = isOrthographic ? -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(vW - cameraPosition);
          vec3 wn = inverseTransformDirection(normal, viewMatrix);
          vec2 side = normalize(look.xz + vec2(1e-4, 0.0));
          float mirror = 0.0;
          for (int k = 0; k < 7; k++) { // (small waves draw a light out towards you)
            float tilt = (float(k) - 3.0) * 0.085;
            vec3 r = reflect(look, normalize(wn + vec3(side.x, 0.0, side.y) * tilt));
            vec2 hit = vW.xz + r.xz / max(r.y, 0.12) * 1.5;
            mirror += texture2D(uLamps, (hit - uArea.xy) / uArea.zw).r * (1.0 - abs(float(k) - 3.0) * 0.17);
          }
          float glint = 0.55 + 0.9 * smoothstep(0.35, 0.75, texture2D(uNoise, vW.xz * 0.8 + vec2(uTime * 0.02, -uTime * 0.013)).g);
          totalEmissiveRadiance += vec3(1.0, 0.56, 0.22) * uNight * (mirror * 0.42 * glint + pow(smoothstep(-0.7, 0.0, shore), 2.2) * 0.022);
          vec3 away = reflect(look, wn);
          float road = pow(max(dot(away, uMoon), 0.0), 70.0);
          totalEmissiveRadiance += vec3(0.95, 0.88, 0.72) * uNight * deep * (road * 0.10 + pow(road, 5.0) * 0.30);
          totalEmissiveRadiance += vec3(0.02, 0.022, 0.026) * foam * uNight; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.65, foam);')
      .replace('#include <normal_fragment_maps>', `
        { float e = 0.12, dist = length(vViewPosition); float h0 = wave(vW.xz);
          vec2 g = vec2(wave(vW.xz + vec2(e, 0.0)) - h0, wave(vW.xz + vec2(0.0, e)) - h0) / e;
          g *= (0.42 + uSwell * 0.5) * smoothstep(420.0, 25.0, dist) * mix(0.45, 1.0, deep); g += sw.yz;
          if (uRain > 0.05) { vec2 c = vW.xz * 3.2, id = floor(c), f = fract(c) - 0.5; float h1 = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5), age = fract(uTime * (0.9 + h1) + h1 * 7.0), rr = length(f) - age * 0.5; g += normalize(f + 1e-4) * sin(rr * 46.0) * exp(-abs(rr) * 16.0) * (1.0 - age) * 0.5 * uRain * smoothstep(30.0, 6.0, dist); }
          normal = normalize((viewMatrix * vec4(-g.x, 1.0, -g.y, 0.0)).xyz); }`);
  };
  const ww = (g.w - 1) * g.step, wh = (g.h - 1) * g.step;
  // a sheet that goes with the camera: fine under it, coarse out to the edge of the map (the shader keeps it inside)
  const SN = 230, sp = new Float32Array((SN + 1) ** 2 * 3), si = []; for (let j = 0, k = 0; j <= SN; j++) for (let i = 0; i <= SN; i++, k++) { const f = (u) => 62 * u + 2500 * u ** 9; sp.set([f((i / SN) * 2 - 1), 0, f((j / SN) * 2 - 1)], k * 3); if (i < SN && j < SN) si.push(k, k + SN + 1, k + 1, k + 1, k + SN + 1, k + SN + 2); }
  const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sgeo.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(sp, (_, k) => (k % 3 === 1 ? 1 : 0)), 3)); sgeo.setIndex(si);
  const water = new THREE.Mesh(sgeo, sea); water.frustumCulled = false; water.position.y = -0.02; water.receiveShadow = true; root.add(water);
  W.updates.push((dt, now, cam) => { water.position.x = Math.round(cam.x); water.position.z = Math.round(cam.z); }); void ww; void wh;
  await onStage('sea');

  // ------------------------------------------------------------ the city (buildings.js), and its trees in tiles
  const R = rng(11), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), tint = new THREE.Color();
  buildBuildings(W); buildBeacons(W);
  const TILE = 90, put = (tiles, x, z) => { const k = Math.floor(x / TILE) * 1000 + Math.floor(z / TILE); if (!tiles.has(k)) tiles.set(k, { x: (Math.floor(x / TILE) + 0.5) * TILE, z: (Math.floor(z / TILE) + 0.5) * TILE, trees: [], cyp: [] }); return tiles.get(k); };
  const crown = new THREE.IcosahedronGeometry(1, 2), cp = crown.attributes.position;
  for (let k = 0; k < cp.count; k++) { const x = cp.getX(k), y = cp.getY(k), z = cp.getZ(k), f = 0.8 + 0.3 * Math.abs(Math.sin(x * 5.1 + y * 3.3) * Math.cos(z * 4.7 + y)); cp.setXYZ(k, x * f, y * f * 0.9 + 0.85, z * f); }
  { const n = crown.attributes.normal; for (let k = 0; k < cp.count; k++) { const v = V(cp.getX(k), cp.getY(k) - 0.75, cp.getZ(k)).normalize(); n.setXYZ(k, v.x, v.y, v.z); } } // (round, not faceted)
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  // (no leaves between the camera and who is on foot: xyz the walker, w on)
  W.leafCut = { value: new THREE.Vector4() }; leafMat.onBeforeCompile = (s) => { s.uniforms.uWalker = W.leafCut; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLeafW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeafW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;'); s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uWalker; varying vec3 vLeafW;').replace('#include <map_fragment>', `#include <map_fragment>
    if (uWalker.w > 0.5) { vec3 d = uWalker.xyz - cameraPosition, q = vLeafW - cameraPosition; float k = clamp(dot(q, d) / max(dot(d, d), 1e-4), 0.0, 1.0), e = length(q - d * k), g = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (e < mix(0.55, 0.8, g)) discard; }`); };
  const leaf = weathered(leafMat, { snow: 0.85, wet: 0.2, shine: 0.6 }), cyp = new THREE.SphereGeometry(1, 6, 6).scale(0.42, 2.1, 0.42).translate(0, 1.9, 0);
  const inst = (geo, mat, list, fn, grp, cast = true) => { if (!list.length) return; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((o, k) => fn(m, o, k)); m.castShadow = cast; m.receiveShadow = true; m.computeBoundingSphere(); grp.add(m); return m; };
  const tileList = [];
  const grow = (tiles, R) => { for (const t of tiles.values()) {
    const grp = new THREE.Group(); t.grp = grp; tileList.push(t);
    t.leaf = [inst(crown, leaf, t.trees, (m, [x, y, z, s], k) => { M.compose(V(x, y, z), Q.setFromAxisAngle(UP, R() * 6), V(s, s * (0.85 + R() * 0.4), s)); m.setMatrixAt(k, M); m.setColorAt(k, tint.setHSL(0.22 + R() * 0.07, 0.3 + R() * 0.22, 0.14 + R() * 0.11)); }, grp), inst(cyp, leaf, t.cyp, (m, [x, y, z, s], k) => { M.compose(V(x, y, z), Q.identity(), V(s, s, s)); m.setMatrixAt(k, M); m.setColorAt(k, tint.setHSL(0.3, 0.26, 0.1 + R() * 0.05)); }, grp)].filter(Boolean); still.add(grp);
  } };
  A.stream.on('h', (at, b) => { const { T } = readHouses(b, A.map), R = rng(11 + at.i * 131 + at.j * 7), tiles = new Map(); for (let k = 0; k < T.length; k += 4) { const x = T[k] / 20, z = T[k + 1] / 20; (R() < 0.14 ? put(tiles, x, z).cyp : put(tiles, x, z).trees).push([x, T[k + 2] / 400, z, T[k + 3] / 1000]); } grow(tiles, R); });
  // trees put by hand: [x, y, z, size, cypress] (client/topkapi.js: the palace's courts)
  W.plant = (list, seed = 5) => { const R = rng(seed), tiles = new Map(); for (const [x, y, z, s, c] of list) (c ? put(tiles, x, z).cyp : put(tiles, x, z).trees).push([x, y, z, s]); grow(tiles, R); };
  W.updateTiles = (cam, far) => { for (const t of tileList) { const d = Math.hypot(t.x - cam.x, t.z - cam.z) - TILE * 0.71; t.grp.visible = d < far; for (const m of t.leaf) m.visible = d < far * 0.6; } };
  await onStage('city');

  buildRoads(W); await onStage('roads');
  buildMarks(W); await buildTopkapi(W); buildSquares(W); buildGalata(W); buildWalls(W); buildInfra(W); buildGreen(W); buildParking(W); await onStage('landmarks');
  buildLife(W); await onStage('life'); buildShips(W, A); buildTransit(W); await onStage('ships');
  buildSigns(W); buildSignals(W); await onStage('signs');
  lampTex.needsUpdate = true;

  W.setNight = (k) => { night.value = k; for (const [m, x] of W.glow) m.emissiveIntensity = k * x; for (const [l, x] of W.spots) l.intensity = k * x; };
  let asked = 0; W.update = (dt, now, cam, far) => { time.value = now / 1000; if (now - asked > 400) { asked = now; A.stream.focus(cam.x, cam.z, far * 1.15 + 40); } if (W.lampsAt && now > W.lampsAt) { W.lampsAt = 0; lampTex.needsUpdate = true; } W.updateGround(cam); W.keeper.update(now, cam, far); W.updateMarks(cam, far); W.updateTiles(cam, far); W.updateBuildings(cam, far); for (const u of W.updates) u(dt, now, cam, far); };
  W.bounds = M0;
  return W;
}
export { V, UP, smooth };
void stoneMaterial;
