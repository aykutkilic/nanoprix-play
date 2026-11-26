// The ships, by the clock: where each is, which way it heads, whether it lies at
// a landing stage and for how long. The same for everybody; nothing is sent.
const smooth = (t) => t * t * (3 - 2 * t), wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const SPEED = { classic: 4.2, motor: 4.6, seabus: 7.5, car_ferry: 6.2, dolmus: 4.6 }, DWELL = { classic: 14, motor: 9, seabus: 12, car_ferry: 18, dolmus: 7 };
// what OSM's nearest name gets wrong, or has not: [x, z, name]
const NAMES = [[359.5, 302.5, 'Kadıköy'], [348.5, 313.5, 'Kadıköy'], [316.5, 265.5, 'Haydarpaşa'], [67.5, -97.5, 'Galataport'], [222.5, -16.5, 'Kız Kulesi'], [205.5, -13.5, 'Salacak']];
const EASE = 9; // seconds to gather way, and to lose it
export class Fleet {
  constructor(data) {
    this.data = data; this.ports = data.ports; this.ships = []; for (const [x, z, name] of NAMES) { const q = data.ports.find((p) => Math.hypot(p.x - x, p.z - z) < 1.5); if (q) q.name = name; } for (const p of data.ports) p.name = (p.name || '').replace(/ (iskelesi|Şehir Hatları|Motor)$/, '');
    data.lines.forEach((l, k) => {
      const n = l.p.length / 2, s = new Float32Array(n); for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(l.p[i * 2] - l.p[i * 2 - 2], l.p[i * 2 + 1] - l.p[i * 2 - 1]);
      const L = data.models[l.kind].L, half = L / 2, from = half, to = l.off ? s[n - 1] : s[n - 1] - half, run = to - from, v = l.v || SPEED[l.kind], e = Math.min(EASE, (run / v) * 0.9), T = run / v + e, cycle = l.cyc || 2 * (T + DWELL[l.kind]), dwell = cycle / 2 - T, many = l.ph ? l.ph.length : run > 420 && !l.off ? 2 : 1;
      for (let q = 0; q < many; q++) this.ships.push({ line: l, k: this.ships.length, kind: l.kind, n, s, p: l.p, from, to, run, T, e, v, dwell, cycle, L, phase: l.ph ? l.ph[q] : ((k * 37.7) % cycle) + (q * cycle) / many, cars: !!l.cars, off: !!l.off, a: l.a, b: l.b, miles: s[n - 1] / 185.2, open: !l.off && l.a >= 0 && l.b >= 0 && !/Kız Kulesi/.test(l.name) && data.ports[l.a].name !== '' && data.ports[l.b].name !== '' });
    });
    this.car = this.ships.filter((q) => q.cars);
    for (const S of this.ships) if (!S.off) S.lanes = [1, -1].map((side) => lane(S, side));
    // the big ships passing through the Bosphorus: along the strait, round and round
    const st = data.strait; this.big = []; if (st) { const n = st.p.length / 2, s = new Float32Array(n); for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(st.p[i * 2] - st.p[i * 2 - 2], st.p[i * 2 + 1] - st.p[i * 2 - 1]); for (const [kind, dir, ph, L] of st.ships) this.big.push({ kind, dir, ph, L, n, s, p: st.p, len: s[n - 1], v: s[n - 1] / st.period, k: this.big.length }); }
  }
  // where a big ship is: on the right of the strait's middle, the way it goes
  atBig(B, time, out = {}) { const u0 = (((time * B.v) / B.len + B.ph) % 1 + 1) % 1, d = (B.dir > 0 ? u0 : 1 - u0) * B.len, a = this.place(B, Math.max(0, d - 2), (this.q0 ||= {})), b = this.place(B, Math.min(B.len, d + 2), (this.q1 ||= {})); this.place(B, d, out); const yaw = Math.atan2((b.x - a.x) * B.dir, (b.z - a.z) * B.dir); out.yaw = yaw; out.x += Math.cos(yaw) * 5; out.z -= Math.sin(yaw) * 5; out.v = B.v; out.dock = -1; return out; }
  // how far along after t seconds under way: gathers way, sails, loses way
  along(S, t) { const e = S.e, a = S.v / e; if (t <= e) return 0.5 * a * t * t; if (t >= S.T - e) { const r = S.T - t; return S.run - 0.5 * a * Math.max(0, r) * Math.max(0, r); } return 0.5 * a * e * e + S.v * (t - e); }
  place(S, d, out) { const s = S.s; let lo = 0, hi = S.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; } const t = Math.min(1, Math.max(0, (d - s[lo]) / Math.max(1e-6, s[lo + 1] - s[lo]))), p = S.p; out.x = p[lo * 2] + (p[lo * 2 + 2] - p[lo * 2]) * t; out.z = p[lo * 2 + 1] + (p[lo * 2 + 3] - p[lo * 2 + 1]) * t; return out; }
  // → { x, z, yaw, v, dock: -1 | 0 at a | 1 at b, leaves: s till it sails, left: s till it lands }
  at(S, time, out = {}) {
    let t = (((time + S.phase) % S.cycle) + S.cycle) % S.cycle; const D = S.dwell; let d, sign = 1; out.dock = -1; out.leaves = out.left = 0; out.v = 0;
    if (t < D) { d = 0; out.dock = 0; out.leaves = D - t; } else if ((t -= D) < S.T) { d = this.along(S, t); out.left = S.T - t; out.v = Math.min(S.v, (Math.min(t, S.T - t) * S.v) / S.e); } else if ((t -= S.T) < D) { d = S.run; out.dock = 1; out.leaves = D - t; sign = -1; } else { t -= D; d = S.run - this.along(S, t); out.left = S.T - t; sign = -1; out.v = Math.min(S.v, (Math.min(t, S.T - t) * S.v) / S.e); }
    out.sign = sign; out.to = out.dock === 0 ? 1 : out.dock === 1 ? 0 : sign > 0 ? 1 : 0;
    const A = this.place(S, Math.max(0, S.from + d - S.L * 0.45), (this.q0 ||= {})), B = this.place(S, S.from + d + S.L * 0.45, (this.q1 ||= {})); this.place(S, S.from + d, out); const along = Math.atan2(B.x - A.x, B.z - A.z);
    // a car ferry goes either way as she lies; the others turn about as they leave
    if (S.cars) out.yaw = along; else { const turn = out.dock >= 0 ? (out.dock === 0 ? Math.PI : 0) : 0, since = out.dock >= 0 ? 0 : S.T - out.left, k = out.dock >= 0 ? 0 : smooth(Math.min(1, since / (S.e * 0.9))); out.yaw = out.dock >= 0 ? along + turn : sign > 0 ? along + Math.PI * (1 - k) : along + Math.PI * k; }
    // under way she keeps to the right, in her lane (lanes, below); at the landing stages she is on the line
    if (out.dock < 0 && S.lanes) { const Ln = S.lanes[sign > 0 ? 0 : 1]; this.place(Ln, Ln.from + (d / S.run) * Ln.run, out); }
    out.yaw = wrapA(out.yaw); return out;
  }
}
// where a car stands on a car ferry: one behind another in the middle lane, in the ship's own axes [to the right, along]
export const SLOTS = [[0, 2.7], [0, 1.3], [0, -0.1], [0, -1.5], [0, -2.9]];
export const DECK = 0.405; // above the water
// ---------------------------------------------------------------- the timetable, so that no two meet (tools/ports.mjs, once)
// Every line's round takes a whole part of one PERIOD (a little slower under way, a little longer at the landing stages), so
// that the fleet comes round as one; then each ship in turn is given the start that keeps her furthest from those given theirs.
export const PERIOD = 8640;
export function plan(data, log = () => {}) { return plan1(data, log).length; }
function plan1(data, log) {
  const parts = [90, 180, 360, 720, 1440, 2880, PERIOD]; // (each a whole number of the one before: two whose rounds were 144 and 150 seconds would come to the same place sooner or later)
  // where lines share a landing stage, each has its own berth there, side by side along the shore
  if (!data.berths) { data.berths = 1; data.ports.forEach((q, i) => { if (q.car) return; const ends = [], by = (l, e) => { const n = l.p.length / 2, k = e ? n - 1 : 0; return Math.hypot(l.p[k * 2] - q.x, l.p[k * 2 + 1] - q.z) < 6; }; data.lines.forEach((l) => { if (l.cars) return; if (by(l, 0)) ends.push([l, 0]); if (!l.off && by(l, 1)) ends.push([l, 1]); }); if (ends.length < 2) return; const tx = -q.oz, tz = q.ox, gap = Math.max(...ends.map(([l]) => data.models[l.kind].L)) * 0.24 + 0.45;
    ends.forEach(([l, e], k) => { const o = (k - (ends.length - 1) / 2) * gap, n = l.p.length / 2, i0 = e ? n - 1 : 0, x0 = l.p[i0 * 2], z0 = l.p[i0 * 2 + 1]; for (let j = 0; j < n; j++) { const d = Math.hypot(l.p[j * 2] - x0, l.p[j * 2 + 1] - z0); if (d > 14) continue; const f = 1 - smooth(d / 14); l.p[j * 2] = +(l.p[j * 2] + tx * o * f).toFixed(2); l.p[j * 2 + 1] = +(l.p[j * 2 + 1] + tz * o * f).toFixed(2); } }); }); }
  const F0 = new Fleet({ ...data, lines: data.lines.map((l) => ({ ...l, cyc: 0, ph: null, v: 0 })) });
  for (const l of data.lines) { const S = F0.ships.find((q) => q.line.id === l.id), nat = 2 * (S.T + DWELL[l.kind]), cyc = parts.find((c) => c >= nat) || PERIOD, T = Math.min((S.T - S.e) / 0.75 + S.e, S.T + (cyc - nat) / 2); l.cyc = cyc; l.v = +(S.run / (T - S.e)).toFixed(4); l.ph = F0.ships.filter((q) => q.line.id === l.id).map(() => 0); } // (up to a quarter slower under way; the rest of the round at the landing stages)
  if (data.strait) data.strait.period = PERIOD / 4;
  const F = new Fleet(data), all = [...F.ships.map((S) => ({ S, big: false, cyc: S.cycle, L: S.L })), ...F.big.map((B) => ({ S: B, big: true, cyc: data.strait.period, L: B.L }))], DT = 3, N = PERIOD / DT, o = {};
  // each one's way, sampled over its round from a start of nought
  for (const q of all) { const n = Math.round(q.cyc / DT); q.x = new Float32Array(n); q.z = new Float32Array(n); q.yaw = new Float32Array(n); q.dock = new Int8Array(n); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const ph = q.S.phase ?? q.S.ph; if (q.big) q.S.ph = 0; else q.S.phase = 0; for (let i = 0; i < n; i++) { if (q.big) F.atBig(q.S, i * DT, o); else F.at(q.S, i * DT, o); q.x[i] = o.x; q.z[i] = o.z; q.yaw[i] = o.yaw; q.dock[i] = o.dock; x0 = Math.min(x0, o.x); x1 = Math.max(x1, o.x); z0 = Math.min(z0, o.z); z1 = Math.max(z1, o.z); } q.box = [x0 - q.L, x1 + q.L, z0 - q.L, z1 + q.L]; void ph; }
  // how near two hulls come: three points along each, against the beams of both
  const near = (a, i, b, j) => { const dx = a.x[i] - b.x[j], dz = a.z[i] - b.z[j], R = (a.L + b.L) / 2 + 1; if (dx * dx + dz * dz > R * R) return 0; let m = 1e9; for (const u of [-0.42, 0, 0.42]) for (const v of [-0.42, 0, 0.42]) { const ex = a.x[i] + Math.sin(a.yaw[i]) * a.L * u - b.x[j] - Math.sin(b.yaw[j]) * b.L * v, ez = a.z[i] + Math.cos(a.yaw[i]) * a.L * u - b.z[j] - Math.cos(b.yaw[j]) * b.L * v; m = Math.min(m, Math.hypot(ex, ez)); } const w = (a.L + b.L) * 0.11 + 0.5; return m < w ? 1 + (w - m) : 0; };
  // the big ones first (they keep to their own way), then the car ferries, then the longest rounds
  all.sort((a, b) => b.big - a.big || b.S.cars - a.S.cars || b.cyc - a.cyc); const done = []; let worst = 0;
  const fit = (q, others) => { const n = q.x.length, near1 = others.filter((p) => p !== q && p.box[0] < q.box[1] && q.box[0] < p.box[1] && p.box[2] < q.box[3] && q.box[2] < p.box[3]), tries = Math.min(n, 288); let best = [1e9, 0]; const cost = (off, cap) => { let c = 0; for (let t = 0; t < N && c < cap; t++) { const i = (t + off) % n; for (const p of near1) c += near(q, i, p, (t + p.off) % p.x.length); } return c; };
    if (q.off !== undefined) best = [cost(q.off, 1e9), q.off]; for (let c = 0; c < tries && best[0] > 0; c++) { const off = Math.floor((c * n) / tries), k = cost(off, best[0]); if (k < best[0]) best = [k, off]; } q.off = best[1]; return best[0]; };
  for (const q of all) { fit(q, done); done.push(q); }
  // and again, each against all the others, while it helps
  for (let pass = 0; pass < 3; pass++) { let left = 0; for (const q of all) if (!q.big) left += fit(q, all); worst = left; if (!left) break; }
  const bad = new Set(); for (const q of all) { const c = fit(q, all); if (c > 0) { log(`${q.big ? q.S.kind : q.S.line.name}: ${c.toFixed(1)}`); if (!q.big && !q.S.cars) bad.add(q); } }
  // a start of `off` steps: the ship is where she would be off·DT seconds later
  for (const q of all) { const ph = (q.off * DT) % q.cyc; if (q.big) data.strait.ships[q.S.k][2] = +(((ph * q.S.v) / q.S.len) % 1).toFixed(6); else { const l = q.S.line, k = F.ships.filter((s) => s.line === l).indexOf(q.S); l.ph[k] = ph; } }
  void worst; return [...new Set([...bad].map((q) => q.S.line))];
}
// a ship's lane: her line, moved to its right (side 1, as she sails from a to b) or left (-1, coming back), by a little more than
// half her beam: nothing where she berths, less in a bend. Gone along at an even pace, as far along it as she is along her line.
function lane(S, side) {
  const n = S.n, p = S.p, s = S.s, W = S.L * 0.3 + 0.45, out = new Float32Array(n * 2), at = (d, q) => { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; } const t = Math.min(1, Math.max(0, (d - s[lo]) / Math.max(1e-6, s[lo + 1] - s[lo]))); q[0] = p[lo * 2] + (p[lo * 2 + 2] - p[lo * 2]) * t; q[1] = p[lo * 2 + 1] + (p[lo * 2 + 3] - p[lo * 2 + 1]) * t; return q; };
  const w = new Float32Array(n), A = [0, 0], B = [0, 0]; for (let i = 0; i < n; i++) { at(s[i] - S.L * 2, A); at(s[i] + S.L * 2, B); const chord = Math.hypot(B[0] - A[0], B[1] - A[1]) / Math.max(1e-6, Math.min(s[n - 1], s[i] + S.L * 2) - Math.max(0, s[i] - S.L * 2)), end = Math.min(s[i] - S.from, S.to - s[i]); w[i] = W * smooth(Math.min(1, Math.max(0, end / (S.L * 1.4)))) * smooth(Math.min(1, Math.max(0, (chord - 0.8) / 0.18))); out[i * 2] = Math.atan2(B[0] - A[0], B[1] - A[1]); }
  for (let it = 0; it < 6; it++) for (let i = 1; i + 1 < n; i++) w[i] = Math.min(w[i], (w[i - 1] + w[i] + w[i + 1]) / 3); // (no sudden swerve)
  for (let i = 0; i < n; i++) { const h = out[i * 2]; out[i * 2] = p[i * 2] + Math.cos(h) * w[i] * side; out[i * 2 + 1] = p[i * 2 + 1] - Math.sin(h) * w[i] * side; }
  const L = new Float32Array(n); for (let i = 1; i < n; i++) L[i] = L[i - 1] + Math.hypot(out[i * 2] - out[i * 2 - 2], out[i * 2 + 1] - out[i * 2 - 1]); const map = (d) => { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; } return L[lo] + (L[hi] - L[lo]) * Math.min(1, Math.max(0, (d - s[lo]) / Math.max(1e-6, s[hi] - s[lo]))); };
  const from = map(S.from); return { n, p: out, s: L, from, run: map(S.to) - from };
}

