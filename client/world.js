// The diorama: terrain, sea, houses, trees, roads, landmarks, bridges, the
// cable car, boats – lit by day, floodlit by night. The look is the board
// game's (its istanbul-art.js), at this map's scale.

import * as THREE from './vendor/three.module.min.js';
import { MOON_DIR, CARTOON_MOON, noiseTexture, rng, stoneMaterial } from './realism.js';
import { surf, weathered, SWELL_GLSL, cutAway } from './weather.js';
import { buildRoads } from './roads.js';
import { buildMarks } from './marks.js';
import { buildBuildings } from './buildings.js';
import { buildLife } from './life.js';
import { buildShips } from './ships.js';
import { buildSigns } from './signs.js';
import { buildSignals } from './signals.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const CHUNK = 64; // grid cells across a piece of ground

export function buildWorld(scene, A, net, onStage = () => {}) {
  const root = new THREE.Group(); scene.add(root);
  const g = A.map.grid, M0 = A.map.map, { height, coast } = A.ground;
  const night = { value: 0 }, time = { value: 0 }, W = { mouths: { value: [0, 1].map(() => new THREE.Vector4(1e6, 1e6, 0, 1)) }, root, night, time, height, coast, net, grid: g, glow: [], spots: [], updates: [], A };
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
  const urban = new Uint8Array(g.w * g.h); // (built-up land, from the houses)
  for (let k = 0, o = 0; k < A.buildingCount; k++) { const i = Math.round((A.buildings[o] / 20 - g.x0) / g.step), j = Math.round((A.buildings[o + 1] / 20 - g.z0) / g.step); o += 6 + (A.buildings[o + 5] & 255) * 2; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const q = (j + b) * g.w + i + a; if (q >= 0 && q < urban.length) urban[q] = Math.min(255, urban[q] + (a || b ? 34 : 60)); } }
  const urbanTex = tex(urban);
  ground.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uNight: night, uNoise: { value: noiseTexture() }, uShore: { value: shoreTex }, uPark: { value: parkTex }, uUrban: { value: urbanTex }, uArea: { value: area }, uMouth: W.mouths });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying float vUpN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = position; vUpN = normal.y;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uMouth[2];\nuniform sampler2D uNoise, uShore, uPark, uUrban; uniform vec4 uArea; uniform float uNight; varying vec3 vW; varying float vUpN; float gBump; float gUrban;')
      .replace('#include <map_fragment>', `
        for (int k = 0; k < 2; k++) { vec2 md = vW.xz - uMouth[k].xy; float al = dot(md, uMouth[k].zw), la = abs(dot(md, vec2(-uMouth[k].w, uMouth[k].z))); if (al > -1.2 && al < 13.0 && la < 2.5) discard; } // (the mouths of the tunnel)
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
  const makePiece = (ci, cj, st) => {
    const n = CHUNK / st, S = n + 3, pos = new Float32Array(S * S * 3), nor = new Float32Array(S * S * 3), idx = []; // (one ring of skirt round it)
    for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) {
      const skirt = a === 0 || b === 0 || a === S - 1 || b === S - 1, i = Math.min(g.w - 1, ci * CHUNK + Math.min(n, Math.max(0, a - 1)) * st), j = Math.min(g.h - 1, cj * CHUNK + Math.min(n, Math.max(0, b - 1)) * st), k = (b * S + a) * 3;
      pos[k] = g.x0 + i * g.step; pos[k + 1] = hAt(i, j) - (skirt ? 0.5 * st : 0); pos[k + 2] = g.z0 + j * g.step;
      const nx = hAt(i - 1, j) - hAt(i + 1, j), nz = hAt(i, j - 1) - hAt(i, j + 1), l = Math.hypot(nx, 2 * g.step, nz); nor[k] = nx / l; nor[k + 1] = (2 * g.step) / l; nor[k + 2] = nz / l;
      if (a < S - 1 && b < S - 1) { const q = b * S + a; idx.push(q, q + S, q + 1, q + 1, q + S, q + S + 1); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setIndex(idx); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, ground); m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; return m;
  };
  for (let cj = 0; cj < rows; cj++) for (let ci = 0; ci < cols; ci++) {
    let any = false; for (let j = 0; j <= CHUNK && !any; j += 2) for (let i = 0; i <= CHUNK && !any; i += 2) if (hAt(ci * CHUNK + i, cj * CHUNK + j) > -1.4) any = true;
    if (!any) continue;
    pieces.push({ ci, cj, x: g.x0 + (ci + 0.5) * CHUNK * g.step, z: g.z0 + (cj + 0.5) * CHUNK * g.step, lods: {}, now: null });
  }
  // (all of it coarse, once; the rest when the camera gets there)
  for (const p of pieces) { p.lods[4] = makePiece(p.ci, p.cj, 4); root.add(p.lods[4]); p.now = 4; }
  W.updateGround = (cam, budget = 2) => {
    for (const p of pieces) {
      const d = Math.max(Math.abs(p.x - cam.x), Math.abs(p.z - cam.z)) - CHUNK * g.step / 2, want = d < 60 ? 1 : d < 190 ? 2 : 4;
      if (want === p.now) continue;
      if (!p.lods[want]) { if (budget-- <= 0) continue; p.lods[want] = makePiece(p.ci, p.cj, want); root.add(p.lods[want]); }
      p.lods[p.now].visible = false; p.lods[want].visible = true; p.now = want;
    }
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
  onStage('terrain');

  // ------------------------------------------------------------ the sea
  const LD = 2048, ld = new Uint8Array(LD * LD);
  const light = (x, z, r, power) => {
    const i0 = ((x - area.x) / area.z) * LD, j0 = ((z - area.y) / area.w) * LD, Rr = Math.max(0.8, (r / area.z) * LD), w = Math.ceil(Rr * 2.2);
    for (let j = Math.max(0, Math.floor(j0 - w)); j <= Math.min(LD - 1, j0 + w); j++) for (let i = Math.max(0, Math.floor(i0 - w)); i <= Math.min(LD - 1, i0 + w); i++) { const k = j * LD + i, v = Math.exp(-((i - i0) ** 2 + (j - j0) ** 2) / (Rr * Rr)) * power * 255; if (v > 1) ld[k] = Math.min(255, ld[k] + v); }
  };
  W.light = light;
  const lampTex = new THREE.DataTexture(ld, LD, LD, THREE.RedFormat); lampTex.magFilter = lampTex.minFilter = THREE.LinearFilter; lampTex.unpackAlignment = 1;
  W.lampTex = lampTex;
  const wake = (W.wake = { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 1e4)) }); // boats: x, z, heading, length
  const sea = new THREE.MeshPhysicalMaterial({ color: '#0d3f55', roughness: 0.09, metalness: 0, ior: 1.33, specularIntensity: 1, envMapIntensity: 1.15 });
  sea.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uNoise: { value: noiseTexture() }, uShore: { value: shoreTex }, uArea: { value: area }, uTime: time, uNight: night, uMoon: { value: MOON_DIR }, uLamps: { value: lampTex }, uWake: wake, uSwell: surf.swell, uRain: surf.rain }); cutAway(s);
    s.uniforms.uEdge = { value: new THREE.Vector4(g.x0, g.z0, g.x0 + (g.w - 1) * g.step, g.z0 + (g.h - 1) * g.step) };
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vW; uniform sampler2D uShore; uniform vec4 uArea, uEdge; uniform float uTime, uSwell; ${SWELL_GLSL}`).replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec4 w4 = modelMatrix * vec4(position, 1.0); w4.xz = clamp(w4.xz, uEdge.xy, uEdge.zw); float sh = (texture2D(uShore, (w4.xz - uArea.xy) / uArea.zw).r - 0.5) * 24.0, shelter = smoothstep(-0.9, -7.9, sh); w4.y += swell(w4.xz, uTime).x * uSwell * shelter; vW = w4.xyz; transformed = w4.xyz - modelMatrix[3].xyz; }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uSwell, uRain; ${SWELL_GLSL}
        uniform sampler2D uNoise, uShore, uLamps; uniform vec4 uArea; uniform vec4 uWake[8]; uniform float uTime, uNight; uniform vec3 uMoon; varying vec3 vW;
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
        // the boats' wakes
        for (int k = 0; k < 8; k++) {
          vec2 d = vW.xz - uWake[k].xy; if (dot(d, d) > 3600.0) continue;
          vec2 f = vec2(sin(uWake[k].z), cos(uWake[k].z)); float a = -dot(d, f), b = dot(d, vec2(f.y, -f.x)), L = uWake[k].w;
          if (a > -L * 0.5) { float sp = 0.25 + max(a + L * 0.3, 0.0) * 0.30, fade = exp(-max(a, 0.0) * 0.075);
            float arm = exp(-pow((abs(b) - sp) * 1.6, 2.0)) + 0.8 * exp(-b * b * 1.2) * smoothstep(L * 0.3, L * 0.6, a);
            foam += arm * fade * (0.35 + 0.65 * texture2D(uNoise, vW.xz * 0.35 + uTime * 0.03).g) * 0.9; }
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
  onStage('sea');

  // ------------------------------------------------------------ the city (buildings.js), and its trees in tiles
  const R = rng(11), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), tint = new THREE.Color();
  buildBuildings(W);
  const TILE = 100, tiles = new Map(), put = (x, z) => { const k = Math.floor(x / TILE) * 1000 + Math.floor(z / TILE); if (!tiles.has(k)) tiles.set(k, { x: (Math.floor(x / TILE) + 0.5) * TILE, z: (Math.floor(z / TILE) + 0.5) * TILE, trees: [], cyp: [] }); return tiles.get(k); };
  const T = A.trees; for (let k = 0; k < T.length; k += 4) { const x = T[k] / 20, z = T[k + 1] / 20; (R() < 0.14 ? put(x, z).cyp : put(x, z).trees).push([x, T[k + 2] / 400, z, T[k + 3] / 1000]); }
  const crown = new THREE.IcosahedronGeometry(1, 2), cp = crown.attributes.position;
  for (let k = 0; k < cp.count; k++) { const x = cp.getX(k), y = cp.getY(k), z = cp.getZ(k), f = 0.8 + 0.3 * Math.abs(Math.sin(x * 5.1 + y * 3.3) * Math.cos(z * 4.7 + y)); cp.setXYZ(k, x * f, y * f * 0.9 + 0.85, z * f); }
  { const n = crown.attributes.normal; for (let k = 0; k < cp.count; k++) { const v = V(cp.getX(k), cp.getY(k) - 0.75, cp.getZ(k)).normalize(); n.setXYZ(k, v.x, v.y, v.z); } } // (round, not faceted)
  const leaf = weathered(new THREE.MeshStandardMaterial({ roughness: 0.95 }), { snow: 0.85, wet: 0.2, shine: 0.6 }), cyp = new THREE.SphereGeometry(1, 6, 6).scale(0.42, 2.1, 0.42).translate(0, 1.9, 0);
  const inst = (geo, mat, list, fn, grp, cast = true) => { if (!list.length) return; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((o, k) => fn(m, o, k)); m.castShadow = cast; m.receiveShadow = true; m.computeBoundingSphere(); grp.add(m); return m; };
  const tileList = [];
  for (const t of tiles.values()) {
    const grp = new THREE.Group(); root.add(grp); t.grp = grp; tileList.push(t);
    t.leaf = [inst(crown, leaf, t.trees, (m, [x, y, z, s], k) => { M.compose(V(x, y, z), Q.setFromAxisAngle(UP, R() * 6), V(s, s * (0.85 + R() * 0.4), s)); m.setMatrixAt(k, M); m.setColorAt(k, tint.setHSL(0.22 + R() * 0.07, 0.3 + R() * 0.22, 0.14 + R() * 0.11)); }, grp), inst(cyp, leaf, t.cyp, (m, [x, y, z, s], k) => { M.compose(V(x, y, z), Q.identity(), V(s, s, s)); m.setMatrixAt(k, M); m.setColorAt(k, tint.setHSL(0.3, 0.26, 0.1 + R() * 0.05)); }, grp)].filter(Boolean);
  }
  W.updateTiles = (cam, far) => { for (const t of tileList) { const d = Math.hypot(t.x - cam.x, t.z - cam.z) - TILE * 0.71; t.grp.visible = d < far; for (const m of t.leaf) m.visible = d < far * 0.6; } };
  onStage('city');

  buildRoads(W); onStage('roads');
  buildMarks(W); onStage('landmarks');
  buildLife(W); onStage('life'); buildShips(W, A); onStage('ships');
  buildSigns(W); buildSignals(W); onStage('signs');
  lampTex.needsUpdate = true;

  W.setNight = (k) => { night.value = k; for (const [m, x] of W.glow) m.emissiveIntensity = k * x; for (const [l, x] of W.spots) l.intensity = k * x; };
  W.update = (dt, now, cam, far) => { time.value = now / 1000; W.updateGround(cam); W.updateTiles(cam, far); W.updateBuildings(cam, far); for (const u of W.updates) u(dt, now, cam); };
  W.bounds = M0;
  return W;
}
export { V, UP, smooth };
void stoneMaterial;
