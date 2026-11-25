// Somebody on foot: a toy figure that walks and runs, knees and elbows bending.
// Soles at y 0, about 0.53 tall, facing +z. One mesh a limb, coloured by vertex.
import * as THREE from './vendor/three.module.min.js';
const DENIM = '#2c3a52', SKIN = '#d9a77f', HAIR = '#2a1a12', SHOE = '#e9e6df', SOLE = '#b9bbbd', BAG = '#39424f', STRAP = '#262c35', EYE = '#17130f';
const HIP = 0.245, KNEE = 0.115, SHOULDER = 0.378, ELBOW = 0.082;
const turned = (pts, sz = 1, seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg).scale(1, 1, sz);
const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 14, 10).scale(sx, sy, sz).translate(x, y, z);
const pill = (r0, r1, len) => new THREE.CylinderGeometry(r0, r1, len, 12).translate(0, -len / 2, 0);
const slab = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d, 2, 2, 2).translate(x, y, z);
// [geometry, colour] … → one geometry
function join(list) {
  const pos = [], nor = [], col = [], c = new THREE.Color();
  for (const [geo, color] of list) { const g = geo.index ? geo.toNonIndexed() : geo; c.set(color); const p = g.attributes.position.array, n = g.attributes.normal.array; for (let k = 0; k < p.length; k++) { pos.push(p[k]); nor.push(n[k]); } for (let k = 0; k < p.length; k += 3) col.push(c.r, c.g, c.b); if (g !== geo) g.dispose(); geo.dispose(); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return o;
}
export function makePerson(color = '#c8242a') {
  const g = new THREE.Group(), body = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }), dim = `#${new THREE.Color(color).multiplyScalar(0.55).getHexString()}`; g.add(body);
  const part = (parent, x, y, z, list) => { const o = new THREE.Mesh(join(list), mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  // hips, then what turns above them: jacket, bag, and the head on it
  part(body, 0, HIP, 0, [[turned([[0.001, -0.052], [0.034, -0.046], [0.056, -0.018], [0.06, 0.012], [0.054, 0.03]], 0.74), DENIM]]);
  const chest = new THREE.Group(); chest.position.y = HIP; body.add(chest);
  part(chest, 0, 0, 0, [
    [turned([[0.056, 0.0], [0.064, -0.004], [0.065, 0.014], [0.062, 0.016]], 0.74), dim], [turned([[0.062, 0.014], [0.058, 0.045], [0.064, 0.085], [0.071, 0.118], [0.066, 0.142], [0.046, 0.156], [0.029, 0.161]], 0.7), color],
    [turned([[0.029, 0.154], [0.034, 0.164], [0.03, 0.172], [0.024, 0.168]], 0.95, 14), dim], [slab(0.006, 0.145, 0.004, 0, 0.078, 0.0445).rotateX(-0.03), dim],
    [pill(0.02, 0.023, 0.045).translate(0, 0.195, 0.002), SKIN],
    [new THREE.CapsuleGeometry(0.034, 0.05, 5, 12).scale(1.25, 1, 0.72).translate(0, 0.088, -0.062), BAG], [new THREE.CapsuleGeometry(0.02, 0.022, 4, 10).scale(1.3, 0.8, 0.6).translate(0, 0.066, -0.083), STRAP],
    ...[1, -1].flatMap((s) => [[new THREE.TorusGeometry(0.052, 0.0065, 5, 14, Math.PI).rotateY(Math.PI / 2).scale(1, 1.0, 0.85).translate(s * 0.036, 0.109, -0.002), STRAP], [slab(0.013, 0.06, 0.006, s * 0.036, 0.083, 0.044), STRAP]]),
  ]);
  const head = part(chest, 0, 0.222, 0.003, [
    [ball(0.056, 0, 0, 0, 0.94, 1.06, 0.98), SKIN], [ball(0.03, 0, -0.033, 0.012, 1.05, 0.8, 1.1), SKIN], [ball(0.009, 0, -0.006, 0.056, 0.9, 1, 1), SKIN],
    ...[1, -1].flatMap((s) => [[ball(0.0135, s * 0.053, -0.006, -0.002, 0.5, 1, 0.8), SKIN], [ball(0.0068, s * 0.02, 0.01, 0.0515, 1, 1.25, 0.6), EYE], [slab(0.018, 0.0045, 0.006, s * 0.02, 0.0255, 0.052), HAIR]]),
    [new THREE.SphereGeometry(0.0605, 18, 10, 0, Math.PI * 2, 0, 1.38).scale(0.97, 1.06, 1).rotateX(-0.42), HAIR], [ball(0.05, 0, 0.0, -0.018, 1.06, 0.82, 0.92), HAIR], [ball(0.028, 0.012, 0.05, 0.032, 1.5, 0.6, 0.8), HAIR],
  ]);
  const arm = (s) => {
    const a = part(chest, s * 0.072, SHOULDER - HIP, 0, [[ball(0.0255, 0, 0, 0), color], [pill(0.0245, 0.0215, ELBOW), color], [ball(0.0215, 0, -ELBOW, 0), color]]);
    a.rotation.z = s * 0.13; const f = part(a, 0, -ELBOW, 0, [[pill(0.0212, 0.019, 0.05), color], [pill(0.0205, 0.0205, 0.011).translate(0, -0.044, 0), dim], [pill(0.0145, 0.0145, 0.02).translate(0, -0.05, 0), SKIN], [ball(0.0185, 0, -0.078, 0.002, 0.8, 1.2, 1), SKIN], [ball(0.0075, -s * 0.011, -0.07, 0.013, 1, 1.5, 1), SKIN]]); return [a, f];
  };
  const leg = (s) => {
    const a = part(body, s * 0.031, HIP, 0, [[ball(0.0315, 0, 0, 0), DENIM], [pill(0.0315, 0.026, KNEE), DENIM], [ball(0.026, 0, -KNEE, 0), DENIM]]);
    const f = part(a, 0, -KNEE, 0, [[pill(0.026, 0.0235, 0.098), DENIM], [pill(0.025, 0.025, 0.01).translate(0, -0.09, 0), '#22304a'], [ball(0.026, 0, -0.109, 0.016, 0.98, 0.72, 1.75), SHOE], [turned([[0.001, -0.13], [0.0245, -0.13], [0.026, -0.124], [0.025, -0.117]], 1.72, 16).translate(0, 0, 0.016), SOLE]]); return [a, f];
  };
  const L = [leg(1), leg(-1)], A = [arm(1), arm(-1)]; let ph = 0, k = 0, run = 0, idle = Math.random() * 9;
  // dt in s; v: units a second, less than 0 backwards
  g.userData.step = (dt, v) => {
    const s = Math.abs(v), on = s > 0.05; k += ((on ? 1 : 0) - k) * Math.min(1, dt * 10); run += (Math.max(0, Math.min(1, (s - 2) / 1.8)) - run) * Math.min(1, dt * 7); idle += dt;
    if (on) ph += dt * (6 + Math.min(5, s) * 2.2) * (v < 0 ? -1 : 1); else if (k < 0.03) ph = 0;
    const R = k * (0.62 + run * 0.28); let low = 1e9;
    [0, Math.PI].forEach((o, i) => {
      const w = Math.sin(ph + o), lift = Math.max(0, -Math.cos(ph + o)), [a, f] = L[i], [b, e] = A[i], th = w * R - k * run * 0.12, kn = k * (0.1 + lift * (0.75 + run * 0.65)); a.rotation.x = th; f.rotation.x = kn;
      b.rotation.x = -w * R * (0.75 + run * 0.15) + (1 - k) * Math.sin(idle * 1.3 + i) * 0.025; e.rotation.x = -(0.16 + k * 0.2 + run * 0.95); low = Math.min(low, HIP - Math.cos(th) * KNEE - Math.cos(th + kn) * 0.13 - Math.max(0, Math.sin(th + kn)) * 0.04);
    });
    body.position.y = -low * k * (1 - run * 0.3) + run * k * 0.012 * (1 + Math.cos(ph * 2)); // (the lower foot is on the ground; in a run both leave it)
    body.rotation.x = k * 0.03 + run * 0.13; body.rotation.z = Math.sin(ph) * 0.02 * k; chest.rotation.y = Math.sin(ph) * 0.13 * k; chest.scale.y = 1 + Math.sin(idle * 1.9) * 0.006; head.rotation.y = -chest.rotation.y * 0.8 + (1 - k) * Math.sin(idle * 0.45) * 0.3; head.rotation.x = -body.rotation.x * 0.7;
  };
  g.userData.step(0, 0); g.userData.limbs = { body, chest, head, L, A };
  g.userData.dispose = () => g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.isSprite && o.material.map) o.material.map.dispose(); o.material.dispose(); } }); return g;
}
