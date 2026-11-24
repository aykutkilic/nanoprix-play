// Limits, lights and crossings along the roads (baked from OSM, tools/streets.mjs).
import { KMH } from './units.js';

export const CYCLE = 24, GREEN = 14, AMBER = 2.2; // seconds; the rest is red
const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 2246822519); n = Math.imul(n ^ (n >>> 13), 3266489917); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
// what a set of lights shows, t seconds into the cruise: a pure function, so everybody sees the same
export function lightAt(sig, t) { const p = (((t + sig.off) % CYCLE) + CYCLE) % CYCLE; return p < GREEN ? 'green' : p < GREEN + AMBER ? 'amber' : 'red'; }
// the first moment from t on when it is green
export function greenFrom(sig, t) { const p = (((t + sig.off) % CYCLE) + CYCLE) % CYCLE; return p < GREEN - 0.3 ? t : t + CYCLE - p; }

export class Streets {
  constructor(net, data) {
    this.net = net; this.data = data; net.streets = this;
    this.signals = data.signals.filter((q) => net.byId.has(q.road)).map((q, i) => ({ ...q, id: i, r: net.byId.get(q.road), off: hash(i * 7919 + 13) * CYCLE }));
    this.byRoad = new Map(); for (const q of this.signals) { if (!this.byRoad.has(q.r.index)) this.byRoad.set(q.r.index, []); this.byRoad.get(q.r.index).push(q); }
    this.limits = net.roads.map((r) => { const e = data.roads[r.id] || (r.spur ? { fwd: [[0, 30]], back: [[r.len, 30]] } : { fwd: [[0, 50]], back: [[r.len, 50]] }); return { fwd: e.fwd, back: e.back }; });
  }
  // the limit (km/h) at s on a road, going its way (1) or against it (−1)
  limit(r, s, dir) { const e = this.limits[r.index]; if (!e) return 50; if (dir > 0) { let v = e.fwd[0][1]; for (const [q, x] of e.fwd) if (q <= s + 0.5) v = x; return v; } let v = e.back[0][1]; for (const [q, x] of e.back) if (q >= s - 0.5) v = x; return v; }
  // lights ahead on this road within `reach`: [signal, distance]
  ahead(r, s, dir, reach) { let best = null; for (const q of this.byRoad.get(r.index) || []) { const d = (q.s - s) * dir; if (d > -0.2 && d < reach && (!best || d < best[1])) best = [q, d]; } return best; }
  // a course's lights by distance along it
  along(course) {
    const out = []; for (const q of this.signals) { if (!course.only.has(q.r.index)) continue; const i = Math.round((q.s / q.r.len) * (q.r.n - 1)) * 3, x = q.r.p[i], z = q.r.p[i + 1]; let b = 9, k = -1; for (let j = 0; j < course.n; j++) { const d = Math.hypot(course.x[j] - x, course.z[j] - z); if (d < b) { b = d; k = j; } } if (k >= 0 && b < 2.5) out.push({ s: course.s[k], sig: q }); }
    return out.sort((a, b) => a.s - b.s);
  }
}
export const kmh = (u) => u * KMH;
