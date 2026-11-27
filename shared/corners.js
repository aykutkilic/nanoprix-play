// The corners where roads meet (after citymaker's junctions, docs/spec/03-network.md 3.6, crates/core/src/junction.rs):
// wherever the edge of one road crosses the edge of another at its level, the corner outside both is rounded
// by an arc that leaves the one edge and arrives at the other along their directions. Between the arc and
// the crossing it is road. And each end of a road that meets others has a mouth: how far from its end it
// still overlaps them, or a corner's arc runs along it. The paint on it stops there; a stop line stands there.
// One rule for the hubs, for side streets coming off a road and for those crossing one.

const CELL = 4;
// the radius of a corner's kerb, by the smaller of the two roads; and how far along an edge an arc may reach
const RADIUS = { spur: 0.8, lane: 0.8, street: 0.85, shore: 1.0, avenue: 1.0, motorway: 1.2 };
const REACH = 1.8;
// where a race turns back round from one road into another all but alongside it (test/junctions.test.js finds them from
// shared/courses.js): there the round is whole, drawn and driven, with room to turn – not cut straight where no road goes
export const TURNS_BACK = new Set(['libK', 'erenS']); // (not fsmA, 32°: whole, its round holds a bot up there; nor yenikapi: whole, it runs into the car park, and the bots turn there cut)
const RANK = { spur: 0, lane: 0, street: 0, shore: 1, avenue: 2, motorway: 3 };

