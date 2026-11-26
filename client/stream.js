// The city comes by pieces (assets/tiles, tools/tiles.mjs): what is near first, then what
// lies ahead on the way; what nobody goes near is never fetched. Whoever wants a piece
// says so with on(); `focus` and `route` and `pin` say where one is, goes, and starts.
const gap = (t, x, z) => Math.hypot(Math.max(t.x0 - x, 0, x - t.x1), Math.max(t.z0 - z, 0, z - t.z1));
export class Stream {
  constructor(index, base, { fetcher = (u, o) => fetch(u, o), slots = 6 } = {}) {
    this.base = base; this.fetcher = fetcher; this.slots = slots; this.busy = 0; this.hands = {}; this.x = 0; this.z = 0; this.reach = 0; this.pins = []; this.holds = []; this.way = null; this.bytes = 0;
    this.tiles = index.list.map((t) => ({ ...t, kind: t.f[0], x0: t.i * index.c[t.f[0]], z0: t.j * index.c[t.f[0]], x1: (t.i + 1) * index.c[t.f[0]], z1: (t.j + 1) * index.c[t.f[0]], state: 0, tries: 0, after: 0, way: 1e9 })); // (state: 0 not fetched, 1 on its way, 2 here)
    this.waits = new Set();
  }
  on(kind, fn) { (this.hands[kind] ||= []).push(fn); }
  // Hold decoded start tiles until every city layer has registered its consumer.
  deferDelivery() { this.pending = []; }
  deliver() {
    const pending = this.pending || [];
    this.pending = null;
    for (const [tile, data] of pending) this.notifyTile(tile, data);
  }
  notifyTile(tile, data) {
    if (this.pending) this.pending.push([tile, data]);
    else for (const receive of this.hands[tile.kind] || []) receive(tile, data);
  }
  // the way one will go: [[x, z], …]; null: no telling
  route(points) { this.way = points; for (const t of this.tiles) { t.way = 1e9; if (points && t.kind !== 's') for (let k = 0; k < points.length; k++) if (gap(t, points[k][0], points[k][1]) < (t.kind === 'm' ? 150 : t.kind === 'h' ? 110 : 60)) { t.way = k / points.length; break; } } this.pump(); }
  pin(list) { this.pins = list; this.pump(); }
  focus(x, z, reach) { this.x = x; this.z = z; this.reach = reach; this.pump(); }
  // how much a piece is wanted: less is sooner, 1e9 not at all
  score(t) {
    if (t.kind === 's') return this.pins.length || this.holds.length ? 120 : 160; // (the skyline)
    let s = 1e9; const d = gap(t, this.x, this.z); if (d < (t.kind === 'd' ? Math.min(240, this.reach) : this.reach)) s = d * (t.kind === 'h' ? 1 : 1.15);
    for (const p of [...this.holds, ...this.pins]) { const e = gap(t, p.x, p.z); if (e < p.r * (t.kind === 'd' ? 0.45 : 1)) s = Math.min(s, e * 0.3 - 1000); }
    if (t.way < 2) s = Math.min(s, 420 + t.way * 4000); return s;
  }
  pump() {
    const now = Date.now(); while (this.busy < this.slots) {
      let best = null, bs = this.holds.length ? 0 : 1e8; for (const t of this.tiles) { if (t.state || t.after > now) continue; const s = this.score(t); if (s < bs) { bs = s; best = t; } } if (!best) break;
      if (this.busy >= 2 && bs > 400 && this.slots > 2) { if (this.busy >= this.slots - 2) break; } // (what can wait leaves room for what cannot)
      this.get(best);
    }
    clearTimeout(this.tm); this.tm = setTimeout(() => this.pump(), 900); if (this.tm.unref) this.tm.unref();
  }
  async get(t) {
    t.state = 1; this.busy++; t.ctl = new AbortController(); let data = null;
    try { const r = await this.fetcher(new URL(`${t.f}.bin?v=${t.v}`, this.base), { signal: t.ctl.signal }); if (!r.ok) throw new Error(String(r.status)); data = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); } catch (e) { t.state = 0; if (e.name !== 'AbortError') t.tries++; t.after = e.name === 'AbortError' ? 0 : Date.now() + Math.min(20000, 700 * 2 ** t.tries); }
    // An aborted signal can retain the call stack that requested a new race.
    t.ctl = null;
    this.busy--; if (data) { t.state = 2; this.bytes += t.n; this.notifyTile(t, data); } for (const w of [...this.waits]) w(); this.pump();
  }
  within(x, z, r) { return this.tiles.filter((t) => t.kind !== 's' && gap(t, x, z) < r * (t.kind === 'd' ? 0.45 : 1)); }
  // how much of a place is here, 0 … 1
  part(x, z, r) { let a = 0, n = 0; for (const t of this.within(x, z, r)) { n += t.n; if (t.state === 2) a += t.n; } return n ? a / n : 1; }
  // how much of what is wanted here is here, 0 … 1
  get share() { let a = 0, n = 0; for (const t of this.tiles) { if (t.state === 2 ? t.kind !== 's' && gap(t, this.x, this.z) < this.reach : this.score(t) < 1e8) { n += t.n; if (t.state === 2) a += t.n; } } return n ? a / n : 1; }
  // a place's pieces, first of all; resolves when they are here (or cannot be had), or after `most` ms. on: told how much is
  ready(x, z, r, { on = () => {}, most = 15000 } = {}) {
    this.holds.push({ x, z, r }); const p = this.holds[this.holds.length - 1], need = this.within(x, z, r); for (const t of this.tiles) if (t.state === 1 && !need.includes(t) && t.ctl) t.ctl.abort(); this.pump(); // (all else gives way)
   
    return new Promise((res) => { let tm = 0; const end = (ok) => { clearTimeout(tm); this.waits.delete(look); this.holds = this.holds.filter((q) => q !== p); this.pump(); res(ok); }; const look = () => { on(this.part(x, z, r)); if (need.every((t) => t.state === 2 || t.tries > 3)) end(need.every((t) => t.state === 2)); }; this.waits.add(look); tm = setTimeout(() => end(false), most); look(); });
  }
}
