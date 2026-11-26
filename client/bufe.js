// The street büfes (tools/bufe.mjs): İstanbul's little kiosk on the pavement – its counter window to the street, lit, with what
// it sells behind it, an awning over it, its name board on the roof; the drinks' fridge at its side, the ice cream chest, the
// newspapers' rack, packs of water stacked before it, a stool. Four liveries.
import * as THREE from './vendor/three.module.min.js';
import { kit, kitMaterial, box, cyl } from './squares.js';

const LIVERY = [['#f2efe6', '#1f5fae'], ['#c8242a', '#f2b705'], ['#2f6b4a', '#f2efe6'], ['#1c2f52', '#e0b21b']], SAYS = ['BÜFE', 'GAZETE · BÜFE', 'TOST · AYRAN · BÜFE', 'BÜFE · İÇECEK'];
// one büfe, its front (+z) to the street: 1.2 times as tall as who walks by
function model(v) {
  const [wall, acc] = LIVERY[v], L = [[box(0.62, 0.6, 0.5, 0, 0.3, 0), wall], [box(0.64, 0.05, 0.52, 0, 0.025, 0), '#55585c'], [box(0.66, 0.05, 0.56, 0, 0.625, 0), acc], [box(0.62, 0.04, 0.02, 0, 0.12, 0.255), acc]];
  // the window, lit from within, and what stands behind it on the shelves
  L.push([box(0.52, 0.28, 0.012, 0, 0.42, 0.252), '#fff1cf', 0.9]); const goods = ['#e0402e', '#f2b705', '#2f8f5b', '#1c3f94', '#d6d2c8', '#7a3b34']; for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) L.push([box(0.04, 0.06, 0.012, -0.22 + k * 0.055, 0.34 + r * 0.12, 0.26), goods[(k + r * 4) % goods.length]]);
  L.push([box(0.56, 0.025, 0.1, 0, 0.27, 0.3), '#d8d4ca']); for (const x of [-0.27, 0.27]) L.push([box(0.03, 0.3, 0.03, x, 0.42, 0.255), acc]);
  // the awning, slanting out over the counter, in stripes
  for (let k = 0; k < 7; k++) { const g = box(0.1, 0.012, 0.24, -0.3 + k * 0.1, 0, 0).rotateX(0.32).translate(0, 0.6, 0.36); L.push([g, k % 2 ? '#f4f2ec' : acc]); }
  // the name board on the roof
  L.push([box(0.6, 0.11, 0.03, 0, 0.71, 0.21), '#1b1d21']);
  // beside it: the drinks' fridge (its glass door lit), the ice cream chest, before it the papers and the water, a stool
  L.push([box(0.2, 0.44, 0.18, 0.43, 0.22, 0.08), '#c8242a'], [box(0.16, 0.34, 0.012, 0.43, 0.24, 0.172), '#dceef4', 0.55]); for (let r = 0; r < 3; r++) L.push([box(0.14, 0.012, 0.01, 0.43, 0.13 + r * 0.1, 0.175), '#8a8f96']);
  L.push([box(0.22, 0.2, 0.16, -0.44, 0.1, 0.1), '#f4f2ec'], [box(0.22, 0.03, 0.16, -0.44, 0.215, 0.1), '#2f7fc2']);
  L.push([box(0.2, 0.2, 0.04, -0.18, 0.12, 0.33).rotateX(-0.2), '#3a3d42']); for (let k = 0; k < 3; k++) L.push([box(0.06, 0.08, 0.008, -0.25 + k * 0.07, 0.15, 0.352).rotateX(-0.2), k === 1 ? '#c8242a' : '#ecebe6']);
  for (const [x, y] of [[0.16, 0.04], [0.26, 0.04], [0.21, 0.12]]) L.push([box(0.1, 0.08, 0.1, x, y, 0.36), '#9fd3ef']);
  L.push([cyl(0.04, 0.04, 0.16, 0.05, 0, 0.5, 10), '#3a3d42'], [cyl(0.05, 0.05, 0.02, 0.05, 0.16, 0.5, 12), acc]);
  return kit(L);
}
function signs() { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64 * 4; const g = cv.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle'; SAYS.forEach((t, k) => { g.fillStyle = '#1b1d21'; g.fillRect(0, k * 64, 512, 64); g.fillStyle = k === 1 ? '#f2b705' : '#ffffff'; g.font = '800 42px "Arial Narrow", Arial, sans-serif'; g.fillText(t, 256, k * 64 + 34, 490); }); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; }
export function buildBufe(W) {
  const D = W.A.bufe; if (!D || !D.list.length) return; const mat = kitMaterial(W), tx = signs(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  for (let v = 0; v < 4; v++) { const list = D.list.filter((b) => b[4] === v); if (!list.length) continue;
    const m = new THREE.InstancedMesh(model(v), mat, list.length), sg = new THREE.PlaneGeometry(0.56, 0.08), uv = sg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, (3 - v + uv.getY(i)) / 4); const sm = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6, emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 0.1 }); W.glow.push([sm, 0.7]); const s = new THREE.InstancedMesh(sg, sm, list.length);
    list.forEach(([x, z, y, yaw], i) => { Q.setFromAxisAngle(UP, yaw); M.compose(P.set(x, y, z), Q, S); m.setMatrixAt(i, M); M.compose(P.set(x + Math.sin(yaw) * 0.228, y + 0.71, z + Math.cos(yaw) * 0.228), Q, S); s.setMatrixAt(i, M); (W.posts ||= []).push([x, y, z, 0.46, 0.8]); });
    m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); s.computeBoundingSphere(); W.root.add(m, s); }
}
