// The mirrors of what one drives: the way behind, drawn once, small and every few frames, as seen by a camera at the tail
// that looks back; each mirror shows its part of it, the other way round.
import * as THREE from './vendor/three.module.min.js';
const W = 704, H = 216, HALF = Math.tan((50 * Math.PI) / 180); // (50° to either side)
const FS = 'uniform sampler2D map; uniform float uOn; varying vec2 vUv; void main() { vec3 c = texture2D(map, vUv).rgb * vec3(0.9, 0.94, 0.95); gl_FragColor = vec4(mix(vec3(0.05, 0.065, 0.075), c, uOn), 1.0); }';
export class Mirror {
  constructor() { this.cam = new THREE.PerspectiveCamera(2 * Math.atan(HALF / (W / H)) * (180 / Math.PI), W / H, 0.12, 170); this.mat = new THREE.ShaderMaterial({ uniforms: { map: { value: null }, uOn: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: FS, toneMapped: false }); this.n = 0; }
  // a glass w × h that shows what is u ± du to the side (the tangent; left −, right +), vertically v ± as fits. Its front is +z
  glass(w, h, u, du, v = 0, tilt = 1) { const dv = (du * h) / w, g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv; for (let i = 0; i < 4; i++) { const a = u + (uv.getX(i) * 2 - 1) * du, b = v + (uv.getY(i) * 2 - 1) * dv * tilt; uv.setXY(i, 0.5 - a / HALF / 2, 0.5 + (b / (HALF / (W / H))) / 2); } const o = new THREE.Mesh(g, this.mat); o.frustumCulled = false; return o; }
  target(post) {
    if (this.rt && this.post === post) return this.rt; this.dispose(); this.post = post; this.rt = new THREE.WebGLRenderTarget(W, H, { type: post ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: post ? 2 : 0 });
    if (!post) { this.rt.isXRRenderTarget = true; this.rt.texture.colorSpace = THREE.SRGBColorSpace; } // (as on the screen itself: no second set of shaders)
    this.mat.uniforms.map.value = this.rt.texture; this.mat.uniforms.uOn.value = 0; return this.rt;
  }
  dispose() { if (this.rt) this.rt.dispose(); this.rt = null; this.mat.uniforms.map.value = null; this.mat.uniforms.uOn.value = 0; }
  // from: where the tail's camera is (a Vector3), q: the car's turn; hide: what is not to be seen
  render(view, every) {
    if (!this.on || this.n++ % every) return; const r = view.renderer, rt = this.target(!!view.quality.post), c = this.cam, was = r.getRenderTarget(), auto = r.shadowMap.autoUpdate, vis = this.hide.map((o) => o.visible), sky = view.sky.position.clone();
    c.position.copy(this.at); c.quaternion.copy(this.q); c.far = Math.min(170, view.far); c.updateProjectionMatrix(); c.updateMatrixWorld(); view.sky.position.copy(c.position); for (const o of this.hide) o.visible = false; r.shadowMap.autoUpdate = false;
    try { r.setRenderTarget(rt); r.clear(); r.render(view.scene, c); this.mat.uniforms.uOn.value = 1; } finally { r.setRenderTarget(was); r.shadowMap.autoUpdate = auto; this.hide.forEach((o, i) => { o.visible = vis[i]; }); view.sky.position.copy(sky); }
  }
}
