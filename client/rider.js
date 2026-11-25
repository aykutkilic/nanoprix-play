// Who rides a two-wheeler or a board: the figure of person.js, its hands on the bar, its feet on the pedals, the pegs or the deck.
import * as THREE from './vendor/three.module.min.js';
import { makePerson } from './person.js';
const HIP = 0.245, V = new THREE.Vector3(), Q = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), DOWN = new THREE.Vector3(0, -1, 0), M = new THREE.Matrix4();
// a limb of two bones hung at a (its joint f below it, l1 down) to the point p of g's space; bend +1 as a knee, −1 as an elbow
function lay(g, a, f, l1, l2, p, bend) {
  a.parent.updateWorldMatrix(true, false); M.copy(g.matrixWorld).invert().multiply(a.parent.matrixWorld).invert(); V.copy(p).applyMatrix4(M).sub(a.position); const L = Math.max(0.02, Math.min(l1 + l2 - 0.002, V.length())), k = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - L * L) / (2 * l1 * l2)))), A = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + L * L - l2 * l2) / (2 * l1 * L))));
  a.quaternion.setFromUnitVectors(DOWN, V.normalize()).multiply(Q.setFromAxisAngle(X, -A * bend)); f.rotation.set((Math.PI - k) * bend, 0, 0);
}
// what each sits or stands on (its own space, the ground at 0, +z ahead): hips [y, z], how far it leans, bar [x, y, z], feet
export const RIDE = {
  motor: { hip: [0.262, -0.075], lean: 0.2, bar: [0.1, 0.315, 0.115], feet: [0.06, 0.105, -0.035], helmet: '#1a1c20', eye: [0.5, 0.06] },
  bisiklet: { hip: [0.312, -0.085], lean: 0.55, bar: [0.075, 0.318, 0.115], pedal: [0.0865, -0.005, 0.048, 0.034], helmet: '#e8e4da', eye: [0.52, 0.075] },
  scooter: { hip: [0.278, -0.045], lean: 0.06, bar: [0.06, 0.305, 0.112], stand: [[0.018, 0.047, 0.025], [-0.016, 0.047, -0.075]], eye: [0.55, 0.03] },
  kaykay: { hip: [0.262, 0], lean: 0.12, stand: [[0.0, 0.052, -0.075], [0.0, 0.052, 0.07]], side: 1, eye: [0.5, 0.02] },
};
export function makeRider(kind, color) {
  const R = RIDE[kind], g = new THREE.Group(), p = makePerson(color), { body, chest, head, L, A } = p.userData.limbs, T = new THREE.Vector3(); g.add(p); let ph = 0, low = 0; for (const m of p.children) void m; p.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (R.helmet) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.077, 20, 12, 0, Math.PI * 2, 0, kind === 'motor' ? 2.0 : 1.5).scale(0.95, 1, 1.06), new THREE.MeshStandardMaterial({ color: R.helmet, roughness: 0.3 })); h.position.set(0, 0.012, 0.002); if (kind !== 'motor') h.rotation.x = -0.18; h.castShadow = true; head.add(h); if (kind === 'motor') { const v = new THREE.Mesh(new THREE.SphereGeometry(0.0785, 16, 8, -0.95 + Math.PI / 2, 1.9, 1.2, 0.62).rotateY(Math.PI).scale(0.95, 1, 1.06), new THREE.MeshStandardMaterial({ color: '#0a0f14', roughness: 0.08, metalness: 0.6, side: THREE.DoubleSide })); v.rotation.y = Math.PI; v.position.copy(h.position); head.add(v); } }
  if (R.side) p.rotation.y = Math.PI / 2;
  // v: units a second; steer −1 … 1; gas; spin: how far a wheel has turned
  g.userData.ride = (dt, c, v, gas) => {
    ph += dt * Math.max(0, Math.min(3.2, Math.abs(v) * 0.75)) * 2.4 * (gas > 0.05 || Math.abs(v) < 0.2 ? 1 : 0); const s = c.steer || 0, crouch = R.side ? 0.03 + Math.min(0.03, Math.abs(v) * 0.006) + Math.abs(s) * 0.02 : 0; low += (crouch - low) * Math.min(1, dt * 6); g.userData.ph = ph;
    body.position.set(0, R.hip[0] - HIP - low, R.hip[1]); body.rotation.set(R.lean + (c.boosting ? 0.12 : 0), R.side ? 0 : -s * 0.05, 0); if (!R.side) { body.position.z = R.hip[1] - Math.sin(body.rotation.x) * HIP; body.position.y += (1 - Math.cos(body.rotation.x)) * HIP; } chest.rotation.set(0, R.side ? -0.9 + s * 0.2 : 0, 0); head.rotation.set(-body.rotation.x * 0.85, R.side ? -0.55 : -s * 0.3, 0);
    g.updateWorldMatrix(true, false); p.updateMatrixWorld(true);
    [1, -1].forEach((e, i) => {
      if (R.bar) { const c2 = Math.cos(s * 0.35), s2 = Math.sin(s * 0.35); T.set(e * R.bar[0] * c2, R.bar[1], R.bar[2] + e * R.bar[0] * s2); lay(g, A[i][0], A[i][1], 0.082, 0.082, T, -1); A[i][0].rotateY(0); } else { A[i][0].rotation.set(-0.15 + Math.sin(ph * 0.6 + i) * 0.08, 0, e * (0.75 + Math.abs(s) * 0.3 + Math.sin(ph * 0.9 + i * 2) * 0.08)); A[i][1].rotation.set(-0.35, 0, 0); }
      if (R.pedal) { const a = ph + (e > 0 ? 0 : Math.PI); T.set(e * R.pedal[3], R.pedal[0] - Math.sin(a) * -R.pedal[2] + 0.004, R.pedal[1] + Math.cos(a) * R.pedal[2]); } else if (R.feet) T.set(e * R.feet[0], R.feet[1], R.feet[2]); else { const f = R.stand[i]; T.set(f[0], f[1], f[2]); if (R.side) T.set(0.0, f[1], f[2]); }
      T.y += 0.02; lay(g, L[i][0], L[i][1], 0.115, 0.112, T, 1);
    });
  };
  g.userData.head = head; g.userData.board = !!R.side; g.userData.dispose = p.userData.dispose; return g;
}
