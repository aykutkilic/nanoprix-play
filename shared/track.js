// The drivable city, without any drawing: roads as centrelines with a width
// and a height, found by place. A car may be anywhere inside any road at its
// own level – the union of them – so junctions need no special case, and a
// bridge and the road under it are told apart by height.

export class Network {
  constructor(data) {
    this.streets = null;
    this.hubs = new Map(data.hubs.map((h) => [h.id, h]));
    // the main roads first; then the side streets (`spur`), which belong to no junction
    this.roads = [...data.roads, ...(data.spurs || []).map((r) => ({ ...r, spur: true, a: null, b: null }))].map((r, index) => {
      const n = r.p.length / 3, p = Float32Array.from(r.p), s = new Float32Array(n);
      for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2]);
      return { ...r, index, n, p, s, len: s[n - 1], bridge: Uint8Array.from(r.br, (c) => +c), tunnel: r.tu ? Uint8Array.from(r.tu, (c) => +c) : null }; // (tunnel: 1 in a cutting, 2 under ground)
    });
    this.islands = new Map(); for (const q of data.islands || []) for (let u = -q.L - 2.5; u <= q.L + 2.5; u += 1) { const k = Math.floor((q.x + q.dx * u) / 4) * 8192 + Math.floor((q.z + q.dz * u) / 4); if (!this.islands.has(k)) this.islands.set(k, new Set()); this.islands.get(k).add(q); } // (the metrobüs' platforms, in the middle of the D100)
    this.main = this.roads.filter((r) => !r.spur); this.spurs = this.roads.filter((r) => r.spur);
    this.byId = new Map(this.roads.map((r) => [r.id, r]));
    this.cell = 4;
    this.cells = new Map();
    for (const r of this.roads) for (let i = 0; i + 1 < r.n; i++) {
      const x = r.p[i * 3], z = r.p[i * 3 + 1], R = r.hw + 1.2, k0 = Math.floor((x - R) / 4), k1 = Math.floor((x + R) / 4), l0 = Math.floor((z - R) / 4), l1 = Math.floor((z + R) / 4);
      for (let a = k0; a <= k1; a++) for (let b = l0; b <= l1; b++) { const k = a * 8192 + b; let q = this.cells.get(k); if (!q) this.cells.set(k, (q = [])); q.push(r.index, i); }
    }
    this.adj = new Map();
    // the round open ground where three or more meet: drivable, at the height
    // of the nearest road
    this.discs = [];
    const deg = new Map(); for (const r of this.main) for (const e of [r.a, r.b]) deg.set(e, (deg.get(e) || 0) + 1);
    const ends = this.spurs.filter((r) => !r.id.startsWith('p')).map((r) => ({ id: null, x: r.p[r.n * 3 - 3], z: r.p[r.n * 3 - 2], h: r.p[r.n * 3 - 1], r: r.hw })); // (a side street ends round)
    for (const h of [...this.hubs.values(), ...ends]) { const d = { hub: h.id, x: h.x, z: h.z, r: h.r || 3, h: h.h, deg: deg.get(h.id) || 1 }; this.discs.push(d); for (let a = Math.floor((h.x - d.r) / 4); a <= Math.floor((h.x + d.r) / 4); a++) for (let b = Math.floor((h.z - d.r) / 4); b <= Math.floor((h.z + d.r) / 4); b++) { const k = a * 8192 + b; if (!this.dcells) this.dcells = new Map(); let q = this.dcells.get(k); if (!q) this.dcells.set(k, (q = [])); q.push(d); } }
    for (const r of this.main) for (const [a, b] of [[r.a, r.b], [r.b, r.a]]) { if (!this.adj.has(a)) this.adj.set(a, []); this.adj.get(a).push({ to: b, r }); }
    // a junction is as wide as what meets there, not round: the hull of its roads' edges where they leave it (where no road goes, its edge is straight)
    for (const d of this.discs) { if (!d.hub) continue; const E = []; for (const r of [...this.main, ...this.spurs]) { const n = r.n, P = r.p; for (const e of [0, n - 1]) { if (Math.hypot(P[e * 3] - d.x, P[e * 3 + 1] - d.z) > d.r + 0.8 || Math.abs(P[e * 3 + 2] - d.h) > 1.2) continue; const s = e ? -1 : 1; let i = e; while (i + s >= 0 && i + s < n && Math.hypot(P[i * 3] - d.x, P[i * 3 + 1] - d.z) < d.r) i += s; const j = Math.max(0, Math.min(n - 1, i - s)), dx = P[i * 3] - P[j * 3], dz = P[i * 3 + 1] - P[j * 3 + 1], l = Math.hypot(dx, dz) || 1, w = r.hw + 0.05; E.push([P[i * 3] - (dz / l) * w, P[i * 3 + 1] + (dx / l) * w], [P[i * 3] + (dz / l) * w, P[i * 3 + 1] - (dx / l) * w]); } }
      if (E.length < 4) continue; const S = [...E].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = []; for (const p of S) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (const p of S.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } const H = [...lo.slice(0, -1), ...up.slice(0, -1)];
      if (H.length < 3) continue; let inside = true; for (let k = 0; k < H.length; k++) { const a = H[k], b = H[(k + 1) % H.length]; if (cr(a, b, [d.x, d.z]) <= 0.1) inside = false; } if (inside) { const span = (a, b) => { let t = Math.atan2(b[0] - d.x, b[1] - d.z) - Math.atan2(a[0] - d.x, a[1] - d.z); t = Math.abs(Math.atan2(Math.sin(t), Math.cos(t))); return t; }; const cut = []; for (let k = 0; k < H.length; k++) { const a = H[k], b = H[(k + 1) % H.length]; if (span(a, b) <= 2.0) continue; let used = false; for (let t = 0.15; t < 0.9 && !used; t += 0.15) { const mx = a[0] + (b[0] - a[0]) * t, mz = a[1] + (b[1] - a[1]) * t, ox = mx - d.x, oz = mz - d.z, ol = Math.hypot(ox, oz) || 1; for (let f = 0.45; f <= 1.05 && !used; f += 0.15) { const px = mx + (ox / ol) * (d.r - ol) * f, pz = mz + (oz / ol) * (d.r - ol) * f; this.around(px, pz, (r, i, tt, D, h) => { if (D < r.hw - 0.1 && Math.abs(h - d.h) < 1.5) used = true; }); } } if (!used) cut.push([a, b]); } if (cut.length) d.poly = cut; } } /* (and not where a road comes in there after all) */ // (only across the side where no road goes: between roads it stays round, for who cuts the corner)
  }
  // how far within a junction a place is (its hull's, or its circle's)
  discIn(d, x, z) { const D = d.r - Math.hypot(x - d.x, z - d.z); if (!d.poly) return D; let m = D; for (const [a, b] of d.poly) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; m = Math.min(m, ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) / l); } return m; }
  // how far from a junction's middle its edge is, in direction t (sin t, cos t)
  discR(d, t) { if (!d.poly) return d.r; const ux = Math.sin(t), uz = Math.cos(t); let best = d.r; for (const [a, b] of d.poly) { const ex = b[0] - a[0], ez = b[1] - a[1], den = ux * ez - uz * ex; if (Math.abs(den) < 1e-9) continue; const s = ((a[0] - d.x) * ez - (a[1] - d.z) * ex) / den, q = ((a[0] - d.x) * uz - (a[1] - d.z) * ux) / den; if (s > 0 && q >= -1e-6 && q <= 1 + 1e-6) best = Math.min(best, s); } return best; }

  // where each side street leaves the road it comes off: by that road, [{ s, spur, side: +1 right of its direction, x, z }]
  sides() {
    if (this._sides) return this._sides; const M = (this._sides = new Map()); this.joint = new Map();
    for (const r of this.spurs) { const x = r.p[0], z = r.p[1], y = r.p[2]; let b = null; this.around(x, z, (q, i, t, d, h) => { if (q === r || d > q.hw || Math.abs(h - y) > 0.6) return; const k = d + (q.spur ? 0.4 : 0); if (!b || k < b.k) b = { k, q, i, t }; }); if (!b) continue; const { q, i, t } = b, s = q.s[i] + (q.s[i + 1] - q.s[i]) * t, a = i * 3, dx = q.p[a + 3] - q.p[a], dz = q.p[a + 4] - q.p[a + 1], e = Math.min(r.n - 1, 4) * 3, vx = r.p[e] - x, vz = r.p[e + 1] - z, o = { s, spur: r, side: dx * vz - dz * vx > 0 ? 1 : -1, yaw: Math.atan2(vx, vz) }; if (!M.has(q)) M.set(q, []); M.get(q).push(o); this.joint.set(r, { r: q, s, i }); }
    for (const l of M.values()) l.sort((a, b) => a.s - b.s); return M;
  }

  // calls fn(road, i, t, d, h) for each stretch within reach of a point
  around(x, z, fn, only) {
    const q = this.cells.get(Math.floor(x / 4) * 8192 + Math.floor(z / 4));
    if (!q) return;
    for (let k = 0; k < q.length; k += 2) {
      const r = this.roads[q[k]], i = q[k + 1];
      if (only && !only.has(r.index)) continue;
      const a = i * 3, ax = r.p[a], az = r.p[a + 1], dx = r.p[a + 3] - ax, dz = r.p[a + 4] - az, L = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / L;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - dx * t, ez = z - az - dz * t;
      fn(r, i, t, Math.sqrt(ex * ex + ez * ez), r.p[a + 2] + (r.p[a + 5] - r.p[a + 2]) * t);
    }
  }

  // The road under a point at height y (the highest within reach): where its
  // surface is, and how far inside its edge. null: nowhere near any.
  // drivable ground that is no road: a car park, a filling station's forecourt – polygons at a height (client/parking.js)
  addPads(list) { this.pcells ||= new Map(); for (const q of list) { const xs = q.q.map((p) => p[0]), zs = q.q.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), d = { ...q, x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: 0, road: { id: `pad:${q.name || ''}`, name: q.name || '', style: 'lane', spur: true, pad: true, hw: 1, n: 2, p: [(x0 + x1) / 2, (z0 + z1) / 2, q.h, (x0 + x1) / 2 + 0.01, (z0 + z1) / 2, q.h], s: Float32Array.from([0, 0.01]), len: 0.01, bridge: new Uint8Array(2), tunnel: null, index: -1 } };
    for (let a = Math.floor(x0 / 4); a <= Math.floor(x1 / 4); a++) for (let b = Math.floor(z0 / 4); b <= Math.floor(z1 / 4); b++) { const k = a * 8192 + b; let c = this.pcells.get(k); if (!c) this.pcells.set(k, (c = [])); c.push(d); } } }
  // how far inside a pad (x, z) is, about y: [how far, the pad] or null
  pad(x, z, y) { const L = this.pcells && this.pcells.get(Math.floor(x / 4) * 8192 + Math.floor(z / 4)); if (!L) return null; let best = null; for (const d of L) { if (Math.abs(d.h - y) > 1.2) continue; const q = d.q, n = q.length; let c = false, m = 1e9; for (let i = 0, j = n - 1; i < n; j = i++) { const [ax, az] = q[j], [bx, bz] = q[i]; if ((bz > z) !== (az > z) && x < ((ax - bx) * (z - bz)) / (az - bz) + bx) c = !c; const ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))); m = Math.min(m, Math.hypot(x - ax - ex * t, z - az - ez * t)); } const inside = c ? m : -m; if (!best || inside > best[0]) best = [inside, d]; } return best; }
  at(x, z, y, only, out = {}) {
    let bestIn = -1e9, found = false, sh = 0, sw = 0;
    out.road = null; out.disc = null;
    this.around(x, z, (r, i, t, d, h) => {
      const dy = h - y;
      if (dy > 0.62 || dy < -3.2 || (dy < -1.3 && r.tunnel && r.tunnel[i] === 2)) return; // (from above one does not fall into a tunnel)
      const inside = r.hw - d - Math.max(0, -dy - 0.8) * 2; // (a road far below counts only if nothing nearer is)
      if (inside > bestIn) { bestIn = inside; found = true; out.road = r; out.i = i; out.t = t; out.d = d; out.h = h; }
      const w = r.hw - d;
      if (w > 0 && dy > -0.8) { const k = w * w; sh += h * k; sw += k; } // (where roads overlap their heights blend)
    }, only);
    const pd = !only && this.pcells ? this.pad(x, z, y) : null;
    if (!found) { if (!pd || pd[0] < -0.5) return null; const d = pd[1]; out.road = d.road; out.i = 0; out.t = 0; out.d = 0; out.h = d.h; out.inside = pd[0]; out.disc = { x: d.cx ?? d.x, z: d.cz ?? d.z, h: d.h, r: 0, pad: d }; out.s = 0; return out; }
    out.inside = out.road.hw - out.d;
    if (sw > 0) out.h = sh / sw;
    const ds = this.dcells.get(Math.floor(x / 4) * 8192 + Math.floor(z / 4));
    if (ds) for (const d of ds) { const I = d.r - Math.hypot(x - d.x, z - d.z); if (I > out.inside && Math.abs(d.h - y) < 1.2) { out.inside = I; out.disc = d; } } // (round for who drives: the cut shape, discR, is only how it is drawn)
    if (pd && pd[0] > out.inside) { const d = pd[1]; out.inside = pd[0]; out.h = d.h; out.disc = { x: d.cx ?? d.x, z: d.cz ?? d.z, h: d.h, r: 0, pad: d }; }
    return out;
  }

  // the island one would be in: [it, how far along, how far to its right, its half width there (it tapers to a point)]
  island(x, z, y, m) {
    const S = this.islands.get(Math.floor(x / 4) * 8192 + Math.floor(z / 4)); if (!S) return null;
    for (const q of S) { if (Math.abs(q.h - y) > 0.7) continue; const ex = x - q.x, ez = z - q.z, u = ex * q.dx + ez * q.dz, e = Math.abs(u) - q.L; if (e > 2.5) continue; const w = (q.w + m) * (e <= 0 ? 1 : 1 - e / 2.5), v = -ex * q.dz + ez * q.dx; if (Math.abs(v) < w) return [q, u, v, w]; }
    return null;
  }

  // is a car in the tunnel (2), in a cutting (1), or neither?
  under(c) { const q = this.at(c.x, c.z, c.y + 0.15, null, (this.uq ||= {})); return q && q.road.tunnel ? q.road.tunnel[q.i] : 0; }

  // from a hub to the next by hubs that were put on the way (`+…`: where a road drawn by hand meets another)
  through(a, b) {
    const best = new Map([[a, 0]]), prev = new Map(), open = [a];
    while (open.length) { open.sort((p, q) => best.get(q) - best.get(p)); const h = open.pop(); if (h === b) break; if (h !== a && h[0] !== '+') continue; for (const e of this.adj.get(h) || []) { const d = best.get(h) + e.r.len; if (d < (best.get(e.to) ?? Infinity)) { best.set(e.to, d); prev.set(e.to, [h, e.r]); if (!open.includes(e.to)) open.push(e.to); } } }
    if (!prev.has(b)) throw new Error(`no road ${a} → ${b}`);
    const out = []; for (let h = b; h !== a;) { const [p, r] = prev.get(h); out.unshift([r, r.a === p ? 1 : -1]); h = p; } return out;
  }

  pathRoads(hubs) {
    const out = [];
    for (let k = 0; k < hubs.length; k++) {
      const a = hubs[k], b = hubs[(k + 1) % hubs.length], best = this.adj.get(a).filter((e) => e.to === b).sort((p, q) => p.r.len - q.r.len)[0];
      if (!best) { out.push(...this.through(a, b)); continue; }
      out.push([best.r, best.r.a === a ? 1 : -1]);
    }
    return out;
  }
}

