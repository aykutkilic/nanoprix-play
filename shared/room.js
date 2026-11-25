// A room: who is in it, what is raced, when it starts and how it ends. Runs
// wherever the host is – in the hosting player's browser (p2p.js) or on the
// Node server – and is the same for both.
import { TIME_TRIAL, TRIAL_SEED, TRIAL_CAR } from './events.js';
import { cityStart } from './clock.js';
import { cleanPlayerName, cleanRoomName } from './names.js';
import { COURSES } from './courses.js';
import { CARS, RACERS, makeCar, stepCar, startOn, track, bump, STEP } from './car.js';
import { makeBot, driveBot } from './bot.js';
import { Course } from './track.js';
import { STARTS } from './places.js';
import { CHOICES, weatherAt, gust } from './weather.js';
import { makeTraffic, trafficAt } from './traffic.js';
import { encodePoses, decodePose, POSE_EVERY } from './protocol.js';

export const MAX_MEMBERS = 8, GRID = 8;
export const COLOURS = ['#e8b21c', '#d8342c', '#1f6fd0', '#1f9d55', '#8e44ad', '#f07f1d', '#f2f2ee', '#26262a', '#e0559b', '#17a7a7'];
const BOT_NAMES = ['Kadir', 'Nermin', 'Rıza', 'Suzan', 'Ferdi', 'Aysel', 'Cevat', 'Leyla', 'Hulusi', 'Perran'];
const COUNTDOWN = 5200, AFTER_FIRST = 60000, RESULTS_MIN = 2500;
export function sanitizeProfile(p) {
  p = p && typeof p === 'object' ? p : {};
  return { name: cleanPlayerName(String(p.name || '')) || 'Yarışçı', car: CARS.some((c) => c.id === p.car) ? p.car : 'taksi', color: COLOURS.includes(p.color) ? p.color : COLOURS[0] };
}
const int = (v, lo, hi, d) => { v = Number(v); return Number.isInteger(v) && v >= lo && v <= hi ? v : d; };
export const DEFAULTS = { mode: 'race', start: 'taksim', weather: 'clear', course: 'taksim', laps: 2, reverse: false, light: 'day', traffic: 1, bots: 3, level: 1 };

export class Room {
  constructor(code, name, net, now = () => performance.now()) {
    this.code = code; this.name = cleanRoomName(name) || 'Oda'; this.net = net; this.now = now;
    this.members = new Map(); this.bots = []; this.hostId = 0; this.phase = 'lobby'; this.settings = { ...DEFAULTS }; this.race = null; this.raceNo = 0; this.ticks = 0; this.lastResults = null;
    this.onChange = null; this.onKicked = null; this.banned = new Set();
  }

  get localSolo() { return !this.code && this.members.size === 1; }

  pauseSolo(on) {
    const race = this.race;
    if (!race) return;
    const now = this.now();
    if (on && this.localSolo && race.pausedAt == null) race.pausedAt = now;
    if (!on && race.pausedAt != null) {
      const elapsed = now - race.pausedAt;
      race.startAt += elapsed;
      race.pausedMs = (race.pausedMs || 0) + elapsed;
      if (race.endAt) race.endAt += elapsed;
      for (const member of this.members.values()) if (member.poseAt != null) member.poseAt += elapsed;
      race.pausedAt = null;
      this.broadcast({ t: 'startAt', startAt: race.startAt });
    }
  }

  openToFriends(code) {
    this.pauseSolo(false);
    this.code = code;
    if (this.race?.results.size && !this.race.endAt) {
      this.race.endAt = this.now() + AFTER_FIRST;
      this.broadcast({ t: 'deadline', endAt: this.race.endAt });
    }
  }

  refusal(who) { return who && this.banned.has(who) ? 'The host sent you out' : ''; }
  broadcast(msg) { const s = JSON.stringify(msg); for (const m of this.members.values()) m.client.sendText(s); }
  broadcastRoom() { for (const m of this.members.values()) m.client.sendText(JSON.stringify(this.view(m.id))); if (this.onChange) this.onChange(); }
  listing() {
    return { code: this.code, name: this.name, players: this.members.size, max: MAX_MEMBERS, live: this.phase === 'race', mode: this.settings.mode };
  }

