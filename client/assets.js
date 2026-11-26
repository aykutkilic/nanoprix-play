// The baked city (tools/): the ground, the roads and the timetables, fetched at once and
// unpacked; the houses and the landmarks come after, by pieces (stream.js).
import { Stream } from './stream.js';
const BASE = new URL('../assets/', import.meta.url);
// a file as it comes, with word of each piece
async function bytes(n, on) { const r = await fetch(new URL(n, BASE)); if (!r.ok) throw new Error(`${n}: ${r.status}`); return r.body.pipeThrough(new TransformStream({ transform(c, k) { on(n, c.byteLength); k.enqueue(c); } })); }
const json = async (n, on) => JSON.parse(await new Response(await bytes(n, on)).text());
const gunzip = async (n, on) => new Response((await bytes(n, on)).pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
export async function loadAssets(on = () => {}) {
  const [roads, streets, map, marks, tb, ub, index, ports, shipsBin, transit, lines, entries, squares, squaresBin, walls, infra, green, parking] = await Promise.all([json('roads.json', on), json('streets.json', on), json('map.json', on), json('landmarks.json', on), gunzip('terrain.bin', on), gunzip('urban.bin', on), json('tiles.json', on), json('ports.json', on), gunzip('ships.bin', on), json('transit.json', on), json('lines.json', on), json('entries.json', on), json('squares.json', on), gunzip('squares.bin', on), json('walls.json', on), json('infra.json', on), json('green.json', on), json('parking.json', on)]); transit.entries = entries.list;
  const topkapi = await fetch(new URL('topkapi.json', BASE)).then((r) => (r.ok ? r.json() : null)).catch(() => null); // (the palace: client/topkapi.js)
  // terrain: heights as deltas along the rows, low and high bytes apart
  const { w, h } = map.grid, N = w * h, u = new Uint8Array(tb), H = new Float32Array(N);
  for (let k = 0, v = 0; k < N; k++) { const d = u[k] | (u[N + k] << 8); v = k % w ? (v + d) & 65535 : d; H[k] = v / 400 - 20; }
  if (topkapi) for (const [k, v] of topkapi.ground || []) H[k] = v; // (the ground under the palace's terraces, lowered to them: tools/topkapi.mjs)
  const shore = u.slice(N * 2, N * 3), park = u.slice(N * 3, N * 4);
  const stream = new Stream(index, new URL('tiles/', BASE));
  return { roads, streets, map, ground: makeGround(map.grid, H, shore), H, shore, park, urban: new Uint8Array(ub), landmarks: marks, stream, ports, shipsBin, transit, lines, squares, squaresBin, walls, infra, green, parking, topkapi };
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
// a piece of houses: [how many, numbers, trees]; the numbers as city.mjs lays them out, z from the middle of the map
// (houseMask.f(x, z[, B, o]): true where something else stands in their stead, as the palace does; houseMask.seat(x, z, y): a tree's
// foot where the ground was lowered under it: client/topkapi.js)
export const houseMask = { f: null, seat: null };
export function readHouses(b, map) {
  const [nb, nt, nw] = new Uint32Array(b, 0, 3), B = Int32Array.from(new Int16Array(b, 12, nw)), T = Int32Array.from(new Int16Array(b, 12 + nw * 2, nt * 4)), mz = Math.round((map.map.z0 + map.map.z1) / 2) * 20; for (let k = 0, o = 0; k < nb; k++) { B[o + 1] += mz; o += 6 + (B[o + 5] & 255) * 2; } for (let k = 1; k < T.length; k += 4) T[k] += mz;
  const f = houseMask.f; if (!f) return { n: nb, B, T };
  let n = 0, w = 0, t = 0; for (let k = 0, o = 0; k < nb; k++) { const l = 6 + (B[o + 5] & 255) * 2; if (!f(B[o] / 20, B[o + 1] / 20, B, o)) { B.copyWithin(w, o, o + l); w += l; n++; } o += l; }
  for (let k = 0; k < T.length; k += 4) if (!f(T[k] / 20, T[k + 1] / 20)) { T.copyWithin(t, k, k + 4); if (houseMask.seat) T[t + 2] = Math.round(houseMask.seat(T[t] / 20, T[t + 1] / 20, T[t + 2] / 400) * 400); t += 4; }
  return { n, B: B.subarray(0, w), T: T.subarray(0, t) };
}
// a piece of landmarks: each one's own corners, colours and faces
export function readMarks(b, items, which) {
  let nv = 0; for (const q of which) nv += items[q].vn; const out = []; let v = 0, i = 0; for (const q of which) { const m = items[q]; out.push([q, { pos: new Int16Array(b, v * 6, m.vn * 3), col: new Uint8Array(b, nv * 6 + v * 4, m.vn * 4), idx: new Uint32Array(b.slice(nv * 10 + i * 4, nv * 10 + (i + m.in) * 4)) }]); v += m.vn; i += m.in; } return out;
}
