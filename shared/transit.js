// Trains, trams, the metrobüs and the buses by the clock: where each is depends on the time
// alone (shared/clock.js) and on the timetables (assets/lines.json: tools/lines.mjs), so
// everybody sees the same and nothing is sent.
import { RATE, dayType } from './clock.js';
import { unpackEntry } from './entries.js';
export { RATE };
// lat: how far to the right of the line each way is (the metrobüs keeps to the left: its doors are on the right, the platform is between the ways)
export const KIND = {
  rail: { lat: 0.42, cars: 6, pitch: 2.72, dwell: 30 }, metro: { lat: 0.42, cars: 4, pitch: 2.72, dwell: 25 }, fun: { lat: 0.3, cars: 2, pitch: 1.5, dwell: 30 }, tram: { lat: 0.34, cars: 3, pitch: 1.72, dwell: 22 }, old: { lat: 0.3, cars: 1, pitch: 1.4, dwell: 22 }, mbus: { lat: -0.52, dwell: 13, len: 3.3 }, bus: { lat: 0, dwell: 18, len: 1.7 },
};
export const BUS = { r: 0.34 };
// a shuttle's way: two apart for `loop` either side of its middle, coming together over `ease` beyond that; in its halls
// the platforms from E to X either side of its one way, PY over it, L either side of where a car stands (client/transit.js, trip.js)
export const SHUTTLE = { loop: 4.5, ease: 6, E: 0.33, X: 1.25, PY: 0.2, L: 2.3, lid: 4, W: 0.42, H: 0.95 }; // (lid: how many of its points under ground its mouth is roofed over, the ground being thin there; W, H: its tube, half as wide where it is one way, and how high: tools/lines.mjs lays it at least that far under)
const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }, unpack = (list) => { let l = 0; return Float64Array.from(list, (d) => (l += d)); };
// a way something goes along: points with their distance
class Way {
  lay(X, Y, Z, S, closed) { const m = (this.m = X.length); this.closed = closed; this.X = Float32Array.from(X); this.Y = Float32Array.from(Y); this.Z = Float32Array.from(Z); this.S = Uint8Array.from(S); const L = (this.L = new Float64Array(m + 1)); for (let k = 0; k < m; k++) { const q = closed ? (k + 1) % m : Math.min(m - 1, k + 1); L[k + 1] = L[k] + Math.hypot(X[q] - X[k], Z[q] - Z[k], Y[q] - Y[k]); } this.round = L[m]; let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (let k = 0; k < m; k++) { a = Math.min(a, X[k]); b = Math.max(b, X[k]); c = Math.min(c, Z[k]); d = Math.max(d, Z[k]); } this.box = [a, b, c, d]; }
  // a place on it
  at(l, o) {
    const R = this.round, L = this.L, m = this.m; l = this.closed ? ((l % R) + R) % R : Math.min(R - 1e-6, Math.max(0, l)); let lo = 0, hi = m; while (hi - lo > 1) { const q = (lo + hi) >> 1; if (L[q] <= l) lo = q; else hi = q; } const j = this.closed ? (lo + 1) % m : Math.min(m - 1, lo + 1), t = (l - L[lo]) / Math.max(1e-9, L[lo + 1] - L[lo]);
    o.x = this.X[lo] + (this.X[j] - this.X[lo]) * t; o.y = this.Y[lo] + (this.Y[j] - this.Y[lo]) * t; o.z = this.Z[lo] + (this.Z[j] - this.Z[lo]) * t; o.st = this.S[lo]; return o;
  }
  far(x, z, d) { const b = this.box; return x < b[0] - d || x > b[1] + d || z < b[2] - d || z > b[3] + d; }
}
// a railway, tramway or busway: there on one side, about at the end, back on the other
export class Line extends Way {
  constructor(d) {
    super(); Object.assign(this, { id: d.id, kind: d.kind === 'bus' ? 'mbus' : d.kind, name: d.name || d.ref, ref: d.ref, color: d.color, own: d.own || 0, stops: d.stops, pats: [], ring: !!d.ring }); if (d.id === 't2' || d.id === 't3') this.kind = 'old';
    const K = (this.K = KIND[this.kind]), n = (this.n = d.p.length / 3), p = (this.p = Float32Array.from(d.p)), st = (this.st = Uint8Array.from(d.st, (c) => (c === '3' ? 3 : +c)));
    const s = (this.s = new Float32Array(n)); for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2]); this.len = s[n - 1];
    if (this.kind === 'rail') { let e = 0; for (let i = 0; i < n; i++) { if (st[i] === 2) { e++; } else e = 0; let f = 0; if (st[i] === 2) { let j = i; while (j < n && st[j] === 2 && j - i < 60) { j++; f++; } p[i * 3 + 2] -= Math.min(5, Math.max(0, Math.min(e, f) - 15) * 0.16); } } } // (well down, under the sea)
    const X = [], Y = [], Z = [], S = [], f = new Float64Array(n), b = new Float64Array(n), dir = (i) => { const a = Math.max(0, i - 1) * 3, c = Math.min(n - 1, i + 1) * 3, x = p[c] - p[a], z = p[c + 1] - p[a + 1], l = Math.hypot(x, z) || 1; return [x / l, z / l]; }, put = (x, y, z, h) => { X.push(x); Y.push(y); Z.push(z); S.push(h); };
    this.shuttle = !!d.shuttle; // (Tünel: two cars on one rope, one way but in the middle, where they pass: SHUTTLE)
    const wide = (i) => { if (this.shuttle) return K.lat * this.loop(s[i]); const e = Math.min(s[i], this.len - s[i]); return K.lat + (Math.sign(K.lat) * 1.15 - K.lat) * (this.kind === 'mbus' ? 1 - ease(e / 4) : 0); }, side = (i, g) => { const [dx, dz] = dir(i), o = wide(i) * g; return [p[i * 3] - dz * o, p[i * 3 + 2], p[i * 3 + 1] + dx * o]; };
    const turn = (i, g) => { const [dx, dz] = dir(i), o = Math.abs(wide(i)); for (let k = 1; k < 10; k++) { const a = (k / 10) * Math.PI, u = Math.cos(a) * wide(i) * g, v = Math.sin(a) * o * g; put(p[i * 3] - dz * u + dx * v, p[i * 3 + 2], p[i * 3 + 1] + dx * u + dz * v, st[i]); } };
    for (let i = 0; i < n; i++) { f[i] = X.length; put(...side(i, 1), st[i]); } turn(n - 1, 1); for (let i = n - 1; i >= 0; i--) { b[i] = X.length; put(...side(i, -1), st[i]); } turn(0, -1);
    this.lay(X, Y, Z, S, true); const L = this.L, on = (arr, v) => { let i = 0; while (i < n - 2 && s[i + 1] < v) i++; const t = Math.min(1, (v - s[i]) / Math.max(1e-6, s[i + 1] - s[i])), A = L[arr[i]], B = L[arr[i + 1]]; return A + (B - A) * t; };
    this.alongF = (v) => on(f, v); this.alongB = (v) => on(b, v); this.ends = [L[f[0]], L[f[n - 1]], L[b[n - 1]], L[b[0]]];
  }
  // how far apart its two ways are there, of K.lat: a shuttle's one way parts in the middle and joins again
  loop(v) { const m = this.len / 2; return 1 - ease((Math.abs(v - m) - SHUTTLE.loop) / SHUTTLE.ease); }
  // the line itself at a distance: [x, y, z, dx, dz, i]
  frame(v) { const { s, p, n } = this; v = Math.min(this.len, Math.max(0, v)); let lo = 0, hi = n - 1; while (hi - lo > 1) { const q = (lo + hi) >> 1; if (s[q] <= v) lo = q; else hi = q; } const t = (v - s[lo]) / Math.max(1e-6, s[lo + 1] - s[lo]), a = Math.max(0, lo - 1) * 3, b = Math.min(n - 1, lo + 2) * 3, dx = p[b] - p[a], dz = p[b + 1] - p[a + 1], l = Math.hypot(dx, dz) || 1, k = lo * 3; return [p[k] + (p[k + 3] - p[k]) * t, p[k + 2] + (p[k + 5] - p[k + 2]) * t, p[k + 1] + (p[k + 4] - p[k + 1]) * t, dx / l, dz / l, lo]; }
}
// one way of a bus line: its own line on the road
export class Street extends Way {
  constructor(d, l) { super(); this.kind = 'bus'; this.K = KIND.bus; this.id = `${l.id}${d.d}`; this.ref = l.ref; this.color = l.color; this.stops = d.stops; this.pats = []; const X = [], Y = [], Z = []; let a = 0, b = 0, c = 0; for (let i = 0; i < d.q.length; i += 3) { X.push((a += d.q[i]) / 20); Z.push((b += d.q[i + 1]) / 20); Y.push((c += d.q[i + 2]) / 100); } this.lay(X, Y, Z, X.map(() => 0), false); this.len = this.round; }
  alongF(v) { return v; }
}
// one service: the stops it calls at, when it leaves each after it sets out, and when it sets out, by the day
const LAY = { mbus: 12, bus: 40, tram: 25 }, REST = { mbus: 8, bus: 25, tram: 18 }, PACE = { rail: 0.95, metro: 0.9, fun: 0.4, tram: 0.5, old: 0.3, mbus: 0.9, bus: 0.6 }; // (units a second of the city's, where it comes into the map and leaves it)
export class Service {
  constructor(way, d) {
    this.way = way; this.ref = d.ref || way.ref; this.to = d.to; this.d = d.d; this.src = d.src; this.color = way.color; const K = way.K, q = d.stops && typeof d.stops[0] === 'object' ? d.stops.map((_, k) => k) : d.stops; this.stops = q; const along = (k) => (d.d > 0 ? way.alongF(way.stops[k].s) : way.alongB(way.stops[k].s));
    const A = q.map(along), off = [...d.off]; for (let k = 1; k < A.length; k++) if (A[k] <= A[k - 1]) A[k] = A[k - 1] + 0.1;
    // (what comes from beyond the map comes in at its edge, and goes out there)
    const e = way.ends ? (d.d > 0 ? [way.ends[0], way.ends[1]] : [way.ends[2], way.ends[3]]) : [0, way.len], half = ((K.cars || 1) * (K.pitch || 2)) / 2, v = PACE[way.kind]; this.pre = this.post = 0; this.via = !way.ring; const flat = (n) => (n || '').toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '').slice(0, 6), ends = flat(way.stops[q[q.length - 1]].name) === flat(d.to);
    if (this.via && A[0] - e[0] > half + 5 && d.off[0] > 45) { A.unshift(e[0] + 0.01); off.unshift(off[0] - (A[1] - e[0]) / v - 12); this.pre = 1; } if (this.via && e[1] - A[A.length - 1] > half + 5 && !ends) { A.push(e[1] - 0.01); off.push(off[off.length - 1] + (A[A.length - 1] - A[A.length - 2]) / v + 12); this.post = 1; }
    this.A = Float64Array.from(A); this.off = Float64Array.from(off); this.n = A.length; this.dep = d.dep.map((l) => { const u = unpack(l); if (!d.sec) for (let k = 0; k < u.length; k++) u[k] *= 60; return u; });
    this.t0 = this.off[0] - (this.pre ? 0 : LAY[way.kind] || 45); this.t1 = this.off[this.n - 1] + (this.post ? 0 : REST[way.kind] || 28);
    if (way.shuttle) { let gap = 1e9; for (const D of this.dep) for (let k = 1; k < D.length; k++) gap = Math.min(gap, D[k] - D[k - 1]); const wait = Math.max(10, (gap - (this.off[this.n - 1] - this.off[0])) / 2); this.t0 = this.off[0] - wait; this.t1 = this.off[this.n - 1] + wait; } // (a shuttle's car stands at the end until it goes back: one leaves as the other comes in)
  }
  // the runs under way at time c of the city: fn(how long after setting out, which)
  runs(c, dow, day, fn) {
    if (this.way.shuttle) for (let k = 1; k >= 0; k--) { const D = this.dep[dayType((dow + 7 - k) % 7)], N = this.dep[dayType((dow + 8 - k) % 7)], t = c + k * 86400; if (!D.length) continue; const last = D[D.length - 1]; if (t - last > this.t1 && t < 86400 + (N.length ? N[0] : 0) + this.t0) fn(t - last, (day - k) * 10000 + D.length - 1); } // (and the night through, where the last run left it)
    for (let k = 1; k >= 0; k--) { const D = this.dep[dayType((dow + 7 - k) % 7)], t = c + k * 86400; if (!D.length || t - this.t0 < D[0] || t - this.t1 > D[D.length - 1]) continue; let lo = 0, hi = D.length; const from = t - this.t1; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < from) lo = m + 1; else hi = m; } for (; lo < D.length && D[lo] <= t - this.t0; lo++) fn(t - D[lo], (day - k) * 10000 + lo); }
  }
  // how far along a run is, t seconds (the city's) after it set out; how fast (units a second of ours); does it stand with its doors open, and where
  where(t, o) {
    const { off, A, n } = this; if (t <= off[0]) { o.l = A[0]; o.v = 0; o.k = 0; o.stop = !this.pre; return o; } if (t >= off[n - 1]) { o.l = A[n - 1]; o.v = 0; o.k = n - 1; o.stop = !this.post; return o; }
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (off[m] <= t) lo = m; else hi = m; }
    const D = off[lo + 1] - off[lo], c = A[lo + 1] - A[lo], W = lo + 1 === n - 1 ? 0 : Math.max(4, Math.min(Math.max(7, Math.min(D * 0.34, this.way.K.dwell)), D - c * 0.36)), R = D - W, x = t - off[lo]; o.k = lo + 1;
    if (x >= R) { o.l = A[lo + 1]; o.v = 0; o.stop = true; o.left = off[lo + 1] - t; return o; }
    const a = Math.min(0.3, Math.max(0.02, 6 / R)), u = x / R, a0 = lo === 0 && this.pre ? 0 : a, a1 = lo + 1 === n - 1 && this.post ? 0 : a, V = 1 / (1 - (a0 + a1) / 2), f = u < a0 ? (V * u * u) / (2 * a0) : u > 1 - a1 ? 1 - (V * (1 - u) * (1 - u)) / (2 * a1) : V * (u - a0 / 2), g = u < a0 ? (V * u) / a0 : u > 1 - a1 ? (V * (1 - u)) / a1 : V; // (off, along, and to a stand)
    o.l = A[lo] + c * Math.min(1, Math.max(0, f)); o.v = ((c * g) / R) * RATE; o.stop = false; o.left = 0; return o;
  }
  // the stop of the way it is at or bound for (its place among way.stops)
  stopOf(k) { const q = k - this.pre; return q >= 0 && q < this.stops.length ? this.stops[q] : -1; }
  // when it leaves its q-th stop next, after time c: [[seconds from now, which], …]
  next(q, c, dow, day, many = 2) { const out = [], o = this.off[q + this.pre]; for (let k = 1; k >= -1 && out.length < many; k--) { const D = this.dep[dayType((dow + 7 - k) % 7)], t = c + k * 86400; let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] + o < t) lo = m + 1; else hi = m; } for (; lo < D.length && out.length < many; lo++) out.push([D[lo] + o - t, (day - k) * 10000 + lo]); } return out; }
}
export class Transit {
  // data: transit.json's two lines and roads.json's islands; lines: lines.json
  constructor(data, lines = null) {
    this.lines = data.lines.map((d) => new Line(d)); this.rail = this.lines.find((l) => l.kind === 'rail'); this.bus = this.lines.find((l) => l.kind === 'mbus'); this.streets = []; this.bodies = new Map(); this.near = []; this.on = true; this.hold = null; this.clock = { dow: 3, at: 8 * 3600 };
    if (lines) for (const d of lines.lines) {
      if (d.of) { const l = this.lines.find((q) => q.id === d.of); if (!l) continue; l.ref = d.ref; l.color = d.color; for (const q of d.dirs) l.pats.push(new Service(l, q)); continue; }
      if (d.kind === 'bus') { for (const q of d.dirs) { const w = new Street(q, d); w.pats.push(new Service(w, { ...q, ref: d.ref })); this.streets.push(w); } continue; }
      const l = new Line(d); for (const q of d.dirs) l.pats.push(new Service(l, q)); this.lines.push(l);
    }
    if (lines && this.rail) for (const q of this.rail.stops) { const e = (lines.marmaray || {})[q.name]; if (e) Object.assign(q, e); }
    for (const e of data.entries || []) { const l = this.lines.find((q) => q.id === e.way), q = l && l.stops[e.stop]; if (q && q.under) { q.door = e.door; q.entry = unpackEntry(e); } } // (a way down to it: shared/entries.js)
    this.ways = [...this.lines, ...this.streets]; this.services = this.ways.flatMap((w) => w.pats); this.services.forEach((p, i) => { p.no = i; });
    // what passes overhead, and where the rails lie, by place
    this.cells = new Map(); const add = (x, z, y, w, deck) => { const k = Math.floor(x / 4) * 8192 + Math.floor(z / 4); if (!this.cells.has(k)) this.cells.set(k, []); this.cells.get(k).push([x, z, y, w, deck]); };
    for (const l of this.lines) for (let i = l.own; i < l.n; i++) if (l.st[i] !== 2 && l.st[i] !== 3) add(l.p[i * 3], l.p[i * 3 + 1], l.p[i * 3 + 2], l.kind === 'tram' || l.kind === 'old' ? 0.8 : 1.15, l.st[i] === 1);
    for (const q of this.islands = data.islands || []) for (let u = -4; u <= 4; u += 0.5) add(q.x - q.dz * u, q.z + q.dx * u, q.h + 1.6, 0.6, true);
  }
  // the city's time, T seconds into the game
  time(T) { return this.clock.at + Math.max(0, T) * RATE; }
  // is there a deck over (x, z), or the line itself, between heights y0 and y1
  over(x, z, y0, y1, m = 0.3) { const a = Math.floor(x / 4), b = Math.floor(z / 4); for (let i = a - 1; i <= a + 1; i++) for (let j = b - 1; j <= b + 1; j++) for (const q of this.cells.get(i * 8192 + j) || []) if (q[2] > y0 && q[2] - 0.4 < y1 && Math.hypot(q[0] - x, q[1] - z) < q[3] + m) return true; return false; }
  // where the busway opens onto the D100: no kerb there
  mouth(x, z) { const l = this.bus; if (!l) return false; for (let i = l.own; i < Math.min(l.n, l.own + 9); i++) if (Math.hypot(l.p[i * 3] - x, l.p[i * 3 + 1] - z) < 1.05) return true; return false; }
  // (at the start of a race the buses keep away from the grid: `hold`, a place)
  held(x, z) { const h = this.hold; return !!h && Math.hypot(h.x - x, h.z - z) < 34; }
  // does a way show itself just now? (on the roads only when there is traffic; city buses and trams leave a race alone)
  shows(w) { return w.kind === 'bus' || w.kind === 'tram' || w.kind === 'old' ? !!this.city : w.kind === 'mbus' ? this.on : true; }
  // every vehicle about a place at time T: fn(service, run, where, its middle)
  each(x, z, T, reach, fn, kinds = null) {
    const c = this.time(T), day = Math.floor(c / 86400), dow = (this.clock.dow + day) % 7, cc = c % 86400, w = (this._w ||= {}), o = (this._o ||= {});
    for (const p of this.services) { const W = p.way; if (kinds && !kinds(W)) continue; if (!this.shows(W) || W.far(x, z, reach)) continue; p.runs(cc, dow, day, (t, run) => { p.where(t, w); W.at(w.l, o); if (Math.abs(o.x - x) > reach || Math.abs(o.z - z) > reach) return; w.t = t; fn(p, run, w, o); }); }
  }
  // one vehicle again: where it is now (null: its run is over)
  find(p, run, T, w) { const c = this.time(T), day = Math.floor(c / 86400), dow = (this.clock.dow + day) % 7; let hit = null; const cc = c % 86400; p.runs(cc, dow, day, (t, r) => { if (r === run) hit = t; }); if (hit === null) return null; p.where(hit, w); w.t = hit; return w; }
  // what leaves a stop of a way next: [{ p, in: seconds of the city's, run }] soonest first
  departures(list, T, many = 8, each = 2) { const c = this.time(T), day = Math.floor(c / 86400), dow = (this.clock.dow + day) % 7, out = []; for (const [p, q] of list) if (q < p.stops.length - 1 && this.shows(p.way)) for (const [s, run] of p.next(q, c % 86400, dow, day, each)) if (s < 5400) out.push({ p, in: s, run, at: c + s }); return out.sort((a, b) => a.in - b.in).slice(0, many); }
  // what is in the way on the roads about a place at time T, as things to run into
  about(x, z, T, reach = 9) {
    this.near.length = 0; let used = 0; const e = {}, o = {};
    this.each(x, z, T, reach + 3, (p, run, w, mid) => {
      const W = p.way; if (mid.st === 2 || this.held(mid.x, mid.z)) return; const span = W.kind === 'mbus' ? [1.25, 0.42, -0.42, -1.25] : W.kind === 'bus' ? [0.5, -0.5] : W.kind === 'old' ? [0.35, -0.35] : [2.3, 1.4, 0.5, -0.5, -1.4, -2.3], l = w.l, v = w.v;
      for (const d of span) { const q = (this.pool ||= [])[used] || (this.pool[used] = { mass: 6, type: 'taksi' }); used++; W.at(l + d, o); W.at(l + d + 0.2, e); let dx = e.x - o.x, dz = e.z - o.z; const g = Math.hypot(dx, dz) || 1; q.x = o.x; q.y = o.y; q.z = o.z; q.yaw = Math.atan2(dx, dz); q.vx = (dx / g) * v; q.vz = (dz / g) * v; this.near.push(q); }
    }, (W) => W.kind === 'mbus' || W.kind === 'bus' || W.kind === 'tram' || W.kind === 'old');
    return this.near;
  }
  // the nearest bit of road to a place, for the way to it
  link(p, net) {
    if (p.link !== undefined) return p.link; let b = null; for (const r of net.roads) { if (r.style === 'motorway' && p.way.kind !== 'mbus') continue; for (let i = 0; i < r.n; i += 2) { const dx = r.p[i * 3] - p.x, dz = r.p[i * 3 + 1] - p.z; if (Math.abs(dx) > 52 || Math.abs(dz) > 52 || (r.tunnel && r.tunnel[i] === 2)) continue; const d = Math.hypot(dx, dz) - r.hw + Math.max(0, Math.abs(r.p[i * 3 + 2] - p.y) - 2.6) * 2; if (!b || d < b.d) b = { d, x: r.p[i * 3], z: r.p[i * 3 + 1], y: r.p[i * 3 + 2], hw: r.hw }; } } return (p.link = b);
  }
  // how high the way from a place to its road is, u of the way along (0 the place): over water it is a footbridge
  linkY(p, l, u) { return p.y + (l.y - p.y) * Math.min(1, Math.max(0, (u - 0.06) / 0.8)); }
  // ---------------------------------------------------------------- the places one gets in and out: stops on the surface, and the doors of the stations below
  places() {
    if (this._places) return this._places; const P = (this._places = []), key = (n) => n.toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '');
    for (const w of this.ways) { const calls = w.stops.map(() => []); for (const p of w.pats) p.stops.forEach((s, q) => calls[s].push([p, q]));
      w.stops.forEach((q, i) => { if (!calls[i].length) return; const f = w.frame ? w.frame(q.s) : (() => { const a = w.at(q.s, {}), b = w.at(q.s + 0.5, {}), l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return [a.x, a.y, a.z, (b.x - a.x) / l, (b.z - a.z) / l]; })(), under = !!q.under, bus = w.kind === 'bus';
        const x = under ? (q.door ? q.door[0] : f[0]) : bus ? f[0] - f[4] * 0.78 : f[0], z = under ? (q.door ? q.door[1] : f[2]) : bus ? f[2] + f[3] * 0.78 : f[2]; if (bus) { const old = P.find((e) => e.bus && Math.hypot(e.x - x, e.z - z) < 5 && e.f[3] * f[3] + e.f[4] * f[4] > 0.3 && (key(e.name) === key(q.name) || Math.hypot(e.x - x, e.z - z) < 2.2)); if (old) { old.calls.push(...calls[i]); if (!old.ways.includes(w)) old.ways.push(w); return; } }
        P.push({ name: q.name, x, z, y: under ? (q.h ?? f[1]) : f[1], f, way: w, ways: [w], i, s: q.s, under, shut: under && !q.door, entry: q.entry || null, bus, calls: calls[i] }); }); }
    return P;
  }
}
