// How a toy car drives. Distances in units (10 m of the city, a car is 1.2
// long), time in seconds. Pure: the same inputs give the same drive – used by
// the player's own car, by bots and by the tests.
export const CAR_R = 0.34;
export const STEP = 1 / 120;
// the cars: top speed, acceleration, grip, weight – each a different compromise
export const CARS = [
  { id: 'taksi', name: { tr: 'Sarı Taksi', en: 'Yellow Taxi' }, top: 17.5, acc: 8.6, grip: 1.02, mass: 1.0 },
  { id: 'dolmus', name: { tr: 'Dolmuş', en: 'Dolmuş' }, top: 16.9, acc: 8.0, grip: 0.98, mass: 1.35 },
  { id: 'spor', name: { tr: 'Boğaz GT', en: 'Bosphorus GT' }, top: 18.4, acc: 8.2, grip: 0.97, mass: 0.95 },
  { id: 'klasik', name: { tr: 'Klasik', en: 'Classic' }, top: 17.1, acc: 8.9, grip: 1.0, mass: 1.1 },
  { id: 'simit', name: { tr: 'Simit Arabası', en: 'Simit Cart' }, top: 16.6, acc: 10.0, grip: 1.1, mass: 0.75 },
  { id: 'polis', name: { tr: 'Zabıta', en: 'Zabıta' }, top: 17.8, acc: 8.4, grip: 1.0, mass: 1.05 },
];
export const carOf = (id) => CARS.find((c) => c.id === id) || CARS[0];

export function makeCar(type = 'taksi') {
  return { type, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, steer: 0, slip: 0, drift: false, air: 0, turbo: 0.35, boosting: false, hit: 0, speed: 0, pitch: 0, roll: 0, road: null, wallT: 0, draft: 0, idx: 0, s: 0, prog: 0, lap: 0 };
}
export function putOn(car, p) { Object.assign(car, { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, yaw: p.yaw, steer: 0, slip: 0, drift: false, air: 0, hit: 0 }); }

