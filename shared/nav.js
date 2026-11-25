// Finding an address and the way to it. The search looks through assets/places.json (tools/places.mjs), the
// way goes over the game's own roads: to the point of them nearest to what was asked for.
const flat = (s) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
// as people write it: cad. → caddesi, no:5 → 5 …
const SHORT = { cad: 'caddesi', cd: 'caddesi', cadde: 'caddesi', sok: 'sokak', sk: 'sokak', sokagi: 'sokak', blv: 'bulvari', bul: 'bulvari', bulv: 'bulvari', mah: 'mahallesi', mh: 'mahallesi', no: '', numara: '', apt: '', street: '', st: '' };
export const words = (s) => flat(s).replace(/[^a-z0-9/]+/g, ' ').trim().split(' ').map((w) => (w in SHORT ? SHORT[w] : w)).filter(Boolean);
export class Places {
  constructor(d) { this.d = d; const A = d.areas.map((a) => words(a)); this.list = []; for (const [n, a, x, z, no, more] of d.s) this.list.push({ name: n, area: d.areas[a], w: words(n), aw: more ? [...A[a], ...more.flatMap((m) => A[m])] : A[a], x, z, no, kind: -1 }); for (const [n, k, a, x, z, more] of d.p) this.list.push({ name: n, area: d.areas[a], w: words(n), aw: more === undefined ? A[a] : [...A[a], ...A[more]], x, z, kind: k }); }
  // best first; near: a place, for equals
  find(text, near = null, many = 8) {
    const q = words(text); if (!q.length || q.join('').length < 2) return []; const out = [];
    for (const e of this.list) {
      let sc = 0, ok = true, inName = 0, no = null; for (const t of q) {
        let s = 0; for (const w of e.w) { if (w === t) { s = 3; break; } if (w.startsWith(t) && t.length > 1) s = Math.max(s, 2); } if (s) inName++; else if (e.kind < 0 && /^\d/.test(t) && no === null) { no = t; s = 0.6; } else for (const w of e.aw) if (w === t) { s = 1.6; break; } else if (w.startsWith(t) && t.length > 2) s = Math.max(s, 1.1); if (!s && t === 'mahallesi') s = 0.2; if (!s) { ok = false; break; } sc += s;
      }
      if (!ok || !inName) continue; if (no !== null) { const L = e.no || [], want = parseInt(no, 10); let b = 99; for (let i = 0; i < L.length; i += 3) b = Math.min(b, String(L[i]).toLowerCase() === no ? 0 : Math.abs(parseInt(L[i], 10) - want) + 0.5 || 99); sc += b === 0 ? 1.5 : b < 3 ? 1.1 : b < 12 ? 0.7 : b < 40 ? 0.3 : 0; } sc -= (e.w.length - inName) * 0.5; if (e.kind === 0) sc += 1.1; else if (e.kind === 1 || e.kind === 5) sc += 0.5; else if (e.kind < 0) sc += 0.35; if (near) sc -= Math.min(1.2, Math.hypot(e.x - near.x, e.z - near.z) / 1200); out.push({ e, sc, no });
    }
    out.sort((a, b) => b.sc - a.sc); const res = []; for (const { e, no } of out) { let x = e.x, z = e.z, num = '', about = false; if (no !== null) { const L = e.no || [], want = parseInt(no, 10); let b = null; for (let i = 0; i < L.length; i += 3) { const v = String(L[i]).toLowerCase(), d = v === no ? 0 : Math.abs(parseInt(v, 10) - want) + 0.5; if (Number.isFinite(d) && (!b || d < b.d)) b = { d, i }; } if (b && b.d < 60) { x = L[b.i + 1]; z = L[b.i + 2]; about = b.d > 0; num = String(L[b.i]); } else about = true; } if (res.some((r) => r.name === e.name && r.area === e.area && r.no === num && Math.hypot(r.x - x, r.z - z) < 30)) continue; res.push({ name: e.name, area: e.area, kind: e.kind, x, z, no: num, asked: no, about }); if (res.length >= many) break; }
    return res;
  }
}
// ---------------------------------------------------------------- the way
const QUICK = { motorway: 1.7, avenue: 1.15, shore: 1.2, street: 0.95, lane: 0.9 };
// the point of the roads nearest to (x, z): on a bridge or in a tunnel only if there is none else about
export function nearestRoad(net, x, z, want = null) { let b = null; for (const r of net.roads) for (let i = 0; i + 1 < r.n; i++) { if (r.tunnel && r.tunnel[i] === 2) continue; const ax = r.p[i * 3], az = r.p[i * 3 + 1]; if (b && (Math.abs(ax - x) > b.d + 3 || Math.abs(az - z) > b.d + 3)) continue; const dx = r.p[i * 3 + 3] - ax, dz = r.p[i * 3 + 4] - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))), d = Math.hypot(ax + dx * t - x, az + dz * t - z) + (r.bridge[i] ? 6 : 0) + (r.style === 'motorway' ? 4 : 0) + (want && r !== want ? 0 : 0); if (!b || d < b.d) b = { d, r, i, s: r.s[i] + (r.s[i + 1] - r.s[i]) * t, x: ax + dx * t, z: az + dz * t, y: r.p[i * 3 + 2] }; } if (b) b.off = Math.hypot(b.x - x, b.z - z); return b; }
export class Way {
  // from { r, s, dir } to { r, s }
  static find(net, from, to) {
    net.sides(); const cuts = new Map(), cut = (r, s, id) => { if (!cuts.has(r)) cuts.set(r, []); cuts.get(r).push([s, id]); };
    for (const r of net.main) { cut(r, 0, r.a); cut(r, r.len, r.b); } for (const r of net.spurs) { cut(r, 0, `j${r.index}`); cut(r, r.len, `e${r.index}`); const j = net.joint.get(r); if (j) cut(j.r, j.s, `j${r.index}`); } cut(to.r, to.s, 'TO'); cut(from.r, from.s, 'FROM');
    const adj = new Map(), link = (a, b, r, s0, s1, w) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, r, s0, s1, w }); };
    for (const [r, L] of cuts) { L.sort((a, b) => a[0] - b[0]); const q = QUICK[r.style] || 0.8; for (let k = 0; k + 1 < L.length; k++) { const w = (L[k + 1][0] - L[k][0]) / q + (r.spur ? 2 : 0); link(L[k][1], L[k + 1][1], r, L[k][0], L[k + 1][0], w); link(L[k + 1][1], L[k][1], r, L[k + 1][0], L[k][0], w); } }
    // (a heap by arrays; turning about where one stands costs a little)
    const best = new Map([['FROM', 0]]), via = new Map(), H = [[0, 'FROM']], pop = () => { let m = 0; for (let k = 1; k < H.length; k++) if (H[k][0] < H[m][0]) m = k; const v = H[m]; H[m] = H[H.length - 1]; H.pop(); return v; };
    while (H.length) { const [c, u] = pop(); if (u === 'TO') break; if (c > best.get(u) + 1e-9) continue; for (const e of adj.get(u) || []) { let w = e.w; if (u === 'FROM' && Math.sign(e.s1 - e.s0) !== from.dir) w += 30; const p = via.get(u); if (p && p.r === e.r && Math.sign(p.s1 - p.s0) !== Math.sign(e.s1 - e.s0)) w += 40; else if (p && p.r !== e.r) w += 1.5; if (c + w < (best.get(e.to) ?? 1e12)) { best.set(e.to, c + w); via.set(e.to, { ...e, from: u }); H.push([c + w, e.to]); } } }
    if (!via.has('TO') && from.r !== to.r) return null; const legs = []; for (let u = 'TO'; u !== 'FROM';) { const v = via.get(u); if (!v) return null; legs.unshift(v); u = v.from; }
    const seg = []; for (const l of legs) { if (Math.abs(l.s1 - l.s0) < 0.02 && legs.length > 1) continue; /* (a side street at a junction: no way between) */ const d = Math.sign(l.s1 - l.s0) || 1, L = seg[seg.length - 1]; if (L && L.r === l.r && L.dir === d) L.s1 = l.s1; else seg.push({ r: l.r, dir: d, s0: l.s0, s1: l.s1 }); }
    return new Way(net, seg, to);
  }
  constructor(net, seg, to) { this.net = net; this.seg = seg; this.to = to; this.k = 0; let L = 0; for (const s of seg) { s.at = L; L += Math.abs(s.s1 - s.s0); } this.len = L; this.left = L; this.points = this.line(); this.off = 0; }
  line() { const P = []; for (const { r, s0, s1, dir } of this.seg) { const put = (s) => { let lo = 0, hi = r.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.s[m] <= s) lo = m; else hi = m; } const t = (s - r.s[lo]) / Math.max(1e-6, r.s[lo + 1] - r.s[lo]), a = lo * 3; P.push([r.p[a] + (r.p[a + 3] - r.p[a]) * t, r.p[a + 1] + (r.p[a + 4] - r.p[a + 1]) * t]); }; put(s0); for (let i = dir > 0 ? 0 : r.n - 1; i >= 0 && i < r.n; i += dir) if ((r.s[i] - s0) * dir > 0.3 && (s1 - r.s[i]) * dir > 0.3) put(r.s[i]); put(s1); } return P; }
  // where one is on it now; false: off the way
  follow(x, z, y, dt) {
    let b = null; for (let k = Math.max(0, this.k - 1); k < Math.min(this.seg.length, this.k + 3); k++) { const g = this.seg[k], r = g.r, lo = Math.min(g.s0, g.s1) - 3, hi = Math.max(g.s0, g.s1) + 3; for (let i = 0; i + 1 < r.n; i++) { if (r.s[i + 1] < lo || r.s[i] > hi) continue; const ax = r.p[i * 3], az = r.p[i * 3 + 1]; if (Math.abs(ax - x) > 9 || Math.abs(az - z) > 9 || Math.abs(r.p[i * 3 + 2] - y) > 2.5) continue; const dx = r.p[i * 3 + 3] - ax, dz = r.p[i * 3 + 4] - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))), d = Math.hypot(ax + dx * t - x, az + dz * t - z) + (k === this.k ? -0.4 : k < this.k ? 0.8 : 0); if (!b || d < b.d) b = { d, k, s: r.s[i] + (r.s[i + 1] - r.s[i]) * t }; } }
    if (!b || b.d > 5) { this.off += dt; return this.off < 2; } this.off = 0; this.k = b.k; const g = this.seg[b.k]; this.s = b.s; this.left = Math.max(0, this.len - g.at - Math.max(0, (b.s - g.s0) * g.dir)); return true;
  }
  // the next change of road: { r, a: how sharp, right +, d: how far }
  get next() { for (let k = this.k; k + 1 < this.seg.length; k++) { const g = this.seg[k], n = this.seg[k + 1], dir = (r, s, d) => { const i = Math.max(1, Math.min(r.n - 2, r.s.findIndex((v) => v >= s))); const A = Math.max(0, Math.min(r.n - 1, i - 4 * d)), B = Math.max(0, Math.min(r.n - 1, i + 4 * d)); return [A, B, i]; }, d = (k === this.k ? Math.max(0, (g.s1 - (this.s ?? g.s0)) * g.dir) : g.at + Math.abs(g.s1 - g.s0) - (this.len - this.left)); const e1 = dir(g.r, g.s1, g.dir), e2 = dir(n.r, n.s0, n.dir), P = g.r.p, Q = n.r.p, a1 = Math.atan2(P[e1[2] * 3] - P[e1[0] * 3], P[e1[2] * 3 + 1] - P[e1[0] * 3 + 1]), a2 = Math.atan2(Q[e2[1] * 3] - Q[e2[2] * 3], Q[e2[1] * 3 + 1] - Q[e2[2] * 3 + 1]), a = Math.atan2(Math.sin(a1 - a2), Math.cos(a1 - a2)); if (g.r === n.r || Math.abs(a) > 0.45 || n.r.name !== g.r.name) return { r: n.r, a: g.r === n.r ? Math.PI : a, d, k: k + 1 }; } return null; }
  // a place on it, d on from here (to be put back on it)
  spot(d, lane) { let k = this.k, s = this.s ?? this.seg[k].s0; for (;;) { const g = this.seg[k], rest = (g.s1 - s) * g.dir; if (d <= rest || k + 1 >= this.seg.length) { const r = g.r, at = Math.max(0.5, Math.min(r.len - 0.5, s + g.dir * Math.min(d, Math.max(0, rest)))); let lo = 0, hi = r.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.s[m] <= at) lo = m; else hi = m; } const a = lo * 3, t = (at - r.s[lo]) / Math.max(1e-6, r.s[lo + 1] - r.s[lo]), dx = (r.p[a + 3] - r.p[a]) * g.dir, dz = (r.p[a + 4] - r.p[a + 1]) * g.dir, l = Math.hypot(dx, dz) || 1, o = lane(r); return { x: r.p[a] + (r.p[a + 3] - r.p[a]) * t - (dz / l) * o, z: r.p[a + 1] + (r.p[a + 4] - r.p[a + 1]) * t + (dx / l) * o, y: r.p[a + 2] + (r.p[a + 5] - r.p[a + 2]) * t, yaw: Math.atan2(dx, dz) }; } d -= Math.max(0, rest); s = this.seg[++k].s0; } }
  // which way along road r one is to go just now (0: r is not where one should be)
  dirOn(r) { for (let k = this.k; k < Math.min(this.seg.length, this.k + 2); k++) { const g = this.seg[k]; if (g.r !== r) continue; if (k === this.k && this.s !== undefined && this.seg[k + 1] && this.seg[k + 1].r === r && (g.s1 - this.s) * g.dir < 2) return this.seg[k + 1].dir; return g.dir; } return 0; }
  // what cruise control is to take after road r in direction dir
  after(r, dir) { for (let k = this.k; k < Math.min(this.seg.length, this.k + 3); k++) { const g = this.seg[k]; if (g.r === r && g.dir === dir) return this.seg[k + 1] || null; } return null; }
}
