// Red lights that warn aircraft at night, flashing on what stands tall: towers of fifty metres and more as the city's
// houses come in, the modern landmarks at each of their summits (tools/landmarks.mjs tips), the masts, the 380 kV towers and
// the Bosphorus crossing towers of the power lines (client/infra.js). Each structure flashes on its own beat.
import * as THREE from './vendor/three.module.min.js';
import { readHouses } from './assets.js';

const TALL = 5; // (units: 50 m)
const OLD = /cami|mosque|kilise|church|sinagog|saray|galata-kulesi|beyazit-kulesi|kiz-kulesi|hisar|cesme|turbe|medrese/; // (the old towers and minarets carry none)
// the tops of the power towers (client/infra.js FAM: H)
const PYLON = { 380: 6.0, cross: 16 };

export function buildBeacons(W) {
  const { A, night } = W, pts = [], phase = [];
  const seen = new Set(), add = (x, y, z, seed) => { const k = `${Math.round(x * 4)},${Math.round(z * 4)}`; if (seen.has(k)) return false; seen.add(k); pts.push(x, y + 0.04, z); phase.push(seed); return true; };
  const seedOf = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
  for (const m of A.landmarks?.items || []) if (m.tips && !OLD.test(m.id)) { const s = seedOf(m.x, m.z); for (const [x, y, z] of m.tips) add(x, y, z, s); }
  const I = A.infra;
  if (I) {
    for (const [x, z, y, h] of I.masts || []) add(x, y + h, z, seedOf(x, z));
    for (const L of I.lines || []) for (const p of L.p) { const H = p[3] === 2 ? PYLON.cross : p[3] && L.v === 380 ? PYLON[380] : 0; if (H) add(p[0], p[2] + H - 0.1, p[1], seedOf(p[0], p[1])); }
  }
  // the points, drawn as small round glows of a steady size on the screen
  const geo = new THREE.BufferGeometry(), mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: night, uScale: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float aPhase; uniform float uTime, uScale; varying float vOn;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = -mv.z;
        float t = fract(uTime * 0.7 + aPhase); vOn = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.42, 0.55, t)); // (about forty flashes a minute)
        gl_PointSize = clamp(700.0 / max(d, 1.0), 4.0, 14.0) * uScale; }`,
    fragmentShader: `uniform float uNight; varying float vOn;
      void main() { vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard; float core = smoothstep(0.55, 0.1, r), halo = (1.0 - r) * 0.5;
        gl_FragColor = vec4(vec3(1.0, 0.08, 0.04) * (core * 2.6 + halo * 1.4) * vOn * uNight, 1.0); }`,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.name = 'aircraft warning lights'; W.root.add(points);
  let dirty = true; const set = () => { geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1)); dirty = false; };
  // what other builders put up tall (client/marks.js: the bridges' towers)
  W.beacon = (x, y, z) => { if (add(x, y, z, seedOf(x, z))) dirty = true; };
  // the city's tall houses, as their pieces come
  A.stream.on('h', (t, b) => { const { n, B } = readHouses(b, A.map); for (let k = 0, o = 0; k < n; k++) { const h = B[o + 3] / 200; if (h >= TALL) { const x = B[o] / 20, z = B[o + 1] / 20; if (add(x, B[o + 2] / 400 + h, z, seedOf(x, z))) dirty = true; } o += 6 + (B[o + 5] & 255) * 2; } });
  W.updates.push((dt, now) => { points.visible = night.value > 0.02; if (!points.visible) return; if (dirty) set(); mat.uniforms.uTime.value = now / 1000; mat.uniforms.uScale.value = Math.min(2, window.devicePixelRatio || 1); });
}
