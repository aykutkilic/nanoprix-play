// Keeping to what a graphics card can hold: geometry in small numbers, what is far
// off let go (its arrays stay; it is sent again when one comes back), and a lost
// context taken up again cleanly.
import * as THREE from './vendor/three.module.min.js';
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
  add(o, reach = 1.3, r = null) { const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const c = g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld.copy(o.matrix)); this.parts.push({ o, x: c.x, z: c.z, r: r ?? g.boundingSphere.radius * o.matrix.getMaxScaleOnAxis(), reach, off: 0, held: true }); return o; }
  // some of them each frame
  update(now, cam, far) {
    const n = this.parts.length; if (!n) return; for (let q = Math.ceil(n / 12); q-- > 0;) {
      const p = this.parts[this.k = (this.k + 1) % n], d = Math.hypot(p.x - cam.x, p.z - cam.z) - p.r, see = d < far * p.reach; if (p.o.visible !== see && !p.hidden) p.o.visible = see;
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
