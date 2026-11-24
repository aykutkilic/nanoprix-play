// Everyday traffic on a course, the same for everybody without a word over
// the network: each vehicle keeps its lane and its speed, so where it is
// follows from the race's clock alone. And the simits to pick up.
import { greenFrom } from './streets.js';
const KINDS = ['taksi', 'taksi', 'sedan', 'sedan', 'hatch', 'hatch', 'suv', 'minibus', 'dolmus', 'otobus', 'kamyonet'];
export function makeTraffic(course, seed, density) { // density 0, 1, 2
  let r = (seed * 2654435761) >>> 0; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296); rnd();
  const out = [], gap = density === 2 ? 34 : 62; if (!density) return out;
  for (const dir of [1, -1]) for (let s = 50 + rnd() * 20; s < course.len - 30; s += gap * (0.6 + rnd() * 0.8)) out.push({ dir, s0: s, v: dir > 0 ? 4.2 : 3.6, kind: KINDS[Math.floor(rnd() * KINDS.length)], lane: 0.3 + rnd() * 0.28, hold: rnd() < 0.5 ? 0 : 1.6 });
  return out;
}
const P = {}, A = {}, B = {}, BR = 1.4; // seconds to stop or to get going
// How far vehicle v has gone, t seconds in. With lights on the course (course.lights) it waits at
// the red ones: its whole trip follows from the clock, worked out once from the start and kept.
function gone(v, course, t) {
  t = Math.max(0, t);
  const L = course.lights; if (!L || !L.length) return [v.v * t, v.v];
  const tl = v.trip && v.trip.course === course ? v.trip : (v.trip = { course, seg: [[0, 0, 0]], t: 0, d: 0, k: -1 }); // [from, gone by then, what: 0 drive, 1 brake, 2 wait, 3 set off]
  const half = (v.v * BR) / 2, n = L.length;
  while (tl.t <= t + 1) { // the next light on its way
    const s0 = v.dir > 0 ? (((v.s0 + tl.d) % course.len) + course.len) % course.len : (((v.s0 - tl.d) % course.len) + course.len) % course.len;
    let best = 1e9, sig = null; for (let i = 0; i < n; i++) { let d = v.dir > 0 ? L[i].s - s0 : s0 - L[i].s; if (d < 0) d += course.len; d -= 1.3 + (v.hold || 0); if (d > 2 * half + 0.4 && d < best) { best = d; sig = L[i].sig; } }
    if (!sig) { tl.t += 600; tl.d += v.v * 600; tl.seg.push([tl.t, tl.d, 0]); continue; }
    const arrive = tl.t + best / v.v, go = greenFrom(sig, arrive);
    if (go <= arrive) { tl.t = arrive; tl.d += best; continue; } // (green: straight on)
    const b0 = arrive - half / v.v; tl.seg.push([b0, tl.d + best - half, 1], [b0 + BR, tl.d + best, 2]);
    const g = Math.max(b0 + BR, go) + 0.5 + (v.hold || 0) * 0.4; tl.seg.push([g, tl.d + best, 3], [g + BR, tl.d + best + half, 0]); tl.t = g + BR; tl.d += best + half;
  }
  let lo = 0, hi = tl.seg.length; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tl.seg[m][0] <= t) lo = m; else hi = m; }
  const [t0, d0, what] = tl.seg[lo], x = t - t0;
  return what === 0 ? [d0 + v.v * x, v.v] : what === 1 ? [d0 + v.v * x - (v.v * x * x) / (2 * BR), v.v * (1 - x / BR)] : what === 2 ? [d0, 0] : [d0 + (v.v * x * x) / (2 * BR), (v.v * x) / BR];
}
// where vehicle v is, t seconds into the race
export function trafficAt(v, course, t, out = {}) {
  const [d, speed] = gone(v, course, t);
  const sc = v.s0 + v.dir * d; course.place(sc + 2.2, 0, A); course.place(sc - 2.2, 0, B); course.place(sc, 0, P); { const x = A.x - B.x, z = A.z - B.z, l = Math.hypot(x, z) || 1; P.dx = x / l; P.dz = z / l; P.yaw = Math.atan2(P.dx, P.dz); } // (round a corner the lane swings gently)
  const bz = course.bus ? course.bus[P.i] + (course.bus[(P.i + 1) % course.n] - course.bus[P.i]) * P.t : 0, lat = v.dir * (P.hw * v.lane * (1 - bz) + (1.3 + (v.lane - 0.3) * 2.2) * bz); // (they keep to the right)
  out.x = P.x - P.dz * lat; out.z = P.z + P.dx * lat; out.y = P.y; out.yaw = v.dir > 0 ? P.yaw : P.yaw + Math.PI; out.vx = P.dx * speed * v.dir; out.vz = P.dz * speed * v.dir; out.slope = P.slope * v.dir; out.mass = v.kind === 'otobus' ? 4 : 2; out.type = 'taksi'; out.braking = speed < v.v - 0.05; return out;
}
export function makeSimits(course, seed) {
  let r = (seed * 40503 + 77) >>> 0; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296); rnd();
  const out = [];
  for (let s = 40; s < course.len - 20; s += 34 + rnd() * 30) { const n = 1 + Math.floor(rnd() * 3), lat = (rnd() - 0.5) * 1.5; for (let k = 0; k < n; k++) { const i = course.idx(s + k * 2.2), L = Math.max(0, course.hw[i] - 0.6); course.place(s + k * 2.2, lat * L, P); out.push({ x: P.x, y: P.y, z: P.z, s: s + k * 2.2, taken: 0 }); } }
  return out;
}
