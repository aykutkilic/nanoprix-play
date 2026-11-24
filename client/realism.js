// (From the board game's realism.js, at this city's scale, with a tilt-shift.)
// What makes the table look real: a sky that lights the scene (image-based
// lighting), procedural materials (stone, wood, card, façades – all drawn in
// code, nothing downloaded), and a post pipeline: multisampled HDR, ambient
// occlusion, bloom, filmic tone mapping, a little vignette and grain.
// Quality steps down by itself when frames get slow (?gfx=high|medium|low
// fixes it).

import * as THREE from './vendor/three.module.min.js';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize(); // late afternoon, from the south-west

// the moon, low over the Black Sea: where the TV camera looks at night
export const MOON_DIR = new THREE.Vector3(-0.075, Math.tan(0.05), -1).normalize();

// ---------------------------------------------------------------- noise

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export { rng };

// tileable fractal value noise, size × size, 0..1
function fbmTile(size, base, octaves, seed) {
  const out = new Float32Array(size * size);
  let amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = base << o, r = rng(seed + o * 101), grid = Float32Array.from({ length: cells * cells }, r);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells, gy = (y / size) * cells, x0 = Math.floor(gx), y0 = Math.floor(gy);
      let fx = gx - x0, fy = gy - y0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const at = (a, b) => grid[(b % cells) * cells + (a % cells)];
      out[y * size + x] += amp * ((at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy);
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
let noiseTex = null;
// R: soft, G: finer, B: fine grain, A: another soft one
export function noiseTexture() {
  if (noiseTex) return noiseTex;
  const n = 256, ch = [fbmTile(n, 4, 5, 1), fbmTile(n, 8, 5, 2), fbmTile(n, 32, 3, 3), fbmTile(n, 4, 5, 4)];
  const d = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) for (let c = 0; c < 4; c++) d[i * 4 + c] = (0.5 + 0.5 * Math.tanh((ch[c][i] - 0.5) * 3.4)) * 255; // (soft, not clamped: a clamped peak is flat)
  noiseTex = new THREE.DataTexture(d, n, n);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.anisotropy = 4;
  noiseTex.needsUpdate = true;
  return noiseTex;
}
// noise on the CPU, for placing things
const cpu = fbmTile(256, 8, 5, 9);
export function noise2(x, z) {
  const wrap = (v) => ((v % 256) + 256) % 256;
  const gx = wrap(x * 8), gy = wrap(z * 8), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const at = (a, b) => cpu[(b % 256) * 256 + (a % 256)];
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

// ---------------------------------------------------------------- materials

const textures = new Map();
function canvasTex(key, w, h, draw, { srgb = true, repeat = null } = {}) {
  if (textures.has(key)) return textures.get(key);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h, rng(key.length * 77 + 5));
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  t.anisotropy = 8;
  textures.set(key, t);
  return t;
}
// courses of stone: the colour map, and the same joints as a bump map
function blocks(bump) {
  return (g, w, h, r) => {
    g.fillStyle = bump ? '#444' : '#8d8371'; g.fillRect(0, 0, w, h);
    const rows = 12, bh = h / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 40;
      while (x < w) {
        const bw = 26 + r() * 34, v = r();
        if (bump) g.fillStyle = `rgb(${150 + v * 90},${150 + v * 90},${150 + v * 90})`;
        else g.fillStyle = `hsl(${36 + v * 8},${14 + v * 12}%,${60 + v * 16}%)`;
        g.fillRect(x + 1, y * bh + 1, bw - 2, bh - 2);
        x += bw;
      }
    }
    if (!bump) for (let k = 0; k < 2600; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,32,22' : '255,248,230'},${r() * 0.09})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  };
}
export const stoneMaterial = (tint = '#ffffff', repeat = [2, 2]) => {
  const key = repeat.join('x');
  return new THREE.MeshStandardMaterial({ color: tint, map: canvasTex(`stone${key}`, 256, 256, blocks(false), { repeat }), bumpMap: canvasTex(`stoneb${key}`, 256, 256, blocks(true), { srgb: false, repeat }), bumpScale: 1.2, roughness: 0.92 });
};
export const woodMaterial = (tint = '#7a5232', repeat = [1, 1]) => new THREE.MeshPhysicalMaterial({
  color: tint, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3,
  map: canvasTex(`wood${repeat}`, 512, 512, (g, w, h, r) => {
    g.fillStyle = '#d9c3a6'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 420; k++) {
      const y = r() * h, a = 3 + r() * 10, f = 0.004 + r() * 0.012, ph = r() * 7;
      g.strokeStyle = `rgba(${70 + r() * 40},${40 + r() * 25},${18 + r() * 14},${0.05 + r() * 0.17})`;
      g.lineWidth = 0.6 + r() * 2.4;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * f * Math.PI + ph) * a * 0.5);
      g.stroke();
    }
  }, { repeat }),
});
// four storeys of windows, for the city's walls (tinted per building)
export const facadeTexture = () => canvasTex('facade', 128, 128, (g, w, h, r) => {
  g.fillStyle = '#f3efe8'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 700; k++) { g.fillStyle = `rgba(60,45,30,${r() * 0.06})`; g.fillRect(r() * w, r() * h, 2 + r() * 5, 2 + r() * 10); }
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const px = 12 + x * 40, py = 10 + y * 41;
    g.fillStyle = '#d9d2c6'; g.fillRect(px - 3, py - 3, 26, 30);
    const lit = r() < 0.12;
    g.fillStyle = lit ? '#e8c98a' : ['#2d3a45', '#3b4a55', '#25303a'][Math.floor(r() * 3)]; g.fillRect(px, py, 20, 24);
    g.fillStyle = 'rgba(190,215,235,.35)'; g.fillRect(px + 1, py + 1, 8, 11);
    g.fillStyle = '#efe9de'; g.fillRect(px + 9, py, 2, 24);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(px - 3, py + 27, 26, 3);
  }
});
export const towerTexture = () => canvasTex('tower', 128, 256, (g, w, h, r) => {
  g.fillStyle = '#c3ccd1'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 12; x++) {
    const v = r();
    g.fillStyle = v < 0.06 ? '#f1dca6' : `hsl(${203 + v * 12},${14 + v * 12}%,${58 + v * 26}%)`;
    g.fillRect(x * (w / 12) + 1, y * 8 + 1, w / 12 - 2, 6);
  }
});
// fine fibres, for the cards' surface
export const paperBump = () => canvasTex('paper', 256, 256, (g, w, h, r) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 5200; k++) { const v = 100 + r() * 60; g.strokeStyle = `rgba(${v},${v},${v},.5)`; g.lineWidth = 0.7; const x = r() * w, y = r() * h, a = r() * 7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke(); }
}, { srgb: false });

