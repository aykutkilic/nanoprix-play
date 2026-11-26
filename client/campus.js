// The universities' grounds (tools/campus.mjs): a fence along each – a low stone base, iron railings on it – and at each road in a
// gate of two stone piers; over the widest, an arch with the university's name and its campus.
import * as THREE from './vendor/three.module.min.js';
import { kitMaterial } from './squares.js';

export function buildCampus(W) {
  const D = W.A.campus; if (!D || !D.list.length) return; const segs = [], posts = [], piers = [], beams = [];
  for (const c of D.list) { for (const run of c.runs) for (let i = 0; i + 1 < run.length; i++) { const [ax, ay, az] = run[i], [bx, by, bz] = run[i + 1]; segs.push([(ax + bx) / 2, Math.min(ay, by), (az + bz) / 2, Math.atan2(bx - ax, bz - az), Math.hypot(bx - ax, bz - az) + 0.02]); if (i % 2 === 0) posts.push([ax, ay, az]); }
    for (const gt of c.gates) { for (const p of [gt.a, gt.b]) piers.push(p); if (gt.main) beams.push({ c, gt }); } }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), stone = kitMaterial(W, { roughness: 0.9 }), iron = new THREE.MeshStandardMaterial({ color: '#23272b', roughness: 0.5, metalness: 0.5 });
  const inst = (geo, mat, list, put) => { if (!list.length) return; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((e, k) => { put(e); m.setMatrixAt(k, M); }); m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); W.root.add(m); };
  const col = (g, c) => { const a = []; const k = new THREE.Color(c); for (let i = 0; i < g.attributes.position.count; i++) a.push(k.r, k.g, k.b); g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); const gl = new Float32Array(g.attributes.position.count); g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1)); return g; };
  inst(col(new THREE.BoxGeometry(0.14, 0.2, 1).translate(0, 0.1, 0), '#c9bfae'), stone, segs, ([x, y, z, a, l]) => M.compose(P.set(x, y - 0.05, z), Q.setFromAxisAngle(UP, a), S.set(1, 1, l)));
  inst(new THREE.BoxGeometry(0.03, 0.03, 1).translate(0, 0.62, 0), iron, segs, ([x, y, z, a, l]) => M.compose(P.set(x, y, z), Q.setFromAxisAngle(UP, a), S.set(1, 1, l)));
  inst(new THREE.BoxGeometry(0.02, 0.02, 1).translate(0, 0.34, 0), iron, segs, ([x, y, z, a, l]) => M.compose(P.set(x, y, z), Q.setFromAxisAngle(UP, a), S.set(1, 1, l)));
  inst(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5).translate(0, 0.4, 0), iron, segs.flatMap(([x, y, z, a, l]) => { const o = []; for (let t = -0.4; t <= 0.4; t += 0.2) o.push([x + Math.sin(a) * l * t, y, z + Math.cos(a) * l * t]); return o; }), ([x, y, z]) => M.compose(P.set(x, y, z), Q.identity(), S.set(1, 1, 1)));
  inst(col(new THREE.BoxGeometry(0.1, 0.72, 0.1).translate(0, 0.36, 0), '#b9ae9a'), stone, posts, ([x, y, z]) => M.compose(P.set(x, y - 0.05, z), Q.identity(), S.set(1, 1, 1)));
  inst(col(new THREE.BoxGeometry(0.32, 1.2, 0.32).translate(0, 0.6, 0), '#d8cfbd'), stone, piers, ([x, y, z]) => M.compose(P.set(x, y - 0.05, z), Q.identity(), S.set(1, 1, 1)));
  // the arch over the main gate, with the name on both faces
  for (const { c, gt } of beams) { const [ax, ay, az] = gt.a, [bx, by, bz] = gt.b, l = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az), y = Math.max(ay, by) + 1.15; const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, l + 0.3), new THREE.MeshStandardMaterial({ color: '#d8cfbd', roughness: 0.85 })); beam.position.set((ax + bx) / 2, y + 0.16, (az + bz) / 2); beam.rotation.y = yaw; beam.castShadow = true; W.root.add(beam);
    const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 160; const g = cv.getContext('2d'); g.fillStyle = c.color; g.fillRect(0, 0, 2048, 160); g.fillStyle = '#fff'; g.font = '800 84px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(c.name, 1024, 84, 1990); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.05 }); W.glow.push([m, 0.6]);
    for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(l + 0.2, (l + 0.2) * 0.078), m); p.position.set((ax + bx) / 2 + Math.cos(yaw) * 0.12 * s, y + 0.16, (az + bz) / 2 - Math.sin(yaw) * 0.12 * s); p.rotation.y = yaw + (s > 0 ? Math.PI / 2 : -Math.PI / 2); W.root.add(p); } }
  for (const [x, y, z] of piers) (W.posts ||= []).push([x, y, z, 0.2, 1.2]);
}
