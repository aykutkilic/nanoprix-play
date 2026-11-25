// The mirrors of what one drives: the way behind, drawn once, small and every few frames, as seen by a camera at the tail
// that looks back; each glass shows its part of it, the other way round. The glasses bulge: towards their rim they look
// further round, so things in them are small and bent, the door mirrors' outer part the most.
import * as THREE from './vendor/three.module.min.js';
const SIZE = { high: [1152, 360], medium: [960, 300], low: [704, 220] }, SIDE = 52, HALF = Math.tan((SIDE * Math.PI) / 180), RAD = Math.PI / 180; // (SIDE°: as far round as it sees)
const VS = 'attribute vec2 aP; varying vec2 vUv, vP; void main() { vUv = uv; vP = aP; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FS = `uniform sampler2D map; uniform float uOn, uRound, uLine; uniform vec2 uSize; varying vec2 vUv, vP;
void main() {
  vec3 c = mix(vec3(0.05, 0.065, 0.075), texture2D(map, vUv).rgb * vec3(0.9, 0.94, 0.95), uOn);
  float r2 = dot(vP, vP); c *= 1.0 - 0.1 * r2; // (seen at a slant towards the rim)
  vec2 q = abs(vP) * uSize, k = q - uSize + uRound; float e = uRound > 0.0 ? length(max(k, 0.0)) + min(max(k.x, k.y), 0.0) - uRound : (sqrt(r2) - 1.0) * uSize.x, w = fwidth(e); // (the edge: ground to a bevel, rounded off)
  c = mix(c, c * 1.35 + 0.03, (1.0 - smoothstep(0.0, w * 1.5, abs(e + 0.0016) - 0.0005)) * 0.6);
  if (uLine != 0.0) c *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, fwidth(vP.x) * 1.2, abs(vP.x - uLine))) * step(0.45, fract(vP.y * 13.0));
  c = mix(c, vec3(0.006), smoothstep(-w, 0.0, e)); gl_FragColor = vec4(c, 1.0);
}`;
export class Mirror {
  constructor() { this.cam = new THREE.PerspectiveCamera(40, 3.2, 0.12, 300); this.map = { value: null }; this.uOn = { value: 0 }; this.n = 0; }
  // a glass w × h whose middle looks `out`° to the side (left −, right +) and `up`°, and its rims `half`° further; aspheric: the outer
  // third bends more; its front is +z
  glass(w, h, out, half, { up = 0, round = 0.006, aspheric = false, disc = false, bulge = 0.04 } = {}) {
    const g = disc ? new THREE.CircleGeometry(1, 40, 0).toNonIndexed() : new THREE.PlaneGeometry(2, 2, 28, 18); if (disc) { const r = new THREE.RingGeometry(0, 1, 36, 10); g.copy(r); } const p = g.attributes.position, uv = g.attributes.uv, P = new Float32Array(p.count * 2), V = HALF / this.aspect(), s = Math.sign(out) || 1;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), o = Math.max(0, x * s - 0.34), a = (out + half * (x * (1 + 0.16 * x * x) + (aspheric ? s * o * o * 0.85 : 0))) * RAD, b = (up + half * (h / w) * y * (1 + 0.16 * y * y + 0.12 * x * x)) * RAD, A = Math.max(-SIDE * RAD, Math.min(SIDE * RAD, a));
      uv.setXY(i, 0.5 - Math.tan(A) / HALF / 2, Math.max(0.002, Math.min(0.998, 0.5 + Math.tan(b) / Math.cos(A) / V / 2))); P[i * 2] = x; P[i * 2 + 1] = y; p.setXYZ(i, (x * w) / 2, (y * h) / 2, bulge * w * 0.5 * (1 - x * x * 0.6 - y * y * 0.4));
    }
    g.setAttribute('aP', new THREE.BufferAttribute(P, 2)); const m = new THREE.ShaderMaterial({ uniforms: { map: this.map, uOn: this.uOn, uRound: { value: disc ? 0 : round }, uLine: { value: aspheric ? s * 0.42 : 0 }, uSize: { value: new THREE.Vector2(w / 2, h / 2) } }, vertexShader: VS, fragmentShader: FS, toneMapped: false }), o = new THREE.Mesh(g, m); o.frustumCulled = false; return o;
  }
  aspect() { return 3.2; }
  target(view) {
    const post = !!view.quality.post, key = `${post}${view.level}`; if (this.rt && this.key === key) return this.rt; this.dispose(); this.key = key; const [W, H] = SIZE[view.level] || SIZE.low; this.rt = new THREE.WebGLRenderTarget(W, H, { type: post ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: post ? 2 : 0 });
    if (!post) { this.rt.isXRRenderTarget = true; this.rt.texture.colorSpace = THREE.SRGBColorSpace; } // (as on the screen itself: no second set of shaders)
    this.map.value = this.rt.texture; this.uOn.value = 0; return this.rt;
  }
  dispose() { if (this.rt) this.rt.dispose(); this.rt = null; this.map.value = null; this.uOn.value = 0; }
  // at: where the tail's camera is, q: the car's turn; hide: what is not to be seen
  render(view, every) {
    if (!this.on || this.n++ % every) return; const r = view.renderer, rt = this.target(view), c = this.cam, was = r.getRenderTarget(), auto = r.shadowMap.autoUpdate, vis = this.hide.map((o) => o.visible), sky = view.sky, at = sky.position.clone(), big = sky.scale.x;
    c.position.copy(this.at); c.quaternion.copy(this.q); c.aspect = this.aspect(); c.fov = (2 * Math.atan(HALF / c.aspect)) / RAD; c.far = Math.min(300, view.far); c.updateProjectionMatrix(); c.updateMatrixWorld(); sky.position.copy(c.position); sky.scale.setScalar(c.far * 0.9); /* (or it would lie beyond what is drawn: a black sky) */ for (const o of this.hide) o.visible = false; r.shadowMap.autoUpdate = false;
    try { r.setRenderTarget(rt); r.clear(); r.render(view.scene, c); this.uOn.value = 1; } finally { r.setRenderTarget(was); r.shadowMap.autoUpdate = auto; this.hide.forEach((o, i) => { o.visible = vis[i]; }); sky.position.copy(at); sky.scale.setScalar(big); }
  }
}
