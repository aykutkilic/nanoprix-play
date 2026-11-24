// Keeping to what a graphics card can hold: geometry in small numbers, what is far
// off let go (its arrays stay; it is sent again when one comes back), and a lost
// context taken up again cleanly.
import * as THREE from './vendor/three.module.min.js';
// (a depth material shared by single and instanced meshes would have its program looked up anew at every change between them)
const DEPTH = [0, 1].map(() => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })); Object.defineProperty(THREE.InstancedMesh.prototype, 'customDepthMaterial', { configurable: true, get() { return this._depth || DEPTH[this.instanceColor ? 1 : 0]; }, set(m) { this._depth = m; } });
// the arrays are not needed here once they are on the card (whoever asks for this makes them again if the card forgets)
export function handOver(g) { const free = function () { this.array = null; }; for (const k in g.attributes) g.attributes[k].onUpload(free); if (g.index) g.index.onUpload(free); return g; }
// normals as bytes, colours as bytes – with whatever flag goes along in the fourth
export function pack(g, flag = null) {
  const n = g.attributes.normal, c = g.attributes.color, k = flag ? g.attributes[flag] : null;
  if (n && n.array instanceof Float32Array) { const o = new Int8Array(n.count * 4); for (let i = 0; i < n.count; i++) for (let q = 0; q < 3; q++) o[i * 4 + q] = Math.round(Math.max(-1, Math.min(1, n.array[i * 3 + q])) * 127); g.setAttribute('normal', new THREE.BufferAttribute(o, 4, true)); }
  if (c && c.array instanceof Float32Array) { const o = new Uint8Array(c.count * 4); for (let i = 0; i < c.count; i++) { for (let q = 0; q < 3; q++) o[i * 4 + q] = Math.round(Math.max(0, Math.min(1, c.array[i * 3 + q])) * 255); o[i * 4 + 3] = k ? k.array[i] : 255; } g.setAttribute('color', new THREE.BufferAttribute(o, 4, true)); if (k) g.deleteAttribute(flag); }
  return g;
}
// what stands in the world and is worth letting go of
export class Keeper {
  constructor() { this.parts = []; this.at = 0; this.k = 0; }
  // reach: beyond how many times the sight it is neither shown nor kept; sure: always shown
  add(o, reach = 1.3, r = null, max = 1e9) { const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const c = g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld.copy(o.matrix)); this.parts.push({ o, x: c.x, z: c.z, r: r ?? g.boundingSphere.radius * o.matrix.getMaxScaleOnAxis(), reach, max, off: 0, held: true }); return o; }
  // some of them each frame
  update(now, cam, far) {
    const n = this.parts.length; if (!n) return; for (let q = Math.ceil(n / 12); q-- > 0;) {
      const p = this.parts[this.k = (this.k + 1) % n], d = Math.hypot(p.x - cam.x, p.z - cam.z) - p.r, see = d < Math.min(far * p.reach, p.max); if (p.o.visible !== see && !p.hidden) p.o.visible = see;
      if (see) { p.off = 0; p.held = true; } else if (!p.off) p.off = now; else if (p.held && now - p.off > 9000) { p.o.geometry.dispose(); p.held = false; }
    }
  }
}
// after a lost context everything is made anew; what three.js listens for on the old one must go, or every later
// dispose() would also ask the new context to delete the old one's objects
export function forget(scene, more = []) {
  const seen = new Set(), off = (o) => { if (o && !seen.has(o)) { seen.add(o); if (o._listeners && o._listeners.dispose) o._listeners.dispose.length = 0; } };
  const tex = (o) => { for (const k in o) { const v = o[k]; if (v && v.isTexture) off(v); else if (v && v.value && v.value.isTexture) off(v.value); } };
  const mat = (m) => { off(m); tex(m); if (m.uniforms) tex(m.uniforms); };
  scene.traverse((o) => { off(o); off(o.geometry); for (const m of [].concat(o.material || [])) mat(m); if (o.customDepthMaterial) mat(o.customDepthMaterial); }); for (const m of more) if (m) { off(m); if (m.isMaterial) mat(m); tex(m); }
}

// three.js's computeVertexNormals, for plain indexed arrays, without the ceremony
export function normals(g) {
  const p = g.attributes.position.array, x = g.index.array, n = new Float32Array(p.length); for (let k = 0; k < x.length; k += 3) { const a = x[k] * 3, b = x[k + 1] * 3, c = x[k + 2] * 3, ux = p[c] - p[b], uy = p[c + 1] - p[b + 1], uz = p[c + 2] - p[b + 2], vx = p[a] - p[b], vy = p[a + 1] - p[b + 1], vz = p[a + 2] - p[b + 2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; n[a] += nx; n[a + 1] += ny; n[a + 2] += nz; n[b] += nx; n[b + 1] += ny; n[b + 2] += nz; n[c] += nx; n[c + 1] += ny; n[c + 2] += nz; }
  for (let k = 0; k < n.length; k += 3) { const l = Math.sqrt(n[k] * n[k] + n[k + 1] * n[k + 1] + n[k + 2] * n[k + 2]) || 1; n[k] /= l; n[k + 1] /= l; n[k + 2] /= l; } g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); return g;
}
// many small pieces into one: same attributes, one index
export function merge(list) {
  const first = list[0], out = new THREE.BufferGeometry(); let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  for (const k of Object.keys(first.attributes)) { const a = first.attributes[k], arr = new a.array.constructor(nv * a.itemSize); let o = 0; for (const g of list) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize, a.normalized)); }
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni); let o = 0, v = 0; for (const g of list) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[o + i] = a[i] + v; o += a.length; v += g.attributes.position.count; } out.setIndex(new THREE.BufferAttribute(idx, 1)); return out;
}
// pieces of the same stuff, gathered by the tile they lie in
export class Batch {
  constructor(size = 130) { this.size = size; this.m = new Map(); }
  add(g, mat, reach, cast = true) { g.computeBoundingSphere(); const c = g.boundingSphere.center, k = `${mat.uuid}|${reach}|${cast}|${Math.floor(c.x / this.size)},${Math.floor(c.z / this.size)}`; if (!this.m.has(k)) this.m.set(k, { mat, reach, cast, list: [] }); this.m.get(k).list.push(g); }
  flush(W) { for (const { mat, reach, cast, list } of this.m.values()) { const m = new THREE.Mesh(merge(list), mat); m.castShadow = cast; m.receiveShadow = true; W.still.add(m); W.keeper.add(m, reach); } this.m.clear(); }
}
// what never moves: its matrices are set once, and left out of every frame's round of updates
export class Still extends THREE.Group {
  add(...os) { for (const o of os) { super.add(o); o.traverse((q) => { q.matrixAutoUpdate = false; q.updateMatrix(); if (q.parent && q !== o) q.matrixWorld.multiplyMatrices(q.parent.matrixWorld, q.matrix); else q.matrixWorld.copy(q.matrix); }); } return this; }
  updateMatrixWorld() {}
}
