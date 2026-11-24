// What goes over the unreliable channel: where each car is. A car is its own
// player's to drive (no lag at the wheel); the host only passes poses on,
// drives the bots, keeps the clock and checks the results.
export const MSG = { POSE: 1, POSES: 2, PING: 3, PONG: 4 };
export const TICK_RATE = 60, POSE_EVERY = 3; // ticks between two batches of poses (20 a second)
const SIZE = 32;
function put(dv, o, c) {
  dv.setFloat32(o, c.x); dv.setFloat32(o + 4, c.y); dv.setFloat32(o + 8, c.z);
  dv.setInt16(o + 12, Math.round(Math.atan2(Math.sin(c.yaw), Math.cos(c.yaw)) * 10000));
  dv.setInt16(o + 14, Math.round(Math.max(-300, Math.min(300, c.vx)) * 100)); dv.setInt16(o + 16, Math.round(Math.max(-300, Math.min(300, c.vz)) * 100)); dv.setInt16(o + 18, Math.round(Math.max(-300, Math.min(300, c.vy)) * 100));
  dv.setInt8(o + 20, Math.round(Math.max(-1, Math.min(1, c.steer)) * 100));
  dv.setUint8(o + 21, (c.drift ? 1 : 0) | (c.boosting ? 2 : 0) | (c.braking ? 4 : 0) | (c.horn ? 8 : 0) | (c.air > 0.06 ? 16 : 0) | (c.wallT > 0 ? 32 : 0) | (c.finished ? 64 : 0));
  dv.setInt16(o + 22, Math.round(Math.max(-3, Math.min(3, c.slip || 0)) * 1000));
  dv.setFloat32(o + 24, c.prog || 0); dv.setFloat32(o + 28, c.t || 0);
}
function take(dv, o) {
  const f = dv.getUint8(o + 21);
  return { x: dv.getFloat32(o), y: dv.getFloat32(o + 4), z: dv.getFloat32(o + 8), yaw: dv.getInt16(o + 12) / 10000, vx: dv.getInt16(o + 14) / 100, vz: dv.getInt16(o + 16) / 100, vy: dv.getInt16(o + 18) / 100, steer: dv.getInt8(o + 20) / 100, drift: !!(f & 1), boosting: !!(f & 2), braking: !!(f & 4), horn: !!(f & 8), air: f & 16 ? 1 : 0, wall: !!(f & 32), finished: !!(f & 64), slip: dv.getInt16(o + 22) / 1000, prog: dv.getFloat32(o + 24), t: dv.getFloat32(o + 28) };
}
const ok = (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Number.isFinite(p.prog) && Number.isFinite(p.t) && Math.abs(p.x) < 5000 && Math.abs(p.z) < 5000 && Math.abs(p.y) < 200 && Math.abs(p.prog) < 1e6;
// race: which race this belongs to (a late packet of the last one is dropped)
export function encodePose(car, race, t) { const b = new ArrayBuffer(2 + SIZE), dv = new DataView(b); dv.setUint8(0, MSG.POSE); dv.setUint8(1, race & 255); put(dv, 2, { ...car, t }); return b; }
export function decodePose(dv) { if (dv.byteLength < 2 + SIZE) return null; const p = take(dv, 2); return ok(p) ? { race: dv.getUint8(1), ...p } : null; }
export function encodePoses(list, race, hostTime) {
  const b = new ArrayBuffer(11 + list.length * (2 + SIZE)), dv = new DataView(b);
  dv.setUint8(0, MSG.POSES); dv.setUint8(1, race & 255); dv.setFloat64(2, hostTime); dv.setUint8(10, list.length);
  list.forEach(([id, c], i) => { const o = 11 + i * (2 + SIZE); dv.setUint16(o, id); put(dv, o + 2, c); });
  return b;
}
export function decodePoses(dv) {
  const n = dv.getUint8(10), cars = [];
  for (let i = 0; i < n; i++) { const o = 11 + i * (2 + SIZE); if (o + 2 + SIZE > dv.byteLength) break; const p = take(dv, o + 2); if (ok(p)) cars.push({ id: dv.getUint16(o), ...p }); }
  return { race: dv.getUint8(1), hostTime: dv.getFloat64(2), cars };
}
export function encodePing(t) { const b = new ArrayBuffer(9), dv = new DataView(b); dv.setUint8(0, MSG.PING); dv.setFloat64(1, t); return b; }
export function encodePong(t, hostTime) { const b = new ArrayBuffer(17), dv = new DataView(b); dv.setUint8(0, MSG.PONG); dv.setFloat64(1, t); dv.setFloat64(9, hostTime); return b; }
export function decodePong(dv) { return { clientTime: dv.getFloat64(1), hostTime: dv.getFloat64(9) }; }
