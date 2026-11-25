// The driver's hands: a rigged hand (Godot XR Tools' by Miodrag Sejic, CC0 – vendor/hand/; as in boardgames and cwords),
// closed round whatever it holds once and for all, so that it is drawn as a plain mesh, coloured by corner.
// A hand's own space: the wrist at the origin, +z along the fingers, +y its back, the thumb at +x (right) or −x (left);
// in metres, of somebody 1.75 m tall.
import * as THREE from './vendor/three.module.min.js';
import { sharedInteriorResources } from './trim.js';
const WRIST_Z = 0.0272, LIFE = 0.875;
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'].map((f) => ['Proximal', 'Intermediate', 'Distal'].map((b) => `${f}_${b}_R`)), THUMB = ['Thumb_Metacarpal_R', 'Thumb_Proximal_R', 'Thumb_Distal_R'];
// joints bent (rad), index to little; the thumb's about their x and z; at: what is held, so far along the fingers and below the palm
const POSES = {
  wheel: { at: [0.086, 0.0265], f: [[0.6, 1.02, 0.72], [0.64, 1.08, 0.74], [0.68, 1.1, 0.76], [0.74, 1.08, 0.76]], s: [0.03, 0, -0.02, -0.04], t: [[-0.5, -0.34], [-0.3, 0.3], [0, 0.3]] },
  bar: { at: [0.088, 0.023], f: [[0.7, 1.1, 0.66], [0.73, 1.14, 0.68], [0.76, 1.14, 0.7], [0.8, 1.12, 0.7]], s: [0.02, 0, -0.02, -0.03], t: [[-0.5, -0.3], [-0.42, 0.4], [0, 0.5]] },
  loose: { at: [0.09, 0.03], f: [[0.3, 0.4, 0.25], [0.36, 0.46, 0.28], [0.42, 0.52, 0.3], [0.48, 0.55, 0.32]], s: [0.02, 0, -0.02, -0.05], t: [[-0.25, -0.35], [0, 0.2], [0, 0.2]] },
};
let model = null, asked = null; const made = new Map();
function read(g) {
  const bin = Uint8Array.from(atob(g.buffers[0].uri.split(',')[1]), (c) => c.charCodeAt(0)), SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, T = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const get = (i) => { const a = g.accessors[i], v = g.bufferViews[a.bufferView], C = T[a.componentType], n = a.count * SIZE[a.type], from = (v.byteOffset || 0) + (a.byteOffset || 0); return new C(bin.buffer.slice(bin.byteOffset + from, bin.byteOffset + from + n * C.BYTES_PER_ELEMENT)); };
  const pr = g.meshes[0].primitives[0], at = pr.attributes, ibm = get(g.skins[0].inverseBindMatrices), joints = g.skins[0].joints;
  return { nodes: g.nodes, joints, inv: joints.map((_, i) => new THREE.Matrix4().fromArray(ibm, i * 16)), pos: get(at.POSITION), nor: get(at.NORMAL), ji: get(at.JOINTS_0), jw: get(at.WEIGHTS_0), idx: get(pr.indices) };
}
export const hands = () => (asked ||= fetch(new URL('./vendor/hand/Hand_Nails_R.gltf', import.meta.url)).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then((g) => { model = read(g); return true; }).catch((e) => { console.warn('hands:', e.message || e); asked = null; return false; }));
// the skin as it lies in a pose
function bake(pose, side, skin) {
  const key = `${pose}${side}${skin}`; if (made.has(key)) return made.get(key); const M = model, P = POSES[pose], bones = M.nodes.map((n) => { const o = new THREE.Object3D(); o.name = n.name || ''; if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); return o; }), by = {}; bones.forEach((o) => { by[o.name] = o; });
  M.nodes.forEach((n, i) => { if (M.joints.includes(i)) for (const c of n.children || []) if (M.joints.includes(c)) bones[i].add(bones[c]); });
  const E = new THREE.Euler(), Q = new THREE.Quaternion(), turn = (n, x, z) => by[n].quaternion.multiply(Q.setFromEuler(E.set(x, 0, z))); FINGERS.forEach((f, i) => f.forEach((n, j) => turn(n, j ? 0 : P.s[i], P.f[i][j]))); THUMB.forEach((n, j) => turn(n, P.t[j][0], P.t[j][1]));
  by.Wrist_R.updateMatrixWorld(true); const s = LIFE, own = new THREE.Matrix4().set(0, side * s, 0, 0, s, 0, 0, 0, 0, 0, -s, WRIST_Z * s, 0, 0, 0, 1), mats = M.joints.map((j, i) => own.clone().multiply(bones[j].matrixWorld).multiply(M.inv[i]));
  let zmax = -1e9; for (let i = 2; i < M.pos.length; i += 3) zmax = Math.max(zmax, M.pos[i]);
  const N = M.pos.length / 3, pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), col = new Float32Array(N * 3), v = new THREE.Vector3(), w = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), base = new THREE.Color(skin), red = base.clone().lerp(new THREE.Color('#b5523c'), 0.3), pale = base.clone().lerp(new THREE.Color('#ffe2cf'), 0.55), c = new THREE.Color(), tips = M.joints.map((j) => /Distal/.test(bones[j].name)), knuck = M.joints.map((j) => /Proximal|Intermediate/.test(bones[j].name));
  for (let i = 0; i < N; i++) {
    v.fromArray(M.pos, i * 3); w.fromArray(M.nor, i * 3); { const k = Math.min(1, (v.z - (zmax - 0.008)) / 0.008), r = Math.hypot(w.x, w.y); if (k > 0 && r > 1e-3) w.set(w.x + (w.x / r - w.x) * k, w.y + (w.y / r - w.y) * k, w.z * (1 - k)).normalize(); } // (the last ring at the wrist is turned outward, not back)
    const back = w.x; let tip = 0, mix = 0; a.set(0, 0, 0); b.set(0, 0, 0); for (let k = 0; k < 4; k++) { const q = M.jw[i * 4 + k]; if (!q) continue; const j = M.ji[i * 4 + k], m = mats[j]; a.addScaledVector(v.clone().applyMatrix4(m), q); b.addScaledVector(w.clone().transformDirection(m), q); if (tips[j]) tip += q; if (knuck[j]) mix = Math.max(mix, 1 - Math.abs(q - 0.5) * 2); }
    b.normalize(); a.toArray(pos, i * 3); b.toArray(nor, i * 3); c.copy(base); if (back < -0.3) c.lerp(pale, 0.25); c.lerp(red, Math.max(mix * 0.55, tip * 0.45)); c.toArray(col, i * 3);
  }
  const idx = side < 0 ? M.idx.slice() : M.idx; if (side < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k]; idx[k] = idx[k + 1]; idx[k + 1] = t; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); sharedInteriorResources.add(g); made.set(key, g); return g;
}
// side 1 right, −1 left; k: units to the metre; at: a point of what is held; fwd: along the fingers, back: where the back of the hand
// looks (about square). The wrist is in userData.wrist. (Once hands() has come.)
export function makeHand(mat, side, k, at, fwd, back, pose = 'wheel', skin = '#d8a37c') {
  const z = fwd.clone().normalize(), x = new THREE.Vector3().crossVectors(back, z).normalize(), y = new THREE.Vector3().crossVectors(z, x), p = at.clone().addScaledVector(z, -POSES[pose].at[0] * k).addScaledVector(y, POSES[pose].at[1] * k), o = new THREE.Mesh(bake(pose, side, skin), mat);
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); o.position.copy(p); o.scale.setScalar(k); o.frustumCulled = false; o.castShadow = o.receiveShadow = true; o.userData.wrist = p.clone().addScaledVector(z, 0.002 * k); o.userData.fwd = z; return o;
}
// a forearm in its sleeve: a unit long along +y, the cuff at the top; reach() lays it from the elbow to the wrist
export function makeSleeve(mat, k, color) {
  const prof = [[0.052, 0], [0.047, 0.25], [0.043, 0.5], [0.0395, 0.72], [0.037, 0.84], [0.0395, 0.865], [0.038, 0.9], [0.0395, 0.93], [0.039, 0.985], [0.036, 1], [0.03, 0.992], [0.028, 0.95]].map(([r, y]) => new THREE.Vector2(r * k, y)), g = new THREE.LatheGeometry(prof, 22), c = new THREE.Color(color), cuff = c.clone().multiplyScalar(0.8), n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) (g.attributes.position.getY(i) > 0.85 ? cuff : c).toArray(col, i * 3); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const o = new THREE.Mesh(g, mat); o.frustumCulled = false; o.castShadow = o.receiveShadow = true; return o;
}
const D = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
export function reach(o, elbow, wrist) { D.subVectors(wrist, elbow); const l = D.length(); o.position.copy(elbow); o.quaternion.setFromUnitVectors(UP, D.divideScalar(l)); o.scale.set(1, l, 1); }
