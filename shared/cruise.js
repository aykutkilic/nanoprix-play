// The autopilot: keeps to the right-hand lane of whatever road it is on, at its
// limit; goes the way asked at junctions (or the way to where one is going, and
// stops there), slows for bends, keeps its distance, waits at red lights and for
// who crosses, and turns round – in three goes if need be – where a road ends.
import { lightAt } from './streets.js';
import { KMH } from './units.js';
// how far right of the middle: its own side, clear of the kerb, of the tram in the middle where there is room beside it
export const laneOf = (r) => { if (r.bus) return 1.4; const most = Math.max(0.06, r.hw - 0.46); return Math.min(most, Math.max(r.tram ? 0.9 : 0.42, r.hw * 0.42)); };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export class Cruiser {
  constructor(net) { this.net = net; this.speed = 8.5; this.obey = true; this.limit = 50; this.want = 0; this.next = null; this.road = null; this.dir = 1; this.out = { steer: 0, gas: 0, brake: 0, drift: false, turbo: false }; this.stuck = 0; this.back = 0; }
  reset() { this.road = null; this.next = null; this.held = null; }
  // the stretch the car is on, remembered so overlapping roads do not confuse it
  locate(car) {
    const n = this.net, astray = this.heading && !(this.road && this.heading(this.road)); let best = null; // (on none of its way's roads: whichever is of it, if one is here)
    n.around(car.x, car.z, (r, i, t, d, h) => {
      const dy = Math.abs(h - car.y), held = r === this.held; if (dy > 1 || d > r.hw + (held ? 2 : 0.4)) return;
      const a = i * 3, dx = r.p[a + 3] - r.p[a], dz = r.p[a + 4] - r.p[a + 1], l = Math.hypot(dx, dz) || 1, c = (Math.sin(car.yaw) * dx + Math.cos(car.yaw) * dz) / l, score = d + dy * 2 - Math.abs(c) * 0.8 - (held ? 3.5 : 0) - (r === this.road ? 1.4 : astray && this.heading(r) ? 2 : 0) - (this.next && r === this.next.r && this.road && r.s[i] + t < 1e9 && this.left < 2.5 ? (this.next.at !== undefined && this.left < 0.9 ? 2.6 : 1.0) : 0);
      if (!best || score < best.score) best = { r, i, t, d, c, score };
    });
    return best;
  }
  // where the road goes `s` from a position, over junctions; lateral to the right
  ahead(r, dir, s, dist, depth = 0) {
    const to = s + dir * dist, N = this.next, stop = depth === 0 && N && N.from === r && N.fdir === dir && N.at !== undefined ? N.at : dir > 0 ? r.len : 0;
    if ((dir > 0 ? to <= stop && to >= 0 : to >= stop && to <= r.len)) { let lo = 0, hi = r.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.s[m] <= to) lo = m; else hi = m; } const a = lo * 3, t = (to - r.s[lo]) / Math.max(1e-6, r.s[lo + 1] - r.s[lo]), dx = (r.p[a + 3] - r.p[a]) * dir, dz = (r.p[a + 4] - r.p[a + 1]) * dir, l = Math.hypot(dx, dz) || 1, lat = laneOf(r); return { x: r.p[a] + (r.p[a + 3] - r.p[a]) * t - (dz / l) * lat, z: r.p[a + 1] + (r.p[a + 4] - r.p[a + 1]) * t + (dx / l) * lat, dx: dx / l, dz: dz / l, r }; }
    const rest = dist - Math.max(0, (stop - s) * dir), e = depth === 0 ? this.choose(r, dir) : this.pick(r, dir, 0); if (depth > 2) return this.ahead(r, dir, s, Math.max(0, (stop - s) * dir), 3);
    return this.ahead(e.r, e.dir, e.s0 ?? (e.dir > 0 ? 0 : e.r.len), Math.max(0, rest), depth + 1);
  }
  exits(r, dir) {
    if (r.spur) { // a side street: at its end one turns about, at its beginning there is the road it came off
      this.net.sides(); const j = dir < 0 && this.net.joint.get(r); if (!j) return []; const In = Math.atan2(r.p[0] - r.p[12 < r.n * 3 ? 12 : 3], r.p[1] - r.p[12 < r.n * 3 ? 13 : 4]), q = j.r, a = Math.min(q.n - 2, j.i) * 3, Y = Math.atan2(q.p[a + 3] - q.p[a], q.p[a + 4] - q.p[a + 1]);
      return [1, -1].filter((d) => (d > 0 ? q.len - j.s : j.s) > 2).map((d) => ({ r: q, dir: d, a: wrapA(In - (d > 0 ? Y : Y + Math.PI)), s0: j.s }));
    }
    const hub = dir > 0 ? r.b : r.a, k = dir > 0 ? r.n - 1 : 0, j = dir > 0 ? Math.max(0, r.n - 6) : Math.min(r.n - 1, 5), ix = r.p[k * 3] - r.p[j * 3], iz = r.p[k * 3 + 1] - r.p[j * 3 + 1], In = Math.atan2(ix, iz);
    return this.net.adj.get(hub).filter((e) => e.r !== r).map((e) => { const d = e.r.a === hub ? 1 : -1, p = d > 0 ? 0 : e.r.n - 1, q = d > 0 ? Math.min(e.r.n - 1, 9) : Math.max(0, e.r.n - 10); return { r: e.r, dir: d, a: wrapA(In - Math.atan2(e.r.p[q * 3] - e.r.p[p * 3], e.r.p[q * 3 + 1] - e.r.p[p * 3 + 1])) }; });
  }
  pick(r, dir, want) {
    const ex = this.exits(r, dir); if (!ex.length) return { r, dir: -dir, a: Math.PI, uturn: true };
    const score = (e) => (want === 0 ? Math.abs(e.a) - (e.r.style === r.style ? 0.25 : 0) : Math.abs(e.a - want * 1.1) + (Math.sign(e.a) === want ? 0 : 0.5));
    // (asked to turn: the road that runs straight on is not a turn, if there is another that way)
    if (want) { const on = ex.reduce((p, q) => (Math.abs(q.a) < Math.abs(p.a) ? q : p)), side = ex.filter((e) => e !== on && Math.sign(e.a) === want); if (side.length) return side.sort((a, b) => score(a) - score(b))[0]; }
    return ex.sort((a, b) => score(a) - score(b))[0];
  }
  // a side street to turn into, the way asked, before the next junction
  side(r, dir) {
    if (!this.want || this.sNow === undefined) return null; const l = this.net.sides().get(r); if (!l) return null; let best = null;
    for (const o of l) { const d = (o.s - this.sNow) * dir; if (d < 3.2 || d > 45 || o.side * dir !== this.want || o.spur.len < 3) continue; if (!best || d < best.d) best = { d, o }; }
    if (!best) return null; const i = Math.max(0, r.s.findIndex((v) => v >= best.o.s) - 1), a = i * 3, In = Math.atan2((r.p[a + 3] - r.p[a]) * dir, (r.p[a + 4] - r.p[a + 1]) * dir); return { r: best.o.spur, dir: 1, a: wrapA(In - best.o.yaw), s0: Math.min(r.hw * 0.75, best.o.spur.len * 0.3), at: best.o.s - dir * (best.o.side * dir > 0 ? 0.75 : 0.1) }; // (the corner is cut: into the mouth, not to the middle of the road)
  }
  // the way one is being guided: (road, direction) → the next stretch
  guided(r, dir) {
    const g = this.guide && this.guide(r, dir); if (!g) return null; if (g.r === r) return { r, dir: -dir, a: Math.PI, uturn: true, at: undefined };
    if (g.r.spur) { const j = (this.net.sides(), this.net.joint.get(g.r)); if (j && j.r === r && this.sNow !== undefined && (j.s - this.sNow) * dir > -1.5) { const o = (this.net.sides().get(r) || []).find((e) => e.spur === g.r); if (o) { const i = Math.max(0, r.s.findIndex((v) => v >= o.s) - 1), a = i * 3, In = Math.atan2((r.p[a + 3] - r.p[a]) * dir, (r.p[a + 4] - r.p[a + 1]) * dir); return { r: o.spur, dir: 1, a: wrapA(In - o.yaw), s0: Math.min(r.hw * 0.75, o.spur.len * 0.3), at: o.s - dir * (o.side * dir > 0 ? 0.75 : 0.1) }; } } return null; }
    return this.exits(r, dir).find((e) => e.r === g.r && e.dir === g.dir) || null;
  }
  choose(r, dir) { if (!this.next || this.next.from !== r || this.next.fdir !== dir || this.next.want !== this.want) this.next = { ...((!this.want && this.guided(r, dir)) || this.side(r, dir) || this.pick(r, dir, this.want)), from: r, fdir: dir, want: this.want }; return this.next; }
  // time: the cruise's clock, for the lights
  drive(car, others, dt, time = null, grip = 1) {
    const o = this.out, q = this.locate(car); o.drift = o.turbo = false;
    if (!q) { o.steer = 0; o.gas = 0.3; o.brake = 0; return o; }
    if (q.r !== this.road) { if (this.next && q.r === this.next.r && this.road === this.next.from) { this.dir = this.next.dir; this.want = 0; this.held = q.r.spur ? q.r : null; } else this.dir = q.c >= 0 ? 1 : -1; this.road = q.r; this.next = null; }
    if (this.heading && !this.held) { const d = this.heading(this.road); if (d && d !== this.dir) { this.dir = d; this.next = null; } } // (being guided, it turns about where it must)
    const r = this.road, v = Math.max(0, car.speed), s = r.s[q.i] + (r.s[q.i + 1] - r.s[q.i]) * q.t; this.sNow = s; if (this.held && (r !== this.held || s > 5 || s > r.len * 0.6)) this.held = null; if (this.next && this.next.at !== undefined && (this.next.at - s) * this.dir < -1.6) { this.next = null; this.want = 0; } const end = () => (this.next && this.next.from === this.road && this.next.at !== undefined ? this.next.at : this.dir > 0 ? r.len : 0); this.left = (end() - s) * this.dir;
    if (this.left < 1.2 && this.choose(r, this.dir).uturn) { this.dir = -this.dir; this.next = null; }
    const nx = this.choose(r, this.dir); this.left = Math.max(0, (end() - s) * this.dir); this.turn = nx;
    const p = this.ahead(r, this.dir, s, 1.1 + v * 0.3); let a = wrapA(Math.atan2(p.x - car.x, p.z - car.z) - car.yaw); o.steer = Math.max(-1, Math.min(1, -a * 2.4));
    // how fast: as set, less for what is coming
    let vt = this.obey && this.net.streets ? 30 : this.speed, last = null;
    for (let d = 0; d < 3 + (v * 1.1) / grip; d += 1.6) { const k = this.ahead(r, this.dir, s, d); if (last) { const c = Math.abs(wrapA(Math.atan2(k.dx, k.dz) - last)) / 1.6; if (c > 0.01) vt = Math.min(vt, Math.sqrt((6.5 * grip) / c + Math.max(0, d - 1.6) * 7 * grip)); } last = Math.atan2(k.dx, k.dz); }
    if (nx.at !== undefined) vt = Math.min(vt, Math.sqrt(3.4 + Math.max(0, this.left - 1.6) * 8)); else if (this.held) vt = Math.min(vt, 2.2); else if (Math.abs(nx.a) > 0.6) vt = Math.min(vt, Math.sqrt((Math.abs(nx.a) > 1.9 ? 4 : Math.abs(nx.a) > 0.95 ? 6.5 : 13) + Math.max(0, this.left - 2) * (Math.abs(nx.a) > 1.9 ? 6 : 9)));
    const st = this.net.streets; this.red = false;
    if (st) {
      this.limit = st.limit(r, s, this.dir); if (this.obey) vt = Math.min(vt, (this.limit / KMH) * (0.4 + 0.6 * grip));
      if (time !== null) { // a red light: stop at its line
        const q = st.ahead(r, s, this.dir, 3 + (v * 1.6) / grip); let sig = q && q[0], d = q && q[1];
        if (!sig && this.left < 2 + v * 1.2 && !nx.uturn) { const w = st.ahead(nx.r, nx.dir > 0 ? 0 : nx.r.len, nx.dir, 3); if (w) { sig = w[0]; d = this.left + w[1]; } }
        if (sig && d > 0.35) { const l = lightAt(sig, time), need = (v * v) / (14 * grip); if (l === 'red' || (l === 'amber' && d - 1 > need * 0.7)) { vt = Math.min(vt, Math.sqrt(Math.max(0, d - 1.15) * 9 * grip)); this.red = true; if (d < 1.35) vt = 0; } }
      }
    }
    if (this.stopIn) { const left = this.stopIn(); if (left !== null && left < 4 + (v * v) / 8) vt = Math.min(vt, Math.sqrt(0.2 + Math.max(0, left - 0.8) * 6 * grip)); } // (nearly there)
    if (Math.abs(a) > 1.2) vt = Math.min(vt, 1.7); else if (nx.uturn) vt = Math.min(vt, Math.sqrt(3 + this.left * 8));
    vt = this.yield(car, others, r, s, v, vt, grip);
    o.gas = v < vt - 0.15 ? Math.min(1, (vt - v) * 0.7) : 0; o.brake = v > vt + 0.35 ? Math.min(1, (v - vt) * 0.4) : 0;
    o.hold = vt < 0.06; if (o.hold) { o.gas = 0; o.brake = v > 0.12 ? 1 : 0; }
    // against a wall while it wants to go round: back, the other way about, as long as that helps
    const tight = Math.abs(a) > 1.0 && v < 1.1; this.rub = tight && car.wallT > 0 ? (this.rub || 0) + dt : Math.max(0, (this.rub || 0) - dt);
    if (v < 0.4 && vt > 1) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt);
    { let y = wrapA(car.yaw - (this.yaw0 ?? car.yaw)); this.yaw0 = car.yaw; if (Math.abs(o.steer) < 0.9) y = -(this.spin || 0) * Math.min(1, dt * 2); this.spin = (this.spin || 0) + y; } const round = Math.abs(this.spin) > 8; if (round) this.spin = 0; // (going round and round what it cannot reach)
    if (this.back <= 0 && (round || this.rub > 0.5 || this.stuck > 1.4)) { this.back = round ? 1.4 : tight ? 1.1 : 0.9; this.stuck = this.rub = 0; this.hit = 0.25; this.way = Math.abs(a) > 0.25 ? -Math.sign(o.steer) || 1 : 0; }
    if (this.back > 0) { this.back -= dt; this.hit -= dt; if ((this.hit < 0 && car.wallT > 0) || (this.way && Math.abs(a) < 0.45) || (this.hit < 0 && this.behind(car, others))) this.back = 0; o.hold = false; o.gas = 0; o.brake = 0.75; o.steer = this.way; }
    return o;
  }
  behind(car, others) { const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw); for (const c of others) { if (c === car || Math.abs(c.y - car.y) > 0.8) continue; const dx = c.x - car.x, dz = c.z - car.z, f = dx * fx + dz * fz; if (f < -0.2 && f > -1.5 && Math.abs(dx * fz - dz * fx) < 0.75) return true; } return false; }
  // how fast it may go for the others: behind whoever is ahead on its way, and not across who comes over it
  yield(car, others, r, s, v, vt, grip) {
    const reach = 2.2 + v * 1.15, fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), L = this.len || 0.62; let near = null;
    for (const c of others) { if (c === car || Math.abs(c.y - car.y) > 0.8) continue; const dx = c.x - car.x, dz = c.z - car.z; if (dx * dx + dz * dz < (reach + 5) ** 2) (near ||= []).push(c); } if (!near) return vt;
    const P = (this.path ||= []); let n = 0; for (let d = 0; d <= reach; d += 0.7) P[n++] = this.ahead(r, this.dir, s, d); const off = -((car.x - P[0].x) * P[0].dz - (car.z - P[0].z) * P[0].dx);
    for (const c of near) {
      const half = (c.L || 0.62) + L, dx = c.x - car.x, dz = c.z - car.z, f0 = dx * fx + dz * fz, l0 = Math.abs(dx * fz - dz * fx); let best = 1e9, at = 0, k0 = 0;
      for (let k = 0; k < n; k++) { const e = Math.min(1, (k * 0.7) / 2.5), px = P[k].x - -P[k].dz * 0 + (1 - e) * (car.x - P[0].x), pz = P[k].z + (1 - e) * (car.z - P[0].z), d = Math.hypot(c.x - px, c.z - pz); if (d < best) { best = d; at = k * 0.7; k0 = k; } }
      const along = (c.vx * P[k0].dx + c.vz * P[k0].dz), same = Math.sin(c.yaw) * P[k0].dx + Math.cos(c.yaw) * P[k0].dz;
      if (best < 0.62 && (f0 > 0.1 || at > 1) && (same > 0.3 || Math.hypot(c.vx, c.vz) < 0.5)) { const gap = Math.min(at, Math.max(f0, at * 0.6)) - half - 0.12, vs = Math.max(0, along); vt = Math.min(vt, gap <= 0.05 ? Math.max(0, Math.min(vs - 0.4, vs * 0.8)) : Math.sqrt(vs * vs + 2 * 4.2 * grip * gap) < vt ? Math.min(vt, vs + Math.min(gap * 1.1, Math.sqrt(2 * 4.2 * grip * gap))) : vt); continue; }
      if (Math.hypot(c.vx, c.vz) < 0.5) continue; // (what comes over the way: where it will be when one is there)
      for (let t = 0.2; t < 2.4; t += 0.2) { const d = Math.max(v, 1.2) * t, k = Math.min(n - 1, Math.round(d / 0.7)); if (d > reach) break; const ox = c.x + c.vx * t - P[k].x, oz = c.z + c.vz * t - P[k].z; if (Math.hypot(ox, oz) < 0.66 && d > 0.9) { const stop = d - half - 0.25; if (stop > -0.2 || v < 1) vt = Math.min(vt, Math.sqrt(Math.max(0, stop) * 8 * grip)); break; } }
      void l0;
    }
    void off; return vt;
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
