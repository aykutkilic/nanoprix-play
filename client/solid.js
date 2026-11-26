// What one on foot walks round, not through: the houses' walls, posts, trees, cars.
const inside = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) if (P[i + 1] > z !== P[j + 1] > z && x < ((P[j] - P[i]) * (z - P[i + 1])) / (P[j + 1] - P[i + 1]) + P[i]) c = !c; return c; };
const DEEP = 0.35; // (further in than this nobody walked there: they are let out)
export class Solids {
  constructor(W) { this.W = W; this.posts = null; this.walls = []; this.round = []; this.crowns = []; this.x = 1e9; this.z = 0; this.at = 0; this.out = { x: 0, z: 0 }; }
  // what is about; asked for again every few steps, and as the city comes
  about(x, z, now) {
    if (Math.abs(x - this.x) < 2.5 && Math.abs(z - this.z) < 2.5 && now - this.at < 1500) return; this.x = x; this.z = z; this.at = now; const W = this.W, R = 7;
    if (!this.posts) { this.posts = new Map(); for (const p of W.posts || []) { const k = `${Math.floor(p[0] / 12)},${Math.floor(p[2] / 12)}`; if (!this.posts.has(k)) this.posts.set(k, []); this.posts.get(k).push(p); } }
    this.crowns.length = this.round.length = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const p of this.posts.get(`${Math.floor(x / 12) + a},${Math.floor(z / 12) + b}`) || []) this.round.push(p);
    for (const { T, x0, z0, x1, z1 } of W.trees || []) { if (x < x0 - R || x > x1 + R || z < z0 - R || z > z1 + R) continue; for (let k = 0; k < T.length; k += 4) { const tx = T[k] / 20, tz = T[k + 1] / 20; if (Math.abs(tx - x) < R && Math.abs(tz - z) < R) { const s = T[k + 3] / 1000; this.round.push([tx, T[k + 2] / 400, tz, s * 0.45, 1.5]); this.crowns.push([tx, T[k + 2] / 400 + s * 0.85, tz, s * 1.12, s * 1.15]); } } }
    this.walls.length = 0; if (W.eachHouse) W.eachHouse(x, z, (B, o) => {
      const hx = B[o] / 20, hz = B[o + 1] / 20, y = B[o + 2] / 400, n = B[o + 5] & 255, P = []; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < n; k++) { const px = hx + B[o + 6 + k * 2] / 100, pz = hz + B[o + 7 + k * 2] / 100; P.push(px, pz); x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
      if (x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R) this.walls.push({ P, x0, x1, z0, z1, y0: y - 0.35, y1: y + B[o + 3] / 200 });
    });
  }
  // how far along from a to b (0 … 1) one sees, or may put a camera: up to the first wall or crown of leaves
  sight(ax, ay, az, bx, by, bz, r = 0.15) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dz) || 1e-6, sx = (-dz / L) * r, sz = (dx / L) * r; let t = 1;
    for (const w of this.walls) {
      if (Math.max(ax, bx) + r < w.x0 || Math.min(ax, bx) - r > w.x1 || Math.max(az, bz) + r < w.z0 || Math.min(az, bz) - r > w.z1 || Math.max(ay, by) < w.y0 || Math.min(ay, by) > w.y1 + 0.2) continue; const P = w.P, n = P.length;
      for (let i = 0; i < n; i += 2) { const px = P[i], pz = P[i + 1], ex = P[(i + 2) % n] - px, ez = P[(i + 3) % n] - pz; for (let k = -1; k <= 1; k++) { const ux = dx + sx * k, uz = dz + sz * k, D = ux * ez - uz * ex; if (Math.abs(D) < 1e-9) continue; const s = ((px - ax) * ez - (pz - az) * ex) / D, q = ((px - ax) * uz - (pz - az) * ux) / D; if (s >= 0 && s < t && q >= 0 && q <= 1 && ay + dy * s < w.y1 + 0.2) t = s; } }
    }
    if (t < 1) t = Math.max(0, t - 0.1 / L);
    if (this.W.palace) t = Math.min(t, this.W.palace.sight(ax, ay, az, ax + dx * t, ay + dy * t, az + dz * t) * t); // (and what the palace has built: client/topkapi.js)
    for (const [cx, cy, cz, R, H] of this.crowns) { // (an ellipsoid)
      const R1 = R + 0.06, H1 = H + 0.06, ox = (ax - cx) / R1, oy = (ay - cy) / H1, oz = (az - cz) / R1, vx = dx / R1, vy = dy / H1, vz = dz / R1, A = vx * vx + vy * vy + vz * vz, B = ox * vx + oy * vy + oz * vz, C = ox * ox + oy * oy + oz * oz - 1, q = B * B - A * C; if (q <= 0) continue; const s = C < 0 ? 1 : (-B - Math.sqrt(q)) / A; // (in a tree: its leaves are left out, world.js)
       if (s >= 0 && s < t) t = s;
    }
    return t;
  }
  // does a post stand in the way?
  post(ax, az, bx, bz, y) { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1e-6; for (const p of this.round) { if (p[4] >= 1.5 && p[3] > 0.15) continue; if (y < p[1] - 0.4 || y > p[1] + p[4]) continue; const t = Math.max(0, Math.min(1.15, ((p[0] - ax) * dx + (p[2] - az) * dz) / L)); if (Math.hypot(p[0] - ax - dx * t, p[2] - az - dz * t) < p[3] + 0.16) return true; } return false; }
  // is this within some house's walls?
  walled(x, z, y) { for (const w of this.walls) if (x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1 && y + 0.4 > w.y0 && y < w.y1 && inside(w.P, x, z)) return true; return false; }
  // (x, z) moved out of whatever it is in. houses: whether their walls count here; cars: { x, y, z, yaw } …
  push(x, z, y, r, houses, cars) {
    const o = this.out; for (let it = 0; it < 2; it++) {
      for (const p of this.round) if (y + 0.5 > p[1] - 0.3 && y < p[1] + p[4]) [x, z] = off(x, z, p[0], p[2], r * 0.7 + p[3]); // (an arm may brush by a post)
      for (const c of cars) if (Math.abs(c.y - y) < 0.6 && Math.abs(c.x - x) < 1.2 && Math.abs(c.z - z) < 1.2) { const sx = Math.sin(c.yaw), sz = Math.cos(c.yaw), e = Math.max(-0.3, Math.min(0.3, (x - c.x) * sx + (z - c.z) * sz)); [x, z] = off(x, z, c.x + sx * e, c.z + sz * e, r + 0.27); }
      if (houses) for (const w of this.walls) {
        if (x < w.x0 - r || x > w.x1 + r || z < w.z0 - r || z > w.z1 + r || y + 0.4 < w.y0 || y > w.y1) continue; let best = 1e9, bx = 0, bz = 0, nx = 0, nz = 0; const P = w.P, n = P.length;
        for (let i = 0; i < n; i += 2) { const ax = P[i], az = P[i + 1], dx = P[(i + 2) % n] - ax, dz = P[(i + 3) % n] - az, L = dx * dx + dz * dz; if (L < 1e-8) continue; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), ex = ax + dx * t, ez = az + dz * t, d = Math.hypot(x - ex, z - ez); if (d < best) { best = d; bx = ex; bz = ez; const l = Math.sqrt(L); nx = -dz / l; nz = dx / l; } }
        const within = inside(P, x, z); if (within ? best > DEEP : best >= r) continue; if (best > 1e-4) { const s = (within ? -1 : 1) / best; nx = (x - bx) * s; nz = (z - bz) * s; } x = bx + nx * r; z = bz + nz * r;
      }
    }
    o.x = x; o.z = z; return o;
  }
}
const off = (x, z, cx, cz, R) => { const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz); return d >= R ? [x, z] : d < 1e-4 ? [cx + R, cz] : [cx + (dx / d) * R, cz + (dz / d) * R]; };
