// Which signs stand where (pure: the drawing is client/signs.js). In the
// manner of Türkiye's: green on motorways, blue on city roads, brown for the
// sights, red-rimmed limits and warnings, a blue plate with the street's name.
import { PLACE, shield } from './places.js';

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// along a road from one of its ends: the frame `s` units in, travelling `dir` (1: a → b)
function frame(r, s, dir) {
  s = Math.max(0, Math.min(r.len, s)); let i = 0, hi = r.n - 2; while (i < hi) { const m = (i + hi) >> 1; if (r.s[m + 1] < s) i = m + 1; else hi = m; }
  const t = (s - r.s[i]) / Math.max(1e-6, r.s[i + 1] - r.s[i]), a = i * 3, dx = r.p[a + 3] - r.p[a], dz = r.p[a + 4] - r.p[a + 1], l = Math.hypot(dx, dz) || 1;
  return { x: r.p[a] + dx * t, z: r.p[a + 1] + dz * t, y: r.p[a + 2] + (r.p[a + 5] - r.p[a + 2]) * t, dx: (dx / l) * dir, dz: (dz / l) * dir, slope: ((r.p[a + 5] - r.p[a + 2]) / l) * dir, i };
}
// the ends of roads that lead to nothing: no other road there, no landmark, no pier. [{ r, dir, x, y, z, yaw }], dir: the way one comes to it
export function deadEnds(net, marks = [], ports = []) {
  const inside = (p, x, z) => { let r = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) r = !r; return r; };
  const edge = (p, x, z) => { if (inside(p, x, z)) return 0; let b = 1e9; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[j], c = p[i], vx = c[0] - a[0], vz = c[1] - a[1], t = Math.min(1, Math.max(0, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1))); b = Math.min(b, Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t)); } return b; };
  const out = [], look = (r, dir) => {
    const k = dir > 0 ? r.n - 1 : 0, j = dir > 0 ? Math.max(0, r.n - 4) : Math.min(r.n - 1, 3), x = r.p[k * 3], z = r.p[k * 3 + 1], y = r.p[k * 3 + 2]; let on = false; net.around(x, z, (q, i, t, d, h) => { if (q !== r && d < q.hw + r.hw + 0.2 && Math.abs(h - y) < 0.7) on = true; }); if (on) return;
    const reach = r.hw + 2.7; for (const m of marks) if (Math.hypot(m.x - x, m.z - z) < m.r + 12 && (m.hull ? edge(m.hull, x, z) : Math.hypot(m.x - x, m.z - z) - m.r) < reach) return; if (ports.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) return;
    out.push({ r, dir, x, y, z, yaw: Math.atan2(x - r.p[j * 3], z - r.p[j * 3 + 1]) });
  };
  for (const r of net.main) { if (net.adj.get(r.b).length === 1) look(r, 1); if (net.adj.get(r.a).length === 1) look(r, -1); } for (const r of net.spurs) look(r, 1); return out;
}
export function planSigns(net, marks = [], ports = []) {
  const out = [], used = [], q = {}, st = net.streets;
  // the post's foot must be off every road at its level, the panel clear of any deck above
  const free = (x, z, y, top) => { const k = net.at(x, z, y, null, q); if (net.transit && net.transit.over(x, z, y - 0.5, y + top)) return false; if (k && k.inside > -0.12 && Math.abs(k.h - y) < 0.9) return false; let under = false; net.around(x, z, (r, i, t, d, h) => { if (d < r.hw + 0.3 && h > y + 0.5 && h < y + top + 0.4) under = true; }); return !under; };
  const put = (kind, r, s, dir, o = {}) => {
    const f = frame(r, s, dir), lat = r.hw + 0.34, rx = -f.dz, rz = f.dx, x = f.x + rx * lat, z = f.z + rz * lat, top = kind === 'gantry' ? 4 : 3.2;
    if (!free(x, z, f.y, top)) return false;
    if (kind === 'gantry' && !free(f.x - rx * lat, f.z - rz * lat, f.y, top)) return put('panel', r, s, dir, o);
    const gap = kind === 'gantry' || kind === 'panel' ? 7 : 2.4;
    if (r.tunnel && r.tunnel[Math.round((s / r.len) * (r.n - 1))]) return false;
    if (used.some((u) => u.r === r && u.dir === dir && Math.abs(u.s - s) < Math.max(gap, u.gap))) return false;
    used.push({ r, dir, s, gap }); out.push({ kind, x, z, y: f.y, cx: f.x, cz: f.z, dx: f.dx, dz: f.dz, hw: r.hw, road: r.id, s, dir, ...o }); return true;
  };
  // past a hub of two roads there is nothing to choose: the sign names what comes after
  const far = (r, to) => { let h = to, road = r; for (let k = 0; k < 3; k++) { const e = net.adj.get(h); if (e.length !== 2) break; const n = e.find((c) => c.r !== road); if (!n) break; if (PLACE[h] && k === 0 && road.len > 60) break; road = n.r; h = n.to; } return h; };
  for (const r of net.main) for (const dir of [1, -1]) {
    const hub = dir > 0 ? r.b : r.a, H = net.hubs.get(hub), exits = net.adj.get(hub).filter((e) => e.r !== r), end = dir > 0 ? r.len : 0, at = (back) => end - dir * back;
    if (exits.length >= 2) {
      const In = frame(r, at(Math.min(5, r.len / 2)), dir), rows = [];
      for (const e of exits) {
        const d = e.r.a === hub ? 1 : -1, o = frame(e.r, d > 0 ? Math.min(9, e.r.len / 2) : e.r.len - Math.min(9, e.r.len / 2), d), vx = o.x - H.x, vz = o.z - H.z, a = wrapA(Math.atan2(In.dx, In.dz) - Math.atan2(vx, vz)); // (right is +)
        if (Math.abs(a) > 2.55) continue;
        const name = e.r.id === 'yss' ? 'Yavuz Sultan Selim Köprüsü' : e.r.id === 'bogaz' ? 'Boğaziçi Köprüsü' : e.r.id === 'tup' ? 'Avrasya Tüneli' : e.r.id === 'camt' ? 'Çamlıca Tüneli' : e.r.id === 'fsm' ? 'FSM Köprüsü' : e.r.id === 'galata' ? 'Galata Köprüsü' : e.r.id === 'unk2' ? 'Atatürk Köprüsü' : e.r.id === 'd3' ? 'Haliç Köprüsü' : PLACE[far(e.r, e.to)] || e.r.name;
        const t = st && st.data.turns[`${r.id}>${e.r.id}@${hub}`]; // what the sign there really reads, where OSM has it
        rows.push({ real: !!t, items: t ? t.rows.slice(0, 3) : [{ name }], ref: t && t.ref.length ? t.ref : shield(e.r.id) ? [shield(e.r.id)] : [], a, arrow: Math.abs(a) < 0.5 ? 'up' : a > 0 ? (a > 1.15 ? 'right' : 'upright') : a < -1.15 ? 'left' : 'upleft', name, via: e.r.name, no: shield(e.r.id) });
      }
      rows.sort((a, b) => a.a - b.a);
      const back = Math.min(r.len * 0.6, (H.r || 3) + (r.style === 'motorway' ? 16 : r.style === 'street' ? 5 : 9));
      if (rows.length) for (const extra of [0, 3, -3, 6]) if (put(r.style === 'motorway' ? 'gantry' : 'panel', r, at(back + extra), dir, { green: r.style === 'motorway', rows })) break;
      if (r.style === 'motorway' && r.len > 90 && rows.length) put('panel', r, at(back + 34), dir, { green: true, rows: rows.filter((x) => x.arrow !== 'up').slice(0, 2), ahead: 500 });
    }
  }
  // brown signs to the sights, on the nearest road, either way
  for (const m of marks) {
    if (!m.hero) continue;
    let best = null;
    for (const r of net.main) for (let i = 4; i < r.n - 4; i += 2) { const ex = r.p[i * 3] - m.x, ez = r.p[i * 3 + 1] - m.z, d = ex * ex + ez * ez; if (!best || d < best.d) best = { d, r, s: r.s[i] }; } if (best) best.d = Math.sqrt(best.d);
    if (!best || best.d - m.r > (m.top > 30 ? 130 : 72)) continue;
    for (const dir of [1, -1]) for (const back of [7, 10, 4, 14, 18, 1, -3, 24]) {
      const s = best.s - dir * back; if (s < 2 || s > best.r.len - 2) continue;
      const f = frame(best.r, s, dir), side = -f.dz * (m.x - f.x) + f.dx * (m.z - f.z);
      if (put('brown', best.r, s, dir, { text: m.name, right: side > 0 })) break;
    }
  }
  for (const r of net.main) for (const dir of [1, -1]) {
    const hub = dir > 0 ? r.b : r.a, end = dir > 0 ? r.len : 0, exits = net.adj.get(hub).filter((e) => e.r !== r), at = (back) => end - dir * back;
    // the road's own name, and its limit, as one turns into it
    const start = dir > 0 ? 0 : r.len, go = (n) => start + dir * n, A = net.hubs.get(dir > 0 ? r.a : r.b), deg = net.adj.get(dir > 0 ? r.a : r.b).length;
    if (deg >= 3 && r.len > 18) put('plate', r, go((A.r || 3) + 2.5), dir, { text: r.name, green: r.style === 'motorway', no: shield(r.id) });
    if (st) { // the limit, where it begins and where it changes
      if (deg >= 3 && r.len > 18) for (const e of [7, 9, 5, 12]) if (put('limit', r, go((A.r || 3) + e), dir, { text: String(st.limit(r, go((A.r || 3) + e), dir)) })) break;
      const runs = dir > 0 ? st.limits[r.index].fwd : st.limits[r.index].back; for (const [s, v] of runs.slice(1)) for (const e of [0, 2, -2]) if (put('limit', r, s + e * dir, dir, { text: String(v) })) break;
      for (const L of st.byRoad.get(r.index) || []) for (const e of [9, 12, 7]) if (put('lights', r, L.s - e * dir, dir)) break;
      for (const L of st.data.crossings) if (L.road === r.id && !(st.byRoad.get(r.index) || []).some((g) => Math.abs(g.s - L.s) < 4)) put('crossing', r, L.s - 0.5 * dir, dir);
      for (const L of st.data.cameras) if (L.road === r.id && L.dir === dir) put('camera', r, L.s - 4 * dir, dir);
      // exits and places ahead, as signed
      for (const L of st.data.signs) if (L.road === r.id && L.dir === dir) for (const e of [L.exit ? 5 : 1, 8, 2]) if (put('panel', r, L.s - e * dir, dir, { green: r.style === 'motorway', rows: [{ real: true, arrow: L.ahead ? 'up' : L.right ? 'upright' : 'upleft', a: L.ahead ? 0 : L.right ? 1 : -1, items: L.rows.slice(0, 4), ref: L.ref }] })) break;
    }
    if (deg === 1) put('plate', r, go(6), dir, { text: PLACE[dir > 0 ? r.a : r.b] || r.name });
    // welcome to the other side
    if (r.id === 'bogaz' || r.id === 'fsm' || r.id === 'yss') { put('welcome', r, at(34), dir, { text: dir > 0 ? 'ASYA' : 'AVRUPA' }); }
    // bends and hills ahead
    let last = -99;
    for (let s = 14; s < r.len - 8; s += 1) {
      const p = start + dir * s; if (s - last < 26) continue;
      const a = frame(r, p - dir * 3, dir), b = frame(r, p + dir * 3, dir), turn = wrapA(Math.atan2(a.dx, a.dz) - Math.atan2(b.dx, b.dz));
      if (Math.abs(turn) > 0.5) { last = s; put('bend', r, p - dir * 8, dir, { right: turn > 0 }); } else { const f = frame(r, p, dir); if (Math.abs(f.slope) > 0.085) { last = s; put('hill', r, p - dir * 5, dir, { up: f.slope > 0, text: `%${Math.round(Math.abs(f.slope) * 100)}` }); } }
    }
  }
  // a road that leads nowhere says so where one turns into it, and again where it stops
  const dead = deadEnds(net, marks, ports);
  for (const e of dead) { const r = e.r, go = (n) => (e.dir > 0 ? n : r.len - n), end = (n) => (e.dir > 0 ? r.len - n : n); if (r.len > 6) for (const n of r.spur ? [2.6, 3.4, 4.4, 6, 8] : [r.len - 14, r.len - 18, r.len - 10]) if (n < r.len - 2 && n > 1 && put('deadend', r, go(n), e.dir)) break; for (const n of [0.5, 1.2, 2]) if (put('blocked', r, end(n), e.dir)) break; }
  return out;
}
export { frame };