  view(you) {
    return { t: 'room', code: this.code, name: this.name, you, hostId: this.hostId, phase: this.phase, settings: this.settings, max: MAX_MEMBERS, members: [...this.members.values()].map((m) => ({ id: m.id, name: m.name, car: m.car, color: m.color, ready: m.ready, wins: m.wins, watch: !!m.watch })) };
  }

  join(client) {
    const p = sanitizeProfile(client.profile), taken = new Set([...this.members.values()].map((m) => m.color));
    const m = { id: client.id, client, ...p, ready: false, wins: 0, pose: null, prog: -1e9, finish: null };
    if (taken.has(m.color)) m.color = COLOURS.find((c) => !taken.has(c)) || m.color;
    this.members.set(m.id, m); client.room = this;
    if (!this.hostId) this.hostId = m.id;
    this.broadcastRoom();
    if (this.race && this.race.cruise && !m.watch) { // a cruise is joined as it goes
      m.racing = true; this.race.grid.push(m.id); const c = this.raceMsg(); client.sendText(JSON.stringify(c)); const car = c.cars.find((k) => k.id === m.id);
      for (const o of this.members.values()) if (o !== m) o.client.sendText(JSON.stringify({ t: 'car', car }));
    } else if (this.race) client.sendText(JSON.stringify({ ...this.raceMsg(), watch: true }));
    else if (this.lastResults) client.sendText(JSON.stringify(this.lastResults));
  }

  leave(client) {
    const m = this.members.get(client.id); client.room = null;
    if (!m) return;
    this.members.delete(client.id);
    if (this.hostId === client.id) this.hostId = this.members.size ? [...this.members.keys()][0] : 0;
    this.broadcast({ t: 'gone', id: client.id });
    if (this.race) { this.race.out.add(client.id); this.race.grid = this.race.grid.filter((id) => id !== client.id); if (!this.race.cruise) this.checkEnd(); }
    if (!this.members.size) { this.race = null; this.phase = 'lobby'; }
    this.broadcastRoom();
  }

  handleText(client, msg) {
    const m = this.members.get(client.id); if (!m) return;
    const host = client.id === this.hostId;
    switch (msg.t) {
      case 'hello': case 'profile': { const p = sanitizeProfile(msg.profile); const taken = [...this.members.values()].some((o) => o !== m && o.color === p.color); Object.assign(m, p, taken ? { color: m.color } : {}); this.broadcastRoom(); break; }
      case 'watch': m.watch = !!msg.on; this.broadcastRoom(); break; // (from the next start: no car, only eyes)
      case 'ready': m.ready = !!msg.on; this.broadcastRoom(); break;
      case 'set': if (host && this.phase === 'lobby') { this.set(msg.settings); this.broadcastRoom(); } break;
      case 'name': if (host) { this.name = cleanRoomName(String(msg.name || '')) || this.name; this.broadcastRoom(); } break;
      case 'start': if (host && this.phase === 'lobby') this.start(msg.trial === true && this.localSolo); break;
      case 'finish': this.finish(m, msg); break;
      // (alone in a cruise one may let the time run on, waiting for a bus)
      case 'skip': if (this.race && this.race.cruise && this.members.size === 1) { this.race.startAt -= Math.max(0, Math.min(1500, Number(msg.ms) || 0)); this.broadcast({ t: 'startAt', startAt: this.race.startAt }); } break;
      case 'weather': if (host && !this.race?.trial && CHOICES.includes(msg.weather)) { // the host may turn the weather at any time
        this.settings = { ...this.settings, weather: msg.weather }; const R = this.race; if (R) { R.settings.weather = msg.weather; R.wx = { to: msg.weather, from: R.wx.to, at: (this.now() - R.startAt) / 1000 }; this.broadcast({ t: 'weather', wx: R.wx }); } else this.broadcastRoom(); } break;
      case 'lobby': if (host && this.phase !== 'lobby') this.toLobby(); break;
      case 'kick': if (host && msg.id !== this.hostId) { const k = this.members.get(msg.id); if (k) { if (k.client.who) this.banned.add(k.client.who); k.client.sendText(JSON.stringify({ t: 'error', text: 'The host sent you out', kicked: true })); if (this.onKicked) this.onKicked(k.client); else this.leave(k.client); } } break;
      default:
    }
  }