// the edges of a road: side +1 and -1, as client/roads.js draws them (x - dz * sd * hw, z + dx * sd * hw)
function edgeDirs(r) {
  const n = r.n, D = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3, dx = r.p[b] - r.p[a], dz = r.p[b + 1] - r.p[a + 1], l = Math.hypot(dx, dz) || 1; D[i * 2] = dx / l; D[i * 2 + 1] = dz / l; }
  return D;
}
export function buildCorners(net) {
  const roads = net.roads, dirs = roads.map(edgeDirs), level = (r, i) => !(r.bridge[i] || (r.tunnel && r.tunnel[i]));
  // each road's two edges, worked out once: x, z of side +1 then side -1 at each point
  const edges = roads.map((r, k) => { const D = dirs[k], E = new Float64Array(r.n * 4); for (let i = 0; i < r.n; i++) { const x = r.p[i * 3], z = r.p[i * 3 + 1], ox = -D[i * 2 + 1] * r.hw, oz = D[i * 2] * r.hw; E[i * 4] = x + ox; E[i * 4 + 1] = z + oz; E[i * 4 + 2] = x - ox; E[i * 4 + 3] = z - oz; } return E; });
  // the drawn round of a hub: as wide as the narrowest road there (it rounds the outside of a bend; the corners do the rest)
  for (const d of net.discs) {
    if (!d.hub) { d.rd = d.r; continue; }
    let m = Infinity, M = 0; const ways = [];
    for (const e of net.adj.get(d.hub) || []) { const r = e.r; m = Math.min(m, r.hw); M = Math.max(M, r.hw); for (const end of r.a === d.hub && r.b === d.hub ? [0, r.n - 1] : [r.a === d.hub ? 0 : r.n - 1]) { const st = end ? -1 : 1; let i = end; while (i + st >= 0 && i + st < r.n && Math.hypot(r.p[i * 3] - d.x, r.p[i * 3 + 1] - d.z) < d.r) i += st; ways.push(Math.atan2(r.p[i * 3] - d.x, r.p[i * 3 + 1] - d.z)); } }
    // where two roads leave it all but together, one turns back round from the one into the other: there it stays round and wide
    let sharp = false; for (let a = 0; a < ways.length; a++) for (let b = a + 1; b < ways.length; b++) { const g = Math.abs(Math.atan2(Math.sin(ways[a] - ways[b]), Math.cos(ways[a] - ways[b]))); if (g < 0.52) sharp = true; }
    if (TURNS_BACK.has(d.hub)) { d.poly = null; sharp = true; }
    // where the roads bend round it (more than 200° on its outer side without a road), it rounds that outer side as wide as the widest of them
    const W = [...ways].sort((a, b) => a - b); let open = W.length ? 2 * Math.PI - (W[W.length - 1] - W[0]) : 0; for (let k = 1; k < W.length; k++) open = Math.max(open, W[k] - W[k - 1]);
    d.rd = sharp || !Number.isFinite(m) ? d.r : (open > 3.5 ? M : m) - 0.03; // (else just inside the roads where they run on through it, so no kerb lies on theirs)
  }
  // is (x, z) on any road about height y (but `but`), or in a hub's drawn round? how far in
  const onRoad = (x, z, y, but, slack = 0.02) => { let c = false; net.around(x, z, (q, i, t, dd, h) => { if (!c && !but.includes(q) && dd < q.hw - slack && Math.abs(h - y) < 0.5) c = true; }); if (c) return true; for (const d of net.discsAt(x, z)) if (Math.abs(d.h - y) < 0.9 && Math.hypot(d.x - x, d.z - z) < d.rd - slack) return true; return false; };
  const hOn = (r, x, z, y) => { let best = null, bd = 1e9; net.around(x, z, (q, i, t, dd, h) => { if (q === r && Math.abs(h - y) < 0.6 && dd < bd) { bd = dd; best = h; } }); return best ?? y; };
  const offEdge = (r, x, z, y) => { let bd = 1e9; net.around(x, z, (q, i, t, dd, h) => { if (q === r && Math.abs(h - y) < 0.6) bd = Math.min(bd, dd); }); return Math.abs(bd - r.hw); };

  const found = [];
  const lev = roads.map((r) => { const L = new Uint8Array(r.n); for (let i = 0; i < r.n; i++) L[i] = level(r, i) ? 1 : 0; return L; });
  // the stretches that may cross, by cell: each where its edges' box lies (not as wide as net.cells, which reaches round each for who drives)
  const grid = new Map();
  for (const r of roads) { const E = edges[r.index], L = lev[r.index]; for (let i = 0; i + 1 < r.n; i++) { if (!L[i] || !L[i + 1]) continue; const k = i * 4; let x0 = Math.min(E[k], E[k + 2], E[k + 4], E[k + 6]), x1 = Math.max(E[k], E[k + 2], E[k + 4], E[k + 6]), z0 = Math.min(E[k + 1], E[k + 3], E[k + 5], E[k + 7]), z1 = Math.max(E[k + 1], E[k + 3], E[k + 5], E[k + 7]);
    for (let a = Math.floor(x0 / CELL); a <= Math.floor(x1 / CELL); a++) for (let b = Math.floor(z0 / CELL); b <= Math.floor(z1 / CELL); b++) { const key = a * 8192 + b; let l = grid.get(key); if (!l) grid.set(key, (l = [])); l.push(r.index, i); } } }
  for (const [key, list] of grid) {
    const n = list.length;
    for (let p = 0; p < n; p += 2) {
      const ra = list[p], ja = list[p + 1]; if (!lev[ra][ja] || !lev[ra][ja + 1]) continue;
      const RA = roads[ra], xa = RA.p[ja * 3], za = RA.p[ja * 3 + 1];
      for (let q = p + 2; q < n; q += 2) {
        const rb = list[q]; if (rb === ra) continue;
        const jb = list[q + 1]; if (!lev[rb][jb] || !lev[rb][jb + 1]) continue;
        const RB = roads[rb], lim = RA.hw + RB.hw + 3.4; if (Math.abs(xa - RB.p[jb * 3]) > lim || Math.abs(za - RB.p[jb * 3 + 1]) > lim) continue;
        const sw = ra > rb, A = sw ? RB : RA, B = sw ? RA : RB, ia = sw ? jb : ja, ib = sw ? ja : jb, EA = edges[A.index], EB = edges[B.index];
        for (let oa = 0; oa <= 2; oa += 2) for (let ob = 0; ob <= 2; ob += 2) {
          const ax = EA[ia * 4 + oa], az = EA[ia * 4 + oa + 1], bx = EA[ia * 4 + 4 + oa], bz = EA[ia * 4 + 5 + oa], cx = EB[ib * 4 + ob], cz = EB[ib * 4 + ob + 1], rx = bx - ax, rz = bz - az, sx = EB[ib * 4 + 4 + ob] - cx, sz = EB[ib * 4 + 5 + ob] - cz, den = rx * sz - rz * sx;
          if (Math.abs(den) < 1e-12) continue;
          const qx = cx - ax, qz = cz - az, t = (qx * sz - qz * sx) / den; if (t < 0 || t >= 1) continue;
          const u = (qx * rz - qz * rx) / den; if (u < 0 || u >= 1) continue;
          const P = [ax + rx * t, az + rz * t];
          if (Math.floor(P[0] / CELL) * 8192 + Math.floor(P[1] / CELL) !== key) continue; // (each crossing once: in the cell it lies in)
          const yA = A.p[ia * 3 + 2] + (A.p[ia * 3 + 5] - A.p[ia * 3 + 2]) * t, yB = B.p[ib * 3 + 2] + (B.p[ib * 3 + 5] - B.p[ib * 3 + 2]) * u;
          if (Math.abs(yA - yB) > 0.4) continue;
          found.push({ A, B, ia, ib, sa: oa ? -1 : 1, sb: ob ? -1 : 1, P, yA, yB, t, u });
        }
      }
    }
  }
  const corners = [];
  for (const f of found) {
    const { A, B, ia, ib, sa, sb, P } = f, DA = dirs[A.index], DB = dirs[B.index], y = (f.yA + f.yB) / 2;
    // along each edge, the way that leads out of the other road; the corner outside both lies between them
    const ax = DA[ia * 2] + (DA[ia * 2 + 2] - DA[ia * 2]) * f.t, az = DA[ia * 2 + 1] + (DA[ia * 2 + 3] - DA[ia * 2 + 1]) * f.t, al = Math.hypot(ax, az) || 1;
    const bx = DB[ib * 2] + (DB[ib * 2 + 2] - DB[ib * 2]) * f.u, bz = DB[ib * 2 + 1] + (DB[ib * 2 + 3] - DB[ib * 2 + 1]) * f.u, bl = Math.hypot(bx, bz) || 1;
    const nA = [-az / al * sa, ax / al * sa], nB = [-bz / bl * sb, bx / bl * sb]; // (outwards from each)
    let u = [ax / al, az / al], v = [bx / bl, bz / bl];
    if (u[0] * nB[0] + u[1] * nB[1] < 0) u = [-u[0], -u[1]];
    if (v[0] * nA[0] + v[1] * nA[1] < 0) v = [-v[0], -v[1]];
    const cos = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])), th = Math.acos(cos);
    if (th < 0.14 || th > 2.97) continue; // (a sliver, or all but straight on)
    const wl = Math.hypot(u[0] + v[0], u[1] + v[1]), w = [(u[0] + v[0]) / wl, (u[1] + v[1]) / wl];
    if (onRoad(P[0] + w[0] * 0.25, P[1] + w[1] * 0.25, y, [])) continue; // (the corner lies in a third road, or a hub's round)
    const tan = Math.tan(th / 2);
    let R = Math.min(RADIUS[A.spur ? 'spur' : A.style] ?? 0.8, RADIUS[B.spur ? 'spur' : B.style] ?? 0.8), L = R / tan;
    const reach = th < 0.61 && !A.spur && !B.spur ? 4.5 : REACH; if (L > reach) { L = reach; R = L * tan; } // (two roads parting narrowly: a longer gore before the nose, hatched: junctionPaint)
    // the arc, T1 to T2 round C, with its heights from the one road's to the other's; smaller where it would run into a road
    // (a side street that bends right where it comes off: the straight edge the arc was fitted to is not where its edge is)
    let made = null;
    for (let k = 0; k < 3 && !made; k++, L /= 2, R /= 2) {
      if (R < 0.12) break;
      const T1 = [P[0] + u[0] * L, P[1] + u[1] * L], T2 = [P[0] + v[0] * L, P[1] + v[1] * L];
      if (onRoad(T1[0], T1[1], y, [A], -0.01) || onRoad(T2[0], T2[1], y, [B], -0.01) || offEdge(A, T1[0], T1[1], y) > 0.06 || offEdge(B, T2[0], T2[1], y) > 0.06) continue;
      const cd = R / Math.sin(th / 2), C = [P[0] + w[0] * cd, P[1] + w[1] * cd];
      const y1 = hOn(A, T1[0], T1[1], y), y2 = hOn(B, T2[0], T2[1], y), a1 = Math.atan2(T1[0] - C[0], T1[1] - C[1]); let da = Math.atan2(T2[0] - C[0], T2[1] - C[1]) - a1; da = Math.atan2(Math.sin(da), Math.cos(da));
      const N = Math.max(4, Math.ceil((Math.abs(da) * R) / 0.15)), arc = [];
      for (let j = 0; j <= N; j++) { const g = a1 + (da * j) / N; arc.push([C[0] + Math.sin(g) * R, C[1] + Math.cos(g) * R, y1 + ((y2 - y1) * j) / N]); }
      if (arc.some(([x, z], j) => j > 0 && j < N && onRoad(x, z, y, [], 0.05))) continue;
      made = { T1, T2, C, R, arc, y1, y2 };
    }
    if (!made) continue;
    const { T1, T2, C, arc, y1, y2 } = made; R = made.R;
    const lo = (RANK[A.spur ? 'spur' : A.style] ?? 0) <= (RANK[B.spur ? 'spur' : B.style] ?? 0) ? A : B;
    corners.push({ x: P[0], z: P[1], h: y, P, T1, T2, C, R, u, v, arc, a: A, b: B, style: lo.spur ? 'street' : lo.style, y1, y2 });
  }
  // a lookup by cell
  const cells = new Map();
  for (const c of corners) {
    const xs = [c.P[0], c.T1[0], c.T2[0], c.C[0]], zs = [c.P[1], c.T1[1], c.T2[1], c.C[1]];
    for (let a = Math.floor((Math.min(...xs) - 0.8) / CELL); a <= Math.floor((Math.max(...xs) + 0.8) / CELL); a++) for (let b = Math.floor((Math.min(...zs) - 0.8) / CELL); b <= Math.floor((Math.max(...zs) + 0.8) / CELL); b++) { const k = a * 8192 + b; let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(c); }
  }
  return { corners, cells };
}