const tmp = {};
// input: { steer −1…1, gas 0…1, brake 0…1, drift, turbo }
export function stepCar(car, input, net, only, dt = STEP) {
  const C = carOf(car.type), fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  let vf = car.vx * fx + car.vz * fz, vl = car.vx * fz - car.vz * fx; // forward, and to the left
  const speed = Math.hypot(car.vx, car.vz), ground = car.air < 0.06, G = input.grip ?? 1; // (what the road holds: rain, snow)
  car.boosting = !!(input.turbo && car.turbo > 0.01 && input.gas > 0.1);
  if (car.boosting) car.turbo = Math.max(0, car.turbo - dt * 0.3);
  else car.turbo = Math.min(1, car.turbo + dt * (car.draft > 0.2 ? 0.07 : 0) + (car.drift && Math.abs(car.slip) > 0.16 ? dt * 0.16 : 0));
  const top = C.top * (car.boosting ? 1.3 : 1) * (1 + car.draft * 0.06) * (input.handicap || 1), acc = C.acc * (car.boosting ? 1.7 : 1) * (0.45 + 0.55 * G);
  if (ground) {
    const want = input.gas - input.brake;
    if (want > 0) vf += (vf < 0 ? 16 : acc * Math.max(0, 1 - (vf / top) ** 2) * want) * dt;
    else if (want < 0) vf += (vf > 0.3 ? -15 * G : vf > -4.5 ? -6 : 0) * -want * dt;
    vf -= vf * (input.gas > 0.05 ? 0.02 : 0.28) * dt;
    if (vf > top) vf -= (vf - top) * 1.6 * dt;
    vf -= 9 * (car.slope || 0) * dt; // hills are felt
    if (input.hold && Math.abs(vf) < 0.35) vf = 0; // (the handbrake, at a red light)
  }
  // steering: quick at low speed, calmer fast; the slide lets go of the tail
  const tgt = Math.max(-1, Math.min(1, input.steer));
  car.steer += (tgt - car.steer) * Math.min(1, dt * (Math.abs(tgt) > Math.abs(car.steer) ? 7.5 : 11));
  const drifting = input.drift && ground && vf > 4.5 && (Math.abs(car.steer) > 0.15 || car.drift);
  car.drift = drifting;
  const av = Math.abs(vf), turn = car.steer * Math.min(1, av / 2.2) * (2.75 / (1 + av * 0.072)) * (drifting ? 1.42 : 1) * C.grip * (0.72 + 0.28 * G);
  if (ground) car.yaw -= turn * Math.sign(vf || 1) * dt; else car.yaw -= turn * 0.25 * dt;
  // grip pulls the sideways speed out
  if (ground) vl -= vl * Math.min(1, (drifting ? 2.1 : 9.5 * C.grip * G * G) * dt);
  const gx = Math.sin(car.yaw), gz = Math.cos(car.yaw), ofx = fx, ofz = fz;
  // (the velocity is kept in the world: turning the car does not turn it)
  let vx = ofx * vf + ofz * vl, vz = ofz * vf - ofx * vl;
  if (ground) { // what the tyres turn
    const nf = vx * gx + vz * gz, nl = vx * gz - vz * gx, keep = Math.exp(-(drifting ? 2.3 * (0.5 + 0.5 * G) : 10.5 * C.grip * G * G) * dt), l2 = nl * keep, lost = Math.abs(nl) - Math.abs(l2);
    const f2 = nf + Math.sign(nf || 1) * lost * (drifting ? 0.82 : 0.9);
    vx = gx * f2 + gz * l2; vz = gz * f2 - gx * l2;
    car.slip = Math.atan2(l2, Math.max(1.5, Math.abs(f2)));
  }
  if (input.wind) { const k = (ground ? 0.5 : 1.4) * Math.min(1, speed / 6) * dt; vx += input.wind[0] * k; vz += input.wind[1] * k; }
  car.vx = vx; car.vz = vz;
  car.x += vx * dt; car.z += vz * dt;
  collide(car, net, only, dt);
  car.speed = car.vx * gx + car.vz * gz;
  car.hit = Math.max(0, car.hit - dt * 3);
  return car;
}

function collide(car, net, only, dt) {
  let q = net.at(car.x, car.z, car.y, only, tmp);
  if (!q) { car.vx *= 0.2; car.vz *= 0.2; car.lost = (car.lost || 0) + dt; return; }
  car.lost = 0;
  const margin = CAR_R;
  if (q.inside < margin) { // at the edge of every road here: pushed back, sliding along
    const r = q.road, a = q.i * 3, cx = q.disc ? q.disc.x : r.p[a] + (r.p[a + 3] - r.p[a]) * q.t, cz = q.disc ? q.disc.z : r.p[a + 1] + (r.p[a + 4] - r.p[a + 1]) * q.t;
    let nx = cx - car.x, nz = cz - car.z; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const push = margin - q.inside;
    car.x += nx * push; car.z += nz * push;
    const vn = car.vx * nx + car.vz * nz;
    if (vn < 0) {
      const tx = -nz, tz = nx, vt = car.vx * tx + car.vz * tz, hard = Math.min(1, -vn / 9);
      const vt2 = vt * (1 - 0.1 * hard) - Math.sign(vt) * Math.min(Math.abs(vt), 2.2 * dt), vn2 = -vn * 0.28;
      car.vx = tx * vt2 + nx * vn2; car.vz = tz * vt2 + nz * vn2;
      if (hard > 0.08) car.hit = Math.max(car.hit, hard);
      // the nose comes round along the wall
      const want = Math.atan2(car.vx, car.vz); let d = want - car.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < 1.6) car.yaw += d * Math.min(1, dt * 7 * (0.3 + hard));
    }
    car.wallT = 0.12;
    const again = net.at(car.x, car.z, car.y, only, tmp); if (again) q = again;
  }
  { const s = net.island(car.x, car.z, car.y, margin); if (s) { // against a metrobüs platform: along it
    const [k, , v, w] = s, sd = v < 0 ? -1 : 1, nx = -k.dz * sd, nz = k.dx * sd, push = Math.min(w - Math.abs(v), 0.12); car.x += nx * push; car.z += nz * push; const vn = car.vx * nx + car.vz * nz; if (vn < 0) { const hard = Math.min(1, -vn / 9); car.vx -= nx * vn * 1.2; car.vz -= nz * vn * 1.2; if (hard > 0.08) car.hit = Math.max(car.hit, hard); } car.wallT = 0.12; } }
  car.wallT = Math.max(0, car.wallT - dt);
  const h = q.h;
  // the surface: follow it, fly off a crest
  car.road = q.road;
  const fall = 13;
  car.vy -= fall * dt;
  let ny = car.y + car.vy * dt;
  if (ny <= h + 0.002) { const rise = (h - car.y) / dt; car.vy = Math.max(-6, Math.min(rise, 3.2)); ny = h; car.air = 0; } else if (ny - h < 0.02 && car.vy < 0.4) { ny = h; car.air = 0; } else car.air += dt;
  car.y = ny;
  const sp = Math.hypot(car.vx, car.vz);
  // the slope ahead, for the hill's pull and the body's pitch
  if (car.air === 0 && sp > 0.2) { const e = 0.6, ux = Math.sin(car.yaw), uz = Math.cos(car.yaw), f = net.at(car.x + ux * e, car.z + uz * e, car.y + 0.1, only, tmp), hf = f ? f.h : h, b = net.at(car.x - ux * e, car.z - uz * e, car.y + 0.1, only, tmp), hb = b ? b.h : h; car.slope = Math.max(-0.3, Math.min(0.3, (hf - hb) / (2 * e))); } else if (car.air > 0) car.slope = (car.slope || 0) * 0.98;
}