// ---------------------------------------------------------------- sky and light

// a point on the moon's disc (radius 1) → its colour; shared by the sky and
// the moon's picture on the water
export const CARTOON_MOON = `
  vec4 cartoonMoon(vec2 q) {
    // a crescent: one circle less another (its distance: inside is negative)
    float e = max(length(q) - 1.0, 0.80 - length(q - vec2(0.46, 0.20))), w = max(fwidth(q.x) * 0.9, 0.012);
    vec3 c = vec3(1.0, 0.66, 0.13);
    c = mix(c, vec3(0.80, 0.40, 0.05), smoothstep(-0.30 - w, -0.30 + w, e) * step(q.y, q.x * 0.6 - 0.05)); // the shaded rim
    c = mix(c, vec3(0.26, 0.12, 0.05), smoothstep(-0.10 - w, -0.10 + w, e)); // the outline
    return vec4(c, 1.0 - smoothstep(-w, w, e));
  }`;
const SKY_FS = `
  ${CARTOON_MOON}
  uniform vec3 uSun, uMoon; uniform sampler2D uNoise; uniform float uDisc, uTime, uNight, uCloud, uFlash, uMist; uniform vec3 uGround;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float up = max(d.y, 0.0), s = max(dot(d, uSun), 0.0);
    vec3 zen = vec3(0.075, 0.21, 0.47), hor = vec3(0.60, 0.72, 0.80);
    vec3 c = mix(hor, zen, pow(up, 0.46));
    c = mix(c, vec3(1.0, 0.80, 0.56), pow(s, 6.0) * 0.32 * (1.0 - up * 0.6));
    if (d.y > 0.02) {
      vec2 p = d.xz / (d.y + 0.14);
      float n = texture2D(uNoise, p * 0.06 + uTime * 0.0006).r * 0.62 + texture2D(uNoise, p * 0.19 + uTime * 0.001).g * 0.38;
      float cl = smoothstep(0.52, 0.80, n) * smoothstep(0.02, 0.22, d.y);
      vec3 cc = mix(vec3(0.66, 0.70, 0.76), vec3(1.25, 1.18, 1.08), smoothstep(0.5, 0.9, n) * 0.7 + s * 0.4);
      c = mix(c, cc, cl * 0.85);
    }
    c += vec3(1.0, 0.86, 0.66) * (pow(s, 900.0) * 22.0 + pow(s, 60.0) * 0.5) * uDisc;
    if (uCloud > 0.0) { // overcast: a low grey lid that moves
      vec2 q = d.xz / (max(d.y, 0.0) + 0.22); float m = texture2D(uNoise, q * 0.05 + uTime * 0.0022).r * 0.6 + texture2D(uNoise, q * 0.15 + uTime * 0.004).g * 0.4;
      c = mix(c, mix(vec3(0.60, 0.63, 0.66), vec3(0.30, 0.335, 0.38), pow(up, 0.45)) * (0.72 + m * 0.55), uCloud * smoothstep(-0.05, 0.12, d.y + 0.08)); }
    if (uNight > 0.0) {
      vec3 n = mix(vec3(0.030, 0.036, 0.060), vec3(0.004, 0.007, 0.020), pow(up, 0.5));
      n += vec3(0.20, 0.105, 0.040) * exp(-up * 11.0) * 0.55; // the city's glow on the horizon
      vec2 p = vec2(atan(d.z, d.x) * 46.0, d.y * 64.0), id = floor(p), f = fract(p) - 0.5;
      float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
      n += vec3(0.9, 0.95, 1.0) * smoothstep(0.10, 0.0, length(f - (vec2(fract(h * 71.0), fract(h * 137.0)) - 0.5) * 0.6)) * step(0.90, h) * (0.5 + 0.5 * sin(uTime * (1.0 + h * 2.0) + h * 40.0)) * smoothstep(0.04, 0.3, d.y) * uDisc * 1.4;
      // the moon: a small cartoon crescent – flat, two tones, an outline
      float ms = max(dot(d, uMoon), 0.0);
      vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoon)), mu = cross(uMoon, mr);
      vec2 mq = vec2(dot(d, mr), dot(d, mu)) / 0.0165;
      n += vec3(0.50, 0.46, 0.36) * pow(ms, 1400.0) * 0.10 * max(uDisc, 0.15);
      vec4 moon = cartoonMoon(mq) * step(0.0, dot(d, uMoon)) * uDisc;
      n = mix(n, moon.rgb, moon.a);
      n = mix(n, vec3(0.020, 0.021, 0.026) * (0.7 + texture2D(uNoise, d.xz / (max(d.y, 0.0) + 0.22) * 0.06 + uTime * 0.003).r * 0.8), uCloud);
      c = mix(c, n, uNight);
    }
    c += vec3(0.55, 0.60, 0.75) * uFlash * (0.25 + 0.75 * smoothstep(0.0, 0.5, up));
    c = mix(c, uGround, uMist * (1.0 - 0.45 * smoothstep(0.05, 0.75, d.y)));
    c = mix(c, uGround, smoothstep(0.015 + uCloud * 0.05, -0.06, d.y));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
export const HAZE = new THREE.Color().setRGB(0.60, 0.72, 0.80); // the horizon's colour
export function makeSky(ground = HAZE, disc = 1, moon = MOON_DIR) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN_DIR }, uMoon: { value: moon }, uNoise: { value: noiseTexture() }, uDisc: { value: disc }, uTime: { value: 0 }, uNight: { value: 0 }, uCloud: { value: 0 }, uFlash: { value: 0 }, uMist: { value: 0 }, uGround: { value: new THREE.Color(ground) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SKY_FS,
  }));
  m.scale.setScalar(1500);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}
export const NIGHT_HAZE = new THREE.Color().setRGB(0.095, 0.072, 0.062);
export function skyEnvironment(renderer, ground, night = 0) {
  const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene(), sky = makeSky(ground, 0, SUN_DIR); // (the moonlight on things comes from behind you)
  sky.material.uniforms.uNight.value = night;
  s.add(sky);
  const rt = pm.fromScene(s, 0.015, 0.1, 400);
  pm.dispose();
  return rt.texture;
}
// a lamp-lit room, for the wooden board on its table
export function roomEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24), new THREE.MeshBasicMaterial({ color: '#4b4038', side: THREE.BackSide })));
  const lamp = (x, y, z, w, h, d, i, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i) })); m.position.set(x, y, z); s.add(m); };
  lamp(-11.5, 2, -2, 0.3, 6, 9, 9, '#cfe3f5');
  lamp(0, 5.8, 0, 7, 0.2, 7, 7, '#ffe6c2');
  lamp(9, 4, -9, 2, 2, 0.2, 14, '#ffd9a0');
  const rt = pm.fromScene(s, 0.03);
  pm.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------- post-processing

const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const AO_FS = `
  #include <common>
  uniform sampler2D tDepth; uniform mat4 uInvProj, uProj; uniform vec2 uRes, uFull; uniform float uRadius, uOrtho; varying vec2 vUv;
  // (always a depth pixel's own centre: between two, rows would pick the wrong one)
  vec3 at(vec2 uv) { uv = (floor(uv * uFull) + 0.5) / uFull; vec4 p = uInvProj * vec4(vec3(uv, texture2D(tDepth, uv).x) * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
  void main() {
    float z0 = texture2D(tDepth, vUv).x;
    if (z0 > 0.99999) { gl_FragColor = vec4(1.0); return; }
    vec3 p = at(vUv);
    vec2 e = 1.0 / uRes;
    vec3 r = at(vUv + vec2(e.x, 0.0)) - p, l = p - at(vUv - vec2(e.x, 0.0)), u = at(vUv + vec2(0.0, e.y)) - p, b = p - at(vUv - vec2(0.0, e.y));
    vec3 dx = abs(r.z) < abs(l.z) ? r : l, dy = abs(u.z) < abs(b.z) ? u : b;
    vec3 n = normalize(cross(dx, dy));
    float px = uRadius * uProj[1][1] * 0.5 * uRes.y / mix(-p.z, 1.0, uOrtho);
    px = clamp(px, 3.0, uRes.y * 0.12);
    float rot = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
    float occ = 0.0;
    const int N = 14;
    for (int i = 0; i < N; i++) {
      float a = float(i) * 2.399963 + rot, k = (float(i) + 0.5) / float(N);
      vec3 v = at(vUv + vec2(cos(a), sin(a)) * k * px * e) - p;
      float d2 = dot(v, v);
      occ += max(0.0, dot(v, n) - 0.004 - 0.0008 * abs(p.z)) / (d2 + 0.006) * smoothstep(uRadius * uRadius * 1.6, 0.0, d2);
    }
    gl_FragColor = vec4(vec3(clamp(1.0 - occ * 0.13 * uRadius, 0.0, 1.0)), 1.0);
  }`;
const BLUR_FS = `
  uniform sampler2D tMap, tDepth; uniform vec2 uStep; uniform float uDepthAware, uNear, uFar, uOrtho; varying vec2 vUv;
  float dist(vec2 uv) { float z = texture2D(tDepth, uv).x; return mix(uNear * uFar / (uFar - z * (uFar - uNear)), uNear + z * (uFar - uNear), uOrtho); }
  void main() {
    float d0 = uDepthAware > 0.5 ? dist(vUv) : 0.0; vec4 sum = vec4(0.0); float w = 0.0;
    for (int i = -4; i <= 4; i++) {
      vec2 uv = vUv + uStep * float(i);
      float k = exp(-float(i * i) / 9.0);
      if (uDepthAware > 0.5) k *= exp(-abs(dist(uv) - d0) / (0.0028 * d0));
      vec4 v = texture2D(tMap, uv); if (!(v.r == v.r && v.g == v.g && v.b == v.b)) continue; // (a bad pixel must not spread)
      sum += min(v, vec4(60.0)) * k; w += k;
    }
    gl_FragColor = sum / max(w, 1e-4);
  }`;
const BRIGHT_FS = `uniform sampler2D tMap; varying vec2 vUv; void main() { vec3 c = texture2D(tMap, vUv).rgb; c = vec3(c.r == c.r && c.r >= 0.0 ? min(c.r, 12.0) : 0.0, c.g == c.g && c.g >= 0.0 ? min(c.g, 12.0) : 0.0, c.b == c.b && c.b >= 0.0 ? min(c.b, 12.0) : 0.0); float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(1.0, 2.2, l), 1.0); }`;
const FINAL_FS = `
  uniform sampler2D tMap, tAo, tBloom, tDepth, tSoft; uniform float uFocus, uTilt; uniform float uAo, uExposure, uTime, uNear, uFar, uOrtho, uBloom; uniform vec2 uAoRes; varying vec2 vUv;
  float dist(vec2 uv) { float z = texture2D(tDepth, uv).x; return mix(uNear * uFar / (uFar - z * (uFar - uNear)), uNear + z * (uFar - uNear), uOrtho); }
  // half-size occlusion, taken only from neighbours on the same surface
  float occlusion() {
    vec2 p = vUv * uAoRes - 0.5, b = floor(p), f = p - b;
    float d0 = dist(vUv), sum = 0.0, w = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(float(i - (i / 2) * 2), float(i / 2)), uv = (b + o + 0.5) / uAoRes, k2 = mix(1.0 - f, f, o);
      float k = (k2.x * k2.y + 0.02) / (0.0015 * d0 + abs(dist(uv) - d0));
      sum += texture2D(tAo, uv).r * k; w += k;
    }
    return sum / w;
  }
  vec3 aces(vec3 v) {
    v = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * v;
    v = (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
    return clamp(mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602) * v, 0.0, 1.0);
  }
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb;
    if (!(c.r == c.r && c.g == c.g && c.b == c.b)) c = texture2D(tSoft, vUv).rgb;
    float ao = mix(1.0, occlusion(), uAo);
    if (uTilt > 0.0) { // the diorama's shallow focus: sharp round the car, soft near and far, and towards the top and bottom edges
      float z = dist(vUv), off = abs(log2(max(z, 0.05) / uFocus)), band = abs(vUv.y - 0.46);
      float soft = clamp(max(smoothstep(0.9, 3.4, off) * 0.85, smoothstep(0.26, 0.52, band) * 0.9) * uTilt, 0.0, 1.0);
      c = mix(c, texture2D(tSoft, vUv).rgb, soft); ao = mix(ao, 1.0, soft * 0.6);
    }
    c *= mix(vec3(ao), vec3(1.0), vec3(0.10, 0.07, 0.04) * (1.0 - ao));
    c += texture2D(tBloom, vUv).rgb * uBloom;
    c = aces(c * uExposure);
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.24;
    c = mix(c * 12.92, 1.055 * pow(max(c, 1e-4), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    c += (fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.013;
    gl_FragColor = vec4(c, 1.0);
  }`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.exposure = 1;
    this.bloom = 0.22;
    this.tilt = 0; this.focus = 6;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    const mat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    const u = (v) => ({ value: v });
    this.ao = mat(AO_FS, { tDepth: u(null), uInvProj: u(new THREE.Matrix4()), uProj: u(new THREE.Matrix4()), uRes: u(new THREE.Vector2()), uFull: u(new THREE.Vector2()), uRadius: u(0.6), uOrtho: u(0) });
    this.blur = mat(BLUR_FS, { tMap: u(null), tDepth: u(null), uStep: u(new THREE.Vector2()), uDepthAware: u(1), uNear: u(1), uFar: u(100), uOrtho: u(0) });
    this.bright = mat(BRIGHT_FS, { tMap: u(null) });
    this.final = mat(FINAL_FS, { tMap: u(null), tAo: u(null), tBloom: u(null), tDepth: u(null), uNear: u(1), uFar: u(100), uOrtho: u(0), uAoRes: u(new THREE.Vector2()), uAo: u(1), tSoft: u(null), uFocus: u(6), uTilt: u(0), uExposure: u(1), uBloom: u(0.22), uTime: u(0) });
  }

  setSize(w, h, samples = 4) {
    if (this.main && this.w === w && this.h === h && this.main.samples === samples) return;
    this.dispose();
    this.w = w; this.h = h;
    const depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.main = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthTexture });
    const half = (k, type) => new THREE.WebGLRenderTarget(Math.max(2, w >> k), Math.max(2, h >> k), { type, depthBuffer: false });
    // (soft things need few pixels – fewer still on a dense screen)
    const dense = w * h > 4e6 ? 1 : 0;
    this.ao1 = half(1 + dense, THREE.UnsignedByteType); this.ao2 = half(1 + dense, THREE.UnsignedByteType);
    this.s1 = half(1 + dense, THREE.HalfFloatType); this.s2 = half(1 + dense, THREE.HalfFloatType);
    this.b1 = half(2 + dense, THREE.HalfFloatType); this.b2 = half(2 + dense, THREE.HalfFloatType);
  }

  pass(material, target) { this.quad.material = material; this.r.setRenderTarget(target); this.r.render(this.quad, this.cam); }

  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.main);
    r.clear();
    r.render(scene, camera);
    const depth = this.main.depthTexture, A = this.ao.uniforms, B = this.blur.uniforms;
    A.tDepth.value = depth; A.uProj.value.copy(camera.projectionMatrix); A.uInvProj.value.copy(camera.projectionMatrixInverse);
    A.uRes.value.set(this.ao1.width, this.ao1.height); A.uFull.value.set(this.w, this.h); A.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;
    this.pass(this.ao, this.ao1);
    B.tDepth.value = depth; B.uDepthAware.value = 1; B.uNear.value = camera.near; B.uFar.value = camera.far; B.uOrtho.value = A.uOrtho.value;
    B.tMap.value = this.ao1.texture; B.uStep.value.set(1 / this.ao1.width, 0); this.pass(this.blur, this.ao2);
    B.tMap.value = this.ao2.texture; B.uStep.value.set(0, 1 / this.ao1.height); this.pass(this.blur, this.ao1);
    this.bright.uniforms.tMap.value = this.main.texture; this.pass(this.bright, this.b1);
    B.uDepthAware.value = 0;
    if (this.tilt > 0) for (const k of [1, 1.7]) {
      B.tMap.value = k === 1 ? this.main.texture : this.s1.texture; B.uStep.value.set(k / this.s1.width, 0); this.pass(this.blur, this.s2);
      B.tMap.value = this.s2.texture; B.uStep.value.set(0, k / this.s1.height); this.pass(this.blur, this.s1);
    }
    for (const k of [1, 2.5]) {
      B.tMap.value = this.b1.texture; B.uStep.value.set(k / this.b1.width, 0); this.pass(this.blur, this.b2);
      B.tMap.value = this.b2.texture; B.uStep.value.set(0, k / this.b1.height); this.pass(this.blur, this.b1);
    }
    const F = this.final.uniforms;
    F.tMap.value = this.main.texture; F.tSoft.value = this.s1.texture; F.uTilt.value = this.tilt; F.uFocus.value = this.focus; F.tAo.value = this.ao1.texture; F.tBloom.value = this.b1.texture;
    F.tDepth.value = depth; F.uNear.value = camera.near; F.uFar.value = camera.far; F.uOrtho.value = A.uOrtho.value; F.uAoRes.value.copy(A.uRes.value);
    F.uExposure.value = this.exposure; F.uBloom.value = this.bloom; F.uTime.value = (performance.now() / 50) % 97;
    this.pass(this.final, null);
  }

  dispose() { for (const t of [this.main, this.ao1, this.ao2, this.b1, this.b2, this.s1, this.s2]) if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); } this.main = null; }
}

// ---------------------------------------------------------------- quality

// Resolution is the last thing to go: text has to stay sharp. Slower machines
// first lose antialiasing samples and shadow detail, then ambient occlusion
// and bloom, and only then pixels – never below one per CSS pixel.
export const QUALITY = {
  high: { post: true, samples: 4, dpr: 2, pixels: 9e6, shadow: 4096, text: 440 },
  medium: { post: true, samples: 2, dpr: 2, pixels: 6e6, shadow: 2048, text: 400 },
  low: { post: false, samples: 0, dpr: 1.5, pixels: 4e6, shadow: 2048, text: 320 },
};
export const STEPS = ['high', 'medium', 'low'];
export function pixelRatio(q, w, h, device = devicePixelRatio) {
  return Math.max(Math.min(device, 1), Math.min(device, q.dpr, Math.sqrt(q.pixels / Math.max(1, w * h))));
}
const FORCED = () => { const q = new URLSearchParams(location.search).get('gfx'); return QUALITY[q] ? q : ''; };
const store = { get() { try { return localStorage.getItem('nanoprix.gfx') || 'auto'; } catch { return 'auto'; } }, set(v) { try { localStorage.setItem('nanoprix.gfx', v); } catch { /* */ } } };
// 'auto', or the level the player picked
export const gfxChoice = () => FORCED() || (QUALITY[store.get()] ? store.get() : 'auto');
export const setGfxChoice = (v) => store.set(v);
export function startQuality() {
  const c = gfxChoice();
  return c === 'auto' ? { level: matchMedia('(pointer: coarse)').matches ? 'medium' : 'high', fixed: false } : { level: c, fixed: true };
}
// Watches the frame rate: slow for a while → one step down; fine for longer →
// one step back up (a level that proved too slow is tried again ever later).
export class FrameWatch {
  constructor(level, onStep) { this.level = level; this.top = level; this.onStep = onStep; this.holdUp = 30000; this.reset(5000); }
  reset(warm, now = performance.now()) { this.n = 0; this.slow = 0; this.warm = now + warm; this.goodSince = 0; }
  frame(now, hidden = document.hidden) {
    if (hidden || now < this.warm) { this.n = 0; this.t0 = now; this.slow = 0; return; }
    if (!this.n) this.t0 = now;
    this.n++;
    if (now - this.t0 < 2500) return;
    const fps = ((this.n - 1) * 1000) / (now - this.t0);
    this.n = 0;
    const at = STEPS.indexOf(this.level);
    this.slow = fps < 30 ? this.slow + 1 : 0;
    if (fps < 50) this.goodSince = 0; else this.goodSince = this.goodSince || now;
    if (this.slow >= 3 && STEPS[at + 1]) { this.step(STEPS[at + 1], now); this.holdUp = Math.min(this.holdUp * 2, 600000); } else if (this.goodSince && now - this.goodSince > this.holdUp && at > STEPS.indexOf(this.top)) this.step(STEPS[at - 1], now);
  }
  step(level, now) { this.level = level; this.reset(4000, now); this.onStep(level); }
}