// how far inside a corner's road (x, z) is: how far from its kerb, the arc; negative beyond it; -Infinity where it is
// not about the corner at all. The corner's road is what lies between the crossing P, the arc's ends T1 and T2, and the arc.
export function cornerIn(c, x, z) {
  const side = (a, b) => (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]), s0 = Math.sign(side(c.P, c.T1) * 0 + ((c.T1[0] - c.P[0]) * (c.T2[1] - c.P[1]) - (c.T1[1] - c.P[1]) * (c.T2[0] - c.P[0]))) || 1;
  const e = 0.02, l1 = Math.hypot(c.T1[0] - c.P[0], c.T1[1] - c.P[1]) || 1, l2 = Math.hypot(c.T2[0] - c.T1[0], c.T2[1] - c.T1[1]) || 1, l3 = Math.hypot(c.P[0] - c.T2[0], c.P[1] - c.T2[1]) || 1;
  if ((s0 * side(c.P, c.T1)) / l1 < -e || (s0 * side(c.T1, c.T2)) / l2 < -e || (s0 * side(c.T2, c.P)) / l3 < -e) return -Infinity;
  return Math.hypot(x - c.C[0], z - c.C[1]) - c.R;
}

// the mouths: of each end of each road, how far from it the road still overlaps another, or a corner's arc runs
// along it – as long as that goes on without a break from the end (a side street crossing further along is not the junction)
export function buildMouths(net) {
  const MAX = 8, feet = new Map();
  // of two roads that lie over one another, whose paint shows there: the greater's (the one first in the list, of two alike)
  const over = (q, r) => { const a = RANK[q.spur ? 'spur' : q.style] ?? 0, b = RANK[r.spur ? 'spur' : r.style] ?? 0; return a > b || (a === b && q.index < r.index); };
  for (const r of net.roads) r.mouth = [0, 0];
  for (const c of net.corners) for (const [r, T] of [[c.a, c.T1], [c.b, c.T2], [c.a, c.P], [c.b, c.P]]) {
    let best = null; net.around(T[0], T[1], (q, i, t, d) => { if (q === r && (!best || d < best.d)) best = { d, s: q.s[i] + (q.s[i + 1] - q.s[i]) * t }; });
    if (!best || best.d > r.hw + 0.1) continue;
    if (!feet.has(r)) feet.set(r, []); feet.get(r).push([best.s, r === c.a ? c.b : c.a]);
  }
  for (const r of net.roads) for (const end of [0, 1]) {
    // the corners that make this end's mouth: with the other roads of its hub, or with a greater road (a lesser one coming off it makes none)
    const hubEnd = r.spur ? null : end ? r.b : r.a, arms = new Set(hubEnd ? (net.adj.get(hubEnd) || []).map((e) => e.r) : []);
    const step = end ? -1 : 1, F = (feet.get(r) || []).filter(([, q]) => arms.has(q) || over(q, r)).map(([s]) => (end ? r.len - s : s));
    { const i = end ? r.n - 1 : 0, y = r.p[i * 3 + 2]; let near = F.some((f) => f < MAX); if (!near) net.around(r.p[i * 3], r.p[i * 3 + 1], (q, j, t, d, h) => { if (q !== r && d < q.hw + r.hw && Math.abs(h - y) < 0.5) near = true; }); if (!near) continue; } // (nothing meets it there)
    let last = -1;
    for (let i = end ? r.n - 1 : 0; i >= 0 && i < r.n; i += step) {
      const s = end ? r.len - r.s[i] : r.s[i]; if (s > MAX) break;
      const x = r.p[i * 3], z = r.p[i * 3 + 1], y = r.p[i * 3 + 2], a = Math.max(0, i - 1) * 3, b = Math.min(r.n - 1, i + 1) * 3, dx = r.p[b] - r.p[a], dz = r.p[b + 1] - r.p[a + 1], l = Math.hypot(dx, dz) || 1;
      let hit = false;
      for (const sd of [1, -1]) { const ex = x - (dz / l) * sd * (r.hw - 0.05), ez = z + (dx / l) * sd * (r.hw - 0.05); net.around(ex, ez, (q, j, t, d, h) => { if (q !== r && d < q.hw - 0.02 && Math.abs(h - y) < 0.5 && over(q, r)) hit = true; }); }
      let reach = hit ? s : -1;
      for (const f of F) if (f <= s + 1.6 && f >= (last < 0 ? -0.5 : last - 0.1) && (hit || last >= 0 || f < 1.6)) reach = Math.max(reach, f);
      if (reach >= 0) last = Math.max(last, reach); else if (last >= 0 && s - last > 1.2) break; else if (last < 0 && s > 1.6) break;
    }
    if (last >= 0) r.mouth[end] = Math.min(MAX, last + 0.1);
    // and out of the hub's round, where that is a junction's (not where a road only runs on into the next)
    const i0 = end ? r.n - 1 : 0, ex = r.p[i0 * 3], ez = r.p[i0 * 3 + 1];
    for (const d of net.discsAt(ex, ez)) { if (!d.hub || Math.abs(d.h - r.p[i0 * 3 + 2]) > 0.9) continue; const D = Math.hypot(d.x - ex, d.z - ez); if (D > d.rd || !(r.spur || (net.adj.get(d.hub) || []).length >= 3 || d.rd >= d.r)) continue; r.mouth[end] = Math.max(r.mouth[end], Math.min(MAX, d.rd - D + 0.15)); }
  }
}