// A closed course: one centreline with heights and widths by distance.
export class Course {
  constructor(net, def, reverse = false) {
    this.net = net; this.def = def; this.reverse = reverse;
    const hubs = reverse ? [def.hubs[0], ...def.hubs.slice(1).reverse()] : def.hubs;
    const path = net.pathRoads(hubs), pts = [];
    this.only = new Set(path.map(([r]) => r.index));
    for (const [r, dir] of path) for (let k = 0; k + 1 < r.n; k++) { const i = dir > 0 ? k : r.n - 1 - k; pts.push([r.p[i * 3], r.p[i * 3 + 1], r.p[i * 3 + 2], r.hw, r.index, r.tunnel ? r.tunnel[i] : 0, r.bus ? 1 : 0, r.tram ? 1 : 0]); }
    this.n = pts.length;
    this.x = Float32Array.from(pts, (p) => p[0]); this.z = Float32Array.from(pts, (p) => p[1]); this.h = Float32Array.from(pts, (p) => p[2]); this.hw = Float32Array.from(pts, (p) => p[3]); this.road = Uint16Array.from(pts, (p) => p[4]);
    this.tunnel = Uint8Array.from(pts, (p) => p[5]);
    this.bus = Float32Array.from(pts, (p) => p[6]); for (let k = 0; k < 6; k++) { const o = this.bus.slice(); for (let i = 0; i < this.n; i++) this.bus[i] = (o[(i - 1 + this.n) % this.n] + o[i] + o[(i + 1) % this.n]) / 3; } // (the metrobüs has the middle of it: traffic keeps out)
    this.tram = Float32Array.from(pts, (p) => p[7]); for (let k = 0; k < 6; k++) { const o = this.tram.slice(); for (let i = 0; i < this.n; i++) this.tram[i] = (o[(i - 1 + this.n) % this.n] + o[i] + o[(i + 1) % this.n]) / 3; } // (and of these a tram)
    this.s = new Float32Array(this.n + 1);
    for (let i = 0; i < this.n; i++) { const j = (i + 1) % this.n; this.s[i + 1] = this.s[i] + Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]); }
    this.len = this.s[this.n];
    this.round();
    for (let i = 0; i < this.n; i++) { const j = (i + 1) % this.n; this.s[i + 1] = this.s[i] + Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]); }
    this.len = this.s[this.n];
    // racing line: curvature, and the speed each bend takes
    this.line = new Float32Array(this.n); this.vmax = new Float32Array(this.n);
    this.relaxLine();
  }

  // corners at hubs, cut round within their open ground
  round() {
    const n = this.n, near = new Uint8Array(n);
    for (const d of this.net.discs) if (d.hub) for (let i = 0; i < n; i++) if (Math.hypot(this.x[i] - d.x, this.z[i] - d.z) < d.r + 3) near[i] = 1;
    for (let it = 0; it < 14; it++) for (let i = 0; i < n; i++) { if (!near[i]) continue; const a = (i - 1 + n) % n, b = (i + 1) % n; this.x[i] += 0.5 * ((this.x[a] + this.x[b]) / 2 - this.x[i]); this.z[i] += 0.5 * ((this.z[a] + this.z[b]) / 2 - this.z[i]); }
    for (let i = 0; i < n; i++) if (near[i]) { const q = this.net.at(this.x[i], this.z[i], this.h[i], this.only); if (q) this.h[i] = q.h; }
  }

  relaxLine() {
    const n = this.n, o = this.line, dir = (i) => { const a = (i - 1 + n) % n, b = (i + 1) % n, dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const D = Array.from({ length: n }, (_, i) => dir(i)), px = new Float32Array(n), pz = new Float32Array(n);
    for (let i = 0; i < n; i++) { px[i] = this.x[i]; pz[i] = this.z[i]; }
    for (let it = 0; it < 260; it++) for (let i = 0; i < n; i++) {
      const a = (i - 2 + n) % n, b = (i + 2) % n, mx = (px[a] + px[b]) / 2 - this.x[i], mz = (pz[a] + pz[b]) / 2 - this.z[i], lat = -D[i][1] * mx + D[i][0] * mz, lim = this.hw[i] - 0.65;
      o[i] += 0.35 * (Math.max(-lim, Math.min(lim, lat)) - o[i]);
      px[i] = this.x[i] - D[i][1] * o[i]; pz[i] = this.z[i] + D[i][0] * o[i];
    }
    // round the metrobüs' islands, on the nearer side
    { const S = new Set(); for (const q of this.net.islands.values()) for (const e of q) S.add(e); const keep = new Float32Array(n); for (const q of S) { let sd = 0; for (let i = 0; i < n; i++) if (Math.hypot(this.x[i] - q.x, this.z[i] - q.z) < 1.5 && Math.abs(this.h[i] - q.h) < 1) { sd = o[i] < 0 ? -1 : 1; } if (sd) for (let i = 0; i < n; i++) { const d = Math.hypot(this.x[i] - q.x, this.z[i] - q.z); if (d < q.L + 14 && Math.abs(this.h[i] - q.h) < 2) keep[i] = sd * Math.max(Math.abs(keep[i]), Math.min(1, (q.L + 14 - d) / 10)); } } for (let i = 0; i < n; i++) if (keep[i]) { const sd = Math.sign(keep[i]), w = Math.abs(keep[i]); if (o[i] * sd < 0.95) o[i] += (sd * 0.95 - o[i]) * w; px[i] = this.x[i] - D[i][1] * o[i]; pz[i] = this.z[i] + D[i][0] * o[i]; } }
    for (let i = 0; i < n; i++) {
      const a = (i - 3 + n) % n, b = (i + 3) % n, v1x = px[i] - px[a], v1z = pz[i] - pz[a], v2x = px[b] - px[i], v2z = pz[b] - pz[i], l = (Math.hypot(v1x, v1z) + Math.hypot(v2x, v2z)) / 2 || 1, cr = Math.abs(v1x * v2z - v1z * v2x) / (Math.hypot(v1x, v1z) * Math.hypot(v2x, v2z) || 1), k = Math.asin(Math.min(1, cr)) / l;
      this.vmax[i] = Math.min(40, Math.sqrt(17 / Math.max(k, 1e-4)));
    }
    for (let it = 0; it < 2; it++) for (let q = n - 1; q >= 0; q--) { const j = (q + 1) % n, ds = this.s[q + 1] - this.s[q]; this.vmax[q] = Math.min(this.vmax[q], Math.sqrt(this.vmax[j] ** 2 + 2 * 11 * ds)); }
  }

  idx(s) { // index of the sample before distance s
    s = ((s % this.len) + this.len) % this.len;
    let lo = 0, hi = this.n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    return lo;
  }
  // the place at distance s, `lat` to the right of the middle
  place(s, lat = 0, out = {}) {
    s = ((s % this.len) + this.len) % this.len;
    const i = this.idx(s), j = (i + 1) % this.n, t = (s - this.s[i]) / Math.max(1e-6, this.s[i + 1] - this.s[i]);
    const k = (i + 2) % this.n, h = (i - 1 + this.n) % this.n, mix = (f) => f[i] + (f[j] - f[i]) * t;
    const tx = (this.x[j] - this.x[h]) * (1 - t) + (this.x[k] - this.x[i]) * t, tz = (this.z[j] - this.z[h]) * (1 - t) + (this.z[k] - this.z[i]) * t, l = Math.hypot(tx, tz) || 1;
    out.dx = tx / l; out.dz = tz / l; out.hw = mix(this.hw); out.i = i; out.t = t;
    out.x = mix(this.x) - out.dz * lat; out.z = mix(this.z) + out.dx * lat; out.y = mix(this.h);
    out.yaw = Math.atan2(out.dx, out.dz);
    out.slope = (this.h[j] - this.h[i]) / Math.max(1e-6, this.s[i + 1] - this.s[i]);
    return out;
  }
  // where a car is along the course, looking near where it last was
  project(x, z, hint, span = 14) {
    let best = 1e9, bi = hint, bt = 0;
    for (let q = -span; q <= span; q++) {
      const i = (((hint + q) % this.n) + this.n) % this.n, j = (i + 1) % this.n, dx = this.x[j] - this.x[i], dz = this.z[j] - this.z[i], L = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - this.x[i]) * dx + (z - this.z[i]) * dz) / L)), d = (x - this.x[i] - dx * t) ** 2 + (z - this.z[i] - dz * t) ** 2;
      if (d < best) { best = d; bi = i; bt = t; }
    }
    return { i: bi, s: this.s[bi] + (this.s[bi + 1] - this.s[bi]) * bt, d: Math.sqrt(best) };
  }
  // grid: two by two behind the line
  grid(slot) { return this.place(this.len - 2.2 - Math.floor(slot / 2) * 2.2 - (slot % 2) * 1.0, (slot % 2 ? 1 : -1) * 0.72); }
}
