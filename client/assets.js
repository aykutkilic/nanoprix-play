// The baked city (tools/): fetched, unpacked, handed out as arrays.
const BASE = new URL('../assets/', import.meta.url);
// a file as it comes, with word of each piece
async function bytes(n, on) { const r = await fetch(new URL(n, BASE)); if (!r.ok) throw new Error(`${n}: ${r.status}`); return r.body.pipeThrough(new TransformStream({ transform(c, k) { on(n, c.byteLength); k.enqueue(c); } })); }
const json = async (n, on) => JSON.parse(await new Response(await bytes(n, on)).text());
const gunzip = async (n, on) => new Response((await bytes(n, on)).pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
export async function loadAssets(on = () => {}) {
  const [roads, streets, map, marks, tb, lb, cb, ports, shipsBin, transit] = await Promise.all([json('roads.json', on), json('streets.json', on), json('map.json', on), json('landmarks.json', on), gunzip('terrain.bin', on), gunzip('landmarks.bin', on), gunzip('city.bin', on), json('ports.json', on), gunzip('ships.bin', on), json('transit.json', on)]);
  // terrain: heights as deltas along the rows, low and high bytes apart
  const { w, h } = map.grid, N = w * h, u = new Uint8Array(tb), H = new Float32Array(N);
  for (let k = 0, v = 0; k < N; k++) { const d = u[k] | (u[N + k] << 8); v = k % w ? (v + d) & 65535 : d; H[k] = v / 400 - 20; }
  const shore = u.slice(N * 2, N * 3), park = u.slice(N * 3, N * 4);
  const lm = { ...marks, pos: new Int16Array(lb, 0, marks.nv * 3) };
  const c0 = marks.nv * 6;
  lm.col = new Uint8Array(lb.slice(c0, c0 + marks.nv * 4)); lm.idx = new Uint32Array(lb.slice(c0 + marks.nv * 4));
  const [nb, nt, nw] = new Uint32Array(cb, 0, 3), buildings = Int32Array.from(new Int16Array(cb, 12, nw)), trees = Int32Array.from(new Int16Array(cb, 12 + nw * 2, nt * 4)), mz = Math.round((map.map.z0 + map.map.z1) / 2) * 20; for (let k = 0, o = 0; k < nb; k++) { buildings[o + 1] += mz; o += 6 + (buildings[o + 5] & 255) * 2; } for (let k = 1; k < trees.length; k += 4) trees[k] += mz;
  return { roads, streets, map, ground: makeGround(map.grid, H, shore), H, shore, park, landmarks: lm, buildings, buildingCount: nb, trees, ports, shipsBin, transit };
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
