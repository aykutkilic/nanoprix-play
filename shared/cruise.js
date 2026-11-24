// Cruise control that also steers: keeps to the right-hand lane of whatever
// road it is on, goes the way asked at junctions (straight on if not), slows
// for bends and for whoever is ahead, and turns round where a road ends.
import { lightAt } from './streets.js';
import { KMH } from './units.js';
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export class Cruiser {
  constructor(net) { this.net = net; this.speed = 8.5; this.obey = true; this.limit = 50; this.want = 0; this.next = null; this.road = null; this.dir = 1; this.out = { steer: 0, gas: 0, brake: 0, drift: false, turbo: false }; this.stuck = 0; this.back = 0; }
  reset() { this.road = null; this.next = null; }
  // the stretch the car is on, remembered so overlapping roads do not confuse it
  locate(car) {
    const n = this.net; let best = null;
    n.around(car.x, car.z, (r, i, t, d, h) => {
      const dy = Math.abs(h - car.y); if (dy > 1 || d > r.hw + 0.4) return;
      const a = i * 3, dx = r.p[a + 3] - r.p[a], dz = r.p[a + 4] - r.p[a + 1], l = Math.hypot(dx, dz) || 1, c = (Math.sin(car.yaw) * dx + Math.cos(car.yaw) * dz) / l, score = d + dy * 2 - Math.abs(c) * 0.8 - (r === this.road ? 1.4 : 0) - (this.next && r === this.next.r && this.road && r.s[i] + t < 1e9 && this.left < 2.5 ? 1.0 : 0);
      if (!best || score < best.score) best = { r, i, t, d, c, score };
    });
    return best;
  }
  // where the road goes `s` from a position, over junctions; lateral to the right
  ahead(r, dir, s, dist, depth = 0) {
    const to = s + dir * dist;
    if (to >= 0 && to <= r.len) { let lo = 0, hi = r.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.s[m] <= to) lo = m; else hi = m; } const a = lo * 3, t = (to - r.s[lo]) / Math.max(1e-6, r.s[lo + 1] - r.s[lo]), dx = (r.p[a + 3] - r.p[a]) * dir, dz = (r.p[a + 4] - r.p[a + 1]) * dir, l = Math.hypot(dx, dz) || 1, lat = Math.max(0.3, r.hw * 0.42); return { x: r.p[a] + (r.p[a + 3] - r.p[a]) * t - (dz / l) * lat, z: r.p[a + 1] + (r.p[a + 4] - r.p[a + 1]) * t + (dx / l) * lat, dx: dx / l, dz: dz / l, r }; }
    const rest = dist - (dir > 0 ? r.len - s : s), e = depth === 0 ? this.choose(r, dir) : this.pick(r, dir, 0); if (depth > 2) return this.ahead(r, dir, s, dir > 0 ? r.len - s : s, 3);
    return this.ahead(e.r, e.dir, e.dir > 0 ? 0 : e.r.len, Math.max(0, rest), depth + 1);
  }
  exits(r, dir) {
    const hub = dir > 0 ? r.b : r.a, k = dir > 0 ? r.n - 1 : 0, j = dir > 0 ? Math.max(0, r.n - 6) : Math.min(r.n - 1, 5), ix = r.p[k * 3] - r.p[j * 3], iz = r.p[k * 3 + 1] - r.p[j * 3 + 1], In = Math.atan2(ix, iz);
    return this.net.adj.get(hub).filter((e) => e.r !== r).map((e) => { const d = e.r.a === hub ? 1 : -1, p = d > 0 ? 0 : e.r.n - 1, q = d > 0 ? Math.min(e.r.n - 1, 9) : Math.max(0, e.r.n - 10); return { r: e.r, dir: d, a: wrapA(In - Math.atan2(e.r.p[q * 3] - e.r.p[p * 3], e.r.p[q * 3 + 1] - e.r.p[p * 3 + 1])) }; });
  }
  pick(r, dir, want) {
    const ex = this.exits(r, dir); if (!ex.length) return { r, dir: -dir, a: Math.PI, uturn: true };
    const score = (e) => (want === 0 ? Math.abs(e.a) - (e.r.style === r.style ? 0.25 : 0) : Math.abs(e.a - want * 1.1) + (Math.sign(e.a) === want ? 0 : 0.5));
    return ex.sort((a, b) => score(a) - score(b))[0];
  }
  choose(r, dir) { if (!this.next || this.next.from !== r || this.next.fdir !== dir || this.next.want !== this.want) this.next = { ...this.pick(r, dir, this.want), from: r, fdir: dir, want: this.want }; return this.next; }
  // time: the cruise's clock, for the lights
  drive(car, others, dt, time = null, grip = 1) {
    const o = this.out, q = this.locate(car); o.drift = o.turbo = false;
    if (!q) { o.steer = 0; o.gas = 0.3; o.brake = 0; return o; }
    if (q.r !== this.road) { if (this.next && q.r === this.next.r && this.road === this.next.from) { this.dir = this.next.dir; this.want = 0; } else this.dir = q.c >= 0 ? 1 : -1; this.road = q.r; this.next = null; }
    const r = this.road, v = Math.max(0, car.speed), s = r.s[q.i] + (r.s[q.i + 1] - r.s[q.i]) * q.t; this.left = this.dir > 0 ? r.len - s : s;
    if (this.left < 1.2 && this.choose(r, this.dir).uturn) { this.dir = -this.dir; this.next = null; }
    this.left = this.dir > 0 ? r.len - s : s; const nx = this.choose(r, this.dir); this.turn = nx;
    const p = this.ahead(r, this.dir, s, 1.1 + v * 0.3); let a = wrapA(Math.atan2(p.x - car.x, p.z - car.z) - car.yaw); o.steer = Math.max(-1, Math.min(1, -a * 2.4));
    // how fast: as set, less for what is coming
    let vt = this.speed, last = null;
    for (let d = 0; d < 3 + (v * 1.1) / grip; d += 1.6) { const k = this.ahead(r, this.dir, s, d); if (last) { const c = Math.abs(wrapA(Math.atan2(k.dx, k.dz) - last)) / 1.6; if (c > 0.01) vt = Math.min(vt, Math.sqrt((5.5 * grip) / c + Math.max(0, d - 1.6) * 7 * grip)); } last = Math.atan2(k.dx, k.dz); }
    if (Math.abs(nx.a) > 0.6) vt = Math.min(vt, Math.sqrt((Math.abs(nx.a) > 1.3 ? 7 : 16) + Math.max(0, this.left - 2) * 9));
    const st = this.net.streets; this.red = false;
    if (st) {
      this.limit = st.limit(r, s, this.dir); if (this.obey) vt = Math.min(vt, (this.limit / KMH) * (0.4 + 0.6 * grip));
      if (time !== null) { // a red light: stop at its line
        const q = st.ahead(r, s, this.dir, 3 + (v * 1.6) / grip); let sig = q && q[0], d = q && q[1];
        if (!sig && this.left < 2 + v * 1.2 && !nx.uturn) { const w = st.ahead(nx.r, nx.dir > 0 ? 0 : nx.r.len, nx.dir, 3); if (w) { sig = w[0]; d = this.left + w[1]; } }
        if (sig && d > 0.35) { const l = lightAt(sig, time), need = (v * v) / (14 * grip); if (l === 'red' || (l === 'amber' && d - 1 > need * 0.7)) { vt = Math.min(vt, Math.sqrt(Math.max(0, d - 1.15) * 9 * grip)); this.red = true; if (d < 1.35) vt = 0; } }
      }
    }
    if (Math.abs(a) > 1.2) vt = Math.min(vt, 1.7); else if (nx.uturn) vt = Math.min(vt, Math.sqrt(3 + this.left * 8));
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    for (const c of others) { if (c === car || Math.abs(c.y - car.y) > 0.8) continue; const dx = c.x - car.x, dz = c.z - car.z, f = dx * fx + dz * fz, l = Math.abs(dx * fz - dz * fx); if (f > 0.3 && f < 2 + v * 0.8 && l < 0.7) { const vs = c.vx * fx + c.vz * fz; if (vs > -1) vt = Math.min(vt, Math.max(0.4, vs + (f - 1.8) * 1.4)); } }
    o.gas = v < vt - 0.2 ? Math.min(1, (vt - v) * 0.6) : 0; o.brake = v > vt + 0.5 ? Math.min(1, (v - vt) * 0.35) : 0;
    o.hold = vt < 0.05; if (o.hold) { o.gas = 0; o.brake = v > 0.12 ? 1 : 0; }
    if (v < 0.4 && vt > 1) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 1.4) { this.back = 0.9; this.stuck = 0; } if (this.back > 0) { this.back -= dt; o.gas = 0; o.brake = 1; o.steer = -o.steer; }
    return o;
  }
}
// Everyday traffic over the whole network, the same for everybody: vehicles
// going round the race courses, both ways, by the clock.
import { Course } from './track.js';
import { COURSES } from './courses.js';
import { makeTraffic } from './traffic.js';
export function cityTraffic(net, seed, density) {
  if (!density) return [];
  return COURSES.map((d, k) => { const course = new Course(net, d); if (net.streets) course.lights = net.streets.along(course); return { course, list: makeTraffic(course, seed + k * 7, density).filter((_, i) => i % 2 === 0) }; });
}
