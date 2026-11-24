// Weather, seen: rain and snow in the air round the camera, wet and white
// ground, spray off the sea. (The sky is realism.js's, the waves world.js's.)
import * as THREE from './vendor/three.module.min.js';
import { WAVES, swellAt } from '../shared/weather.js';

// what every surface shares: how wet, how white, how heavy the rain, the swell
export const surf = { wet: { value: 0 }, snow: { value: 0 }, rain: { value: 0 }, swell: { value: 0.04 }, time: { value: 0 } };
export const NONE = { value: 0 };
// what lies between the eye and a car under ground is cut away: `at` the car, `dir` from it to the eye, w: how wide
export const cut = { at: { value: new THREE.Vector4(0, 0, 0, 0) }, dir: { value: new THREE.Vector3(0, 1, 0) }, cam: { value: new THREE.Matrix4() } };
export function cutAway(s) { if (s.uniforms.uCutAt) return; s.uniforms.uCutAt = cut.at; s.uniforms.uCutDir = cut.dir; s.uniforms.uCutCam = cut.cam; s.fragmentShader = s.fragmentShader.replace('void main() {', 'uniform vec4 uCutAt; uniform vec3 uCutDir; uniform mat4 uCutCam;\nvoid main() {\n if (uCutAt.w > 0.0) { vec3 cv = (uCutCam * vec4(-vViewPosition, 1.0)).xyz - uCutAt.xyz; float ct = dot(cv, uCutDir); if (ct > 1.2 && cv.y > 1.1 && length(cv - uCutDir * ct) < uCutAt.w * (0.94 + 0.06 * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5))) discard; }'); }
let nth = 0;
// a material that gets wet and white: snow on what looks up, a sheen when wet
export function weathered(m, { snow = 1, wet = 0.3, shine = 0.35 } = {}) {
  const was = m.onBeforeCompile, key = `weathered ${++nth}`; m.customProgramCacheKey = () => key; // (three.js tells shaders apart by this function's text, which is the same for all)
  m.onBeforeCompile = (s, r) => {
    if (was) was(s, r);
    s.uniforms.uWet = surf.wet; s.uniforms.uSnow = surf.snow; cutAway(s);
    s.fragmentShader = s.fragmentShader.replace('void main() {', 'uniform float uWet, uSnow;\nvoid main() {')
      .replace('#include <roughnessmap_fragment>', `{ float upN = inverseTransformDirection(normalize(vNormal), viewMatrix).y; diffuseColor.rgb *= 1.0 - uWet * ${wet.toFixed(2)}; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.84, 0.90), uSnow * ${snow.toFixed(2)} * smoothstep(0.38, 0.72, upN)); }\n#include <roughnessmap_fragment>`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n{ float upN = inverseTransformDirection(normalize(vNormal), viewMatrix).y; roughnessFactor = mix(roughnessFactor, min(roughnessFactor, ${shine.toFixed(2)}), uWet * smoothstep(0.2, 0.8, upN)); roughnessFactor = mix(roughnessFactor, 0.9, uSnow * ${snow.toFixed(2)} * smoothstep(0.38, 0.72, upN)); }`);
  };
  return m;
}
// the swell for the sea's shader, the very sums of shared/weather.js: height, and its slope along x and z
export const SWELL_GLSL = `
  vec3 swell(vec2 p, float t) { vec3 o = vec3(0.0); ${WAVES.map(([dx, dz, L, a, v]) => `{ vec2 d = vec2(${dx.toFixed(3)}, ${dz.toFixed(3)}); float k = ${(6.28319 / L).toFixed(5)}, q = k * (dot(d, p) - ${v.toFixed(3)} * t), s = 0.5 + 0.5 * sin(q); o.x += ${a.toFixed(3)} * (2.0 * s * s - 0.75); o.yz += d * (${a.toFixed(3)} * 2.0 * s * cos(q) * k); }`).join(' ')} return o; }`;

export class Weather {
  constructor(scene, W, fx, audio) {
    this.W = W; this.fx = fx; this.audio = audio; this.now = null; this.flash = 0; this.nextFlash = 3; this.acc = 0;
    const N = 5200, base = new Float32Array(N * 2 * 3), kind = new Float32Array(N * 2 * 2), r = Math.random;
    for (let k = 0; k < N; k++) { const x = r(), y = r(), z = r(), w = r(); for (const e of [0, 1]) { const i = (k * 2 + e) * 3; base[i] = x; base[i + 1] = y; base[i + 2] = z; kind[(k * 2 + e) * 2] = w; kind[(k * 2 + e) * 2 + 1] = e; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('aK', new THREE.BufferAttribute(kind, 2)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.u = { uT: { value: 0 }, uC: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uWind: { value: new THREE.Vector2() }, uLit: { value: 1 }, uFall: { value: new THREE.Vector2() }, uBox: { value: new THREE.Vector3(46, 26, 46) } };
    this.rain = new THREE.LineSegments(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: this.u, vertexShader: `attribute vec2 aK; uniform float uT, uAmt; uniform vec3 uC, uBox; uniform vec2 uWind, uFall; varying float vA; void main() { vec3 p = position * uBox; p.y -= uT * (21.0 + aK.x * 9.0); p.xz += uFall * (0.8 + aK.x * 0.4); p = mod(p - uC, uBox) - uBox * 0.5 + uC; p += aK.y * vec3(-uWind.x * 0.045, 0.62, -uWind.y * 0.045); vec4 m = modelViewMatrix * vec4(p, 1.0); float d = -m.z; vA = step(fract(aK.x * 7.31), uAmt) * smoothstep(0.4, 2.0, d) * (projectionMatrix[3][3] > 0.5 ? 0.8 : smoothstep(26.0, 8.0, d)) * (1.0 - aK.y * 0.75); gl_Position = projectionMatrix * m; if (vA < 0.004 && aK.y < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`, fragmentShader: 'uniform float uLit; varying float vA; void main() { gl_FragColor = vec4(vec3(0.62, 0.68, 0.75) * uLit, vA * 0.6); }' })); this.rain.frustumCulled = false; scene.add(this.rain);
    const M = 4200, sp = new Float32Array(M * 3), sk = new Float32Array(M); for (let k = 0; k < M; k++) { sp[k * 3] = r(); sp[k * 3 + 1] = r(); sp[k * 3 + 2] = r(); sk[k] = r(); } const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aK', new THREE.BufferAttribute(sk, 1)); sg.boundingSphere = g.boundingSphere;
    this.su = { ...this.u, uAmt: { value: 0 }, uH: { value: 720 } };
    this.snow = new THREE.Points(sg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: this.su, vertexShader: `attribute float aK; uniform float uT, uAmt, uH; uniform vec3 uC, uBox; uniform vec2 uFall; varying float vA; void main() { vec3 p = position * uBox; p.y -= uT * (2.2 + aK * 1.4); p.xz += uFall * (0.5 + aK * 0.6) + vec2(sin(uT * (0.8 + aK) + aK * 40.0), cos(uT * (0.7 + aK * 0.6) + aK * 70.0)) * 0.5; p = mod(p - uC, uBox) - uBox * 0.5 + uC; vec4 m = modelViewMatrix * vec4(p, 1.0); float d = max(0.3, -m.z); bool o = projectionMatrix[3][3] > 0.5; vA = step(fract(aK * 7.31), uAmt) * smoothstep(0.35, 1.2, d) * (o ? 0.9 : smoothstep(26.0, 14.0, d)); gl_Position = projectionMatrix * m; gl_PointSize = min(22.0, (0.055 + aK * 0.04) * uH * projectionMatrix[1][1] * 0.5 / (o ? 1.0 : d)); if (vA < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`, fragmentShader: 'uniform float uLit; varying float vA; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(0.93, 0.95, 1.0) * uLit, vA * (1.0 - smoothstep(0.35, 1.0, d)) * 0.9); }' })); this.snow.frustumCulled = false; scene.add(this.snow);
    this.fall = new THREE.Vector2();
  }
  // w: the weather now (shared/weather.js); at: where one looks; cars: those near, for their spray
  update(dt, now, w, at, night, cars = []) {
    const W = this.W; this.now = w; surf.wet.value = w.wet; surf.snow.value = w.snow; surf.rain.value = w.rain; surf.swell.value = w.swell; surf.time.value = now / 1000;
    const wind = [w.wind * 5.2 + w.snowing * 1.6, -w.wind * 4.1 - w.snowing * 0.8], lit = 0.28 + 0.72 * (1 - night) + this.flash * 2; this.fall.x += wind[0] * dt; this.fall.y += wind[1] * dt;
    this.u.uT.value = this.su.uT.value = (now / 1000) % 1000; this.u.uC.value.set(at.x, at.y + 4, at.z); this.u.uWind.value.set(wind[0], wind[1]); this.u.uFall.value.copy(this.fall); this.u.uLit.value = lit; this.u.uAmt.value = w.rain; this.su.uAmt.value = w.snowing; this.su.uH.value = innerHeight * devicePixelRatio; this.rain.visible = w.rain > 0.01; this.snow.visible = w.snowing > 0.01;
    // lightning, and its thunder a little later
    this.flash = Math.max(0, this.flash - dt * 3.4); if (w.flash > 0.5) { this.nextFlash -= dt; if (this.nextFlash <= 0) { this.flash = 0.7 + Math.random() * 0.5; this.nextFlash = Math.random() < 0.3 ? 0.18 : 4 + Math.random() * 8; const far = Math.random(); setTimeout(() => this.audio.thunder(1 - far * 0.6), 250 + far * 2200); } }
    this.audio.weather(w); if (W.asphalt) W.asphalt.envMapIntensity = 1 + w.wet * 1.9;
    // splashes on the road, spray behind the cars, seas breaking on the quays
    this.acc += dt; const R = Math.random;
    for (const c of cars) { const v = Math.hypot(c.vx, c.vz); if (c.air > 0.05 || v < 3) continue; if (w.wet > 0.5 && R() < v * 0.03) this.fx.spray(c, 0.11 * w.wet); else if (w.snow > 0.4 && R() < v * 0.028) this.fx.spray(c, 0.16 * w.snow, [0.92, 0.95, 1]); }
    if (this.acc > 0.033) { this.acc = 0; if (w.rain > 0.2) for (let k = 0; k < 10 * w.rain; k++) this.fx.add(at.x + (R() - 0.5) * 12, at.y + 0.05, at.z + (R() - 0.5) * 12, 0, 0.5, 0, 0.035, 0.16, [0.75, 0.8, 0.86], 0.5, 0.5); if (w.swell > 0.35) for (let k = 0; k < 14; k++) { const x = at.x + (R() - 0.5) * 70, z = at.z + (R() - 0.5) * 70, c = W.coast(x, z); if (c < -0.25 || c > 0.9) continue; const big = w.swell * (0.5 + R()); for (let q = 0; q < 5; q++) this.fx.add(x + (R() - 0.5) * 1.2, 0.15, z + (R() - 0.5) * 1.2, (R() - 0.2) * 1.6 * w.wind, (1.6 + R() * 2.6) * big, (R() - 0.8) * 1.4 * w.wind, 0.35 + R() * 0.4, 0.7 + R() * 0.5, [0.86, 0.91, 0.95], 0.4, 0.9, -5.5); } }
  }
  // how the sea stands at a place: sheltered near the shore, as in the shader
  sea(x, z) { const c = this.W.coast(x, z), k = Math.max(0, Math.min(1, (-c - 0.9) / 7)); return swellAt(x, z, surf.time.value, surf.swell.value * k * k * (3 - 2 * k)); }
}
