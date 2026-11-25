// The squares and the streets one walks in (tools/squares.mjs): Taksim, İstiklal and Tünel, Altıyol and Bahariye, Üsküdar's
// landing stages – their paving, what stands on them, and who walks there.
import * as THREE from './vendor/three.module.min.js';
import { noiseTexture } from './realism.js';
import { weathered } from './weather.js';

// what is put together out of blocks: [geometry, colour, does it glow by night]
export function kit(list) {
  const pos = [], nor = [], col = [], glow = []; for (const [g, c, e = 0] of list) { const q = g.index ? g.toNonIndexed() : g, k = new THREE.Color(c); if (!q.attributes.normal) q.computeVertexNormals(); pos.push(...q.attributes.position.array); nor.push(...q.attributes.normal.array); for (let i = 0; i < q.attributes.position.count; i++) { col.push(k.r, k.g, k.b); glow.push(e); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1)); return g;
}
export const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z), cyl = (r0, r1, h, x = 0, y = 0, z = 0, n = 12) => new THREE.CylinderGeometry(r1, r0, h, n).translate(x, y + h / 2, z), ball = (r, x, y, z, n = 10) => new THREE.SphereGeometry(r, n, Math.max(6, n - 2)).translate(x, y, z);
// a roof of four slopes
export const hip = (w, d, h, x = 0, y = 0, z = 0, ridge = 0) => { const a = w / 2, b = d / 2, r = ridge / 2, P = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b], [-r, h, 0], [r, h, 0]], F = [[3, 2, 5], [3, 5, 4], [1, 0, 4], [1, 4, 5], [0, 3, 4], [2, 1, 5], [0, 1, 2], [0, 2, 3]], o = []; for (const f of F) for (const k of f) o.push(P[k][0] + x, P[k][1] + y, P[k][2] + z); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(o, 3)); g.computeVertexNormals(); return g; };
export function kitMaterial(W, o = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, ...o });
  m.onBeforeCompile = (s) => { s.uniforms.uNight = W.night; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;'); s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying float vGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uNight * (vGlow * vec3(2.6, 1.9, 1.1) + vec3(0.16, 0.10, 0.05));'); };
  return weathered(m, { snow: 0.85, wet: 0.2, shine: 0.45 });
}
function paving(W) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uNight = W.night; s.uniforms.uNoise = { value: noiseTexture() };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aKind; varying float vKind; varying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = aKind; vW = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D uNoise; uniform float uNight; varying float vKind; varying vec3 vW;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // slabs laid in courses, each half a slab on: how near to a joint, and which slab
      vec3 course(vec2 p, vec2 size, float shift) { vec2 q = p / size; q.x += floor(q.y) * shift; vec2 id = floor(q), f = fract(q), e = min(f, 1.0 - f) * size; return vec3(min(e.x, e.y), id); }`)
      .replace('#include <map_fragment>', `
        vec4 n1 = texture2D(uNoise, vW.xz * 0.06), n2 = texture2D(uNoise, vW.xz * 0.7); float px = max(fwidth(vW.x), fwidth(vW.z)), near = smoothstep(0.10, 0.02, px); vec3 c;
        if (vKind < 0.5) { // granite slabs, with darker bands across the square
          vec3 k = course(vW.xz, vec2(0.34, 0.34), 0.0); float t = h21(k.yz); c = mix(vec3(0.335, 0.322, 0.300), vec3(0.415, 0.402, 0.378), mix(0.5, t, near));
          vec2 b = abs(fract(vW.xz / 2.72) - 0.5) * 2.72; float band = max(step(1.19, b.x), step(1.19, b.y)); c = mix(c, vec3(0.225, 0.218, 0.208), band * 0.75);
          c *= 1.0 - 0.34 * smoothstep(0.014 + px, 0.006, k.x) * near; }
        else if (vKind < 1.5) { // setts
          vec3 k = course(vW.xz, vec2(0.21, 0.13), 0.5); float t = h21(k.yz); c = mix(vec3(0.205, 0.198, 0.192), vec3(0.315, 0.302, 0.288), mix(0.5, t, near)); c = mix(c, vec3(0.34, 0.22, 0.18), step(0.93, t) * near * 0.35);
          c *= 1.0 - 0.36 * smoothstep(0.012 + px, 0.004, k.x) * near; }
        else { vec3 k = course(vW.xz, vec2(0.62, 0.3), 0.5); float t = h21(k.yz); c = mix(vec3(0.40, 0.382, 0.345), vec3(0.475, 0.458, 0.42), mix(0.5, t, near)); c *= 1.0 - 0.3 * smoothstep(0.014 + px, 0.006, k.x) * near; }
        c *= (0.84 + n1.r * 0.26) * (0.9 + n2.b * 0.2); diffuseColor.rgb = c;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.30) * uNight * (0.30 + 0.55 * n1.g);');
  };
  return weathered(m, { snow: 0.94, wet: 0.36, shine: 0.22 });
}
// ---------------------------------------------------------------- the things
function shapes() {
  const IRON = '#23272b', STONE = '#b9b1a2', WOOD = '#7a5532', globe = (x, y) => [ball(0.062, x, y, 0), '#fff1cf', 1], S = {};
  S.lamp = kit([[cyl(0.075, 0.05, 0.16), IRON], [cyl(0.026, 0.02, 1.16), IRON], [box(0.46, 0.022, 0.022, 0, 1.06, 0), IRON], [ball(0.03, 0, 1.2, 0, 8), IRON], globe(0.21, 1.0), globe(-0.21, 1.0)]);
  S.bench = kit([[box(0.5, 0.025, 0.17, 0, 0.135, 0), WOOD], [box(0.5, 0.11, 0.02, 0, 0.225, -0.085), WOOD], [box(0.03, 0.13, 0.16, -0.2, 0.065, 0), IRON], [box(0.03, 0.13, 0.16, 0.2, 0.065, 0), IRON]]);
  S.planter = kit([[cyl(0.13, 0.18, 0.17, 0, 0, 0, 10), STONE], [ball(0.16, 0, 0.23, 0, 8).scale(1, 0.75, 1), '#3f6b2c'], ...[0, 1, 2, 3, 4].map((k) => [ball(0.045, Math.sin(k * 1.257) * 0.1, 0.27, Math.cos(k * 1.257) * 0.1, 6), k % 2 ? '#d8303a' : '#f3d34a'])]);
  S.simit = kit([[box(0.42, 0.2, 0.26, 0, 0.2, 0), '#c0262c'], [box(0.4, 0.14, 0.24, 0, 0.37, 0), '#e9f0f0', 0.25], [box(0.5, 0.02, 0.36, 0, 0.62, 0), '#e8b923'], ...[-1, 1].flatMap((x) => [[box(0.012, 0.2, 0.012, x * 0.2, 0.53, 0.12), IRON], [box(0.012, 0.2, 0.012, x * 0.2, 0.53, -0.12), IRON], [new THREE.CylinderGeometry(0.085, 0.085, 0.03, 12).rotateX(Math.PI / 2).translate(x * 0.15, 0.085, 0.14), '#111418']]), ...[-0.12, 0, 0.12].map((x) => [new THREE.TorusGeometry(0.035, 0.014, 5, 10).rotateX(1.2).translate(x, 0.45, 0.02), '#a8652a'])]);
  S.kiosk = kit([[box(0.9, 0.72, 0.7, 0, 0.36, 0), '#244b3c'], [box(0.78, 0.3, 0.72, 0, 0.42, 0), '#f7dfa6', 0.9], [box(0.92, 0.06, 0.72, 0, 0.72, 0), '#1a362c'], [hip(1.12, 0.92, 0.3, 0, 0.75, 0, 0.24), '#8c9a94'], [box(0.9, 0.02, 0.26, 0, 0.6, 0.45), '#b3282d'], [box(0.66, 0.08, 0.02, 0, 0.68, 0.365), '#f4e9cf', 0.4]]);
  S.flag = kit([[cyl(0.14, 0.12, 0.08), STONE], [cyl(0.03, 0.016, 3.3, 0, 0, 0, 8), '#d8dcdf'], [ball(0.04, 0, 3.33, 0, 8), '#d9b24a']]);
  S.trunk = kit([[new THREE.TorusGeometry(0.2, 0.03, 4, 14).rotateX(Math.PI / 2).translate(0, 0.02, 0), STONE], [cyl(0.05, 0.032, 0.62, 0, 0, 0, 7), '#5b4530']]);
  { const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position; for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), f = 0.82 + 0.28 * Math.abs(Math.sin(x * 5.1 + y * 3.3) * Math.cos(z * 4.7 + y)); p.setXYZ(k, x * f, y * f * 0.92, z * f); } const n = g.attributes.normal, v = new THREE.Vector3(); for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k).normalize(); n.setXYZ(k, v.x, v.y, v.z); } S.crown = g; }
  S.head = kit([[ball(0.043, 0, 0.375, 0, 8), '#d9a27c'], [ball(0.044, 0, 0.39, -0.012, 8), '#2b2019'], [cyl(0.034, 0.03, 0.13, 0.022, 0, 0, 6), '#2a2d36'], [cyl(0.034, 0.03, 0.13, -0.022, 0, 0, 6), '#2a2d36']]);
  S.person = kit([[new THREE.CapsuleGeometry(0.048, 0.13, 3, 8).translate(0, 0.21, 0), '#ffffff']]);
  return S;
}
// ---------------------------------------------------------------- what there is one of
function sights() {
  const S = {}, lead = '#6f7d84', marble = '#ded8c9', sand = '#bba98a';
  // the Boğa's plinth
  S.plinth = (s) => kit([[cyl(1.34, 1.32, 0.1, 0, 0, 0, 40), '#a69d8d'], [cyl(1.16, 1.12, Math.max(0.12, s.top), 0, 0, 0, 40), '#8b8174'], [cyl(1.2, 1.2, 0.05, 0, Math.max(0.12, s.top) - 0.06, 0, 40), '#b8ad9b']]);
  // beds of flowers round the Republic's monument
  S.flowers = () => { const L = []; for (let k = 0; k < 4; k++) { const a0 = k * 1.5708 + 0.22, g = (r0, r1, y, c) => { const s = new THREE.Shape(); s.absarc(0, 0, r1, a0, a0 + 1.13, false); s.absarc(0, 0, r0, a0 + 1.13, a0, true); L.push([new THREE.ExtrudeGeometry(s, { depth: y, bevelEnabled: false, curveSegments: 14 }).rotateX(-Math.PI / 2), c]); }; g(2.1, 2.72, 0.05, '#c9c1b1'); g(2.15, 2.67, 0.09, '#3f6d2e'); g(2.24, 2.4, 0.13, '#c8202c'); g(2.45, 2.6, 0.12, '#f0ead8'); } return kit(L); };
  // the Maksem, where Taksim has its name from: the water was shared out here. And its wall of basins
  S.maksem = () => { const L = [[cyl(0.66, 0.66, 0.16, 0, 0, 0, 8), '#8e8574'], [cyl(0.6, 0.58, 1.15, 0, 0.1, 0, 8), sand], [cyl(0.68, 0.68, 0.08, 0, 1.22, 0, 8), '#cdbfa3'], [new THREE.ConeGeometry(0.7, 0.62, 8).translate(0, 1.61, 0), lead], [ball(0.05, 0, 1.95, 0, 8), '#d6b04c']]; for (let k = 0; k < 8; k++) { const a = (k + 0.5) * 0.7854; L.push([box(0.16, 0.34, 0.03).rotateY(a).translate(Math.sin(a) * 0.55, 0.78, Math.cos(a) * 0.55), '#3a352c', 0.5]); } return kit(L); };
  // the steps up to Gezi
  S.gezi = () => { const L = []; for (let k = 0; k < 5; k++) L.push([box(4, 0.07 * (k + 1), 0.34, 0, 0.035 * (k + 1), 0.6 - k * 0.34), k % 2 ? '#b5ad9d' : '#c2baa9']); for (const x of [-2.15, 2.15]) L.push([box(0.3, 0.5, 1.9, x, 0.25, -0.05), '#9d9484'], [box(0.36, 0.06, 1.96, x, 0.52, -0.05), '#c9c1b1'], [ball(0.16, x, 0.68, 0.7, 10).scale(1, 1, 1), '#44702f']); return kit(L); };
  // the Fiftieth Year, at Galatasaray: tubes of steel
  S.ellinci = () => { const L = [[cyl(0.42, 0.4, 0.14, 0, 0, 0, 24), '#8b8478']]; for (const [x, z, r, h, a] of [[-0.12, 0.02, 0.06, 1.7, 0.1], [0.02, -0.08, 0.055, 1.95, -0.08], [0.14, 0.06, 0.06, 1.5, 0.16], [0.0, 0.12, 0.05, 1.2, -0.2]]) { L.push([cyl(r, r, h, 0, 0, 0, 12).rotateZ(a).translate(x, 0.1, z), '#b9c0c6']); L.push([new THREE.TorusGeometry(0.17, r * 0.9, 8, 16, 3.6).rotateY(a * 7).translate(x + Math.sin(-a) * h, 0.1 + h, z), '#c6cdd2']); } return kit(L); };
  // the fountain of Ahmed III on the shore at Üsküdar: marble, its eaves wide, under lead
  S.ahmet = () => { const L = [[box(2.1, 0.1, 2.1, 0, 0.05, 0), '#a79d8d'], [box(1.5, 1.3, 1.5, 0, 0.72, 0), marble], [box(1.56, 0.1, 1.56, 0, 1.34, 0), '#c8a862'], [box(2.5, 0.07, 2.5, 0, 1.43, 0), '#7c5a3a'], [hip(2.6, 2.6, 0.55, 0, 1.46, 0, 0), lead], [cyl(0.3, 0.26, 0.18, 0, 1.86, 0, 8), '#b7ab97'], [new THREE.ConeGeometry(0.34, 0.34, 8).translate(0, 2.2, 0), lead], [ball(0.05, 0, 2.42, 0, 8), '#d6b04c']];
    for (let k = 0; k < 4; k++) { const t = (g) => g.rotateY(k * 1.5708); L.push([t(box(0.62, 0.8, 0.06, 0, 0.62, 0.75)), '#efe9dc'], [t(box(0.4, 0.5, 0.04, 0, 0.6, 0.78)), '#8fa7a0'], [t(box(0.5, 0.2, 0.22, 0, 0.2, 0.86)), '#cfc6b4'], [t(box(0.9, 0.13, 0.03, 0, 1.14, 0.765)), '#2f5f52'], [t(box(0.76, 0.05, 0.04, 0, 1.14, 0.77)), '#d9bb62']); const a = k * 1.5708 + 0.7854; L.push([cyl(0.13, 0.13, 1.3, Math.sin(a) * 1.02, 0.08, Math.cos(a) * 1.02, 10), '#e6dfcf'], [cyl(0.2, 0.2, 0.06, Math.sin(a) * 1.02, 0.62, Math.cos(a) * 1.02, 10), '#c2a35a']); } return kit(L); };
  S.suavi = () => kit([[box(0.4, 0.1, 0.4, 0, 0.05, 0), '#9d9484'], [box(0.26, 0.6, 0.26, 0, 0.36, 0), '#c6bda9'], [box(0.2, 0.12, 0.13, 0, 0.72, 0), '#4a5a4c'], [ball(0.085, 0, 0.86, 0, 10), '#4a5a4c']]);
  // a landing stage of the city's ferries: two wings with a way through, a hall over it, and eaves all round
  S.iskele = () => { const W1 = '#efe6d0', TR = '#f8f3e6', L = [[box(5.2, 0.16, 2.8, 0, -0.02, 0.1), '#9b9284']]; for (const sd of [1, -1]) { L.push([box(1.75, 0.95, 1.7, sd * 1.5, 0.5, 0), W1], [box(1.79, 0.08, 1.74, sd * 1.5, 0.95, 0), TR], [hip(2.1, 2.05, 0.46, sd * 1.5, 0.99, 0, 0.5), '#a5472f']); for (const z of [0.86, -0.86]) for (const x of [-0.52, 0, 0.52]) L.push([box(0.3, 0.52, 0.03, sd * 1.5 + x, 0.46, z), '#2f4b58', 0.8], [new THREE.CylinderGeometry(0.15, 0.15, 0.03, 12).rotateX(Math.PI / 2).translate(sd * 1.5 + x, 0.72, z), '#2f4b58', 0.8], [box(0.36, 0.04, 0.05, sd * 1.5 + x, 0.18, z), TR]); L.push([box(0.03, 0.52, 0.7, sd * 2.385, 0.46, 0), '#2f4b58', 0.7]); }
    L.push([box(1.5, 0.72, 1.9, 0, 1.32, 0), W1], [box(1.56, 0.07, 1.96, 0, 0.97, 0), TR], [box(1.56, 0.07, 1.96, 0, 1.68, 0), TR], [hip(2.0, 2.4, 0.62, 0, 1.72, 0, 0), '#a5472f'], [cyl(0.02, 0.02, 0.5, 0, 2.3, 0, 6), '#d8dcdf']); for (const z of [0.96, -0.96]) for (const x of [-0.45, 0, 0.45]) L.push([box(0.28, 0.42, 0.03, x, 1.3, z), '#2f4b58', 0.9]);
    for (const x of [-0.66, 0.66]) for (const z of [-0.9, 0.9]) L.push([cyl(0.06, 0.05, 0.94, x, 0, z, 10), TR]);
    // the roof over the quay side, on posts
    L.push([box(5, 0.06, 1.0, 0, 0.9, 1.35), '#4b5a60']); for (const x of [-2.3, -1.15, 1.15, 2.3]) L.push([cyl(0.035, 0.035, 0.9, x, 0, 1.75, 8), '#dfe3e2']); return kit(L); };
  return S;
}
export const iskele = () => sights().iskele();
// is this in a street one walks in?
export function inSetts(A) {
  const list = A.squares ? A.squares.areas.filter((a) => a.kind === 1).map(({ rings: [r] }) => ({ r, x0: Math.min(...r.map((p) => p[0])), x1: Math.max(...r.map((p) => p[0])), z0: Math.min(...r.map((p) => p[1])), z1: Math.max(...r.map((p) => p[1])) })) : [];
  return (x, z) => list.some(({ r, x0, x1, z0, z1 }) => { if (x < x0 || x > x1 || z < z0 || z > z1) return false; let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; });
}
export function buildSquares(W) {
  const D = W.A.squares; if (!D) return; const { A } = W, g = A.map.grid, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), P0 = new THREE.Vector3(), S0 = new THREE.Vector3();
  const inside = (p, x, z) => { let r = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) r = !r; return r; };
  const ground = (x, z) => { const a = (x - g.x0) / g.step, b = (z - g.z0) / g.step, i = Math.floor(a), j = Math.floor(b), p = a - i, q = b - j, k = j * g.w + i, f = A.H; return p + q <= 1 ? f[k] + (f[k + 1] - f[k]) * p + (f[k + g.w] - f[k]) * q : f[k + g.w + 1] + (f[k + g.w] - f[k + g.w + 1]) * (1 - p) + (f[k + 1] - f[k + g.w + 1]) * (1 - q); };
  const areas = D.areas.map((a) => { const xs = a.rings[0].map((p) => p[0]), zs = a.rings[0].map((p) => p[1]); return { a, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; });
  // how high one stands on the paving at (x, z): null, there is none, or a landmark stands there
  W.paved = (x, z) => {
    let k = null; for (const { a, x0, x1, z0, z1 } of areas) if (x > x0 && x < x1 && z > z0 && z < z1 && inside(a.rings[0], x, z) && !a.rings.slice(1).some((h) => inside(h, x, z))) { k = a.kind; break; } if (k === null) return null;
    for (const m of W.marks) if (Math.abs(m.x - x) < m.r && Math.abs(m.z - z) < m.r && inside(m.hull, x, z)) return null;
    const y = ground(x, z) + D.lift; return k === 2 && W.coast(x, z) < 2.5 ? Math.max(y, 0.42) : y;
  };
  const pave = paving(W), stuff = kitMaterial(W), leaf = weathered(new THREE.MeshStandardMaterial({ roughness: 0.95 }), { snow: 0.85, wet: 0.2, shine: 0.6 }), T = shapes(), sight = sights(), groups = [], B = A.squaresBin; let o = 0;
  for (const p of D.parts) {
    const pos16 = new Int16Array(B.slice(o, o + p.nv * 6)); o += p.nv * 6; const kinds = new Uint8Array(B, o, p.nv); o += p.nv + p.pad; const idx = new Uint32Array(B.slice(o, o + p.ni * 4)); o += p.ni * 4;
    const pos = new Float32Array(p.nv * 3), kind = new Float32Array(p.nv); for (let k = 0; k < p.nv; k++) { pos[k * 3] = p.ox + pos16[k * 3] / 200; pos[k * 3 + 1] = pos16[k * 3 + 1] / 1000; pos[k * 3 + 2] = p.oz + pos16[k * 3 + 2] / 200; kind[k] = kinds[k]; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const G = new THREE.Group(), m = new THREE.Mesh(geo, pave); m.receiveShadow = true; G.add(m); const small = new THREE.Group(); G.add(small);
    // the quay's wall
    if (p.wall.length > 2) { const L = []; for (let i = 0; i + 1 < p.wall.length; i++) { const [ax, az] = p.wall[i], [bx, bz] = p.wall[i + 1], l = Math.hypot(bx - ax, bz - az); if (l < 0.02 || l > 4) continue; L.push([box(0.26, 1.35, l + 0.1, 0, -0.16, 0).rotateY(Math.atan2(bx - ax, bz - az)).translate((ax + bx) / 2, 0, (az + bz) / 2), '#8f877a'], [box(0.34, 0.07, l + 0.1, 0, 0.5, 0).rotateY(Math.atan2(bx - ax, bz - az)).translate((ax + bx) / 2, 0, (az + bz) / 2), '#c4bba9']); } const q = new THREE.Mesh(kit(L), stuff); q.castShadow = q.receiveShadow = true; G.add(q); }
    groups.push({ p, G, small, x: p.ox, z: p.oz, things: {}, people: [] });
  }
  const home = (x, z) => groups.reduce((b, q) => { const d = Math.hypot(q.x - x, q.z - z) - q.p.r; return d < b[0] ? [d, q] : b; }, [1e9, null])[1];
  for (const [k, list] of Object.entries(D.things)) for (const e of list) { const q = home(e[0], k === 'string' ? e[2] : e[2]); (q.things[k] ||= []).push(e); }
  const post = { lamp: [0.06, 1.2], planter: [0.17, 0.4], simit: [0.24, 0.6], kiosk: [0.5, 0.9], flag: [0.1, 3], bench: [0.2, 0.3], tree: [0.07, 0.6] };
  for (const q of groups) {
    const put = (geo, mat, list, fn, cast = true, col = null) => { if (!list.length) return; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((e, i) => { fn(e, i); m.setMatrixAt(i, M); if (col) m.setColorAt(i, col(e, i)); }); m.castShadow = cast; m.receiveShadow = true; m.computeBoundingSphere(); q.small.add(m); return m; }, turned = ([x, y, z, a]) => M.compose(P0.set(x, y, z), Q.setFromAxisAngle(UP, a), S0.set(1, 1, 1)), tint = new THREE.Color();
    for (const [k, list] of Object.entries(q.things)) {
      if (post[k]) for (const [x, y, z] of list) (W.posts ||= []).push([x, y, z, ...post[k]]);
      if (T[k]) put(T[k], stuff, list, turned);
      if (k === 'lamp') for (const [x, , z] of list) if (W.coast(x, z) < 6) W.light(x, z, 0.9, 0.7);
      if (k === 'tree') { put(T.trunk, stuff, list, ([x, y, z]) => M.makeTranslation(x, y, z)); put(T.crown, leaf, list, ([x, y, z, s], i) => M.compose(P0.set(x, y + 0.52 + s * 0.75, z), Q.setFromAxisAngle(UP, i * 2.4), S0.set(s, s, s)), true, (e, i) => tint.setHSL(0.23 + ((i * 0.37) % 1) * 0.06, 0.38, 0.17 + ((i * 0.61) % 1) * 0.07)); }
      if (k === 'flag') { const cv = document.createElement('canvas'); cv.width = 192; cv.height = 128; const c = cv.getContext('2d'); c.fillStyle = '#e30a17'; c.fillRect(0, 0, 192, 128); c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 32, 0, 7); c.fill(); c.fillStyle = '#e30a17'; c.beginPath(); c.arc(72, 64, 25.6, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 5; i++) { const a = Math.PI + (i * 4 * Math.PI) / 5; c.lineTo(107 + Math.cos(a) * 16, 64 + Math.sin(a) * 16); } c.fill(); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; const fg = new THREE.PlaneGeometry(1.05, 0.7, 10, 1).translate(0.54, 2.9, 0), fp = fg.attributes.position; for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 6) * 0.07 * fp.getX(i)); fg.computeVertexNormals(); put(fg, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.08 }), list, ([x, y, z]) => M.makeTranslation(x, y, z)); }
      if (k === 'string') { const L = []; for (const [x, y, z, X, Z] of list) { const n = 11, l = Math.hypot(X - x, Z - z), yaw = Math.atan2(X - x, Z - z); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, sag = 0.34 * (1 - (2 * t - 1) ** 2); L.push([box(0.012, 0.012, l / n + 0.02).rotateY(yaw).translate(x + (X - x) * t, y - sag, z + (Z - z) * t), '#1d1f22'], [ball(0.032, x + (X - x) * t, y - sag - 0.035, z + (Z - z) * t, 6), i % 3 ? '#fff3cf' : '#ffd27a', 1.6]); } } const m = new THREE.Mesh(kit(L), stuff); q.small.add(m); }
    }
    // the sights
    for (const s of D.sites) if (home(s.x, s.z) === q && sight[s.kind]) { const m = new THREE.Mesh(sight[s.kind](s), stuff); m.position.set(s.x, s.y, s.z); m.rotation.y = s.yaw; m.castShadow = m.receiveShadow = true; q.G.add(m); if (s.kind !== 'gezi' && s.kind !== 'flowers') (W.posts ||= []).push([s.x, s.y, s.z, s.r * 0.95, 2]); }
    // who walks there
    const walks = D.walks.filter((w) => w[0] === q.p.site).map((w, i) => ({ a: [w[1], w[2]], b: [w[3], w[4]], l: Math.hypot(w[3] - w[1], w[4] - w[2]), v: 0.16 + ((i * 0.37) % 1) * 0.12, t: i * 3.7 }));
    for (const s of D.streets) if (s.site === q.p.site) { const C = [0]; for (let i = 1; i < s.p.length; i++) C.push(C[i - 1] + Math.hypot(s.p[i][0] - s.p[i - 1][0], s.p[i][1] - s.p[i - 1][1])); const len = C[C.length - 1], n = Math.round(len * (s.site === 'istiklal' ? 0.95 : 0.7)); for (let i = 0; i < n; i++) walks.push({ s: s.p, C, len, at: (i * 0.618 * len) % len, u: (0.72 + ((i * 0.733) % 1) * 0.72) * (i % 2 ? 1 : -1), d: (i * 7) % 5 < 2 ? 1 : -1, v: 0.18 + ((i * 0.37) % 1) * 0.14 }); }
    if (walks.length) { const coats = ['#2d3440', '#7c2430', '#35597c', '#c9b48a', '#4c5a3a', '#8a8f96', '#d6d2c8', '#5c3a52', '#b46a2c', '#1d1f24'].map((c) => new THREE.Color(c)), m = new THREE.InstancedMesh(T.person, stuff, walks.length); walks.forEach((w, i) => m.setColorAt(i, coats[(i * 7) % coats.length])); m.castShadow = true; const h = new THREE.InstancedMesh(T.head, stuff, walks.length); h.instanceMatrix = m.instanceMatrix; h.castShadow = true; for (const o1 of [m, h]) { o1.frustumCulled = false; o1.visible = false; W.root.add(o1); } q.walk = { m, h, list: walks }; }
    q.G.visible = false; W.still.add(q.G);
  }
  // each shown when near enough; its people go when nearer yet
  const spot = (w, T1, out) => {
    if (w.s) { const s = (((w.at + w.d * w.v * T1) % w.len) + w.len) % w.len; let lo = 0, hi = w.C.length - 2; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (w.C[k] <= s) lo = k; else hi = k - 1; } const a = w.s[lo], b = w.s[lo + 1], l = w.C[lo + 1] - w.C[lo] || 1, t = (s - w.C[lo]) / l, dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l; out[0] = a[0] + (b[0] - a[0]) * t - dz * w.u; out[1] = a[1] + (b[1] - a[1]) * t + dx * w.u; out[2] = Math.atan2(dx * w.d, dz * w.d); return; }
    const c = ((w.t + w.v * T1) / w.l) % 2, t = c < 1 ? c : 2 - c, dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1]; out[0] = w.a[0] + dx * t; out[1] = w.a[1] + dz * t; out[2] = Math.atan2(dx, dz) + (c < 1 ? 0 : Math.PI);
  }, at = [0, 0, 0];
  W.updates.push((dt, now, cam, far) => {
    for (const q of groups) {
      const d = Math.hypot(q.x - cam.x, q.z - cam.z) - q.p.r, F = far || 300; q.G.visible = d < F * 0.95; q.small.visible = d < Math.min(110, F * 0.6); if (!q.walk) continue; const on = (q.walk.m.visible = q.walk.h.visible = d < 45); if (!on) continue;
      const m = q.walk.m, T1 = now / 1000; q.walk.list.forEach((w, i) => { spot(w, T1, at); if (w.last === undefined || (i + q.tick) % 8 === 0) w.last = ground(at[0], at[1]) + D.lift; const hop = Math.abs(Math.sin(T1 * 7 * (0.8 + w.v) + i)) * 0.02; M.compose(P0.set(at[0], w.last + hop, at[1]), Q.setFromAxisAngle(UP, at[2]), S0.set(1, 1, 1)); m.setMatrixAt(i, M); }); q.tick = ((q.tick || 0) + 1) % 8; m.instanceMatrix.needsUpdate = true;
    }
  });
}
