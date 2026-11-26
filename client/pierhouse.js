// The great piers' houses (client/ships.js puts them): two floors, the waiting hall below and, above, behind glass, what the
// city keeps there – at Eminönü and Karaköy an İstanbul Kitapçısı with its café, at Beşiktaş the İBB pier library and a café
// (as OpenStreetMap has them there); a terrace over the water; the name in letters on the roof. Kadıköy's own house is a
// landmark, which only gets its sign.
import * as THREE from './vendor/three.module.min.js';
import { kit, box, cyl, hip } from './squares.js';

export const UPSTAIRS = { Eminönü: 'kitap', Karaköy: 'kitap', Beşiktaş: 'kutup', Bostancı: 'adalar', 'Bostancı Deniz Otobüsü': 'ido' }; // (Bostancı's: the Şehir Hatları pier for the Islands, a café above; İDO's sea-bus terminal, its lounge above)
const SIGN = { kitap: ['İSTANBUL KİTAPÇISI · KAFE', '#b3122b'], kutup: ['İBB İSKELE KÜTÜPHANESİ · KAFE', '#0b4ea2'], adalar: ['BOSTANCI · ADALAR İSKELESİ · KAFE', '#123a66'], ido: ['İDO · BOSTANCI DENİZ OTOBÜSÜ', '#0a4f9c'] };
export const HOUSE = { W: 2.6, D: 1.3, F: 0.56, U: 0.52 }; // how wide (along the shore), deep (towards the water: +z), high the hall below, high the floor above
// the house itself, from the ground: cream walls, the glass of the hall below, a white band between the floors, corner piers above, a cornice, a tiled hip roof, the terrace on the water's side
export function houseGeometry() {
  const { W, D, F, U } = HOUSE, y1 = F + 0.06, y2 = y1 + U, cream = '#efe6d2', white = '#f7f4ec', glass = '#33505e', L = [];
  L.push([box(W + 0.24, 0.9, D + 0.9, 0, -0.45, 0.18), '#8d8a84']); // (its deck, where it stands over the water)
  L.push([box(W, F, D, 0, F / 2, 0), cream]); for (const s of [1, -1]) { L.push([box(W - 0.3, F * 0.62, 0.02, 0, F * 0.5, s * (D / 2 + 0.006)), glass, 0.5]); L.push([box(0.5, F * 0.82, 0.03, 0, F * 0.41, s * (D / 2 + 0.012)), '#2a3238']); }
  L.push([box(W + 0.06, 0.06, D + 0.06, 0, F + 0.03, 0), white]); L.push([box(W - 0.06, U, D - 0.06, 0, y1 + U / 2, 0), '#3a2f28']);
  for (const x of [-1, 1]) for (const z of [-1, 1]) L.push([box(0.08, U, 0.08, (x * (W - 0.08)) / 2, y1 + U / 2, (z * (D - 0.08)) / 2), cream]);
  L.push([box(W + 0.1, 0.07, D + 0.1, 0, y2 + 0.035, 0), white]); L.push([hip(W + 0.22, D + 0.22, 0.34, 0, y2 + 0.07, 0, W * 0.45), '#9c3f2a']);
  // the terrace over the water, its rail, tables and chairs
  const tz = D / 2 + 0.2; L.push([box(W * 0.8, 0.04, 0.4, 0, F + 0.04, tz), white]); L.push([box(W * 0.8, 0.02, 0.02, 0, F + 0.27, tz + 0.19), '#2d3135']); for (let k = 0; k <= 8; k++) L.push([box(0.012, 0.23, 0.012, -W * 0.4 + (W * 0.8 * k) / 8, F + 0.17, tz + 0.19), '#2d3135']); for (const sx of [-1, 1]) L.push([box(0.02, 0.23, 0.4, sx * W * 0.4, F + 0.17, tz), '#2d3135']);
  for (const x of [-0.75, -0.25, 0.25, 0.75]) { L.push([cyl(0.012, 0.012, 0.13, x, F + 0.06, tz - 0.02), '#2d3135']); L.push([cyl(0.075, 0.075, 0.012, x, F + 0.19, tz - 0.02, 14), '#f2efe8']); for (const s of [-1, 1]) L.push([box(0.06, 0.1, 0.06, x + s * 0.11, F + 0.11, tz - 0.02), '#7a4a2c']); }
  return kit(L);
}
// the floor above, seen through its glass: shelves of books, the counter, tables and who sits at them, lamps; by night lit
function upstairs(kind, side) {
  const cv = document.createElement('canvas'); cv.width = side ? 512 : 1024; cv.height = 192; const g = cv.getContext('2d'), Wd = cv.width;
  const wall = g.createLinearGradient(0, 0, 0, 192); wall.addColorStop(0, '#f3dfb8'); wall.addColorStop(1, '#c9a77a'); g.fillStyle = wall; g.fillRect(0, 0, Wd, 192);
  const R = (() => { let s = (kind === 'kitap' ? 7 : 11) + (side ? 3 : 0); return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); })(), SP = ['#8c1f2d', '#1c3f94', '#2f8f5b', '#e0b21b', '#5c3a52', '#d6d2c8', '#b46a2c', '#16181c', '#3f6e8c', '#c8242a'];
  // the shelves, along the back
  const books = kind === 'kitap' || kind === 'kutup', shelfTo = !books ? 0 : side ? Wd : Wd * (kind === 'kutup' ? 0.62 : 0.48); for (let x = 12; x < shelfTo - 40; x += 118) { g.fillStyle = '#5a3a22'; g.fillRect(x, 26, 108, 150); for (let r = 0; r < 4; r++) { const y = 34 + r * 36; g.fillStyle = '#3b2616'; g.fillRect(x + 4, y + 28, 100, 5); for (let bx = x + 6; bx < x + 100; ) { const w = 4 + R() * 7, h = 18 + R() * 9; g.fillStyle = SP[Math.floor(R() * SP.length)]; g.fillRect(bx, y + 28 - h, w, h); bx += w + 1; } } }
  if (!side) { // the counter, tables and people at them
    const c0 = shelfTo + 20; g.fillStyle = '#2d2420'; g.fillRect(c0, 118, 150, 58); g.fillStyle = '#e9e2d4'; g.fillRect(c0, 112, 150, 8); g.fillStyle = '#b9b2a4'; g.fillRect(c0 + 20, 92, 34, 20);
    for (let k = 0; k < 4; k++) { const x = c0 + 200 + k * 92; if (x > Wd - 60) break; g.fillStyle = '#f2efe8'; g.beginPath(); g.ellipse(x, 140, 30, 7, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3a3a3a'; g.fillRect(x - 2, 140, 4, 36); for (const s of [-1, 1]) if (R() < 0.75) { const px = x + s * 34, col = SP[Math.floor(R() * SP.length)]; g.fillStyle = col; g.beginPath(); g.ellipse(px, 128, 13, 22, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#d8a47c'; g.beginPath(); g.arc(px, 98, 10, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a211a'; g.beginPath(); g.arc(px, 94, 10, Math.PI, Math.PI * 2); g.fill(); } }
  }
  // lamps, the glass's frames and its sheen
  for (let x = 60; x < Wd; x += 150) { g.fillStyle = '#2b2b2b'; g.fillRect(x, 0, 2, 22); g.fillStyle = '#ffd88a'; g.beginPath(); g.arc(x + 1, 24, 7, 0, Math.PI); g.fill(); }
  const sh = g.createLinearGradient(0, 0, Wd, 192); sh.addColorStop(0, 'rgba(255,255,255,0.20)'); sh.addColorStop(0.45, 'rgba(255,255,255,0.02)'); sh.addColorStop(0.55, 'rgba(255,255,255,0.12)'); sh.addColorStop(1, 'rgba(255,255,255,0.0)'); g.fillStyle = sh; g.fillRect(0, 0, Wd, 192);
  g.fillStyle = '#e8e4da'; for (let x = 0; x <= Wd; x += 128) g.fillRect(Math.min(Wd - 6, x - 3), 0, 6, 192); g.fillRect(0, 0, Wd, 5); g.fillRect(0, 187, Wd, 5); g.fillRect(0, 150, Wd, 4);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
}
function signTexture(kind) { const [t, c] = SIGN[kind], cv = document.createElement('canvas'); cv.width = 1024; cv.height = 96; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 1024, 96); g.fillStyle = '#fff'; g.fillRect(6, 6, 1012, 4); g.fillRect(6, 86, 1012, 4); g.font = '800 54px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 512, 50, 990); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; return tx; }
// the glass of the floor above and the sign over it, for one house of a kind: a group to put at its place
const made = {};
export function houseDress(kind, W) {
  const { W: w, D, F, U } = HOUSE, y1 = F + 0.06, M = (made[kind] ||= (() => { const m = (tx) => { const o = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.25, metalness: 0.05, emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 0.06 }); W.glow.push([o, 0.75]); return o; }; return { long: m(upstairs(kind, false)), side: m(upstairs(kind, true)), sign: m(signTexture(kind)) }; })());
  const g = new THREE.Group(), plane = (mat, pw, ph, x, y, z, yaw) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat); o.position.set(x, y, z); o.rotation.y = yaw; o.receiveShadow = true; g.add(o); return o; };
  plane(M.long, w - 0.16, U - 0.02, 0, y1 + U / 2, D / 2 - 0.025, 0); plane(M.long, w - 0.16, U - 0.02, 0, y1 + U / 2, -D / 2 + 0.025, Math.PI); plane(M.side, D - 0.16, U - 0.02, w / 2 - 0.025, y1 + U / 2, 0, Math.PI / 2); plane(M.side, D - 0.16, U - 0.02, -w / 2 + 0.025, y1 + U / 2, 0, -Math.PI / 2);
  for (const s of [1, -1]) plane(M.sign, w * 0.78, 0.15, 0, y1 + U + 0.2, s * (D / 2 + 0.06), s > 0 ? 0 : Math.PI);
  return g;
}
// a sign on another house (Kadıköy's): flat on its face, at a height
export function signOn(kind, W, x, y, z, yaw, w = 1.9) { const M = (made[kind] ||= null) || (houseDress(kind, W), made[kind]), o = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.094), M.sign); o.position.set(x, y, z); o.rotation.y = yaw; return o; }
