// The cars, built in code: bodies lofted along their length, a glazed cabin
// with pillars, lamps, grilles, mirrors, plates, arches and spoked wheels.
// About 1.2 long, nose along +z, wheels on y = 0. The geometry of a kind is
// made once; each car has its own paint and tail lights.
import * as THREE from './vendor/three.module.min.js';
import { pack } from './gpu.js';

const S = (o) => new THREE.MeshStandardMaterial(o), Ph = (o) => new THREE.MeshPhysicalMaterial(o);
const MAT = {
  glass: Ph({ color: '#5d7482', roughness: 0.05, metalness: 0.85, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3 }), tyre: S({ color: '#141516', roughness: 0.92 }), rim: S({ color: '#d6dadd', metalness: 0.55, roughness: 0.3 }), chrome: S({ color: '#ffffff', metalness: 0.9, roughness: 0.2, envMapIntensity: 2.2 }), black: S({ color: '#15171a', roughness: 0.55 }), under: S({ color: '#0c0d0e', roughness: 0.95 }), white: Ph({ color: '#f3f2ec', roughness: 0.32, clearcoat: 1 }), red: Ph({ color: '#c3241f', roughness: 0.35, clearcoat: 0.8 }), amber: S({ color: '#e08a1a', emissive: '#ff9a1a', emissiveIntensity: 0.3, roughness: 0.3 }), wood: S({ color: '#8a5a32', roughness: 0.7 }), cargo: S({ color: '#e4e2dc', roughness: 0.6 }), simit: S({ color: '#b5651d', roughness: 0.65 }), clear: Ph({ color: '#dff0f5', transparent: true, opacity: 0.28, roughness: 0.04, depthWrite: false, side: THREE.DoubleSide }), stripe: S({ color: '#c8322c', roughness: 0.6, side: THREE.DoubleSide }), gold: S({ color: '#ffc93a', emissive: '#ffb21c', emissiveIntensity: 0.6 }), blue: Ph({ color: '#1d4fa0', roughness: 0.32, clearcoat: 1 }),
  head: S({ color: '#fff8e6', emissive: '#ffedc4', emissiveIntensity: 0.6, roughness: 0.15 }),
};
export const setHeadlights = (k) => { MAT.head.emissiveIntensity = 0.5 + k * 5; MAT.gold.emissiveIntensity = 0.5 + k * 2.2; };
// ---------------------------------------------------------------- geometry
// a loft: rings at stations [z, bottom, top, half width, squareness, tumblehome]
function loft(st, M = 22) {
  const pos = [], idx = [], N = st.length;
  for (const [z, y0, y1, w, n = 4.2, t = 0.1] of st) for (let k = 0; k < M; k++) { const a = (k / M) * Math.PI * 2 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a), x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = Math.sign(s) * Math.pow(Math.abs(s), 2 / n); pos.push(x * w * (1 - t * Math.max(0, y)), (y0 + y1) / 2 + (y * (y1 - y0)) / 2, z); }
  for (let i = 0; i + 1 < N; i++) for (let k = 0; k < M; k++) { const a = i * M + k, b = i * M + ((k + 1) % M); idx.push(a, b, a + M, b, b + M, a + M); }
  for (const [i, f] of [[0, 1], [N - 1, -1]]) { const c = pos.length / 3; let y = 0; for (let k = 0; k < M; k++) y += pos[(i * M + k) * 3 + 1]; pos.push(0, y / M, st[i][0] + (f > 0 ? Math.sign(st[0][0] - st[1][0]) : Math.sign(st[N - 1][0] - st[N - 2][0])) * 0.012); for (let k = 0; k < M; k++) { const a = i * M + k, b = i * M + ((k + 1) % M); if (f > 0) idx.push(c, b, a); else idx.push(c, a, b); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // (stations run nose to tail: flip if the faces came out inside out)
  const nrm = g.attributes.normal, p = g.attributes.position; let s = 0; for (let i = 0; i < p.count; i++) s += nrm.getX(i) * p.getX(i); if (s < 0) { for (let k = 0; k < idx.length; k += 3) { const q = idx[k]; idx[k] = idx[k + 1]; idx[k + 1] = q; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
const M4 = new THREE.Matrix4(), Qt = new THREE.Quaternion(), Eu = new THREE.Euler(), V = (x, y, z) => new THREE.Vector3(x, y, z);
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => g.clone().applyMatrix4(M4.compose(V(x, y, z), Qt.setFromEuler(Eu.set(rx, ry, rz)), V(sx, sy, sz)));
const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => at(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1) => at(new THREE.SphereGeometry(r, 14, 10), x, y, z, 0, 0, 0, sx, sy, sz);
const cyl = (r, h, x, y, z, rx = 0, rz = 0, n = 16) => at(new THREE.CylinderGeometry(r, r, h, n), x, y, z, rx, 0, rz);
// a bar between two points
const bar = (a, b, w, h) => { const d = V(...b).sub(V(...a)), l = d.length(), m = new THREE.Matrix4().lookAt(V(0, 0, 0), d, Math.abs(d.y) > l * 0.98 ? V(0, 0, 1) : V(0, 1, 0)); const g = new THREE.BoxGeometry(w, h, l); g.applyMatrix4(m); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g; };
function merge(list) { const pos = [], nor = []; for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; g.normalizeNormals(); for (const v of g.attributes.position.array) pos.push(v); for (const v of g.attributes.normal.array) nor.push(v); } const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return o; }
const both = (f) => [f(1), f(-1)];
// ---------------------------------------------------------------- the kinds: parts by material
function parts(kind) {
  const P = {}, add = (m, ...g) => { (P[m] ||= []).push(...g.flat()); }, R = { P, wr: 0.112, wx: 0.238, wz: [0.385, -0.385], ww: 0.1, rim: 'rim', spokes: 5 };
  // the common car: body stations, cabin [windscreen foot, roof front, roof back, rear foot] and its heights
  const car = ({ body, cab, roofY, belt, gw, rw, sill = 0.085, pillar = 0.026 }) => {
    add('paint', loft(body.map(([z, y, w, n]) => [z, sill, y, w, n || 4.6, 0.07])));
    const [a, b, c, d] = cab; add('glass', loft([[a, belt - 0.03, belt + 0.004, gw * 0.94, 5, 0.02], [a - 0.012, belt - 0.03, belt + 0.02, gw, 6, 0.05], [b, belt - 0.03, roofY - 0.004, gw, 8, 0.2], [(b + c) / 2, belt - 0.03, roofY + 0.006, gw * 1.01, 8, 0.2], [c, belt - 0.03, roofY - 0.004, gw, 8, 0.2], [d + 0.012, belt - 0.03, belt + 0.024, gw, 6, 0.05], [d, belt - 0.03, belt + 0.004, gw * 0.94, 5, 0.02]]));
    add('paint', loft([[b + 0.03, roofY - 0.035, roofY - 0.012, rw * 0.93, 7, 0], [b, roofY - 0.02, roofY + 0.012, rw, 7, 0], [(b + c) / 2, roofY - 0.012, roofY + 0.024, rw * 1.03, 7, 0], [c, roofY - 0.02, roofY + 0.012, rw, 7, 0], [c - 0.03, roofY - 0.04, roofY - 0.012, rw * 0.93, 7, 0]]));
    for (const s of [1, -1]) { add('paint', bar([s * gw * 0.93, belt, a - 0.005], [s * rw * 0.95, roofY, b], pillar, pillar), bar([s * gw * 0.94, belt, d + 0.005], [s * rw * 0.95, roofY, c], pillar * 1.7, pillar)); const m = (b + c) / 2 + 0.02; add('black', bar([s * gw * 1.0, belt, m], [s * rw * 1.0, roofY - 0.01, m], 0.024, 0.02)); }
  };
  const front = (z, y, w, { grille = [0.26, 0.05], lamp = [0.055, 0.036], bump = 0.145, plateY = 0.14, gm = 'black' } = {}) => { add(gm, box(grille[0], grille[1], 0.02, 0, y - 0.005, z)); if (gm === 'black') for (let k = -1; k <= 1; k++) add('chrome', box(grille[0] * 0.98, 0.005, 0.024, 0, y + k * grille[1] * 0.3, z + 0.002)); for (const s of [1, -1]) { add('head', ball(1, s * (w - 0.055), y + 0.012, z - 0.016, lamp[0] * 0.5, lamp[1] * 0.78, 0.034)); add('chrome', ball(1, s * (w - 0.055), y + 0.012, z - 0.024, lamp[0], lamp[1], 0.034)); add('black', ball(1, s * (w - 0.055), y + 0.012, z - 0.03, lamp[0] * 1.2, lamp[1] * 1.25, 0.035)); add('amber', ball(1, s * (w - 0.005), y + 0.004, z - 0.06, 0.016, 0.018, 0.03)); } add('black', box(w * 1.7, 0.035, 0.03, 0, bump - 0.045, z - 0.006)); add('white', box(0.16, 0.036, 0.01, 0, plateY - 0.01, z + 0.012)); };
  const rear = (z, y, w, { lamp = [0.06, 0.035], plateY = 0.2 } = {}) => { for (const s of [1, -1]) add('tail', ball(1, s * (w - 0.06), y, z + 0.018, lamp[0], lamp[1], 0.03)); add('black', box(w * 1.7, 0.04, 0.03, 0, 0.105, z + 0.004)); add('white', box(0.16, 0.036, 0.01, 0, plateY, z - 0.012)); add('chrome', cyl(0.016, 0.06, w * 0.55, 0.085, z - 0.005, Math.PI / 2)); };
  const sides = (w, y, z, { mirror = true, doors = [0.03, -0.2], sill = 0.1 } = {}) => { for (const s of [1, -1]) { if (mirror) { add('paint', ball(1, s * (w + 0.03), y + 0.03, z, 0.032, 0.022, 0.018)); add('black', box(0.04, 0.008, 0.012, s * (w + 0.005), y + 0.018, z)); } for (const d of doors) { add('black', box(0.004, 0.13, 0.005, s * (w + 0.001), y - 0.075, d)); add('chrome', box(0.01, 0.008, 0.035, s * (w + 0.003), y - 0.03, d - 0.04)); } add('black', box(0.012, 0.025, 0.46, s * (w - 0.012), sill, 0)); } };
  const arches = (w, extra = 0.02) => { for (const z of R.wz) for (const s of [1, -1]) { add('under', at(new THREE.CylinderGeometry(R.wr + 0.022, R.wr + 0.022, 0.05, 22, 1, false), s * (w - 0.02), R.wr, z, 0, 0, Math.PI / 2)); add('paint', at(new THREE.TorusGeometry(R.wr + 0.025, 0.011, 6, 22, Math.PI), s * (w + extra * 0.06 - 0.005), R.wr, z, 0, Math.PI / 2, 0)); } add('under', box(w * 1.5, 0.06, 0.9, 0, 0.085, 0)); };
  if (kind === 'taksi' || kind === 'sedan' || kind === 'polis') {
    car({ body: [[0.618, 0.19, 0.2], [0.6, 0.228, 0.248], [0.54, 0.25, 0.268], [0.4, 0.272, 0.276], [0.24, 0.29, 0.279], [0, 0.302, 0.281], [-0.22, 0.308, 0.28], [-0.4, 0.306, 0.277], [-0.52, 0.298, 0.266], [-0.6, 0.272, 0.244], [-0.62, 0.22, 0.2]], cab: [0.26, 0.03, -0.24, -0.47], roofY: 0.462, belt: 0.302, gw: 0.25, rw: 0.208 });
    front(0.612, 0.205, 0.24); rear(-0.612, 0.245, 0.235); sides(0.279, 0.29, 0.2); arches(0.278);
    if (kind === 'taksi') { add('black', box(0.2, 0.012, 0.09, 0, 0.494, -0.1)); add('gold', box(0.19, 0.06, 0.075, 0, 0.528, -0.1)); for (const s of [1, -1]) for (let k = 0; k < 11; k++) for (const j of [0, 1]) if ((k + j) % 2) add('black', box(0.006, 0.02, 0.05, s * 0.2815, 0.2 + j * 0.02, -0.27 + k * 0.05)); }
    if (kind === 'polis') { for (const s of [1, -1]) { add('blue', box(0.008, 0.045, 0.72, s * 0.279, 0.215, -0.02)); } add('black', box(0.3, 0.014, 0.08, 0, 0.494, -0.1)); R.siren = [[-0.085, 0.522, -0.1], [0.085, 0.522, -0.1]]; }
  } else if (kind === 'hatch') {
    R.wz = [0.33, -0.33]; R.wr = 0.108; R.wx = 0.228;
    car({ body: [[0.535, 0.19, 0.19], [0.518, 0.23, 0.236], [0.46, 0.258, 0.258], [0.33, 0.284, 0.266], [0.2, 0.3, 0.269], [0, 0.308, 0.27], [-0.25, 0.318, 0.268], [-0.42, 0.318, 0.258], [-0.5, 0.29, 0.236], [-0.525, 0.22, 0.2]], cab: [0.25, 0.04, -0.34, -0.47], roofY: 0.478, belt: 0.308, gw: 0.244, rw: 0.206 });
    front(0.53, 0.21, 0.232, { grille: [0.2, 0.04], lamp: [0.06, 0.042] }); rear(-0.52, 0.27, 0.222, { lamp: [0.04, 0.06] }); sides(0.267, 0.295, 0.2, { doors: [-0.02] }); arches(0.266);
  } else if (kind === 'suv') {
    R.wr = 0.128; R.wz = [0.37, -0.37]; R.wx = 0.246;
    car({ body: [[0.605, 0.24, 0.22], [0.59, 0.3, 0.262], [0.52, 0.335, 0.282], [0.36, 0.352, 0.289], [0.2, 0.364, 0.291], [0, 0.37, 0.292], [-0.3, 0.378, 0.29], [-0.5, 0.376, 0.276], [-0.585, 0.33, 0.256], [-0.6, 0.25, 0.22]], cab: [0.24, 0.06, -0.4, -0.545], roofY: 0.55, belt: 0.368, gw: 0.264, rw: 0.228, sill: 0.12 });
    front(0.6, 0.265, 0.258, { grille: [0.3, 0.07], bump: 0.18, plateY: 0.17 }); rear(-0.592, 0.33, 0.25, { lamp: [0.032, 0.075], plateY: 0.26 }); sides(0.289, 0.355, 0.2, { sill: 0.14 }); arches(0.288); for (const s of [1, -1]) add('chrome', box(0.014, 0.014, 0.5, s * 0.2, 0.582, -0.17));
  } else if (kind === 'spor') {
    R.wx = 0.25; R.wr = 0.108; R.wz = [0.385, -0.37]; R.ww = 0.115; R.spokes = 7;
    car({ body: [[0.625, 0.13, 0.2, 4], [0.612, 0.158, 0.25, 4], [0.55, 0.2, 0.284, 4.4], [0.4, 0.244, 0.3, 5], [0.24, 0.252, 0.292], [0.02, 0.258, 0.288], [-0.18, 0.272, 0.295], [-0.36, 0.286, 0.306, 5], [-0.5, 0.28, 0.298], [-0.585, 0.264, 0.272], [-0.61, 0.2, 0.23]], cab: [0.27, 0.0, -0.17, -0.5], roofY: 0.396, belt: 0.258, gw: 0.244, rw: 0.188, sill: 0.055 });
    add('black', box(0.42, 0.04, 0.03, 0, 0.1, 0.612), box(0.5, 0.012, 0.07, 0, 0.065, 0.6)); for (const s of [1, -1]) { add('head', ball(1, s * 0.19, 0.172, 0.585, 0.07, 0.022, 0.04)); add('black', box(0.01, 0.05, 0.16, s * 0.292, 0.17, -0.2)); add('black', box(0.02, 0.09, 0.05, s * 0.19, 0.315, -0.55)); add('chrome', cyl(0.024, 0.07, s * 0.11, 0.1, -0.605, Math.PI / 2)); } add('paint', box(0.56, 0.016, 0.11, 0, 0.365, -0.565)); add('tail', box(0.46, 0.016, 0.02, 0, 0.228, -0.602)); add('black', box(0.44, 0.06, 0.02, 0, 0.12, -0.605)); add('white', box(0.16, 0.036, 0.01, 0, 0.165, -0.616)); sides(0.286, 0.235, 0.15, { doors: [-0.02], sill: 0.07 }); arches(0.296, 0.05); add('white', box(0.06, 0.004, 0.3, 0.075, 0.25, 0.36, 0.06), box(0.06, 0.004, 0.3, -0.075, 0.25, 0.36, 0.06));
  } else if (kind === 'klasik') {
    R.wr = 0.114; R.wx = 0.24; R.rim = 'chrome'; R.spokes = 0; R.white = true; R.wz = [0.37, -0.38];
    car({ body: [[0.62, 0.21, 0.2, 3.4], [0.606, 0.262, 0.25, 3.4], [0.52, 0.298, 0.272, 3.6], [0.36, 0.308, 0.28, 3.8], [0.2, 0.31, 0.283], [0, 0.312, 0.284], [-0.25, 0.312, 0.284], [-0.46, 0.306, 0.276, 3.8], [-0.59, 0.28, 0.25, 3.4], [-0.625, 0.21, 0.2, 3.4]], cab: [0.23, 0.06, -0.22, -0.4], roofY: 0.476, belt: 0.31, gw: 0.246, rw: 0.212, pillar: 0.03 });
    P.paint.splice(1, 1); add('white', loft([[0.09, 0.442, 0.466, 0.197, 5, 0], [0.06, 0.456, 0.494, 0.214, 4.5, 0], [-0.08, 0.462, 0.512, 0.22, 4.5, 0], [-0.22, 0.456, 0.494, 0.214, 4.5, 0], [-0.26, 0.438, 0.466, 0.196, 5, 0]]));
    for (const s of [1, -1]) { add('head', ball(0.05, s * 0.195, 0.246, 0.588, 1, 1, 0.6)); add('chrome', at(new THREE.TorusGeometry(0.053, 0.012, 8, 20), s * 0.195, 0.246, 0.594)); add('paint', loft([[-0.3, 0.29, 0.316, 0.012, 3, 0], [-0.46, 0.29, 0.362, 0.018, 3, 0], [-0.6, 0.28, 0.392, 0.016, 3, 0], [-0.63, 0.28, 0.372, 0.008, 3, 0]]).translate(s * 0.235, 0, 0)); add('tail', ball(0.03, s * 0.235, 0.345, -0.632, 0.7, 1.5, 0.6)); add('chrome', box(0.008, 0.016, 0.92, s * 0.284, 0.225, -0.02)); } for (const z of [0.632, -0.638]) add('chrome', at(new THREE.CapsuleGeometry(0.026, 0.46, 6, 12), 0, 0.135, z, 0, 0, Math.PI / 2)); add('chrome', loft([[0.625, 0.17, 0.228, 0.12, 5, 0], [0.606, 0.165, 0.235, 0.14, 5, 0]]), box(0.02, 0.03, 0.07, 0, 0.318, 0.5)); for (let k = -4; k <= 4; k++) add('black', box(0.006, 0.05, 0.02, k * 0.026, 0.2, 0.628)); add('white', box(0.16, 0.036, 0.01, 0, 0.17, -0.634)); sides(0.283, 0.3, 0.17); arches(0.282);
  } else if (kind === 'dolmus' || kind === 'minibus') {
    R.wr = 0.114; R.wz = [0.42, -0.4]; R.wx = 0.242; const w = 0.286, y = 0.62;
    add('paint', loft([[0.66, 0.1, 0.24, 0.23, 5], [0.645, 0.1, 0.31, 0.262, 6], [0.56, 0.1, 0.36, 0.28, 7], [0.5, 0.1, 0.4, w, 8, 0.02], [0, 0.1, 0.41, w, 9, 0.02], [-0.6, 0.1, 0.41, w, 9, 0.02], [-0.635, 0.1, 0.4, w * 0.97, 7, 0.02]])); add('glass', loft([[0.56, 0.36, 0.378, w * 0.93, 6, 0], [0.44, 0.37, y - 0.03, w * 0.965, 9, 0.1], [0, 0.37, y - 0.02, w * 0.975, 9, 0.1], [-0.6, 0.37, y - 0.03, w * 0.965, 9, 0.1], [-0.632, 0.38, y - 0.06, w * 0.94, 8, 0.1]]));
    add('paint', loft([[0.45, y - 0.05, y - 0.02, w * 0.84, 7, 0], [0.4, y - 0.04, y + 0.02, w * 0.9, 7, 0], [-0.1, y - 0.03, y + 0.034, w * 0.92, 7, 0], [-0.58, y - 0.04, y + 0.02, w * 0.9, 7, 0], [-0.632, y - 0.07, y - 0.02, w * 0.85, 7, 0]])); for (const s of [1, -1]) { add('paint', bar([s * w * 0.95, 0.4, 0.53], [s * w * 0.87, y - 0.02, 0.42], 0.035, 0.03)); for (const z of [0.2, -0.06, -0.33, -0.6]) add('paint', bar([s * w * 0.975, 0.4, z], [s * w * 0.9, y - 0.02, z], 0.032, 0.03)); add('chrome', box(0.006, 0.012, 1.1, s * w, 0.3, -0.04)); add('black', box(0.03, 0.06, 0.02, s * (w + 0.04), 0.43, 0.5)); add('tail', box(0.04, 0.12, 0.015, s * 0.24, 0.29, -0.638)); }
    front(0.652, 0.21, 0.25, { grille: [0.22, 0.06], lamp: [0.052, 0.05] }); add('black', box(0.5, 0.045, 0.03, 0, 0.105, -0.63)); add('white', box(0.16, 0.036, 0.01, 0, 0.2, -0.645)); add('gold', box(0.32, 0.05, 0.02, 0, y - 0.004, 0.425)); arches(w); if (kind === 'minibus') add('black', box(0.004, 0.2, 0.006, w + 0.001, 0.26, 0.07), box(0.004, 0.2, 0.006, w + 0.001, 0.26, -0.16)); else add('black', box(0.2, 0.012, 0.1, 0, y + 0.034, 0.1)), add('gold', box(0.18, 0.05, 0.07, 0, y + 0.066, 0.1));
  } else if (kind === 'otobus') {
    R.wr = 0.128; R.wz = [0.66, -0.62]; R.wx = 0.26; const w = 0.305, y = 0.74;
    add('paint', loft([[1.12, 0.1, 0.42, 0.26, 8, 0], [1.1, 0.1, 0.44, w * 0.985, 11, 0], [0, 0.1, 0.44, w, 12, 0], [-1.1, 0.1, 0.44, w * 0.985, 11, 0], [-1.125, 0.1, 0.42, 0.27, 8, 0]])); add('glass', loft([[1.125, 0.4, y - 0.06, 0.262, 9, 0.02], [1.1, 0.4, y - 0.03, w * 0.975, 11, 0.03], [0, 0.4, y - 0.03, w * 0.985, 12, 0.03], [-1.1, 0.4, y - 0.03, w * 0.975, 11, 0.03], [-1.12, 0.42, y - 0.08, 0.27, 9, 0.02]])); add('white', loft([[1.11, y - 0.06, y, 0.262, 8, 0], [1.07, y - 0.05, y + 0.02, w * 0.94, 9, 0], [-1.07, y - 0.05, y + 0.02, w * 0.94, 9, 0], [-1.115, y - 0.08, y, 0.262, 8, 0]]));
    for (const s of [1, -1]) { for (let z = -0.92; z < 1; z += 0.32) add('black', box(0.012, 0.3, 0.02, s * w * 0.985, 0.56, z)); add('white', box(0.006, 0.03, 2.1, s * w * 1.002, 0.4, 0)); add('tail', box(0.04, 0.16, 0.015, s * 0.24, 0.3, -1.128)); add('head', ball(1, s * 0.2, 0.2, 1.105, 0.055, 0.04, 0.03)); add('black', box(0.03, 0.1, 0.04, s * 0.34, 0.62, 1.09)); } add('black', box(0.26, 0.32, 0.008, 0, 0.26, 1.126)); add('gold', box(0.36, 0.06, 0.012, 0, y - 0.075, 1.122)); add('white', box(0.18, 0.04, 0.01, 0, 0.14, 1.13), box(0.18, 0.04, 0.01, 0, 0.16, -1.134), box(0.4, 0.09, 0.6, 0, y + 0.04, -0.3)); add('under', box(0.5, 0.06, 1.9, 0, 0.09, 0)); for (const z of R.wz) for (const s of [1, -1]) add('under', at(new THREE.CylinderGeometry(R.wr + 0.03, R.wr + 0.03, 0.05, 22), s * (w - 0.018), R.wr, z, 0, 0, Math.PI / 2));
  } else if (kind === 'kamyonet') {
    R.wr = 0.118; R.wz = [0.44, -0.4]; R.wx = 0.236; add('paint', loft([[0.68, 0.11, 0.24, 0.22, 5], [0.665, 0.11, 0.3, 0.262, 6], [0.56, 0.11, 0.37, 0.278, 7], [0.46, 0.11, 0.4, 0.282, 8], [0.18, 0.11, 0.4, 0.282, 8]])); add('glass', loft([[0.57, 0.36, 0.38, 0.262, 6, 0], [0.44, 0.37, 0.56, 0.268, 9, 0.12], [0.2, 0.37, 0.57, 0.27, 9, 0.1]])); add('paint', loft([[0.45, 0.53, 0.56, 0.225, 7, 0], [0.4, 0.54, 0.592, 0.24, 7, 0], [0.18, 0.54, 0.592, 0.24, 7, 0]])); for (const s of [1, -1]) { add('paint', bar([s * 0.268, 0.4, 0.54], [s * 0.232, 0.55, 0.43], 0.034, 0.03), bar([s * 0.275, 0.4, 0.22], [s * 0.24, 0.56, 0.22], 0.05, 0.03)); add('tail', box(0.045, 0.07, 0.015, s * 0.22, 0.2, -0.676)); } add('cargo', box(0.6, 0.5, 0.82, 0, 0.44, -0.26)); add('black', box(0.5, 0.05, 1.1, 0, 0.13, -0.1), box(0.56, 0.05, 0.03, 0, 0.12, -0.67)); add('white', box(0.16, 0.036, 0.01, 0, 0.16, -0.69)); for (const x of [-0.005]) add('black', box(0.006, 0.46, 0.006, x, 0.44, -0.673)); front(0.672, 0.2, 0.245, { grille: [0.24, 0.07], lamp: [0.05, 0.045] }); arches(0.276);
  } else { // the simit cart
    R.wr = 0.155; R.wz = [0.36, -0.34]; R.wx = 0.255; R.spokes = 12; R.ww = 0.05; R.rim = 'wood';
    add('paint', loft([[0.52, 0.2, 0.33, 0.2, 6, 0], [0.48, 0.18, 0.36, 0.236, 8, 0], [-0.46, 0.18, 0.36, 0.236, 8, 0], [-0.5, 0.2, 0.33, 0.2, 6, 0]])); add('clear', box(0.46, 0.26, 0.56, 0, 0.5, -0.14)); add('chrome', ...[[-0.23, -0.42], [0.23, -0.42], [-0.23, 0.14], [0.23, 0.14]].map(([x, z]) => box(0.014, 0.4, 0.014, x, 0.55, z)));
    for (let k = 0; k < 15; k++) add('simit', at(new THREE.TorusGeometry(0.066, 0.024, 8, 16), -0.15 + (k % 3) * 0.15, 0.4 + Math.floor(k / 6) * 0.07, -0.34 + (k % 5) * 0.1, Math.PI / 2 - 0.1)); for (let k = 0; k < 8; k++) add(k % 2 ? 'white' : 'stripe', box(0.6 / 8, 0.014, 0.72, -0.2625 + k * 0.075, 0.775, -0.14), box(0.6 / 8, 0.075, 0.01, -0.2625 + k * 0.075, 0.74, 0.22), box(0.6 / 8, 0.075, 0.01, -0.2625 + k * 0.075, 0.74, -0.5)); add('simit', at(new THREE.TorusGeometry(0.1, 0.036, 10, 22), 0, 0.89, -0.14)); add('wood', box(0.42, 0.02, 0.2, 0, 0.375, 0.3), bar([0, 0.34, 0.46], [0, 0.52, 0.4], 0.02, 0.02)); add('black', box(0.34, 0.06, 0.16, 0, 0.41, 0.3), box(0.34, 0.16, 0.04, 0, 0.5, 0.2), bar([-0.14, 0.52, 0.4], [0.14, 0.52, 0.4], 0.018, 0.018)); for (const s of [1, -1]) { add('head', ball(0.04, s * 0.15, 0.29, 0.515, 1, 1, 0.5)); add('tail', box(0.06, 0.035, 0.015, s * 0.15, 0.3, -0.505)); } add('chrome', box(0.44, 0.012, 1.0, 0, 0.365, 0)); add('white', box(0.16, 0.036, 0.01, 0, 0.23, -0.51)); add('under', box(0.4, 0.05, 0.8, 0, 0.16, 0));
  }
  return R;
}
const made = new Map();
function kindOf(kind) {
  if (made.has(kind)) return made.get(kind);
  const R = parts(kind), geo = {}; for (const m in R.P) geo[m] = merge(R.P[m]);
  // a wheel: tyre, rim, spokes, hub – turning about x
  const r = R.wr, w = R.ww, tyre = at(new THREE.TorusGeometry(r - 0.026, 0.028, 10, 26), 0, 0, 0, 0, Math.PI / 2, 0, 1, 1, 1), W = { tyre: merge([at(tyre, 0, 0, 0, 0, 0, 0, w / 0.056, 1, 1), cyl(r - 0.004, w * 0.8, 0, 0, 0, 0, Math.PI / 2, 26), ...(R.white ? [] : [])]) }, face = [];
  for (const s of [1, -1]) { if (R.spokes) { for (let k = 0; k < R.spokes; k++) { const a = (k / R.spokes) * Math.PI * 2; face.push(at(new THREE.BoxGeometry(0.014, r * 0.66, R.spokes > 8 ? 0.012 : 0.04), s * w * 0.46, Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36, a)); } } else face.push(ball(1, s * w * 0.42, 0, 0, 0.02, r * 0.56, r * 0.56)); face.push(at(new THREE.TorusGeometry(r * 0.7, 0.012, 8, 24), s * w * 0.47, 0, 0, 0, Math.PI / 2)); face.push(cyl(r * 0.17, 0.02, s * w * 0.48, 0, 0, 0, Math.PI / 2, 12)); }
  W.rim = merge(face); if (R.white) W.white = merge([1, -1].map((s) => at(new THREE.TorusGeometry(r * 0.8, 0.014, 6, 24), s * w * 0.46, 0, 0, 0, Math.PI / 2)));
  W.dark = merge([1, -1].map((s) => at(new THREE.CircleGeometry(r * 0.68, 22), s * w * 0.415, 0, 0, 0, s * Math.PI / 2)));
  const o = { R, geo, W }; made.set(kind, o); return o;
}
const PLATE = new Map();
function plate(text) { if (PLATE.has(text)) return PLATE.get(text); const c = document.createElement('canvas'); c.width = 128; c.height = 30; const g = c.getContext('2d'); g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, 128, 30); g.fillStyle = '#1747a6'; g.fillRect(0, 0, 14, 30); g.fillStyle = '#111'; g.font = '700 22px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 71, 16, 108); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; PLATE.set(text, t); return t; }
const LOD = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), lods = new Map();
function lodGeo(kind, geo, W, R) {
  if (lods.has(kind)) return lods.get(kind); const pos = [], nor = [], col = [], put = (g, m, M) => { if (!g || !m) return; const q = g.index ? g.toNonIndexed() : g, p = q.attributes.position, n = q.attributes.normal, v = new THREE.Vector3(), c = m.color; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (M) v.applyMatrix4(M); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i); nor.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); } };
  for (const m in geo) if (m !== 'paint' && m !== 'tail' && m !== 'clear') put(geo[m], MAT[m], null); for (const z of R.wz) for (const s of [-1, 1]) { const M = new THREE.Matrix4().makeTranslation(s * R.wx, R.wr, z); put(W.tyre, MAT.tyre, M); put(W.rim, MAT[R.rim], M); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); lods.set(kind, pack(g)); return g;
}
export function lodCar(g, far) { const u = g.userData; if (!u.lod || u.far === far) return; u.far = far; u.lod.visible = far; for (const o of u.detail) o.visible = !far; }
// the dark under a car, darkest where its wheels touch the road
const contacts = new Map(), contactSize = new Map();
function contactTex(kind, R, geo) {
  if (contacts.has(kind)) return contacts.get(kind); const b = new THREE.Box3(); for (const m in geo) { geo[m].computeBoundingBox(); if (m !== 'stripe') b.union(geo[m].boundingBox); } const L = b.max.z - b.min.z, w = Math.max(0.5, R.wx * 2 + R.ww), SX = w + 0.5, SZ = L + 0.5, c = document.createElement('canvas'), K = 128 / SZ; c.height = 128; c.width = Math.ceil(SX * K); const g = c.getContext('2d'), X = (x) => (x + SX / 2) * K, Z = (z) => (z + SZ / 2) * K; contactSize.set(kind, [SX, SZ]);
  g.filter = 'blur(7px)'; g.fillStyle = `rgba(0,0,0,${kind === 'simit' ? 0.42 : 0.72})`; g.fillRect(X(-w / 2 + 0.04), Z(-L / 2 + 0.04), (w - 0.08) * K, (L - 0.08) * K); g.filter = 'blur(2.5px)'; g.fillStyle = 'rgba(0,0,0,.95)'; for (const z of R.wz) for (const q of [1, -1]) { g.beginPath(); g.ellipse(X(q * R.wx), Z(-z), (R.ww * 0.5 + 0.025) * K, R.wr * 0.62 * K, 0, 0, 7); g.fill(); } g.filter = 'none';
  const t = new THREE.CanvasTexture(c); contacts.set(kind, t); return t;
}
export function makeCarModel(kind, color) {
  const { R, geo, W } = kindOf(kind), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = Ph({ color: kind === 'polis' ? '#f4f6f8' : color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0.06, envMapIntensity: 1.15 }), tail = S({ color: '#7a1210', emissive: '#ff2a1a', emissiveIntensity: 0.5, roughness: 0.25 });
  for (const m in geo) { const o = new THREE.Mesh(geo[m], m === 'paint' ? paint : m === 'tail' ? tail : MAT[m]); o.castShadow = m !== 'clear' && m !== 'amber'; o.receiveShadow = true; body.add(o); }
  if (kind === 'polis') { const c = Ph({ color, roughness: 0.3, clearcoat: 1 }); const o = new THREE.Mesh(new THREE.BoxGeometry(0.566, 0.02, 0.9), c); o.position.set(0, 0.17, 0); body.add(o); g.userData.siren = R.siren.map((p, i) => { const m = S({ color: i ? '#2a6bff' : '#ff2a2a', emissive: i ? '#2a6bff' : '#ff2a2a', emissiveIntensity: 1 }), s = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.075), m); s.position.set(...p); body.add(s); return m; }); }
  const pm = new THREE.MeshStandardMaterial({ map: plate({ taksi: '34 TAX 34', dolmus: '34 DLM 12', minibus: '34 MIN 87', otobus: '34 HO 500', polis: '34 ZBT 01', simit: '34 SMT 05', spor: '34 GT 1453', klasik: '34 İST 56' }[kind] || '34 NP 2026'), roughness: 0.5 }), white = geo.white && geo.white.boundingBox; void white;
  const zf = { taksi: 0.63, sedan: 0.63, polis: 0.63, hatch: 0.548, suv: 0.618, spor: 0, klasik: 0, dolmus: 0.67, minibus: 0.67, otobus: 1.136, kamyonet: 0.69 }[kind], zb = { taksi: -0.63, sedan: -0.63, polis: -0.63, hatch: -0.538, suv: -0.61, spor: -0.6225, klasik: -0.6405, dolmus: -0.6515, minibus: -0.6515, otobus: -1.1405, kamyonet: -0.6965, simit: -0.5165 }[kind], yf = { suv: 0.16, otobus: 0.14 }[kind] || 0.13, yb = { suv: 0.26, spor: 0.165, klasik: 0.17, otobus: 0.16, kamyonet: 0.16, simit: 0.23 }[kind] || 0.2;
  for (const [z, y, ry] of [[zf, yf, 0], [zb, yb, Math.PI]]) { if (!z) continue; const o = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.034), pm); o.position.set(0, y, z); o.rotation.y = ry; body.add(o); }
  const wheels = [];
  for (const z of R.wz) for (const s of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(s * R.wx, R.wr, z); g.add(piv); const w = new THREE.Group(); piv.add(w); for (const [k, m] of [['tyre', MAT.tyre], ['dark', MAT.under], ['rim', MAT[R.rim]], ['white', MAT.white]]) if (W[k]) { const o = new THREE.Mesh(W[k], m); o.castShadow = k === 'tyre'; w.add(o); } wheels.push({ piv, w, front: z > 0 }); }
  // from afar: all but the paint and the tail lamps in one piece
  const lod = new THREE.Mesh(lodGeo(kind, geo, W, R), LOD); lod.castShadow = true; lod.visible = false; body.add(lod); const detail = [...body.children.filter((o) => o !== lod && o.material !== paint && o.material !== tail), ...wheels.map((w) => w.piv)];
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: contactTex(kind, R, geo), color: '#000000', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4 })); contact.scale.set(contactSize.get(kind)[0], 1, contactSize.get(kind)[1]); contact.position.y = 0.008; contact.renderOrder = 1; g.add(contact);
  g.userData = { ...g.userData, body, detail, lod, far: false, contact, wheels, tail, paint, wr: R.wr, spin: 0, roll: 0, pitch: 0, bob: 0 };
  return g;
}
const PAINT = ['#e6e4de', '#e6e4de', '#1c1e22', '#8f969b', '#8f969b', '#5b6167', '#a3221d', '#1f3f73', '#3c4a3e', '#b89a6a', '#d9dde0'];
let nth = 0;
export function makeTrafficModel(kind) {
  nth++; if (kind === 'taksi') return makeCarModel('taksi', '#f2b705'); if (kind === 'dolmus') return makeCarModel('dolmus', '#e9b50c'); if (kind === 'minibus') return makeCarModel('minibus', '#2f7fc2'); if (kind === 'otobus') return makeCarModel('otobus', ['#c8322c', '#f0b51c', '#2a6db0'][nth % 3]); if (kind === 'kamyonet') return makeCarModel('kamyonet', ['#e6e4de', '#2f5f9a', '#b3402c'][nth % 3]); return makeCarModel(kind, PAINT[(nth * 7) % PAINT.length]);
}
// wheels, body roll, lights – from how the car moves
export function animateCar(g, c, dt, night) {
  const u = g.userData; if (!u.tail) return;
  const v = c.vx * Math.sin(c.yaw) + c.vz * Math.cos(c.yaw); u.spin += (v / u.wr) * dt;
  for (const w of u.wheels) { w.w.rotation.x = u.spin; if (w.front) w.piv.rotation.y = -(c.steer || 0) * 0.42; }
  const acc = (v - (u.v || 0)) / Math.max(dt, 1e-3); u.v = v;
  u.roll += (Math.max(-0.1, Math.min(0.1, (c.steer || 0) * Math.abs(v) * 0.007 + (c.slip || 0) * 0.08)) - u.roll) * Math.min(1, dt * 8);
  u.pitch += (Math.max(-0.045, Math.min(0.045, -acc * 0.0022)) - u.pitch) * Math.min(1, dt * 7);
  u.body.rotation.z = u.roll; u.body.rotation.x = u.pitch; u.body.position.y = Math.abs(Math.sin(u.spin * 0.25)) * 0.004 * Math.min(1, Math.abs(v) / 8);
  if (u.lit !== night) { u.lit = night; u.paint.emissive.copy(u.paint.color); u.paint.emissiveIntensity = night * 0.16; }
  u.tail.emissiveIntensity = c.braking ? 5 : 0.4 + night * 1.6;
  if (u.siren) { const t = Math.floor(performance.now() / 160) % 2, on = c.boosting || c.horn; u.siren[0].emissiveIntensity = on ? (t ? 8 : 0.3) : 0.6; u.siren[1].emissiveIntensity = on ? (t ? 0.3 : 8) : 0.6; }
}
void both;