  set(s) {
    s = s && typeof s === 'object' ? s : {};
    const o = this.settings, c = COURSES.find((q) => q.id === s.course);
    this.settings = { mode: s.mode === 'cruise' || s.mode === 'race' ? s.mode : o.mode, start: STARTS.includes(s.start) ? s.start : o.start, course: c ? c.id : o.course, laps: int(s.laps, 1, 9, c && c.id !== o.course ? c.laps : o.laps), reverse: typeof s.reverse === 'boolean' ? s.reverse : o.reverse, weather: CHOICES.includes(s.weather) ? s.weather : o.weather, light: ['day', 'night', 'cycle'].includes(s.light) ? s.light : o.light, traffic: int(s.traffic, 0, 2, o.traffic), bots: int(s.bots, 0, GRID - 1, o.bots), level: int(s.level, 0, 2, o.level) };
  }

  start(trial = false) {
    const S = trial ? { ...this.settings, ...TIME_TRIAL, course: this.settings.course, reverse: this.settings.reverse } : this.settings;
    const def = COURSES.find((c) => c.id === S.course), all = [...this.members.values()], cruise = S.mode === 'cruise', drivers = all.filter((m) => !m.watch), people = cruise && !drivers.length ? all : drivers, nb = cruise ? 0 : Math.max(people.length ? 0 : 3, Math.min(S.bots, GRID - people.length)); // (somebody has to drive)
    const taken = new Set(people.map((m) => m.color)), names = BOT_NAMES.filter((n) => !people.some((m) => m.name === n)), seed = trial ? TRIAL_SEED : Math.floor(Math.random() * 1e9);
    const free = COLOURS.filter((c) => !taken.has(c));
    this.raceNo = (this.raceNo + 1) & 255;
    this.bots = Array.from({ length: nb }, (_, k) => ({ id: 60000 + k, name: names[(k + seed) % names.length], car: RACERS[(k * 5 + seed) % RACERS.length].id, color: free[k % free.length] || COLOURS[k % COLOURS.length], bot: true }));
    // the grid: bots ahead, people by their last result reversed, newest last
    const grid = [...this.bots.map((b) => b.id), ...people.sort((a, b) => a.wins - b.wins || Math.sin(seed + a.id) - Math.sin(seed + b.id)).map((m) => m.id)];
    this.race = { trial, no: this.raceNo, seed, settings: { ...S }, grid, startAt: this.now() + COUNTDOWN, results: new Map(), out: new Set(), endAt: 0, course: this.net && !cruise ? new Course(this.net, def, S.reverse) : null, traffic: [], cruise, wx: { to: S.weather, from: null, at: 0 }, clock: cityStart(Date.now(), S.light) };
    if (cruise) this.race.startAt = this.now(); // (nothing to count down to)
    for (const m of this.members.values()) { m.pose = null; m.prog = -1e9; m.ready = false; m.racing = grid.includes(m.id); }
    if (this.race.course) {
      this.race.traffic = makeTraffic(this.race.course, seed, S.traffic);
      for (const b of this.bots) { b.c = makeCar(b.car); startOn(b.c, this.race.course, grid.indexOf(b.id)); b.ai = makeBot(seed + b.id, S.level); b.done = 0; b.skip = new Map(); b.at = 0; }
    }
    this.phase = 'race';
    this.broadcastRoom();
    this.broadcast(this.raceMsg());
  }

