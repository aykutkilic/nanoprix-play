// Computer drivers: follow the racing line, brake for the bends, keep off the
// others. `level` 0 easy … 2 hard.
const LEVELS = [{ pace: 0.86, look: 0.95 }, { pace: 0.96, look: 1 }, { pace: 1.05, look: 1 }];
export function makeBot(seed, level = 1) { let r = (seed * 2654435761) >>> 0; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296); rnd(); return { level, skill: LEVELS[level].pace * (0.97 + rnd() * 0.05), side: (rnd() - 0.5) * 0.8, ph: rnd() * 10, stuck: 0, back: 0, out: { steer: 0, gas: 1, brake: 0, drift: false, turbo: false } }; }
const P = {}, Q = {};
// grip: what the road holds (1 dry)
export function driveBot(bot, car, course, others, now, dt, grip = 1) {
  const o = bot.out, v = Math.max(0, car.speed), look = 1.4 + v * 0.26;
  // the lane: near the racing line, near where it is, clear of whoever is ahead
  course.place(car.s, 0, P);
  const here = -(car.x - P.x) * P.dz + (car.z - P.z) * P.dx, i = course.idx(car.s + look), lim = Math.max(0.2, course.hw[i] - 0.62), want = course.line[i] + bot.side * Math.sin(now * 0.25 + bot.ph);
  let lat = Math.max(-lim, Math.min(lim, want)), best = 1e9, slow = 99;
  const near = [];
  for (const c of others) {
    if (c === car || Math.abs(c.y - car.y) > 0.8) continue;
    const dx = c.x - car.x, dz = c.z - car.z, f = dx * P.dx + dz * P.dz; if (f < 0.15 || f > 34) continue;
    const vs = c.vx * P.dx + c.vz * P.dz, close = v - vs, range = 2.4 + Math.max(0, close) * 1.25; if (f > range) continue;
    const g = course.place(car.s + f, 0, Q), l = -(c.x - g.x) * g.dz + (c.z - g.z) * g.dx; near.push([l, 1 - f / range, f, vs]);
  }
  if (near.length) for (let k = -4; k <= 4; k++) {
    const q = (k / 4) * lim; let cost = Math.abs(q - want) * 0.5 + Math.abs(q - here) * 0.35;
    for (const [l, w] of near) { const o = Math.abs(q - l); if (o < 1.0) cost += (0.4 + w) * 7 * (1.15 - o); }
    if (cost < best) { best = cost; lat = q; }
  }
  for (const [l, , f, vs] of near) if (Math.abs(here - l) < 0.75 && f < 1.6 + Math.max(0, v - vs) * 0.5) slow = Math.min(slow, Math.max(2.5, vs + f * 1.5)); // (no room yet: ease off)
  course.place(car.s + look, lat, P);
  let a = Math.atan2(P.x - car.x, P.z - car.z) - car.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
  o.steer = Math.max(-1, Math.min(1, -a * 2.6));
  let vt = 99; for (let d = 0.5; d < 3 + (v * 0.55) / grip; d += 1.5) vt = Math.min(vt, course.vmax[course.idx(car.s + d)]);
  vt = Math.min(vt * bot.skill * (0.25 + 0.75 * grip), slow);
  o.gas = v < vt ? 1 : v < vt + 0.6 ? 0.4 : 0; o.brake = v > vt + 1.2 ? Math.min(1, (v - vt) / 3) : 0;
  o.drift = Math.abs(a) > 0.5 && v > 8 && grip > 0.8; o.grip = grip;
  o.turbo = car.turbo > 0.25 && vt > 24 && Math.abs(a) < 0.12 && v > 9;
  o.handicap = bot.skill > 1 ? 1 + (bot.skill - 1) * 0.6 : bot.skill;
  if (v < 0.5) bot.stuck += dt; else bot.stuck = Math.max(0, bot.stuck - dt * 2);
  if (bot.stuck > 1.2) { bot.back = 0.9; bot.stuck = 0; }
  if (bot.back > 0) { bot.back -= dt; o.gas = 0; o.brake = 1; o.steer = -o.steer; o.turbo = false; }
  return o;
}
