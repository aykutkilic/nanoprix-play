// Topkapı Sarayı and Gülhane Parkı at true size, from the ist project's assembly of them (tools/topkapi.mjs): seen from
// afar as one light model, near in all its pieces; and a floor for every metre one may stand on – its courts and gardens,
// its gates and porticoes, the park and its paths – reached on foot from the streets round it.
import * as THREE from './vendor/three.module.min.js';
import { houseMask } from './assets.js';
import { handOver } from './gpu.js';
// the toys of the old model these take the place of (tools/topkapi.mjs REPLACES)
export const REPLACES = new Set(['topkapi-sarayi', 'topkapi-aya-irini', 'cinili-kosk', 'sark-eserleri-muzesi', 'alay-kosku', 'ahmet-hamdi-tanpinar-edebiyat-muze-kutuphanesi']);
const BASE = new URL('../assets/', import.meta.url), NEAR = 25; // (closer than this to its precinct, in units, the pieces; further, the light one)
const get = async (n, gz) => { const r = await fetch(new URL(n, BASE)); if (!r.ok) throw new Error(`${n}: ${r.status}`); return gz ? new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : r.json(); };

// the pieces as tools/topkapi.mjs packs them: int16 corners, int8 normals, colours with the kind of thing in the fourth
function pieces(chunks, buf, mat, parent, cast, o0 = 0) {
  let o = o0; const out = [];
  for (const c of chunks) {
    const pos = new Int16Array(buf, o, c.nv * 4); o += c.nv * 8; const nor = new Int8Array(buf, o, c.nv * 4); o += c.nv * 4; const col = new Uint8Array(buf, o, c.nv * 4); o += c.nv * 4;
    const idx = c.wide ? new Uint32Array(buf, o, c.ni) : new Uint16Array(buf, o, c.ni); o += c.ni * (c.wide ? 4 : 2) + c.pad;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 4)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 4, true)); g.setAttribute('color', new THREE.BufferAttribute(col, 4, true)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), c.r / c.q); const m = new THREE.Mesh(handOver(g), mat); m.position.set(c.x, c.y, c.z); m.scale.setScalar(c.q); m.castShadow = cast; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); m.matrixWorld.copy(m.matrix); parent.add(m); // (in W.still, at the origin) out.push(m);
  }
  return out;
}
export async function buildTopkapi(W) {
  const D = W.A.topkapi; if (!D) return; // (loaded with the ground, which it lowers here and there: client/assets.js)
  const F = D.floor, fb = await get('topkapi-floor.bin', true), NC = F.w * F.h, L0 = new Int16Array(fb, 0, NC), bit = (o) => new Uint8Array(fb, NC * 2 + o * Math.ceil(NC / 8), Math.ceil(NC / 8)), cutBits = bit(0), builtBits = bit(1), room = new Uint8Array(fb, NC * 2 + 2 * Math.ceil(NC / 8), NC), moreA = new Int32Array(fb.slice(NC * 3 + 2 * Math.ceil(NC / 8)));
  const more = new Map(); for (let k = 0; k < moreA.length; k += 2) { const a = more.get(moreA[k]) || []; a.push(moreA[k + 1] / 400); more.set(moreA[k], a); }
  const cell = (x, z) => { const i = Math.floor((x - F.x0) / F.c), j = Math.floor((z - F.z0) / F.c); return i < 0 || j < 0 || i >= F.w || j >= F.h ? -1 : j * F.w + i; };
  const on = (B, k) => k >= 0 && (B[k >> 3] >> (k & 7)) & 1, P0 = D.precinct || [], inPrecinct = (x, z) => { let c = false; for (let i = 0, j = P0.length - 1; i < P0.length; j = i++) if (P0[i][1] > z !== P0[j][1] > z && x < ((P0[j][0] - P0[i][0]) * (z - P0[i][1])) / (P0[j][1] - P0[i][1]) + P0[i][0]) c = !c; return c; };
  // houses and trees of the map that stand where the palace's buildings do are left out (they are the same buildings, as OSM has them)
  houseMask.f = (x, z, B, o) => {
    if (!B) return inPrecinct(x, z) || on(builtBits, cell(x, z)); // (a tree: not in a building; within the walls the trees are ist's, D.trees)
    if (inPrecinct(x, z)) return true; // (within the palace's walls every house is one of its own, or the park's)
    const n = B[o + 5] & 255, P = []; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let k = 0; k < n; k++) { const px = x + B[o + 6 + k * 2] / 100, pz = z + B[o + 7 + k * 2] / 100; P.push(px, pz); x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
    if (x1 < F.x0 || z1 < F.z0 || x0 > F.x0 + F.w * F.c || z0 > F.z0 + F.h * F.c) return false;
    // (a house a third of which the palace's buildings cover: it is one of them, as OSM has it)
    const s = Math.max(0.2, Math.max(x1 - x0, z1 - z0) / 24); let all = 0, hit = 0; for (let px = x0 + s / 2; px < x1; px += s) for (let pz = z0 + s / 2; pz < z1; pz += s) { let c = false; for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) if (P[i + 1] > pz !== P[j + 1] > pz && px < ((P[j] - P[i]) * (pz - P[i + 1])) / (P[j + 1] - P[i + 1]) + P[i]) c = !c; if (!c) continue; all++; if (on(builtBits, cell(px, pz))) hit++; }
    return all > 0 && hit / all > 0.33;
  };
  houseMask.seat = (x, z, y) => (cell(x, z) >= 0 ? Math.min(y, W.height(x, z)) : y); // (a tree where the ground was lowered under it goes down with it)
  // the ground of the game is not drawn where the palace lies on its own
  { const t = new Uint8Array(NC); for (let k = 0; k < NC; k++) t[k] = on(cutBits, k) ? 255 : 0; const tex = new THREE.DataTexture(t, F.w, F.h, THREE.RedFormat); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.unpackAlignment = 1; tex.needsUpdate = true; if (W.cut) { W.cut.tex.value = tex; W.cut.box.value.set(F.x0, F.z0, F.w * F.c, F.h * F.c); } }
  // where one stands: the floor nearest one's feet
  const floorAt = (x, z, y) => { const k = cell(x, z); if (k < 0) return null; const v = L0[k]; if (v === -32768) return null; let h = v / 400; const m = more.get(k); if (m) for (const q of m) if (Math.abs(q - y) < Math.abs(h - y)) h = q; return h; };
  // how far along from a to b (0 … 1) a camera may go: not into the palace's walls, nor up into its vaults
  const sight = (ax, ay, az, bx, by, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 0.05); if (cell(ax, az) < 0 && cell(bx, bz) < 0) return 1;
    for (let s = 1; s <= n; s++) { const t = s / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t, k = cell(x, z); if (k < 0) continue; const v = L0[k];
      if (v === -32768) { if (on(builtBits, k)) return Math.max(0, t - 0.15 / (L || 1)); continue; } const r = room[k]; if (r < 255 && y > v / 400 + r / 100 - 0.06 && y < v / 400 + r / 100 + 0.6) return Math.max(0, t - 0.15 / (L || 1)); }
    return 1;
  };
  W.palace = { floorAt, sight, gates: D.gates, data: D };
  // the courts' trees (tools/courts.mjs): on the floor where they stand; in the way, as the city's are (client/solid.js)
  if (D.trees?.length && W.plant) { const list = D.trees.map(([x, z, s, c]) => { const g = W.height(x, z); return [x, floorAt(x, z, g) ?? g, z, s, c]; }); W.plant(list, 23);
    const T = new Int32Array(list.length * 4); list.forEach(([x, y, z, s], k) => T.set([Math.round(x * 20), Math.round(z * 20), Math.round(y * 400), Math.round(s * 1000)], k * 4)); (W.trees ||= []).push({ T, x0: Math.min(...list.map((t) => t[0])), x1: Math.max(...list.map((t) => t[0])), z0: Math.min(...list.map((t) => t[2])), z1: Math.max(...list.map((t) => t[2])) }); }
  W.walkOn.push(floorAt);
  // drawn as the toys are (client/marks.js)
  const mat = W.markStone, far = new THREE.Group(), near = new THREE.Group(); far.name = 'Topkapı (far)'; near.name = 'Topkapı'; W.still.add(far); W.still.add(near); near.visible = false;
  let cx = 0, cz = 0, n = 0; for (const c of D.far) { cx += c.x * c.nv; cz += c.z * c.nv; n += c.nv; } cx /= n || 1; cz /= n || 1;
  get('topkapi-far.bin', true).then((b) => pieces(D.far, b, mat, far, true)).catch((e) => console.warn('topkapi far', e.message));
  // the gardens' ground (tools/topkapi.mjs, after ist's gardens.js): the courts' stone, the lawns and grass, the paths, each over the one under it
  const ground = new THREE.Group(); ground.name = 'Topkapı gardens'; W.still.add(ground);
  if (D.garden?.layers?.length) get('topkapi-ground.bin', true).then((b) => { D.garden.layers.forEach((L, k) => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 - k, polygonOffsetUnits: -2 - 2 * k }); pieces(L.chunks, b, m, ground, false, L.at); }); }).catch((e) => console.warn('topkapi ground', e.message));
  let asked = false, ready = false;
  W.updates.push((dt, now, cam, farOff) => {
    const d = Math.hypot(cam.x - cx, cam.z - cz) - 45;
    if (!asked && d < NEAR * 2.2) { asked = true; get('topkapi.bin', true).then((b) => { pieces(D.near, b, mat, near, true); ready = true; }).catch((e) => console.warn('topkapi near', e.message)); }
    const close = ready && d < NEAR; near.visible = close; far.visible = !close && d < (farOff || 300) * 2.2; ground.visible = d < (farOff || 300) * 1.2; // (as far as the other great landmarks are seen: client/marks.js)
  });
}