  raceMsg() {
    const R = this.race, who = (id) => this.members.get(id) || this.bots.find((b) => b.id === id);
    return { t: 'race', trial: R.trial, endAt: R.endAt, no: R.no, seed: R.seed, settings: R.settings, wx: R.wx, clock: R.clock, startAt: R.startAt, cars: R.grid.map((id, slot) => { const m = who(id); return m && { id, slot, name: m.name, car: R.trial ? TRIAL_CAR : m.car, color: m.color, bot: !!m.bot }; }).filter(Boolean) };
  }

  onPose(m, dv) {
    const p = decodePose(dv), R = this.race;
    if (!p || !R || p.race !== R.no || !m.racing) return;
    // (no teleporting ahead: progress grows no faster than any car drives)
    const now = this.now();
    if (m.poseAt !== undefined && m.pose) { const dt = Math.max(0.02, (now - m.poseAt) / 1000); p.prog = Math.min(p.prog, m.pose.prog + 30 * dt + 4); } else p.prog = Math.min(p.prog, 5);
    m.pose = p; m.poseAt = now; m.prog = Math.max(m.prog, p.prog);
  }

  finish(m, msg) {
    const R = this.race; if (!R || R.cruise || R.results.has(m.id) || !m.racing) return;
    const t = this.now() - R.startAt, time = Number(msg.time), len = R.course ? R.course.len : 0;
    if (t < 1000 || (len && m.prog < R.settings.laps * len - 60)) return; // (its poses must have got there)
    const claim = Number.isFinite(time) && Math.abs(time - t) < 1500 ? time : t, best = Number(msg.best);
    this.record(m.id, claim, Number.isFinite(best) && best > 1000 ? best : 0);
  }

  record(id, time, best) {
    const R = this.race; if (R.results.has(id)) return;
    R.results.set(id, { id, time, best });
    if (!this.localSolo && !R.endAt) R.endAt = this.now() + AFTER_FIRST;
    this.broadcast({ t: 'finished', id, time, endAt: R.endAt, place: R.results.size });
    this.checkEnd();
  }

  checkEnd() {
    const R = this.race; if (!R) return;
    const people = [...this.members.values()].filter((m) => m.racing), all = people.length ? people.every((m) => R.results.has(m.id)) : !R.cruise && this.bots.length && this.bots.every((b) => R.results.has(b.id));
    if (all) {
      const endAt = Math.min(R.endAt || Infinity, this.now() + (this.bots.every((b) => R.results.has(b.id)) ? RESULTS_MIN : 6000));
      if (endAt !== R.endAt) {
        R.endAt = endAt;
        if (!this.localSolo) this.broadcast({ t: 'deadline', endAt });
      }
    }
  }

  end() {
    const R = this.race, who = (id) => this.members.get(id) || this.bots.find((b) => b.id === id);
    const prog = (id) => { const m = this.members.get(id); if (m) return m.prog; const b = this.bots.find((q) => q.id === id); return b && b.c ? b.c.prog : -1e9; };
    const order = [...R.results.values()].sort((a, b) => a.time - b.time), rest = R.grid.filter((id) => !R.results.has(id) && who(id)).sort((a, b) => prog(b) - prog(a));
    const list = [...order, ...rest.map((id) => ({ id, time: 0, best: 0 }))].map((r, i) => { const m = who(r.id); return m && { ...r, place: i + 1, name: m.name, color: m.color, car: R.trial ? TRIAL_CAR : m.car, bot: !!m.bot }; }).filter(Boolean);
    const first = list[0] && this.members.get(list[0].id); if (first && list[0].time) first.wins++;
    this.lastResults = { t: 'results', course: R.settings.course, settings: R.settings, list };
    this.race = null; this.phase = 'lobby'; for (const m of this.members.values()) m.racing = false;
    this.broadcast(this.lastResults); this.broadcastRoom();
  }

  toLobby() { this.race = null; this.phase = 'lobby'; for (const m of this.members.values()) m.racing = false; this.broadcast({ t: 'stopped' }); this.broadcastRoom(); }

