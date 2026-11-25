// The ways down to the stations below: from the street by stairs, between an escalator down and one up, and along a
// passage to the wall of the hall. Worked out from the ground, the roads and the line alone, so the same for everybody.
export const PASS = { W: 0.82, H: 0.98, SLOPE: 0.6, EDGE: 0.3, GAP: 0.36, BACK: 0.75, OPEN: 1.95 }; // half as wide as it is; how high; how steep; the stairs' half width; where the escalators begin; the opening in the ground, behind the door's place and from there on
export const HALLS = { L: 8.4, W: 1.95, H: 1.75, E: 0.84, Y: 0.2, TW: 1.12, TH: 1.4 }; // (as client/under.js draws them)
const R = 1.1; // how round its corners are
// corners rounded: [[x, z], …] → points a step apart, or null where there is no room for one
function round(P) {
  const out = [], step = 0.25, put = (x, z) => { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - x, l[1] - z) > 0.03) out.push([x, z]); }, line = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(l / step)); for (let k = 0; k <= n; k++) put(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n); };
  let from = P[0], used = 0; for (let i = 1; i + 1 < P.length; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1], l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]); if (l1 < 0.05 || l2 < 0.05) return null; const d1 = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1], d2 = [(c[0] - b[0]) / l2, (c[1] - b[1]) / l2], th = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]); if (Math.abs(th) > 1.92) return null; const t = R * Math.tan(Math.abs(th) / 2); if (t + used > l1 + 1e-6 || t > l2) return null;
    const A = [b[0] - d1[0] * t, b[1] - d1[1] * t]; line(from, A); const sg = Math.sign(th) || 1, cx = A[0] - d1[1] * R * sg, cz = A[1] + d1[0] * R * sg, n = Math.ceil((Math.abs(th) * R) / step); for (let k = 1; k <= n; k++) { const q = (th * k) / n, ox = A[0] - cx, oz = A[1] - cz; put(cx + ox * Math.cos(q) - oz * Math.sin(q), cz + ox * Math.sin(q) + oz * Math.cos(q)); } from = [b[0] + d2[0] * t, b[1] + d2[1] * t]; used = t;
  }
  line(from, P[P.length - 1]); return out;
}
// way, q: the stop below; D: the door's place; to: where its road is; height(x, z); clear(x, z, m): nothing there; front(x, z): one may walk there
export function planEntry(way, q, D, to, height, clear, many = 1500, front = null) {
  const f0 = way.frame(q.s), { W, H, SLOPE, BACK, OPEN } = PASS, cap = HALLS, F = []; for (let s = q.s - 64; s <= q.s + 64; s += 1) if (s >= 0 && s <= way.len) { const f = way.frame(s); if (way.st[f[5]] === 2 || Math.abs(s - q.s) < cap.L) F.push([...f, s]); }
  const top0 = height(D.x, D.z); if (top0 - f0[1] < 1.5 || top0 - f0[1] > 9) return null;
  // in the line's own hall or tube?
  const hits = (x, y, z, m) => { let b = null, bd = 1e9; for (const f of F) { const d = (f[0] - x) ** 2 + (f[2] - z) ** 2; if (d < bd) { bd = d; b = f; } } if (!b || bd > 90) return false; const u = Math.abs(-(x - b[0]) * b[4] + (z - b[2]) * b[3]), v = Math.abs(b[6] - q.s), hall = v < cap.L + m, w = (hall ? cap.W : cap.TW) + m; return u < w && y < b[1] + (hall ? cap.H : cap.TH) + 0.06 && y + H > b[1] - 0.2; };
  const tries = [], away = Math.atan2(D.x - to.x, D.z - to.z), v1 = Math.min(q.s < OVER.V + 1 ? 3.9 : 5, way.len - q.s - 1.5), v0 = Math.max(way.len - q.s < OVER.V + 1 ? -3.9 : -5, 1.5 - q.s); // (clear of the footbridge's stairs where the line ends)
  for (let k = 0; k < 24; k++) {
    const a = away + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12), ax = Math.sin(a), az = Math.cos(a), T = [D.x - ax * BACK, D.z - az * BACK]; let ok = true; for (const al of [0, 0.9, OPEN]) for (const u of [-W - 0.12, 0, W + 0.12]) { const x = T[0] + ax * al - az * u, z = T[1] + az * al + ax * u; if (!clear(x, z, 0.12) || Math.abs(height(x, z) - top0) > 0.75) ok = false; } if (ok && front) for (const al of [-0.7, -1.5]) for (const u of [-0.5, 0.5]) if (!front(T[0] + ax * al - az * u, T[1] + az * al + ax * u)) ok = false; if (!ok) continue; const yT = height(T[0], T[1]);
    for (const sd of [1, -1]) for (let v = Math.ceil(v0); v <= v1; v += 1) { const e = way.frame(q.s + v), nx = -e[4] * sd, nz = e[3] * sd, E = [e[0] + nx * cap.W, e[2] + nz * cap.W], K = [E[0] + nx * 1.5, E[1] + nz * 1.5], yE = e[1] + cap.Y, run = Math.max(0.5, (yT - yE) / SLOPE), L = [T[0] + ax * (run + 0.4 + R), T[1] + az * (run + 0.4 + R)];
      for (const side of [0, 1, -1]) { const B = side ? [L[0] - az * side * 2.5, L[1] + ax * side * 2.5] : null, len = run + (B ? 2.5 + Math.hypot(K[0] - B[0], K[1] - B[1]) : Math.hypot(K[0] - L[0], K[1] - L[1])); tries.push({ c: len + Math.abs(k / 2) * 0.35 + (side ? 2 : 0), a: [ax, az], T, yT, yE, run, way: B ? [T, L, B, K, E] : [T, L, K, E], sd, v, E, n: [nx, nz] }); } }
  }
  tries.sort((p, r) => p.c - r.c); let looked = 0;
  for (const t of tries) {
    if (++looked > many) break; let pts = round(t.way); if (!pts) continue; const S = [0]; for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); const len = S[S.length - 1]; let ok = true;
    const P = pts.map(([x, z], i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { x, z, s: S[i], y: S[i] < t.run ? t.yT + ((t.yE - t.yT) * S[i]) / t.run : t.yE, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l }; });
    for (let i = 0; i < P.length && ok; i += 2) { const p = P[i]; for (const u of [-W, 0, W]) { const x = p.x - p.dz * u, z = p.z + p.dx * u; if (p.s < len - 0.9 && hits(x, p.y, z, 0.08)) { ok = false; break; } if (p.s > OPEN + 0.15 && p.s < len - 0.2 && height(x, z) < p.y + H + 0.1) { ok = false; break; } } }
    // (it does not run into itself)
    for (let i = 0; i < P.length && ok; i += 3) for (let j = i + 12; j < P.length; j += 3) if (P[j].s - P[i].s > 3.4 && Math.hypot(P[j].x - P[i].x, P[j].z - P[i].z) < 2 * W + 0.12 && Math.abs(P[j].y - P[i].y) < H + 0.1) { ok = false; break; }
    if (ok) return { P, len, run: t.run, a: t.a, top: { x: t.T[0], y: t.yT, z: t.T[1] }, sd: t.sd, v: t.v, s: q.s + t.v, drop: t.yT - t.yE };
  }
  return null;
}
// where along it (x, z) is: { s, u, y, i } – the nearest of it at about height y; null if it is not in it
export function inPass(E, x, z, y, m = 0) {
  let b = null, bd = 1e9; const P = E.P; for (let i = 0; i + 1 < P.length; i++) { const p = P[i], q = P[i + 1], ex = q.x - p.x, ez = q.z - p.z, L = ex * ex + ez * ez || 1e-9; let t = ((x - p.x) * ex + (z - p.z) * ez) / L; if (i > 0) t = Math.max(0, t); if (i + 2 < P.length) t = Math.min(1, t); if (t < -0.6 || t > 1.6) continue; const yy = p.y + (q.y - p.y) * Math.max(0, Math.min(1, t)); if (Math.abs(yy - y) > 0.75) continue; const d = Math.hypot(x - p.x - ex * t, z - p.z - ez * t) + Math.abs(yy - y) * 0.2; if (d < bd) { bd = d; b = { s: p.s + (q.s - p.s) * t, u: -(x - p.x) * p.dz + (z - p.z) * p.dx, y: yy, i, dx: p.dx, dz: p.dz }; } }
  return b && b.s > -0.05 - m && b.s < E.len + 0.05 + m && Math.abs(b.u) < PASS.W + m ? b : null;
}
// a place on it
export function onPass(E, s) { const P = E.P; s = Math.max(0, Math.min(E.len, s)); let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const k = (lo + hi) >> 1; if (P[k].s <= s) lo = k; else hi = k; } const p = P[lo], q = P[hi], t = (s - p.s) / Math.max(1e-6, q.s - p.s); return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t, dx: p.dx + (q.dx - p.dx) * t, dz: p.dz + (q.dz - p.dz) * t }; }
// an entry as it is kept (assets/entries.json) → as it is used
export function unpackEntry(e) { const P = []; for (let i = 0; i < e.p.length; i += 3) P.push({ x: e.p[i], y: e.p[i + 1], z: e.p[i + 2], s: 0, dx: 0, dz: 1 }); P.forEach((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1; p.dx = (b.x - a.x) / l; p.dz = (b.z - a.z) / l; p.s = i ? P[i - 1].s + Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z) : 0; }); return { P, len: P[P.length - 1].s, run: e.run, a: e.a, top: { x: P[0].x, y: P[0].y, z: P[0].z }, sd: e.sd, s: e.s }; }
// how high one stands in the passage at (x, z), about y; null: not there. Between the stairs and the escalators there is no way across
export function passFoot(E, x, z, y, m = 0) { const r = inPass(E, x, z, y, m); if (!r) return null; const u = Math.abs(r.u); if (u > PASS.W - 0.09) return null; if (r.s > 0.22 && r.s < E.run - 0.22 && u > PASS.EDGE - 0.03 && u < PASS.GAP + 0.04) return null; return r.y; }
// which escalator one stands on: 1 down, −1 up (keep to the right), 0 none
export const escalator = (E, r) => (r && r.s > 0.1 && r.s < E.run - 0.08 && Math.abs(r.u) > PASS.GAP ? Math.sign(r.u) : 0);
export const RIDE = 0.8; // how fast they go, along the ground
// the opening in the street: is (x, z) in it (1), on its wall (−1), or neither (0)
export function atOpening(E, x, z) { const dx = x - E.top.x, dz = z - E.top.z, al = dx * E.a[0] + dz * E.a[1], u = -dx * E.a[1] + dz * E.a[0], w = Math.abs(u); if (al < -0.05 || al > PASS.OPEN + 0.16 || w > PASS.W + 0.2) return 0; if (al > 0.02 && w > PASS.W - 0.09) return -1; return al > PASS.OPEN && al < PASS.OPEN + 0.16 ? -1 : al > 0 ? 1 : 0; }
// a footbridge over the rails in every hall: where, how high, how wide
export const OVER = { V: 6.9, Y: 1.05, D: 0.32, U: 1.42, RUN: 1.4 };
export const overAt = (entry, s, way) => { const v = entry && entry.s - s > 0 ? -OVER.V : OVER.V, ok = (q) => s + q > 0.9 && s + q < way.len - 0.9; return ok(v) || !ok(-v) ? v : -v; }; // (away from the door; where the line ends in the hall, on the side where there is line)
// how high one stands in a hall; null: nowhere (the rails are not to be walked on)
export function hallFoot(way, s, entry, x, z, y) {
  const C = HALLS; let v = 0, g = null; for (let k = 0; k < 4; k++) { g = way.frame(s + v); v += (x - g[0]) * g[3] + (z - g[2]) * g[4]; if (Math.abs(v) > C.L + 4) return null; } if (Math.abs(v) > C.L - 0.3 || s + v < 0.3 || s + v > way.len - 0.3) return null; g = way.frame(s + v); const u = -(x - g[0]) * g[4] + (z - g[2]) * g[3], w = Math.abs(u), h = y - g[1], door = !!entry && Math.sign(u) === entry.sd && Math.abs(v - (entry.s - s)) < PASS.W - 0.1; if (w > C.W - (door ? -0.12 : 0.12)) return null;
  const vb = overAt(entry, s, way), k = vb > 0 ? -1 : 1, dv = (v - vb) * k; // (dv: from the bridge towards the middle of the hall)
  if (w > OVER.U && dv > OVER.D && dv < OVER.D + OVER.RUN) { const t = OVER.Y - ((dv - OVER.D) / OVER.RUN) * (OVER.Y - C.Y); return Math.abs(t - h) < 0.3 ? g[1] + t : null; }
  if (h > OVER.Y - 0.32) return Math.abs(dv) < OVER.D - 0.05 || (w > OVER.U && dv > 0 && dv <= OVER.D) ? (w < C.W - 0.12 ? g[1] + OVER.Y : null) : null;
  return w > C.E + 0.04 ? g[1] + C.Y : null;
}
