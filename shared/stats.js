// The timing of a race, as a timing screen has it: when each car passed each of
// the many checkpoints round the lap, and all that follows – laps, sectors, gaps
// in seconds, who holds what, how the order went. Fed with where cars are.
export class RaceStats {
  constructor(len, laps, cars) {
    this.len = len; this.laps = laps; this.N = Math.max(6, Math.round(len / 18 / 3) * 3); this.step = len / this.N; // (sectors end on a checkpoint)
    this.cars = new Map(cars.map((c) => [c.id, { ...c, t: [0], at: null, top: 0, done: 0, best: 0, bestLap: -1 }])); this.fastest = null; this.events = [];
  }
  // where a car is at a moment (s into the race), how far along, how fast
  sample(id, t, prog, speed = 0) {
    const c = this.cars.get(id); if (!c || t < 0) return; c.v = speed; if (speed > c.top) c.top = speed;
    const p = c.at; c.at = { t, prog }; if (!p || prog <= p.prog || t <= p.t) return;
    while (c.t.length * this.step <= prog && c.t.length <= this.laps * this.N) {
      const k = c.t.length, at = k * this.step, f = (at - p.prog) / (prog - p.prog); c.t.push(p.t + (t - p.t) * Math.max(0, Math.min(1, f)));
      if (k % this.N === 0) { const n = k / this.N - 1, lap = this.lap(id, n); if (!c.best || lap < c.best) { c.best = lap; c.bestLap = n; } if (!this.fastest || lap < this.fastest.time) { this.fastest = { id, time: lap, lap: n }; this.events.push({ kind: 'fastest', id, time: lap, lap: n }); } }
      if (k % (this.N / 3) === 0) { const s = (k / (this.N / 3) - 1) % 3, n = Math.floor((k - 1) / this.N), time = this.sector(id, n, s); this.events.push({ kind: 'sector', id, lap: n, s, time, colour: this.colour(id, n, s) }); }
    }
  }
  finish(id, time) { const c = this.cars.get(id); if (!c || c.done) return; c.done = time; const last = this.laps * this.N; if (c.t.length === last) c.t.push(time); if (c.t.length > last) c.t[last] = time; this.rebest(); }
  // (the official time moves the last lap by a hair: the bests are found anew)
  rebest() { this.fastest = null; for (const c of this.cars.values()) { c.best = 0; c.bestLap = -1; for (let n = 0; n < this.laps; n++) { const lap = this.lap(c.id, n); if (!lap) continue; if (!c.best || lap < c.best) { c.best = lap; c.bestLap = n; } if (!this.fastest || lap < this.fastest.time) this.fastest = { id: c.id, time: lap, lap: n }; } } }
  lap(id, n) { const t = this.cars.get(id).t, b = (n + 1) * this.N; return n >= 0 && t.length > b ? t[b] - t[n * this.N] : 0; }
  sector(id, n, s) { const t = this.cars.get(id).t, q = this.N / 3, a = n * this.N + s * q; return n >= 0 && t.length > a + q ? t[a + q] - t[a] : 0; }
  bestSector(id, s) { let b = 0; for (let n = 0; n < this.laps; n++) { const v = this.sector(id, n, s); if (v && (!b || v < b)) b = v; } return b; }
  // purple: nobody has been quicker; green: not this car before; yellow: slower than its best
  colour(id, n, s) { const v = this.sector(id, n, s); if (!v) return ''; let all = 0, own = 0; for (const c of this.cars.keys()) for (let m = 0; m < this.laps; m++) { if (c === id && m === n) continue; const w = this.sector(c, m, s); if (!w) continue; if (!all || w < all) all = w; if (c === id && (!own || w < own)) own = w; } return !all || v <= all ? 'purple' : !own || v <= own ? 'green' : 'yellow'; }
  last(id) { const n = Math.floor((this.cars.get(id).t.length - 1) / this.N) - 1; return n >= 0 ? this.lap(id, n) : 0; }
  lapNow(id) { return Math.min(this.laps - 1, Math.floor((this.cars.get(id).t.length - 1) / this.N)); }
  prog(id) { const c = this.cars.get(id); return c.at ? c.at.prog : -1e9; }
  order() { return [...this.cars.values()].sort((a, b) => (a.done && b.done ? a.done - b.done : a.done ? -1 : b.done ? 1 : this.prog(b.id) - this.prog(a.id))).map((c) => c.id); }
  // seconds behind another, at the last checkpoint both have passed
  gap(id, ref) { const a = this.cars.get(id), b = this.cars.get(ref); if (a.done && b.done) return a.done - b.done; const k = Math.min(a.t.length, b.t.length) - 1, g = k <= 0 ? 0 : a.t[k] - b.t[k]; if (g > 0) return g; const d = this.prog(ref) - this.prog(id); return d > 0 ? d / Math.max(3, a.v || 0) : g; } // (just overtaken since then: by the road between them)
  // against one's own best lap so far, now
  delta(id) { const c = this.cars.get(id); if (c.bestLap < 0) return null; const k = c.t.length - 1, n = Math.floor(k / this.N), i = k - n * this.N; if (!i || n >= this.laps) return null; return c.t[k] - c.t[n * this.N] - (c.t[c.bestLap * this.N + i] - c.t[c.bestLap * this.N]); }
  // for the charts: seconds behind whoever was first there, at each checkpoint
  gaps() { const K = Math.max(...[...this.cars.values()].map((c) => c.t.length)), out = []; for (let k = 0; k < K; k++) { let lead = Infinity; for (const c of this.cars.values()) if (c.t.length > k) lead = Math.min(lead, c.t[k]); const row = { k, lap: k / this.N }; for (const c of this.cars.values()) if (c.t.length > k) row[c.id] = c.t[k] - lead; out.push(row); } return out; }
  // places at each sector's end
  places() { const q = this.N / 3, K = Math.max(...[...this.cars.values()].map((c) => c.t.length)), out = []; for (let k = q; k < K; k += q) { const pass = [...this.cars.values()].filter((c) => c.t.length > k).sort((a, b) => a.t[k] - b.t[k]), row = { k, lap: k / this.N }; pass.forEach((c, i) => { row[c.id] = i + 1; }); out.push(row); } return out; }
}
