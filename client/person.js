// Somebody on foot: a toy figure that walks.
import * as THREE from './vendor/three.module.min.js';
export function makePerson(color = '#c8242a') {
  const g = new THREE.Group(), m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }), shirt = m(color), skin = m('#d9a77f'), dark = m('#23262c'), hair = m('#2a1a12'), add = (geo, mat, x, y, z, p = g) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  add(new THREE.CapsuleGeometry(0.075, 0.11, 4, 10), shirt, 0, 0.27, 0); add(new THREE.SphereGeometry(0.066, 12, 9), skin, 0, 0.44, 0); add(new THREE.SphereGeometry(0.069, 12, 6, 0, 6.3, 0, 1.6), hair, 0, 0.45, -0.008);
  const limb = (x, y, l, r, mat) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); add(new THREE.CapsuleGeometry(r, l, 3, 7), mat, 0, -l / 2 - r * 0.4, 0, p); return p; };
  const legs = [limb(0.037, 0.19, 0.11, 0.032, dark), limb(-0.037, 0.19, 0.11, 0.032, dark)], arms = [limb(0.1, 0.35, 0.1, 0.024, shirt), limb(-0.1, 0.35, 0.1, 0.024, shirt)]; let ph = 0;
  g.userData.step = (dt, v) => { ph += dt * Math.min(9, 3 + v * 4) * (v > 0.05 ? 1 : 0); const a = v > 0.05 ? Math.sin(ph * 1.6) * Math.min(0.8, 0.35 + v * 0.2) : 0; legs[0].rotation.x = a; legs[1].rotation.x = -a; arms[0].rotation.x = -a * 0.9; arms[1].rotation.x = a * 0.9; };
  g.userData.dispose = () => g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); return g;
}
