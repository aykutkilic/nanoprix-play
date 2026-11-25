// What shows something on the dashboard: the dials, the little display between them, and the navigation's screen.
import * as THREE from './vendor/three.module.min.js';
import { KMH } from '../shared/units.js';
const PI = Math.PI, V = (x, y, z) => new THREE.Vector3(x, y, z), FONT = '"Avenir Next Condensed", "Arial Narrow", Arial, sans-serif';
// how the dials look: face, figures, the red of the last stretch, needle, glow at night
const LOOK = {
  plain: { face: '#101418', rim: '#8c9399', ink: '#eef2f4', dim: '#7d878e', red: '#ff4433', hand: '#ff5a2c', glow: '#bfe6ff' }, classic: { face: '#efe3c4', rim: '#d8c48e', ink: '#2a211a', dim: '#7a6a54', red: '#a82718', hand: '#b01f14', glow: '#ffdf9a' },
  sport: { face: '#0b0b0d', rim: '#c8202a', ink: '#ffffff', dim: '#8d8d92', red: '#ff3030', hand: '#ff2a2a', glow: '#ffd0c8' },
};
const glow = { value: 0.2 }; // (how much the dials light themselves)
export const setGlow = (night, under) => { glow.value = 0.5 + 0.45 * Math.max(Math.min(1, night), under ? 0.9 : 0); };
const face = (map) => { const m = new THREE.MeshStandardMaterial({ map, roughness: 0.55, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.2, envMapIntensity: 0.4 }); return m; };
const A0 = 225, SWEEP = 270, ang = (f) => ((A0 - SWEEP * f) * PI) / 180;
function dial(g, x, y, r, look, { max, step, minor, unit, from, small = 0.17 }) {
  const L = LOOK[look]; g.save(); g.translate(x, y); g.fillStyle = L.rim; g.beginPath(); g.arc(0, 0, r * 1.03, 0, 7); g.fill(); g.fillStyle = '#05070a'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); const q = g.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r); q.addColorStop(0, L.face); q.addColorStop(1, look === 'classic' ? '#d9c99f' : '#07090b'); g.fillStyle = q; g.beginPath(); g.arc(0, 0, r * 0.975, 0, 7); g.fill();
  if (from !== undefined) { g.strokeStyle = L.red; g.lineWidth = r * 0.05; g.beginPath(); g.arc(0, 0, r * 0.9, -ang(from / max), -ang(1)); g.stroke(); }
  for (let v = 0; v <= max + 1e-6; v += minor) { const a = ang(v / max), big = Math.abs(v / step - Math.round(v / step)) < 1e-6, c = Math.cos(a), s = -Math.sin(a); g.strokeStyle = from !== undefined && v >= from ? L.red : big ? L.ink : L.dim; g.lineWidth = r * (big ? 0.028 : 0.014); g.beginPath(); g.moveTo(c * r * 0.93, s * r * 0.93); g.lineTo(c * r * (big ? 0.8 : 0.86), s * r * (big ? 0.8 : 0.86)); g.stroke(); if (big) { g.fillStyle = L.ink; g.font = `700 ${Math.round(r * small)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(Math.round(v)), c * r * 0.65, s * r * 0.65); } }
  g.fillStyle = L.dim; g.font = `600 ${Math.round(r * 0.13)}px ${FONT}`; g.textAlign = 'center'; g.fillText(unit, 0, r * 0.36); g.restore();
}
// rpm as a share of the dial, and the gear, from how fast it goes
const GEARS = [0, 4, 7, 10, 13, 16, 24];
export function gearOf(v) { const a = Math.abs(v); if (v < -0.2) return ['R', 0.15 + Math.min(0.5, a * 0.1)]; if (a < 0.4) return ['N', 0.1]; let k = 1; while (k < 6 && a >= GEARS[k]) k++; const lo = GEARS[k - 1], hi = GEARS[k]; return [String(k), k === 1 ? 0.12 + (a / hi) * 0.62 : 0.34 + ((a - lo) / (hi - lo)) * 0.42]; }
// the cluster: 2 dials and a display. w × h in units; its front is +z, +x to the driver's right
export class Cluster {
  constructor(w, h, look = 'plain') {
    const W = 1024, H = Math.round((1024 * h) / w), cv = document.createElement('canvas'), g = cv.getContext('2d'), L = LOOK[look]; cv.width = W; cv.height = H; this.look = look; g.fillStyle = look === 'classic' ? '#3a2616' : '#0a0c0e'; g.fillRect(0, 0, W, H); const r = H * 0.45, xl = W * 0.23, xr = W * 0.77, y = H * 0.5; dial(g, xl, y, r, look, { max: 8, step: 1, minor: 0.5, unit: '×1000/min', from: 6.5, small: 0.2 }); dial(g, xr, y, r, look, { max: 240, step: 40, minor: 10, unit: 'km/h' });
    for (const [x, c, s] of [[0.415, '#2fd07a', '◀'], [0.585, '#2fd07a', '▶']]) { g.fillStyle = c; g.globalAlpha = 0.35; g.font = `${Math.round(H * 0.09)}px Arial`; g.textAlign = 'center'; g.fillText(s, W * x, H * 0.12); g.globalAlpha = 1; }
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; this.m = face(tx); this.m.emissive.set(L.glow); this.g = new THREE.Group(); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.m); this.g.add(p); this.tx = tx;
    const hand = (x) => { const o = new THREE.Group(), len = (r / W) * w * 0.82, n = new THREE.Mesh(new THREE.BufferGeometry(), this.hm ||= new THREE.MeshStandardMaterial({ color: L.hand, emissive: L.hand, emissiveIntensity: 0.4, roughness: 0.5 })); n.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-len * 0.18, -0.0011, 0, len, -0.0003, 0, len, 0.0003, 0, -len * 0.18, -0.0011, 0, len, 0.0003, 0, -len * 0.18, 0.0011, 0], 3)); n.geometry.computeVertexNormals(); const b = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.13, len * 0.15, 0.0022, 20).rotateX(PI / 2), this.bm ||= new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.4 })); b.position.z = 0.0008; n.position.z = 0.0012; o.add(n, b); o.position.set((x / W - 0.5) * w, 0, 0.0008); this.g.add(o); return o; }; this.rpm = hand(xl); this.kmh = hand(xr);
    const c2 = (this.cv = document.createElement('canvas')); c2.width = 192; c2.height = 256; this.x = c2.getContext('2d'); this.t2 = new THREE.CanvasTexture(c2); this.t2.colorSpace = THREE.SRGBColorSpace; this.m2 = face(this.t2); const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.15, w * 0.2), this.m2); s.position.set(0, 0, 0.0006); this.g.add(s); this.was = ''; this.a = this.b = 0; this.g.traverse((o) => { o.frustumCulled = false; });
  }
  update(dt, v, d, now) {
    const [gear, r] = gearOf(v), k = Math.min(1, dt * 9); this.a += (Math.min(1, r * (d.gas > 0.1 ? 1.06 : 0.94)) - this.a) * k; this.b += (Math.min(1, (Math.abs(v) * KMH) / 240) - this.b) * k; this.rpm.rotation.z = ang(this.a); this.kmh.rotation.z = ang(this.b); this.m.emissiveIntensity = this.look === 'classic' ? glow.value * 0.4 : glow.value * 0.9; this.hm.emissiveIntensity = 0.25 + glow.value; this.m2.emissiveIntensity = 0.45 + glow.value * 0.5;
    const key = `${gear}|${d.auto ? 1 : 0}|${Math.round((d.turbo || 0) * 20)}|${d.limit || 0}|${d.boost ? 1 : 0}|${Math.abs(v) * KMH > (d.limit || 999) + 5 ? 1 : 0}`; if (key === this.was || now - (this.at || 0) < 90) return; this.was = key; this.at = now; const g = this.x; g.fillStyle = '#05080b'; g.fillRect(0, 0, 192, 256); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2f6f8'; g.font = `800 96px ${FONT}`; g.fillText(gear, d.limit ? 58 : 96, 66);
    if (d.limit) { const over = Math.abs(v) * KMH > d.limit + 5; g.fillStyle = over ? '#ffc9c9' : '#fff'; g.beginPath(); g.arc(140, 64, 42, 0, 7); g.fill(); g.strokeStyle = '#d0161f'; g.lineWidth = 11; g.beginPath(); g.arc(140, 64, 37, 0, 7); g.stroke(); g.fillStyle = '#111'; g.font = `800 34px ${FONT}`; g.fillText(String(d.limit), 140, 66); }
    g.font = `800 25px ${FONT}`; if (d.auto) { g.fillStyle = '#1f9d5a'; g.beginPath(); g.roundRect(16, 128, 160, 42, 10); g.fill(); g.fillStyle = '#fff'; g.fillText('AUTO', 96, 150); } g.fillStyle = '#8fa0ab'; g.font = `700 19px ${FONT}`; g.fillText('TURBO', 96, 198); g.fillStyle = '#1d242a'; g.fillRect(16, 214, 160, 18); g.fillStyle = d.boost ? '#fff0a0' : '#ffb53a'; g.fillRect(16, 214, 160 * (d.turbo || 0), 18); this.t2.needsUpdate = true;
  }
}
// the navigation's screen: the little map (hud.js draws it), the next turn, the road one is on
export class NavScreen {
  constructor(w, h) { this.w = 576; this.h = Math.round((576 * h) / w); const cv = (this.cv = document.createElement('canvas')); cv.width = this.w; cv.height = this.h; this.x = cv.getContext('2d'); this.tx = new THREE.CanvasTexture(cv); this.tx.colorSpace = THREE.SRGBColorSpace; this.tx.anisotropy = 4; this.mat = new THREE.MeshBasicMaterial({ map: this.tx, fog: false }); this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat); this.mesh.frustumCulled = false; this.at = 0; }
  // hud: draws the map; d: as the HUD's
  draw(hud, d, now) {
    if (now - this.at < 66) return; this.at = now; const g = this.x, W = this.w, H = this.h, n = d.way, top = n ? 78 : 0, bot = 54; g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip(); hud.mapAt(g, W / 2, top + (H - top - bot) * 0.62, W * 0.75, d, (d.zoom || 1.15) * 1.25); g.restore();
    const cut = (t, w) => { let s = String(t || ''); if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(`${s}…`).width > w) s = s.slice(0, -1); return `${s}…`; }; g.textBaseline = 'middle';
    if (n) { g.fillStyle = '#0a2f55'; g.fillRect(0, 0, W, top); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 62px Arial'; g.fillText(n.arrow, 48, top / 2 + 2); g.textAlign = 'left'; g.font = `800 42px ${FONT}`; g.fillText(n.dist, 100, top / 2 + 1); const x = 112 + g.measureText(n.dist).width; g.font = `600 31px ${FONT}`; g.fillText(cut(n.name, W - x - 12), x, top / 2 + 2); }
    g.fillStyle = 'rgba(8,12,16,.9)'; g.fillRect(0, H - bot, W, bot); g.fillStyle = '#fff'; g.textAlign = 'left'; const r = n ? n.left : d.clock || ''; g.font = `700 29px ${FONT}`; const rw = r ? g.measureText(r).width + 26 : 0; g.font = `700 31px ${FONT}`; g.fillText(cut(d.roadName, W - rw - 32), 16, H - bot / 2 + 1); if (r) { g.textAlign = 'right'; g.font = `700 29px ${FONT}`; g.fillStyle = n ? '#7ee2a8' : '#ffd98a'; g.fillText(r, W - 14, H - bot / 2 + 1); } this.tx.needsUpdate = true;
  }
  bright(night, under) { const k = 0.82 - 0.3 * Math.max(Math.min(1, night), under ? 0.6 : 0); this.mat.color.setRGB(k, k, k); }
}
