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
      const L = data.models[l.kind].L, half = L / 2, from = half, to = l.off ? s[n - 1] : s[n - 1] - half, v = SPEED[l.kind], run = to - from, e = Math.min(EASE, (run / v) * 0.9), T = run / v + e, dwell = DWELL[l.kind], cycle = 2 * (T + dwell), many = run > 420 && !l.off ? 2 : 1;
      for (let q = 0; q < many; q++) this.ships.push({ line: l, k: this.ships.length, kind: l.kind, n, s, p: l.p, from, to, run, T, e, v, dwell, cycle, L, phase: ((k * 37.7) % cycle) + (q * cycle) / many, cars: !!l.cars, off: !!l.off, a: l.a, b: l.b, miles: s[n - 1] / 185.2, open: !l.off && l.a >= 0 && l.b >= 0 && !/Kız Kulesi/.test(l.name) && data.ports[l.a].name !== '' && data.ports[l.b].name !== '' });
    });
    this.car = this.ships.filter((q) => q.cars);
  }
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
    out.yaw = wrapA(out.yaw); return out;
  }
}
// where a car stands on a car ferry: one behind another in the middle lane, in the ship's own axes [to the right, along]
export const SLOTS = [[0, 2.7], [0, 1.3], [0, -0.1], [0, -1.5], [0, -2.9]];
export const DECK = 0.405; // above the water