// The lanes of a road as its asphalt paints them (client/roads.js' shader): per side, the metrobüs' two in the middle
// first if it has them (`b0` wide), then `lanes` lanes `lw` wide; lane k from the middle outwards is the k-th from the left.
// `osm`: how many lanes OpenStreetMap gives that way there (shared/streets.js), as many as fit at least half a unit wide each.
export function laneLayout(r, osm = 0) {
  const w = (RANK[r.spur ? 'spur' : r.style] ?? 0) + (r.bus ? 1 : 0), bz = w >= 3.5, b0 = bz ? 0.85 : 0;
  const lanes = osm > 0 ? Math.max(1, Math.min(osm, Math.floor((r.hw - 0.2 - b0) / 0.5))) : bz ? 2 : w >= 2.5 ? 3 : w > 0.5 ? 2 : 1;
  return { b0, lanes, lw: Math.max(0.3, (r.hw - 0.2 - b0) / lanes) };
}

// What is painted where roads meet (after citymaker's turns.rs and junction.rs): at each mouth of a road that gives way
// there, a stop line (a side street's: a broken line, it gives way); on the lanes of a road with two or more each way,
// before a junction of three roads or more, arrows for the ways on from each lane. Pure: client/signals.js paints it.
//   [{ kind: 'stop' | 'giveway', r, s, dir }, { kind: 'arrow', r, s, dir, u, ways: ['left', 'through', 'right'] }]
export function junctionPaint(net, lights = []) {
  const out = [], lit = new Map(); for (const q of lights) { if (!lit.has(q.r)) lit.set(q.r, []); lit.get(q.r).push(q.s); }
  const rank = (r) => (RANK[r.spur ? 'spur' : r.style] ?? 0);
  const plain = (r, s) => { const i = Math.max(0, Math.min(r.n - 1, Math.round((s / r.len) * (r.n - 1)))); return !r.bridge[i] && !(r.tunnel && r.tunnel[i]); };
  const nearLight = (r, s) => (lit.get(r) || []).some((t) => Math.abs(t - s) < 3.5);
  const away = (r, end, m) => { const s = end ? r.len - m : m, i = Math.max(0, Math.min(r.n - 2, Math.round((s / r.len) * (r.n - 1)))), a = i * 3, dx = r.p[a + 3] - r.p[a], dz = r.p[a + 4] - r.p[a + 1], l = Math.hypot(dx, dz) || 1; return end ? [-dx / l, -dz / l] : [dx / l, dz / l]; }; // (the way out of the junction along it)
  // roads that part from another at a narrow angle merge there: no stop line (a gore is painted between them, below)
  const merging = new Set(); for (const c of net.corners) { if (c.a.spur || c.b.spur) continue; const th = Math.acos(Math.max(-1, Math.min(1, c.u[0] * c.v[0] + c.u[1] * c.v[1]))); if (th <= 0.61) for (const r of [c.a, c.b]) { const e = (r.n - 1) * 3, end = Math.hypot(r.p[e] - c.P[0], r.p[e + 1] - c.P[1]) < Math.hypot(r.p[0] - c.P[0], r.p[1] - c.P[1]) ? 1 : 0; merging.add(`${r.index}:${end}`); } }
  for (const [hub, arms] of net.adj) {
    if (arms.length < 3) continue;
    const top = Math.max(...arms.map((e) => rank(e.r))), first = arms.filter((e) => rank(e.r) === top);
    for (const e of arms) {
      const r = e.r; if (r.style === 'motorway') continue;
      for (const end of r.a === hub && r.b === hub ? [0, 1] : [r.a === hub ? 0 : 1]) {
        const m = r.mouth[end], dir = end ? 1 : -1, s = end ? r.len - m : m; // (travelling towards the junction)
        if (r.one && dir < 0) continue; // (a one-way road only leaves here)
        if (m <= 0 || r.len < m * 2 + 3 || !plain(r, s)) continue;
        const gives = !(rank(r) === top && first.length <= 2);
        if (gives && !nearLight(r, s) && !merging.has(`${r.index}:${end}`)) out.push({ kind: 'stop', r, s: s - dir * 0.12, dir });
        const L = laneLayout(r, net.streets ? net.streets.lanes(r, s, dir) : 0); if (r.one || L.lanes < 2 || r.len < m + 6 || !plain(r, s - dir * 2.6)) continue;
        // the ways on: each other road's way out, seen from this one's way in
        const [ix, iz] = away(r, end, m).map((v) => -v), rx = -iz, rz = ix, ways = new Set();
        for (const o of arms) for (const oe of o.r.a === hub && o.r.b === hub ? [0, 1] : [o.r.a === hub ? 0 : 1]) { if ((o.r === r && oe === end) || (o.r.one && oe === 1)) continue; /* (not into a one-way road against it) */ const [ox, oz] = away(o.r, oe, Math.max(1, o.r.mouth[oe])), side = ox * rx + oz * rz, on = ox * ix + oz * iz; ways.add(side > 0.57 ? 'right' : side < -0.57 ? 'left' : on > 0 ? 'through' : side > 0 ? 'right' : 'left'); }
        const has = (w) => ways.has(w), lanes = [];
        for (let k = 0; k < L.lanes; k++) {
          const left = k === 0, right = k === L.lanes - 1, w = [];
          if (left && has('left')) w.push('left');
          if (has('through') && (!left && !right || L.lanes === 2 || (left && !has('left')) || (right && !has('right')))) w.push('through');
          if (right && has('right')) w.push('right');
          if (!w.length) w.push(has('through') ? 'through' : left ? 'left' : 'right');
          lanes.push(w);
        }
        lanes.forEach((w, k) => out.push({ kind: 'arrow', r, s: s - dir * 2.6, dir, u: L.b0 + L.lw * (k + 0.5), ways: w }));
      }
    }
  }
  // the gores: where two roads part at a narrow angle, the nose between them and, back from it, chevrons between their edges
  for (const c of net.corners) {
    if (c.a.spur || c.b.spur) continue;
    const th = Math.acos(Math.max(-1, Math.min(1, c.u[0] * c.v[0] + c.u[1] * c.v[1])));
    if (th > 0.61) continue;
    // (the corner's own road between the crossing and its kerb is the gore: hatched out to the nose)
    const L = Math.hypot(c.T1[0] - c.P[0], c.T1[1] - c.P[1]), M = Math.hypot(c.C[0] - c.P[0], c.C[1] - c.P[1]) - c.R;
    if (M > 0.5) out.push({ kind: 'gore', c, P: c.P, u: c.u, v: c.v, L, M, h: c.h });
  }
  // the side streets: where one comes off a road, or runs into one, it gives way there
  for (const r of net.spurs) for (const end of [0, 1]) {
    const m = r.mouth[end]; if (m <= 0.2 || r.len < m + 2) continue;
    const s = end ? r.len - m : m, dir = end ? 1 : -1; if (!plain(r, s)) continue;
    out.push({ kind: 'giveway', r, s: s - dir * 0.12, dir });
  }
  return out;
}
