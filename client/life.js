// What moves in the diorama: the gulls (the ships are ships.js's).
import * as THREE from './vendor/three.module.min.js';
export function buildLife(W) {
  const { root, coast, mat, lit } = W;
  // gulls
  const gw = mat('#f7f5f0', { roughness: 0.75 }), gg = mat('#9aa3ab', { roughness: 0.8, side: THREE.DoubleSide }), beak = mat('#e8a62c');
  const wing = new THREE.Shape(); wing.moveTo(-0.05, 0); wing.quadraticCurveTo(-0.02, 0.18, -0.1, 0.34); wing.quadraticCurveTo(0.02, 0.2, 0.06, 0);
  const wingGeo = new THREE.ShapeGeometry(wing, 8).rotateX(Math.PI / 2), bodyGeo = new THREE.CapsuleGeometry(0.05, 0.13, 6, 12).rotateZ(Math.PI / 2), headGeo = new THREE.SphereGeometry(0.045, 12, 10), beakGeo = new THREE.ConeGeometry(0.014, 0.06, 8).rotateZ(-Math.PI / 2);
  const gulls = Array.from({ length: 22 }, (_, k) => { const g = new THREE.Group(); const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; }; add(bodyGeo, gw, 0, 0, 0); add(headGeo, gw, 0.11, 0.03, 0); add(beakGeo, beak, 0.17, 0.025, 0); const l = add(wingGeo, gg, 0, 0.03, 0.02), r = add(wingGeo, gg, 0, 0.03, -0.02); r.scale.z = -1; g.scale.setScalar(1.5); root.add(g); return { g, l, r, a: k * 0.9, rad: 3 + (k % 4) * 1.6, h: 3 + (k % 5) * 0.9, speed: 0.4 + (k % 3) * 0.14, x: 0, z: 0, far: true, k }; });
  W.updates.push((dt, now, cam) => {
    for (const g of gulls) {
      // they keep near whoever is looking, over the water and the shore
      if (Math.hypot(g.x - cam.x, g.z - cam.z) > 75) { for (let n = 0; n < 4; n++) { const a = Math.random() * 6.3, d = 20 + Math.random() * 40, x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d; if (coast(x, z) < 1) { g.x = x; g.z = z; g.y = 0; break; } } if (Math.hypot(g.x - cam.x, g.z - cam.z) > 75) { g.g.visible = false; continue; } }
      g.g.visible = true; g.a += dt * g.speed; const flap = Math.sin(now / 130 + g.k) * 0.38; g.l.rotation.x = -flap; g.r.rotation.x = flap;
      g.g.position.set(g.x + Math.cos(g.a) * g.rad, g.h + Math.sin(g.a * 2) * 0.3, g.z + Math.sin(g.a) * g.rad); g.g.rotation.set(0.25, -g.a - Math.PI / 2, 0);
    }
  });
}
