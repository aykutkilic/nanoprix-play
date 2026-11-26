// What a hall below shows of its line, and who uses it (client/under.js makes the hall): on the walls the line's map, with
// what one can change to at each station, and the timetable on a poster; over each platform a board counting down to the
// next trains, and one that says where to change; and people – who come down and wait, get on when a train stands with its
// doors open, get off and go up.
import * as THREE from './vendor/three.module.min.js';
import { hm } from '../shared/clock.js';
import { hallFoot, OVER, overAt } from '../shared/entries.js';

const key = (n) => (n || '').toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '');
const SHIP = '#123a66', NAMES = { '⛴': 'Vapur', B1: 'Marmaray', 34: 'Metrobüs' };
// ---------------------------------------------------------------- what one can change to, at each station of a line
// other lines whose station is near (or has its name), the metrobüs, the ferries: [{ ref, color }] for each of l.stops
export function transfers(TR, ports, l) {
  const all = []; for (const m of TR.lines) { if (m === l || m.kind === 'bus' || !m.frame) continue; for (const q of m.stops) { const f = m.frame(q.s); all.push({ ref: m.kind === 'mbus' ? '34' : m.ref || m.name, color: m.color || '#555', x: f[0], z: f[2], n: key(q.name), r: m.kind === 'mbus' ? 32 : 25 }); } }
  for (const p of ports || []) all.push({ ref: '⛴', color: SHIP, x: p.x, z: p.z, n: key(p.name), r: 32 });
  return l.stops.map((q) => { const f = l.frame(q.s), n = key(q.name), out = new Map(); for (const o of all) { const d = Math.hypot(o.x - f[0], o.z - f[2]); if (o.ref !== l.ref && (d < o.r || (d < 45 && o.n && (o.n.startsWith(n.slice(0, 6)) || n.startsWith(o.n.slice(0, 6)))))) out.set(o.ref, o); } return [...out.values()].sort((a, b) => (a.ref === '⛴') - (b.ref === '⛴') || a.ref.localeCompare(b.ref)); });
}
const badge = (g, x, y, ref, color, h = 26) => { g.font = `800 ${Math.round(h * 0.68)}px "Arial Narrow", Arial, sans-serif`; const w = Math.max(h * 1.25, g.measureText(ref).width + h * 0.55); g.fillStyle = color; g.beginPath(); g.roundRect(x, y, w, h, h * 0.22); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ref, x + w / 2, y + h / 2 + 1); return w; };
// ---------------------------------------------------------------- the sheets on the walls, one row of each for every hall
// the line's map: its stations evenly along a bar of its colour, this one marked, what one can change to over each
export function drawRoute(g, Y, W, H, l, i, tr) {
  const n = l.stops.length, x0 = 70, x1 = W - 70, xs = (k) => x0 + ((x1 - x0) * k) / Math.max(1, n - 1), C = l.color || '#1c4f9c', bar = Y + 104;
  g.fillStyle = '#f5f4f0'; g.fillRect(0, Y, W, H); g.fillStyle = C; g.fillRect(0, Y, W, 8);
  let x = 24; x += badge(g, x, Y + 18, l.ref || 'B1', C, 34) + 14; g.fillStyle = '#1b1d21'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '700 26px "Arial Narrow", Arial, sans-serif'; g.fillText(`${l.stops[0].name}  ⟷  ${l.stops[n - 1].name}`, x, Y + 36);
  g.textAlign = 'right'; g.font = '700 24px "Arial Narrow", Arial, sans-serif'; g.fillText(`Buradasınız · You are here: ${l.stops[i].name}`, W - 24, Y + 36);
  g.fillStyle = C; g.fillRect(x0, bar - 7, x1 - x0, 14);
  for (let k = 0; k < n; k++) { const X = xs(k), me = k === i; g.beginPath(); g.arc(X, bar, me ? 15 : 10, 0, Math.PI * 2); g.fillStyle = me ? C : '#fff'; g.fill(); g.lineWidth = me ? 6 : 5; g.strokeStyle = me ? '#1b1d21' : C; g.stroke();
    // what one can change to, over it
    const T = tr[k] || []; if (T.length) { let w = 0; g.font = '800 14px "Arial Narrow", Arial, sans-serif'; const ws = T.map((t) => Math.max(26, g.measureText(t.ref).width + 12)); w = ws.reduce((a, b) => a + b + 3, -3); let bx = X - w / 2; T.forEach((t, j) => { badge(g, bx, bar - 44, t.ref, t.color, 20); bx += ws[j] + 3; }); }
    // its name, slanting down
    g.save(); g.translate(X + 4, bar + 20); g.rotate(0.55); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = me ? '#000' : '#30333a'; g.font = `${me ? 800 : 700} ${me ? 28 : 24}px "Arial Narrow", Arial, sans-serif`; g.fillText(l.stops[k].name, 0, 0, 250); g.restore(); }
}
// the timetable of what leaves from one platform (direction d): first and last on each kind of day, and how often
export function drawPoster(g, X, Y, W, H, l, i, d) {
  const C = l.color || '#1c4f9c', pats = l.pats.filter((p) => p.d === d && p.stops.indexOf(i) >= 0 && p.stops.indexOf(i) < p.stops.length - 1);
  g.fillStyle = '#fbfaf6'; g.fillRect(X, Y, W, H); g.strokeStyle = '#2a2d33'; g.lineWidth = 6; g.strokeRect(X + 3, Y + 3, W - 6, H - 6); g.fillStyle = C; g.fillRect(X + 6, Y + 6, W - 12, 52);
  let x = X + 16; x += badge(g, x, Y + 16, l.ref || 'B1', '#1b1d21', 32) + 12; g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '800 26px "Arial Narrow", Arial, sans-serif'; g.fillText('Sefer Saatleri · Timetable', x, Y + 33);
  g.fillStyle = '#1b1d21'; g.font = '800 26px "Arial Narrow", Arial, sans-serif'; const to = [...new Set(pats.map((p) => p.to))].slice(0, 2).join(' · ');
  if (!pats.length) { g.textAlign = 'center'; g.fillText('Bu perondan sefer yok', X + W / 2, Y + H / 2 - 12); g.font = '600 20px "Arial Narrow", Arial, sans-serif'; g.fillText('No departures from this platform', X + W / 2, Y + H / 2 + 18); return; }
  g.fillText(`→ ${to}`, X + 18, Y + 82, W - 36);
  const times = (t) => { const o = []; for (const p of pats) { const off = p.off[p.stops.indexOf(i) + p.pre]; for (const s of p.dep[t] || []) { const c = (s + off) % 86400; o.push(c < 5 * 3600 ? c + 86400 : c); } } return o.sort((a, b) => a - b); } /* (a timetable's day runs from five in the morning to five the next) */, night = (L) => L.filter((c) => c > 86400 + 1.5 * 3600).length > 2, gap = (L, a, b) => { const s = L.filter((t) => t % 86400 >= a * 3600 && t % 86400 < b * 3600), G = s.slice(1).map((t, k) => t - s[k]).sort((p, q) => p - q); return G.length ? Math.max(1, Math.round(G[G.length >> 1] / 60)) : null; };
  g.font = '700 19px "Arial Narrow", Arial, sans-serif'; g.fillStyle = '#5a5d63'; g.fillText('İlk · First', X + 190, Y + 118); g.fillText('Son · Last', X + 290, Y + 118); g.fillText('Sıklık · Every', X + 390, Y + 118);
  [['Hafta içi', 0], ['Cumartesi', 1], ['Pazar', 2]].forEach(([name, t], r) => { const L = times(t), y = Y + 152 + r * 40; g.fillStyle = r % 2 ? '#fbfaf6' : '#eeece6'; g.fillRect(X + 10, y - 18, W - 20, 36); g.fillStyle = '#1b1d21'; g.font = '700 21px "Arial Narrow", Arial, sans-serif'; g.fillText(name, X + 20, y); if (!L.length) { g.fillText('—', X + 190, y); return; } g.font = '800 22px "Arial Narrow", Arial, sans-serif'; g.fillText(hm(L[0]), X + 190, y); g.fillText(hm(L[L.length - 1]), X + 290, y); const a = gap(L, 7, 9.5), b = gap(L, 11, 15); g.font = '700 20px "Arial Narrow", Arial, sans-serif'; g.fillText(a ? `${a}${b && b !== a ? `–${b}` : ''} dk` : b ? `${b} dk` : '—', X + 390, y); });
  g.font = '600 15px "Arial Narrow", Arial, sans-serif'; g.fillStyle = '#5a5d63'; g.fillText('Metro İstanbul · İBB Açık Veri', X + 18, Y + H - 22); if (night(times(1)) || night(times(2))) { g.fillStyle = '#1b1d21'; g.font = '700 17px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'right'; g.fillText('☾ Cuma, Cumartesi gece seferleri · Night service', X + W - 18, Y + H - 22); }
}
// where to change, over the platform: yellow on black
export function drawChange(g, Y, W, H, T) {
  g.fillStyle = '#17191c'; g.fillRect(0, Y, W, H); g.fillStyle = '#ffb21c'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '800 30px "Arial Narrow", Arial, sans-serif'; g.fillText('⇄ Aktarma', 14, Y + H / 2 + 1); let x = 168; for (const t of T.slice(0, 5)) { const w = badge(g, x, Y + H / 2 - 17, t.ref, t.color, 34); x += w + 6; if (NAMES[t.ref] && T.length <= 3) { g.fillStyle = '#ffb21c'; g.font = '700 22px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'left'; g.fillText(NAMES[t.ref], x, Y + H / 2 + 1); x += g.measureText(NAMES[t.ref]).width + 12; } }
}
// ---------------------------------------------------------------- the people below
// one figure as tall as who walks there, in five parts drawn for all at once: coat (and arms), head, hair, and two legs
export const figure = (() => { let G = null; return () => (G ||= { coat: new THREE.CapsuleGeometry(0.058, 0.13, 3, 8).scale(1.18, 1, 0.74).translate(0, 0.34, 0), arms: null, head: new THREE.SphereGeometry(0.05, 10, 8).translate(0, 0.475, 0), hair: new THREE.SphereGeometry(0.053, 10, 6, 0, Math.PI * 2, 0, 1.25).translate(0, 0.482, -0.006), leg: new THREE.CapsuleGeometry(0.026, 0.17, 3, 6).translate(0, -0.11, 0) }); })();
export const COATS = ['#2d3440', '#7c2430', '#35597c', '#c9b48a', '#4c5a3a', '#8a8f96', '#d6d2c8', '#5c3a52', '#b46a2c', '#1d1f24', '#a8323a', '#3f6e8c'].map((c) => new THREE.Color(c)), SKIN = ['#e9c39f', '#d8a47c', '#b57a52', '#f0d2b4', '#8d5a3c'].map((c) => new THREE.Color(c)), HAIR = ['#1b1612', '#3a2a1e', '#6b4a2e', '#c9c3b8', '#2a2a2a', '#8a5a2a'].map((c) => new THREE.Color(c)), LEGS = ['#22252b', '#2f3b52', '#3d3a36', '#53504a', '#1b1d22'].map((c) => new THREE.Color(c));
const MAX = 56, WALK = 0.62, LANE = 1.15;
export class HallLife {
  // g: the hall's group; l: its line; halls: its stations below; at(frame, u, y): a place in a hall; HALL: its sizes; TR: the transit; ports: the ferries'
  constructor(g, l, halls, at, HALL, TR, ports, mids = null) {
    Object.assign(this, { g, l, at, HALL, TR }); this.halls = halls; this.tr = transfers(TR, ports, l); this.q = null; this.people = []; this.stand = { 1: null, '-1': null }; this.seed = 1;
    const F = figure(), m = new THREE.MeshStandardMaterial({ roughness: 0.82 }), mk = (geo) => { const o = new THREE.InstancedMesh(geo, m, MAX); o.count = 0; o.frustumCulled = false; o.castShadow = false; g.add(o); return o; };
    this.mesh = { coat: mk(F.coat), head: mk(F.head), hair: mk(F.hair), legL: mk(F.leg), legR: mk(F.leg) }; this.mat = m;
    // a board over each platform of each hall, counting down: its own canvas, drawn again for the hall one is in
    this.boards = halls.map((q, k) => { const o = {}, vm = mids ? mids[k] : 0; for (const sd of [1, -1]) { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; const mat = new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide, fog: false }), pos = [], uv = [], idx = []; for (const flip of [1, -1]) { const f = l.frame(q.s + vm + flip * 0.012), c = at(f, sd * 1.38, 1.5), n = pos.length / 3, rx = f[4] * flip, rz = -f[3] * flip; for (const [e, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { pos.push(c[0] + e * 0.56 * rx, c[1] + v * 0.14, c[2] + e * 0.56 * rz); uv.push((e + 1) / 2, (v + 1) / 2); } idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); const me = new THREE.Mesh(geo, mat); me.frustumCulled = false; g.add(me); o[sd] = { cv, tx, mat }; this.led(o[sd], q, sd, null); } return o; });
  }
  R() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  // what the board says: where the next two go, and in how many minutes (D: departures; null: only where they go)
  led(b, q, sd, D) {
    const g = b.cv.getContext('2d'), to = [...new Set(this.l.pats.filter((p) => p.d === sd).map((p) => p.to))][0] || '', rows = D ? D.slice(0, 2).map((d) => [d.p.to, d.in]) : to ? [[to, null]] : [];
    g.fillStyle = '#0c0d0f'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#22252a'; g.fillRect(0, 63, 512, 2); g.textBaseline = 'middle';
    if (!rows.length) { g.fillStyle = '#ffb21c'; g.font = '700 30px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.fillText('Bu perondan sefer yok', 256, 64, 490); }
    rows.forEach(([t, s], r) => { const y = 33 + r * 63; g.fillStyle = '#ffb21c'; g.textAlign = 'left'; g.font = `800 ${r ? 30 : 36}px "Arial Narrow", Arial, sans-serif`; g.fillText(`→ ${t}`, 14, y, 340); if (s !== null) { g.textAlign = 'right'; const m = Math.round(s / 60); g.fillText(s < 40 ? 'Geliyor' : `${m} dk`, 498, y); } });
    b.tx.needsUpdate = true;
  }
  // which of the line's halls is nearest the eye (where it is not in one, none)
  nearest(cam) { let b = null, bd = 1e9; for (const q of this.halls) { const f = this.l.frame(q.s), d = Math.hypot(f[0] - cam.x, f[2] - cam.z) + Math.abs(f[1] - cam.y) * 2; if (d < bd) { bd = d; b = q; } } return bd < 16 ? b : null; }
  // a place on the platform of side sd, v along the hall from its middle and u across (its sign the side's)
  P(v, u) { const f = this.l.frame(this.q.s + v), p = this.at(f, u, this.HALL.Y); return { x: p[0], y: p[1], z: p[2], f }; }
  ok(v, u) { const q = this.q, p = this.P(v, u), h = hallFoot(this.l, q.s, q.entry, p.x, p.z, p.y); return h !== null && Math.abs(h - p.y) < 0.06; }
  // where one comes down to a platform and goes up from it: the door (if it is on this side), the foot of the footbridge's stairs
  gates(sd) { const q = this.q, out = [], vb = overAt(q.entry, q.s, this.l), k = vb > 0 ? -1 : 1, foot = [vb + k * (OVER.D + OVER.RUN + 0.12), sd * 1.7]; if (this.ok(...foot)) out.push(foot); if (q.entry && q.entry.sd === sd) { const d = [q.entry.s - q.s, sd * (this.HALL.W - 0.14)]; if (this.ok(...d)) out.push(d); } if (!out.length) out.push([0, sd * 1.7]); return out; }
  spot(sd) { const vb = overAt(this.q.entry, this.q.s, this.l), k = vb > 0 ? -1 : 1; for (let t = 0; t < 30; t++) { const v = (this.R() * 2 - 1) * 6.4, u = sd * (1.02 + this.R() * 0.62); if (Math.sign(v - vb) === k && Math.abs(v - vb) < OVER.D + OVER.RUN + 0.3 && Math.abs(u) > OVER.U - 0.1) continue; if (this.ok(v, u)) return [v, u]; } return [0, sd * 1.2]; }
  // a walk along the lane by the platform's edge (clear of the footbridge's stairs), then to where one goes
  path(a, b, sd) { return [[a[0], sd * LANE], [b[0], sd * LANE], b]; }
  add(sd, at, go, then) { if (this.people.length >= MAX) return null; const k = this.people.length + Math.floor(this.R() * 997), o = { sd, v: at[0], u: at[1], go: go || [], then, wait: 0, hv: 0, hu: -sd, ph: this.R() * 6, coat: COATS[k % COATS.length], skin: SKIN[(k * 7) % SKIN.length], hair: HAIR[(k * 3) % HAIR.length], legs: LEGS[(k * 5) % LEGS.length], v0: 0.85 + this.R() * 0.3 }; this.people.push(o); return o; }
  // the hall one has come to: people already waiting on each platform from which trains leave
  begin(q) { this.q = q; this.people.length = 0; this.stand = { 1: null, '-1': null }; this.seed = Math.floor(q.s * 977) >>> 0 || 1; this.next = { 1: 0, '-1': 0 }; for (const sd of [1, -1]) { if (!this.leaves(sd)) continue; const n = 3 + Math.floor(this.R() * 5); for (let k = 0; k < n; k++) this.add(sd, this.spot(sd), [], 'wait'); } }
  leaves(sd) { const i = this.l.stops.indexOf(this.q); return this.l.pats.some((p) => p.d === sd && p.stops.indexOf(i) >= 0 && p.stops.indexOf(i) < p.stops.length - 1); }
  frame(dt, T, cam) {
    dt = Math.min(0.1, Math.max(0, dt)); const q = this.nearest(cam); if (q !== this.q) { if (q) this.begin(q); else { this.q = null; this.people.length = 0; } }
    const now = performance.now(); if (q && now - (this.ledAt || 0) > 1000) { this.ledAt = now; const pl = this.TR.places().filter((p) => p.way === this.l && Math.abs(p.s - q.s) < 1), calls = pl.flatMap((p) => p.calls); for (const sd of [1, -1]) this.led(this.boards[this.halls.indexOf(q)][sd], q, sd, this.TR.departures(calls.filter(([p]) => p.d === sd), T, 2, 2)); }
    if (!q) { this.draw(); return; }
    // the trains standing here with their doors open, on either side
    const i = this.l.stops.indexOf(q), seen = { 1: null, '-1': null }, f0 = this.l.frame(q.s);
    this.TR.each(f0[0], f0[2], T, 14, (p, run, w, o) => { if (!w.stop || p.stopOf(w.k) !== i) return; const v = (o.x - f0[0]) * f0[3] + (o.z - f0[2]) * f0[4]; seen[p.d] = { id: `${p.ref}${p.d}${run}`, v, first: i === p.stops[0], last: i === p.stops[p.stops.length - 1], left: w.left || 0, K: p.way.K }; }, (W) => W === this.l);
    for (const sd of [1, -1]) { const s = seen[sd], was = this.stand[sd];
      if (s && (!was || was.id !== s.id)) { // (it has come: who gets off, and who gets on)
        const K = s.K, C = K.cars || 1, doors = []; for (let c = 0; c < C; c++) { const vc = s.v + ((C - 1) / 2 - c) * (K.pitch || 2); for (const e of C > 1 ? [-0.24, 0.24] : [0]) { const v = vc + e * (K.pitch || 2); if (Math.abs(v) < this.HALL.L - 0.6) doors.push(v); } } s.doors = doors.length ? doors : [s.v];
        if (!s.first) { const n = 2 + Math.floor(this.R() * (C > 2 ? 6 : 3)), G = this.gates(sd); for (let k = 0; k < n; k++) { const d = s.doors[Math.floor(this.R() * s.doors.length)], g = G[Math.floor(this.R() * G.length)], o = this.add(sd, [d, sd * (this.HALL.E + 0.12)], this.path([d, 0], g, sd), 'gone'); if (o) o.wait = 0.4 + k * 0.45 + this.R() * 0.4; } }
        s.boardAt = s.first ? 0.3 : 2.2; s.t = 0; this.stand[sd] = s; }
      if (s && this.stand[sd]) { const S = this.stand[sd]; S.t += dt; S.left = s.left; if (!S.last && S.t > S.boardAt && !S.called) { S.called = true; for (const o of this.people) if (o.sd === sd && o.then === 'wait' && !o.go.length) { const d = S.doors.reduce((b, v) => (Math.abs(v - o.v) < Math.abs(b - o.v) ? v : b), S.doors[0]); o.go = [[o.v, sd * LANE], [d, sd * LANE], [d, sd * (this.HALL.E + 0.1)]]; o.then = 'in'; o.wait = this.R() * 0.8; } } }
      if (!s && was) { this.stand[sd] = null; for (const o of this.people) if (o.sd === sd && o.then === 'in') { o.then = 'wait'; o.go = this.path([o.v, o.u], this.spot(sd), sd); } } // (it has gone without them)
      // who comes down to wait
      if (this.leaves(sd) && (this.next[sd] -= dt) <= 0) { this.next[sd] = 2.5 + this.R() * 5; if (this.people.filter((o) => o.sd === sd && (o.then === 'wait' || o.then === 'in')).length < 10) { const G = this.gates(sd), g = G[Math.floor(this.R() * G.length)]; this.add(sd, g, this.path(g, this.spot(sd), sd), 'wait'); } } }
    // on they go
    for (const o of this.people) { if (o.wait > 0) { o.wait -= dt; continue; } const t = o.go[0]; if (!t) { o.walk = false; o.hv = 0; o.hu = -o.sd; continue; } /* (waiting, facing the rails) */ const dv = t[0] - o.v, du = t[1] - o.u, d = Math.hypot(dv, du), step = WALK * o.v0 * dt; o.walk = true; o.ph += step * 26; if (d <= step) { o.v = t[0]; o.u = t[1]; o.go.shift(); if (!o.go.length && (o.then === 'gone' || (o.then === 'in' && this.stand[o.sd]))) o.dead = true; continue; } o.v += (dv / d) * step; o.u += (du / d) * step; o.hv = dv / d; o.hu = du / d; }
    if (this.people.some((o) => o.dead)) this.people = this.people.filter((o) => !o.dead);
    this.draw();
  }
  draw() {
    const M = this.mesh, B = new THREE.Matrix4(), L = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0); let n = 0;
    if (this.q) for (const o of this.people) { const p = this.P(o.v, o.u), f = p.f, sw = o.walk ? Math.sin(o.ph) * 0.55 : 0, bob = o.walk ? Math.abs(Math.cos(o.ph)) * 0.008 : Math.sin(o.ph + performance.now() / 900) * 0.002;
      // (facing: along the hall the line's way f[3], f[4]; across it, towards u, -f[4], f[3])
      const yaw = Math.atan2(o.hv * f[3] - o.hu * f[4], o.hv * f[4] + o.hu * f[3]); B.compose(P.set(p.x, p.y + bob, p.z), Q.setFromAxisAngle(UP, yaw), S); M.coat.setMatrixAt(n, B); M.head.setMatrixAt(n, B); M.hair.setMatrixAt(n, B); M.coat.setColorAt(n, o.coat); M.head.setColorAt(n, o.skin); M.hair.setColorAt(n, o.hair);
      for (const [m, x, s] of [[M.legL, 0.032, sw], [M.legR, -0.032, -sw]]) { L.compose(P.set(x, 0.25, 0), Q.setFromEuler(E.set(s, 0, 0)), S); m.setMatrixAt(n, B.clone().multiply(L)); m.setColorAt(n, o.legs); } n++; }
    for (const m of Object.values(M)) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  dispose() { for (const m of Object.values(this.mesh)) m.dispose(); this.mat.dispose(); for (const o of this.boards) for (const sd of [1, -1]) { o[sd].tx.dispose(); o[sd].mat.dispose(); } }
}
