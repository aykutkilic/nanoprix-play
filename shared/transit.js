// The Marmaray and the metrobüs by the clock: where each train and each bus is
// depends on the time alone, so everybody sees the same and nothing is sent.
// Both go round a closed way: out on one side, about at the end, back on the other.
export const BUS = { lat: -0.52, v: 8.2, a: 2.2, dwell: 5, n: 44, parts: [0.82, -0.84], len: 3.3, r: 0.34 }; // (they keep to the left in their own lanes: the doors are on the right, the platform is between them)
export const TRAIN = { lat: 0.42, v: 11, a: 1.5, dwell: 8, n: 14, cars: 6, pitch: 2.72, len: 2.6 };
const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
class Line {
  constructor(d) {
    Object.assign(this, { id: d.id, kind: d.kind, name: d.name, own: d.own || 0, stops: d.stops }); const K = (this.K = d.kind === 'bus' ? BUS : TRAIN), n = (this.n = d.p.length / 3), p = (this.p = Float32Array.from(d.p)), st = (this.st = Uint8Array.from(d.st, (c) => +c));
    const s = (this.s = new Float32Array(n)); for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2]); this.len = s[n - 1];
    // the closed way
    const X = [], Y = [], Z = [], S = [], f = new Float64Array(n), b = new Float64Array(n), dir = (i) => { const a = Math.max(0, i - 1) * 3, c = Math.min(n - 1, i + 1) * 3, x = p[c] - p[a], z = p[c + 1] - p[a + 1], l = Math.hypot(x, z) || 1; return [x / l, z / l]; }, put = (x, y, z, h) => { X.push(x); Y.push(y); Z.push(z); S.push(h); };
    const wide = (i) => { const e = Math.min(s[i], this.len - s[i]); return K.lat + (Math.sign(K.lat) * 1.15 - K.lat) * (d.kind === 'bus' ? 1 - ease(e / 4) : 0); }, side = (i, g) => { const [dx, dz] = dir(i), o = wide(i) * g; return [p[i * 3] - dz * o, p[i * 3 + 2], p[i * 3 + 1] + dx * o]; };
    const turn = (i, g) => { const [dx, dz] = dir(i), o = Math.abs(wide(i)); for (let k = 1; k < 10; k++) { const a = (k / 10) * Math.PI, u = Math.cos(a) * wide(i) * g, v = Math.sin(a) * o * g; put(p[i * 3] - dz * u + dx * v, p[i * 3 + 2], p[i * 3 + 1] + dx * u + dz * v, st[i]); } };
    for (let i = 0; i < n; i++) { f[i] = X.length; put(...side(i, 1), st[i]); } turn(n - 1, 1); for (let i = n - 1; i >= 0; i--) { b[i] = X.length; put(...side(i, -1), st[i]); } turn(0, -1);
    const m = (this.m = X.length); this.X = Float32Array.from(X); this.Y = Float32Array.from(Y); this.Z = Float32Array.from(Z); this.S = Uint8Array.from(S); const L = (this.L = new Float64Array(m + 1)); for (let k = 0; k < m; k++) { const q = (k + 1) % m; L[k + 1] = L[k] + Math.hypot(X[q] - X[k], Z[q] - Z[k], Y[q] - Y[k]); } this.round = L[m];
    const on = (arr, v) => { let i = 0; while (i < n - 2 && s[i + 1] < v) i++; const t = Math.min(1, (v - s[i]) / Math.max(1e-6, s[i + 1] - s[i])), A = L[arr[i]], B = L[arr[i + 1]]; return A + (B - A) * t; };
    // the timetable: [leaves at, from, how far, arrives at]
    const T = [...d.stops.map((q) => on(f, q.s)), ...d.stops.map((q) => on(b, q.s))].sort((x, y) => x - y); this.legs = []; let t = 0; T.forEach((a, k) => { const c = k + 1 < T.length ? T[k + 1] - a : T[0] + this.round - a, go = c >= (K.v * K.v) / K.a ? c / K.v + K.v / K.a : 2 * Math.sqrt(c / K.a); this.legs.push([t + K.dwell, a, c, t + K.dwell + go, t]); t += K.dwell + go; }); this.period = t;
  }
  // how far along the closed way vehicle k is at time T, and how fast
  where(k, T, out) {
    const P = this.period, t = (((T + (k * P) / this.K.n) % P) + P) % P, Q = this.legs; let lo = 0, hi = Q.length; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Q[m][4] <= t) lo = m; else hi = m; }
    const [go, a, c, , ] = Q[lo], { v, a: acc } = this.K; let x = 0, w = 0; if (t > go) { const e = t - go, full = c >= (v * v) / acc, ta = full ? v / acc : Math.sqrt(c / acc), vm = ta * acc, end = Q[lo][3] - go; if (e < ta) { x = (acc * e * e) / 2; w = acc * e; } else if (e < end - ta) { x = (vm * ta) / 2 + vm * (e - ta); w = vm; } else { const r = end - e; x = c - (acc * r * r) / 2; w = acc * r; } }
    out.l = a + x; out.v = w; out.stop = t <= go; return out;
  }
  // a place on the closed way
  at(l, o) {
    const R = this.round, L = this.L, m = this.m; l = ((l % R) + R) % R; let lo = 0, hi = m; while (hi - lo > 1) { const q = (lo + hi) >> 1; if (L[q] <= l) lo = q; else hi = q; } const j = (lo + 1) % m, t = (l - L[lo]) / Math.max(1e-9, L[lo + 1] - L[lo]);
    o.x = this.X[lo] + (this.X[j] - this.X[lo]) * t; o.y = this.Y[lo] + (this.Y[j] - this.Y[lo]) * t; o.z = this.Z[lo] + (this.Z[j] - this.Z[lo]) * t; o.st = this.S[lo]; return o;
  }
  // the line itself at a distance: [x, y, z, dx, dz, i]
  frame(v) { const { s, p, n } = this; v = Math.min(this.len, Math.max(0, v)); let lo = 0, hi = n - 1; while (hi - lo > 1) { const q = (lo + hi) >> 1; if (s[q] <= v) lo = q; else hi = q; } const t = (v - s[lo]) / Math.max(1e-6, s[lo + 1] - s[lo]), a = Math.max(0, lo - 1) * 3, b = Math.min(n - 1, lo + 2) * 3, dx = p[b] - p[a], dz = p[b + 1] - p[a + 1], l = Math.hypot(dx, dz) || 1, k = lo * 3; return [p[k] + (p[k + 3] - p[k]) * t, p[k + 2] + (p[k + 5] - p[k + 2]) * t, p[k + 1] + (p[k + 4] - p[k + 1]) * t, dx / l, dz / l, lo]; }
}
export class Transit {
  constructor(data) {
    this.lines = data.lines.map((d) => new Line(d)); this.rail = this.lines.find((l) => l.kind === 'rail'); this.bus = this.lines.find((l) => l.kind === 'bus'); this.bodies = []; this.near = []; this.on = true; this.hold = null;
    // what passes overhead, and where the rails lie, by place
    this.cells = new Map(); const add = (x, z, y, w, deck) => { const k = Math.floor(x / 4) * 8192 + Math.floor(z / 4); if (!this.cells.has(k)) this.cells.set(k, []); this.cells.get(k).push([x, z, y, w, deck]); };
    for (const l of this.lines) for (let i = l.own; i < l.n; i++) if (l.st[i] !== 2) add(l.p[i * 3], l.p[i * 3 + 1], l.p[i * 3 + 2], 1.15, l.st[i] === 1);
    for (const q of this.islands = data.islands || []) for (let u = -4; u <= 4; u += 0.5) add(q.x - q.dz * u, q.z + q.dx * u, q.h + 1.6, 0.6, true);
  }
  // is there a deck over (x, z), or the line itself, between heights y0 and y1
  over(x, z, y0, y1, m = 0.3) { const a = Math.floor(x / 4), b = Math.floor(z / 4); for (let i = a - 1; i <= a + 1; i++) for (let j = b - 1; j <= b + 1; j++) for (const q of this.cells.get(i * 8192 + j) || []) if (q[2] > y0 && q[2] - 0.4 < y1 && Math.hypot(q[0] - x, q[1] - z) < q[3] + m) return true; return false; }
  // where the busway opens onto the D100: no kerb there
  mouth(x, z) { const l = this.bus; if (!l) return false; for (let i = l.own; i < Math.min(l.n, l.own + 9); i++) if (Math.hypot(l.p[i * 3] - x, l.p[i * 3 + 1] - z) < 1.05) return true; return false; }
  // (at the start of a race the buses keep away from the grid: `hold`, a place)
  held(x, z) { const h = this.hold; return !!h && Math.hypot(h.x - x, h.z - z) < 34; }
  // the buses about a place at time T, as things to run into
  about(x, z, T, reach = 9) {
    const L = this.bus; this.near.length = 0; if (!L || !this.on) return this.near; const w = {}, o = {}, e = {};
    for (let k = 0; k < BUS.n; k++) { L.where(k, T, w); L.at(w.l, o); if (Math.abs(o.x - x) > reach || Math.abs(o.z - z) > reach || this.held(o.x, o.z)) continue; const B = (this.bodies[k] ||= [1.25, 0.42, -0.42, -1.25].map(() => ({ mass: 6, type: 'taksi' }))); [1.25, 0.42, -0.42, -1.25].forEach((d, i) => { const q = B[i]; L.at(w.l + d, o); L.at(w.l + d + 0.2, e); const dx = e.x - o.x, dz = e.z - o.z, l = Math.hypot(dx, dz) || 1; q.x = o.x; q.y = o.y; q.z = o.z; q.yaw = Math.atan2(dx, dz); q.vx = (dx / l) * w.v; q.vz = (dz / l) * w.v; this.near.push(q); }); }
    return this.near;
  }
}