  tick() {
    this.ticks++;
    const R = this.race; if (!R || R.pausedAt != null) return;
    const now = this.now(), t = (now - R.startAt) / 1000;
    if (R.course && this.bots.length) {
      const cars = [...this.bots.map((b) => b.c)], people = [];
      for (const m of this.members.values()) if (m.pose && m.racing) people.push({ ...m.pose, type: m.car });
      const all = [...cars, ...people], tr = {}, W = weatherAt(R.wx, R.seed, t, (R.w ||= {}));
      for (const b of this.bots) {
        const c = b.c;
        if (t < 0) continue;
        const seen = all.slice();
        for (const v of R.traffic) { const ds = ((((v.s0 + v.dir * v.v * t - c.s) % R.course.len) + R.course.len * 1.5) % R.course.len) - R.course.len / 2; if (ds > -3 && ds < 34) seen.push(trafficAt(v, R.course, t, (v.o ||= {}))); }
        const inp = driveBot(b.ai, c, R.course, seen, t + b.id, 1 / 60, R.course.tunnel[R.course.idx(c.s)] === 2 ? 1 : W.grip); inp.wind = W.wind > 0.01 && R.course.tunnel[R.course.idx(c.s)] !== 2 ? gust(W, t, c.x, c.z) : null;
        if (b.done) { inp.gas *= 0.45; inp.turbo = false; }
        c.braking = inp.brake > 0.2;
        // they ease off far ahead of the people and press on behind (a little)
        if (people.length && !b.done) { let lead = -1e9; for (const p of people) lead = Math.max(lead, p.prog); const gap = c.prog - lead; inp.handicap = (inp.handicap || 1) * (gap > 25 ? Math.max(0.86, 1 - (gap - 25) * 0.0011) : gap < -35 ? 1.05 : 1); }
        for (let k = 0; k < 2; k++) { stepCar(c, inp, this.net, R.course.only, STEP); track(c, R.course); }
        for (const p of people) bump(c, p, false);
        for (const v of R.traffic) { const ds = Math.abs((((v.s0 + v.dir * v.v * t - c.s) % R.course.len) + R.course.len * 1.5) % R.course.len - R.course.len / 2); if (ds < 12 && !(t < (b.skip.get(v) || 0))) { trafficAt(v, R.course, t, tr); if (bump(c, tr, false, undefined, 0.4) > 0.3) b.skip.set(v, t + 1.4); } } // (one knock, then it lets the car by)
        if (t - (b.at || 0) > 3) { if (b.at && c.prog - b.was < 3 && !b.done) c.lost = 9; b.at = t; b.was = c.prog; } // (getting nowhere: put back on the road)
        if (c.lost > 1) { const p = R.course.place(c.s, 0); Object.assign(c, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, vx: 0, vz: 0, vy: 0, lost: 0 }); }
        if (!b.done && c.prog >= R.settings.laps * R.course.len) { b.done = t * 1000; c.finished = true; this.record(b.id, t * 1000, 0); if (!this.race) return; }
      }
      for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) if (Math.abs(cars[i].x - cars[j].x) < 2) bump(cars[i], cars[j], true);
    }
    if (this.ticks % POSE_EVERY === 0) {
      const list = [];
      for (const m of this.members.values()) if (m.pose && m.racing && now - m.poseAt < 3000) list.push([m.id, m.pose]);
      for (const b of this.bots) if (b.c) list.push([b.id, { ...b.c, t }]);
      if (list.length) { const buf = new Uint8Array(encodePoses(list, R.no, now)); for (const m of this.members.values()) m.client.sendBinary(buf); }
    }
    if (R.cruise) return; // (until the host ends it)
    if (R.endAt && now >= R.endAt) this.end();
    // (nobody finishing at all: an abandoned race does not run for ever)
    else if (!this.localSolo && !R.endAt && R.course && t > 60 + (R.course.len * R.settings.laps) / 4) this.end();
  }
}