// Two cars touching: the lighter gives way. Both, or only `a` (b is someone
// else's to move) changes.
export function bump(a, b, both = true, ra = CAR_R, rb = CAR_R) {
  if (Math.abs(a.y - b.y) > 0.6) return 0;
  let hit = 0;
  // each is two discs, nose and tail
  for (const i of [-0.3, 0.3]) for (const j of [-0.3, 0.3]) {
    const ax = a.x + Math.sin(a.yaw) * i, az = a.z + Math.cos(a.yaw) * i, bx = b.x + Math.sin(b.yaw) * j, bz = b.z + Math.cos(b.yaw) * j, dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), R = ra + rb;
    if (d >= R || d < 1e-5) continue;
    const nx = dx / d, nz = dz / d, ma = carOf(a.type).mass, mb = b.mass || carOf(b.type).mass, wa = both ? mb / (ma + mb) : 0.8, o = R - d;
    a.x += nx * o * wa; a.z += nz * o * wa;
    if (both) { b.x -= nx * o * (1 - wa); b.z -= nz * o * (1 - wa); }
    const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
    if (rv < 0) { const k = -rv * 1.25, ia = k * (mb / (ma + mb)); a.vx += nx * ia; a.vz += nz * ia; if (both) { b.vx -= nx * (k - ia); b.vz -= nz * (k - ia); } hit = Math.max(hit, -rv); }
  }
  if (hit > 1) a.hit = Math.max(a.hit, Math.min(1, hit / 9));
  return hit;
}

// progress along a course: grows past the line, lap after lap
export function track(car, course) {
  const q = course.project(car.x, car.z, car.idx), was = car.s;
  car.idx = q.i; car.s = q.s;
  let d = q.s - was;
  if (d < -course.len / 2) d += course.len; else if (d > course.len / 2) d -= course.len;
  car.prog += d;
  car.lap = Math.floor(car.prog / course.len);
  return d;
}
export function startOn(car, course, slot) {
  const p = course.grid(slot); putOn(car, p);
  const q = course.project(p.x, p.z, course.idx(course.len - 2), 40);
  car.idx = q.i; car.s = q.s; car.prog = q.s - course.len; car.lap = -1; car.turbo = 0.35; car.draft = 0;
}
