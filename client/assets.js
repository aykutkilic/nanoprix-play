// The baked city (tools/): fetched, unpacked, handed out as arrays.
const BASE = new URL('../assets/', import.meta.url);
const get = async (n) => { const r = await fetch(new URL(n, BASE)); if (!r.ok) throw new Error(`${n}: ${r.status}`); return r; };
async function gunzip(n, onBytes) {
  const r = await get(n);
  const counted = r.body.pipeThrough(new TransformStream({ transform(c, k) { onBytes(c.byteLength); k.enqueue(c); } }));
  return new Response(counted.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
export async function loadAssets(onProgress) {
  let got = 0; const total = 16e6, tick = (b) => { got += b; onProgress(Math.min(1, got / total)); };
  const [roads, streets, map, marks, tb, lb, cb, ports, shipsBin] = await Promise.all([get('roads.json').then((r) => r.json()), get('streets.json').then((r) => r.json()), get('map.json').then((r) => r.json()), get('landmarks.json').then((r) => r.json()), gunzip('terrain.bin', tick), gunzip('landmarks.bin', tick), gunzip('city.bin', tick), get('ports.json').then((r) => r.json()), gunzip('ships.bin', tick)]);
  // terrain: heights as deltas along the rows, low and high bytes apart
  const { w, h } = map.grid, N = w * h, u = new Uint8Array(tb), H = new Float32Array(N);
  for (let k = 0, v = 0; k < N; k++) { const d = u[k] | (u[N + k] << 8); v = k % w ? (v + d) & 65535 : d; H[k] = v / 400 - 20; }
  const shore = u.slice(N * 2, N * 3), park = u.slice(N * 3, N * 4);
  const lm = { ...marks, pos: new Int16Array(lb, 0, marks.nv * 3) };
  const c0 = marks.nv * 6;
  lm.col = new Uint8Array(lb.slice(c0, c0 + marks.nv * 4)); lm.idx = new Uint32Array(lb.slice(c0 + marks.nv * 4));
  const [nb, nt, nw] = new Uint32Array(cb, 0, 3), buildings = new Int16Array(cb, 12, nw), trees = new Int16Array(cb, 12 + nw * 2, nt * 4);
  return { roads, streets, map, ground: makeGround(map.grid, H, shore), H, shore, park, landmarks: lm, buildings, buildingCount: nb, trees, ports, shipsBin };
}
function makeGround(g, H, S) {
  const look = (f, k) => (x, z) => {
    let a = (x - g.x0) / g.step, b = (z - g.z0) / g.step;
    a = Math.max(0, Math.min(g.w - 1.001, a)); b = Math.max(0, Math.min(g.h - 1.001, b));
    const i = a | 0, j = b | 0, u = a - i, v = b - j, q = j * g.w + i;
    return k((f[q] * (1 - u) + f[q + 1] * u) * (1 - v) + (f[q + g.w] * (1 - u) + f[q + g.w + 1] * u) * v);
  };
  return { height: look(H, (v) => v), coast: look(S, (v) => (v / 255 - 0.5) * 24) };
}
