// One race (or a free drive) on this screen: the own car simulated here, the
// others shown from what the host passes on.
import * as THREE from './vendor/three.module.min.js';
import { Course } from '../shared/track.js';
import { COURSES } from '../shared/courses.js';
import { makeCar, startOn, stepCar, track, bump, putOn, STEP } from '../shared/car.js';
import { makeTraffic, makeSimits } from '../shared/traffic.js';
import { makeBot, driveBot } from '../shared/bot.js';
import { KMH } from '../shared/units.js';
import { drawnAt } from './roads.js';
import { SLOTS, DECK } from '../shared/ships.js';
import { RaceStats } from '../shared/stats.js';
import { Cabin } from './cabin.js';
import { CAMS } from './view.js';
import { Card, tl } from '../shared/fares.js';
import { tower, sectors, board, gapChart, MODES } from './statsview.js';
import { weatherAt, gust, mixWeather, WEATHER } from '../shared/weather.js';
import { encodePose } from '../shared/protocol.js';
import { makeCarModel, animateCar, setHeadlights, lodCar } from './carmodels.js';
import { CourseView, CityView } from './courseview.js';
import { Cruiser, cityTraffic } from '../shared/cruise.js';
import { Trip } from './trip.js';
import { makePerson } from './person.js';
import { t } from './i18n.js';
import { esc } from './hud.js';
const DELAY = 0.11, wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export class Game {
  constructor({ view, net, hud, audio, fx, input, weather }) { Object.assign(this, { view, net, hud, audio, fx, input, weather }); this.w = {}; this.active = false; this.cars = new Map(); this.override = null; this.trip = new Trip(this); }

  // ---------------------------------------------------------------- beginnings
  clear() { if (this.fly) this.fly.stop(true); if (this.nav) { this.nav.stop(); this.nav.hide(); } if (this.nextSign) this.nextSign.update(null); this.trip.clear(); if (this.cabin) this.cabin.leave(); this.view.ride(false); this.aboard = null; this.ferryNote = ''; this.view.aboard = false; if (this.view.world) this.view.world.shipTime = null;
    for (const c of this.cars.values()) this.drop(c);
    if (this.view.world && this.active) this.view.world.A.stream.route(null); this.line0 = null; if (this.view.world && this.view.world.transit) { this.view.world.transit.hold = null; this.view.world.transit.on = true; this.view.world.transit.city = true; }
    this.cars.clear(); if (this.cv) this.cv.dispose(); this.cv = null; this.course = null; this.me = null; this.active = false; this.hud.course(null); this.audio.quiet(); this.hud.set('big', ''); this.hud.full.hidden = true; this.full = false; this.hud.set('tower', ''); this.hud.set('sec', ''); if (this.input.touchEl) this.input.touchEl.hidden = true;
  }
  addCar(o, mine) {
    const model = makeCarModel(o.car, o.color); this.view.scene.add(model);
    if (!mine) model.add(this.label(o.name, o.color));
    const c = { ...o, model, mine, st: makeCar(o.car), buf: [], prog: -1e9, done: 0 }; this.cars.set(o.id, c); return c;
  }
  label(text, color) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 56; const g = cv.getContext('2d'); g.font = '800 30px ui-rounded, system-ui, sans-serif'; const w = Math.min(246, g.measureText(text).width + 40); g.fillStyle = 'rgba(10,8,6,.6)'; g.beginPath(); g.roundRect(128 - w / 2, 4, w, 46, 14); g.fill(); g.fillStyle = color; g.beginPath(); g.roundRect(128 - w / 2 + 10, 19, 14, 16, 4); g.fill(); g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, 128 - w / 2 + 31, 28, 205);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, fog: false })); s.scale.set(1.9, 0.415, 1); s.position.y = 1.15; return s;
  }
  race(msg, myId, link) {
    this.clear(); this.card = new Card(); this.trip.told = false; this.link = link; this.msg = msg; this.myId = myId; this.settings = msg.settings; this.free = msg.settings.mode === 'cruise'; this.override = null; this.wx = msg.wx || { to: msg.settings.weather || 'clear', from: null, at: 0 };
    const def = COURSES.find((c) => c.id === msg.settings.course), course = (this.course = this.free ? null : new Course(this.net, def, msg.settings.reverse));
    if (this.free) { this.simits = []; this.traffic = []; this.cv = new CityView(this.view.scene, cityTraffic(this.net, msg.seed, msg.settings.traffic), this.net); this.pilot = new Cruiser(this.net); this.auto1 = false; } else { this.simits = makeSimits(course, msg.seed); this.traffic = makeTraffic(course, msg.seed, msg.settings.traffic); this.cv = new CourseView(this.view.scene, this.net, course, this.simits, this.traffic, this.view.world); }
    this.view.world.A.stream.route(course ? Array.from({ length: Math.ceil(course.len / 40) }, (_, k) => { const p = course.place(k * 40, 0, {}); return [p.x, p.z]; }) : null);
    this.view.warm();
    this.stats = this.free ? null : new RaceStats(course.len, msg.settings.laps, msg.cars); this.seen = 0; this.full = false; this.aboard = null; this.ferryOff = null; this.ferryNote = '';
    for (const o of msg.cars) this.enter(o);
    this.mine = this.cars.get(myId) || null; this.me = this.mine ? this.mine.st : null;
    this.watching = !this.me; this.watchId = null; if (this.watching) this.hud.flash(`<small>${t('watching')}</small>`, 5000);
    Object.assign(this, { acc: 0, sent: 0, lapAt: 0, best: 0, finished: 0, wrongT: 0, count: 9, lastLap: 0, auto: null, resetAt: 0, place: 0, active: true, t: -9, safeAt: 0 });
    if (this.free && this.me) { this.me.turbo = 1; this.safe = { x: this.me.x, y: this.me.y, z: this.me.z, yaw: this.me.yaw }; }
    this.hud.course(course); this.view.cam.init = false; this.hud.set('keys', t(this.free ? 'cruiseKeys' : 'controls')); this.hud.keys.style.opacity = 1; clearTimeout(this.kt); this.kt = setTimeout(() => { this.hud.keys.style.opacity = 0; }, this.free ? 14000 : 9000);
    if (this.input.touchEl) this.input.touchEl.hidden = false;
    const at = this.me || [...this.cars.values()][0]?.st; if (at) this.view.world.prime(at.x, at.z, 150);
  }
  enter(o) { // a car takes its place
    if (this.cars.has(o.id)) return; const c = this.addCar(o, o.id === this.myId);
    if (!this.free) { startOn(c.st, this.course, o.slot); c.prog = c.st.prog; return; }
    const hub = this.settings.start, r = this.net.adj.get(hub).map((e) => e.r).sort((p, q) => q.len - p.len)[0], d = r.a === hub ? 1 : -1, k = 5 + (o.slot % 8) * 2, i = d > 0 ? Math.min(r.n - 3, k) : Math.max(2, r.n - 1 - k), dx = (r.p[(i + d) * 3] - r.p[i * 3]), dz = r.p[(i + d) * 3 + 1] - r.p[i * 3 + 1], l = Math.hypot(dx, dz), lat = r.bus ? 1.4 : r.hw * 0.42;
    putOn(c.st, { x: r.p[i * 3] - (dz / l) * lat, z: r.p[i * 3 + 1] + (dx / l) * lat, y: r.p[i * 3 + 2], yaw: Math.atan2(dx, dz) });
  }
  gone(id) { const c = this.cars.get(id); if (!c || c.mine) return; this.drop(c); this.cars.delete(id); }
  drop(c) { if (c.person) { this.view.scene.remove(c.person); c.person.userData.dispose(); c.person = null; } this.view.scene.remove(c.model); c.model.traverse((o) => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); c.model.userData.paint.dispose(); c.model.userData.tail.dispose(); }
  toggleAuto() { if (!this.free || !this.me || this.trip.away) return; this.auto1 = !this.auto1; this.pilot.reset(); this.pilot.obey = true; if (this.auto1) this.pilot.speed = Math.max(5, Math.min(16, Math.abs(this.me.speed) > 3 ? this.me.speed : 8.5)); this.hud.flash(`<small>${t('auto1')} ${this.auto1 ? '✓' : '✕'}</small>`, 1200); }
  poses(b) {
    if (!this.active || b.race !== this.msg.no) return;
    for (const p of b.cars) { if (p.id === this.myId) continue; const c = this.cars.get(p.id); if (!c) continue; const L = c.buf[c.buf.length - 1]; if (L && p.t <= L.t) continue; c.buf.push(p); if (c.buf.length > 24) c.buf.shift(); c.prog = p.prog; c.fin = p.finished; if (this.stats) this.stats.sample(p.id, p.t, p.prog, Math.hypot(p.vx, p.vz)); }
  }
  someoneFinished(m) { const c = this.cars.get(m.id); if (c) { c.done = m.time; c.place = m.place; } if (this.stats) this.stats.finish(m.id, m.time / 1000); if (m.id === this.myId) { this.place = m.place; this.hud.flash(`${m.place}.<small>${t('finished')}</small>`, 4200); if (m.place <= 3) this.audio.win(); } }

  // ---------------------------------------------------------------- each frame
  raceTime() { return (this.link.hostNow() - this.msg.startAt) / 1000; }
  at(c, time) { // another car at a moment: between two poses, or a little beyond the last
    const b = c.buf; if (!b.length) return null;
    let i = b.length - 1; while (i > 0 && b[i].t > time) i--;
    const p = b[i], q = b[i + 1], o = c.st;
    if (q && time >= p.t) { const u = (time - p.t) / Math.max(1e-3, q.t - p.t), u2 = u * u, u3 = u2 * u, D = q.t - p.t, jump = Math.hypot(q.x - p.x, q.z - p.z) > 6; if (jump) { Object.assign(o, { x: q.x, y: q.y, z: q.z }); } else { const H = (a, va, e, vb) => (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * D * va + (-2 * u3 + 3 * u2) * e + (u3 - u2) * D * vb; o.x = H(p.x, p.vx, q.x, q.vx); o.z = H(p.z, p.vz, q.z, q.vz); o.y = p.y + (q.y - p.y) * u; } o.yaw = p.yaw + wrapA(q.yaw - p.yaw) * u; o.vx = p.vx + (q.vx - p.vx) * u; o.vz = p.vz + (q.vz - p.vz) * u; o.steer = p.steer + (q.steer - p.steer) * u; o.slip = q.slip; } else { const e = Math.max(0, Math.min(0.25, time - p.t)); o.x = p.x + p.vx * e; o.z = p.z + p.vz * e; o.y = p.y; o.yaw = p.yaw; o.vx = p.vx; o.vz = p.vz; o.steer = p.steer; o.slip = p.slip; }
    const f = q || p; o.foot = f.foot; o.drift = f.drift; o.boosting = f.boosting; o.braking = f.braking; o.horn = f.horn; o.air = f.air; o.wallT = f.wall ? 0.1 : 0; return o;
  }
  frame(dt, now) {
    if (!this.active) return;
    const T = (this.t = this.raceTime()), me = this.me, V = this.view, fly = this.fly && this.fly.on ? this.fly.frame(dt) : null, inp = this.input.read(); this.input.racing = T > 0 && !this.finished; this.input.walking = this.trip.away;
    // the count
    if (!this.free && !this.watching) { const n = Math.ceil(-T); if (n !== this.count) { if (n >= 1 && n <= 3) { this.hud.flash(String(n), 900); this.audio.beep(false); } else if (n === 0 && this.count === 1) { this.hud.flash(t('go'), 900); this.audio.beep(true); } this.count = n; } }
    // others, as shown and (for touching) as they are now
    const w = weatherAt(this.wx, this.msg.seed, T, this.w);
    const under = fly ? 0 : this.trip.deep ? 2 : this.mine && this.me && !this.trip.away ? this.net.under(this.me) : 0; this.underK = (this.underK || 0) + ((under === 2 ? 1 : 0) - (this.underK || 0)) * Math.min(1, dt * 5); if (under === 2) { w.grip = 1; w.wind = 0; }
    const others = []; let showT = T - DELAY;
    for (const c of this.cars.values()) if (!c.mine) { if (c.buf.length) this.at(c, showT); others.push(c); }
    const TR = V.world.transit; if (TR) { TR.city = this.free; TR.clock = this.msg.clock || TR.clock; TR.on = this.free || this.settings.traffic > 0; TR.hold = this.course && T < 6 ? (this.line0 ||= this.course.place(0, 0, {})) : null; } const buses = TR && me ? TR.about(me.x, me.z, T) : []; V.world.shipTime = T; const onFoot = this.free && me ? this.trip.frame(dt, now, T, inp) : null, away = this.trip.away;
    if (me) {
      const ctl = { steer: inp.steer, gas: inp.gas, brake: inp.brake, drift: inp.drift, turbo: inp.turbo };
      if (T < 0) Object.assign(ctl, { gas: 0, brake: 0, steer: inp.steer, turbo: false, drift: false });
      if (this.finished) { this.auto ||= makeBot(1, 0); const q = driveBot(this.auto, me, this.course, others.map((o) => o.st), T, dt, w.grip); Object.assign(ctl, q, { gas: q.gas * 0.55, turbo: false }); }
      if (this.brakeFor > 0) { this.brakeFor -= dt; if (!inp.gas || this.trip.stopping) Object.assign(ctl, { brake: me.speed > 0.2 ? 1 : 0, gas: 0, hold: true }); }
      if (fly && !this.finished) Object.assign(ctl, { gas: 0, brake: me.speed > 0.2 ? 1 : 0, hold: true });
      if (away) Object.assign(ctl, { gas: 0, brake: 0, steer: 0, turbo: false, drift: false });
      if (this.auto1) { // cruise control: ↑↓ the speed, ←→ the way at the next junction, the brake's other key (space) lets go
        if (inp.drift) this.toggleAuto(); else {
          if (inp.gas || inp.brake) { if (this.pilot.obey) { this.pilot.obey = false; this.pilot.speed = Math.max(3, this.pilot.limit / KMH); } this.pilot.speed = Math.max(3, Math.min(17, this.pilot.speed + (inp.gas - inp.brake) * dt * 4)); } if (Math.abs(inp.steer) > 0.6) this.pilot.want = Math.sign(inp.steer);
          const about = others.map((o) => o.st); if (this.cv.near) about.push(...this.cv.near); about.push(...buses); Object.assign(ctl, this.pilot.drive(me, about, dt, T, w.grip), { drift: false });
        }
      }
      ctl.grip = w.grip; ctl.wind = w.wind > 0.01 && T > 0 ? gust(w, T, me.x, me.z) : null;
      this.ctl = ctl; me.braking = ctl.brake > 0.1; me.horn = inp.horn;
      if (inp.horn && now - (this.hornAt || 0) > 320) { this.hornAt = now; this.audio.horn(); }
      // slipstream
      let draft = 0; for (const o of others) { const dx = o.st.x - me.x, dz = o.st.z - me.z, f = dx * Math.sin(me.yaw) + dz * Math.cos(me.yaw), l = Math.abs(dx * Math.cos(me.yaw) - dz * Math.sin(me.yaw)); if (f > 0.8 && f < 7 && l < 0.6 && me.speed > 8) draft = Math.max(draft, 1 - (f - 0.8) / 6.2); } me.draft += (draft - me.draft) * Math.min(1, dt * 4);
      if (this.free && !away) this.ferry(now, T, me); if (this.aboard || away) this.acc = 0; else
      this.acc = Math.min(0.25, this.acc + dt);
      const wasHit = me.hit;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        if (T < 0) { me.steer += (ctl.steer - me.steer) * 0.1; continue; }
        stepCar(me, ctl, this.net, this.course ? this.course.only : null);
        if (this.course) track(me, this.course);
        for (const o of others) if (!o.st.foot && Math.abs(o.st.x - me.x) < 2.5 && Math.abs(o.st.z - me.z) < 2.5 && o.buf.length) { const L = o.buf[o.buf.length - 1], e = Math.max(0, Math.min(0.2, T - L.t)); this.tmp = Object.assign(this.tmp || {}, { x: (L.x + L.vx * e) * 0.5 + o.st.x * 0.5, z: (L.z + L.vz * e) * 0.5 + o.st.z * 0.5, y: L.y, yaw: L.yaw, vx: L.vx, vz: L.vz, type: o.car }); bump(me, this.tmp, false); }
        if (this.cv && this.cv.near) for (const v of buses.length ? [...this.cv.near, ...buses] : this.cv.near) { if (now < (v.skip || 0)) continue; const dx = Math.abs(v.x - me.x), dz = Math.abs(v.z - me.z); if (dx < 2.5 && dz < 2.5) if (bump(me, v, false, undefined, 0.42) > 0.3) v.skip = now + 1200; } // (one knock, then it lets the car by)
      }
      if (me.hit > wasHit + 0.12) { this.audio.crash(me.hit); this.fx.sparks(me, 8); V.cam.shake = Math.max(V.cam.shake, me.hit); }
      if (!away) this.marks(me, 0, dt); if (!away && me.wallT > 0 && Math.abs(me.speed) > 4 && Math.random() < 0.4) this.fx.sparks(me, 2); if (me.boosting) this.fx.flame(me);
      // simits
      for (const q of this.simits) if (now > q.taken && Math.abs(q.x - me.x) < 0.75 && Math.abs(q.z - me.z) < 0.75 && Math.abs(q.y - me.y) < 1) { q.taken = now + 9000; me.turbo = Math.min(1, me.turbo + 0.3); this.audio.simit(); this.fx.crumbs(q.x, q.y, q.z); }
      if (this.free) { me.turbo = Math.min(1, me.turbo + dt * 0.12); if (!this.aboard && !away && !me.lost && me.air === 0) { if (now - (this.safeAt || 0) > 700) { this.safeAt = now; this.safe = { x: me.x, y: me.y, z: me.z, yaw: me.yaw }; } } }
      if (!away && (me.lost || 0) > 0.8) this.reset();
      if (this.stats && T > 0 && !this.finished) this.stats.sample(this.myId, T, me.prog, me.speed);
      if (this.course && !this.finished && T > 0) this.laps(T, now);
      if (now - this.sent > 33 && !this.watching) { this.sent = now; me.finished = !!this.finished; this.link.sendBinary(encodePose(away && onFoot ? { ...onFoot, foot: true } : me, this.msg.no, T)); }
      if (!fly) this.audio.drive(me, ctl.gas);
    }
    if (fly) this.audio.air(fly.speed, me ? Math.hypot(fly.x - me.x, fly.y - me.y, fly.z - me.z) : 1e4);
    for (const o of others) { this.marks(o.st, o.id % 997, dt); if (o.st.boosting && Math.random() < 0.6) this.fx.flame(o.st); if (o.st.horn && now - (o.hornAt || 0) > 340) { o.hornAt = now; if (me) this.audio.horn(0.18 / (1 + Math.hypot(o.st.x - me.x, o.st.z - me.z) / 6)); } }
    // models
    const eye = V.camera === V.ortho ? null : V.camera.position; for (const c of this.cars.values()) { const s = c.st; lodCar(c.model, eye ? (s.x - eye.x) ** 2 + (s.y - eye.y) ** 2 + (s.z - eye.z) ** 2 > 900 : false); c.model.position.set(s.x, s.y + drawnAt(this.net, s.x, s.z, s.y) - 0.004, s.z); if (c.model.userData.contact) { const h = s.air > 0 ? Math.min(1, s.air * 2) : 0; c.model.userData.contact.material.opacity = 0.85 * (1 - h); } c.model.rotation.set(-Math.atan(s.slope || this.slopeOf(s)) * 0.95, s.yaw, 0, 'YXZ'); animateCar(c.model, s, dt, V.night); c.model.visible = c.mine || (c.buf.length > 0 && !s.foot) || (T < 1 && !s.foot); if (!c.mine && (s.foot || c.person)) { if (!c.person) { c.person = makePerson(c.color); const l = this.label(c.name, c.color); l.position.y = 0.95; c.person.add(l); this.view.scene.add(c.person); } c.person.visible = !!s.foot; if (s.foot) { c.person.position.set(s.x, s.y, s.z); c.person.rotation.y = s.yaw; c.person.userData.step(dt, Math.hypot(s.vx, s.vz)); } } }
    // light of the day
    const day = this.free ? 420 : 150, L = this.override !== null ? this.override : this.settings.light === 'night' ? 1 : this.settings.light === 'cycle' ? Math.min(1, Math.max(0, 0.5 - 0.85 * Math.cos(((T + 20) / day) * Math.PI * 2))) : 0;
    if (Math.abs(V.night - L) > 0.001) V.applyNight(Math.abs(L - V.night) < dt * 0.7 ? L : V.night + Math.sign(L - V.night) * dt * 0.7); setHeadlights(V.night);
    const focus = fly || onFoot || me || this.leader(); if (!focus) return;
    { const u = !fly && !this.trip.away && this.net.under(focus) === 2; this.underK = me ? this.underK : u ? 1 : 0; V.setUnder(u, focus); V.below(fly || this.trip.mode === 'car' ? 0 : this.trip.hall ? 1 : this.trip.pass ? Math.max(0, Math.min(1, (this.trip.passed - 1.4) / Math.max(1, this.trip.pass.entry.run - 1.4))) : this.trip.deep ? 0.6 : 0); V.world.deepNow = !fly && V.deep > 0.9; this.inside(dt, now, T, inp, fly, u); V.aboard = !!this.aboard && !!me; if (this.underK > 0.01) { const k = 1 - this.underK; w.fog *= k; w.rain *= k; w.snowing *= k; w.flash *= k; } }
    this.weather.update(dt, now, w, focus, V.night, [...(me ? [me] : []), ...others.map((o) => o.st)].filter((c) => this.underK < 0.5 && Math.abs(c.x - focus.x) + Math.abs(c.z - focus.z) < 30)); V.setWeather(w, this.weather.flash); setHeadlights(Math.max(V.night, Math.min(1, w.fog * 60 + w.rain * 0.5 + w.snowing * 0.5)));
    V.world.setLights(this.free ? T : null, now); V.world.shipTime = T;
    if (this.cv) { this.cv.night = V.night; this.cv.update(now, T, focus); if (this.cv.crowd) this.audio.crowd(this.cv.crowd.update(now, focus, w, V.night, this.fx)); }
    if (this.stats) this.announce(); if (fly) V.fly(fly); else V.follow(focus, dt, inp.back); if (!away && (me || !fly)) V.lightCar(me || focus); else V.headlight.intensity = 0;
    this.audio.others(others.map((o) => [o.id, o.st, Math.hypot(o.st.x - focus.x, o.st.z - focus.z)]).filter((o) => o[2] < 30));
    if (this.nav) this.nav.frame(dt, now); if (this.nextSign && now - (this.signAt || 0) > 150) { this.signAt = now; this.nextSign.update(me && !away && !fly && T > 0 ? me : null); }
    this.paint(focus, now);
  }
  // the camera inside (cabin.js): in the car, in what one rides, on the ship
  inside(dt, now, T, inp, fly, under) {
    const V = this.view, C = (this.cabin ||= new Cabin(V, V.renderer.domElement)), R = this.trip.mode === 'ride' ? this.trip.ride : null, A = this.mine ? this.aboard : null; if (!fly) V.ride(!!R || !!A); if (fly || CAMS[V.cam.mode] !== 'inside') { C.leave(); return; }
    if (!A) { C.own = false; C.flip = null; } if (!(R && !R.ship)) V.world.inside = null;
    if (R && R.ship) { C.look(inp, dt); C.ship(R.ship, T, now, dt, V.night, R.ship.cars ? R.dir : 1); } else if (R) { if (R.lost) return; C.look(inp, dt); const w = this.trip.w, i = R.p.stopOf(w.k), q = i >= 0 ? R.p.way.stops[i].name : R.p.to; C.transit(R.p, R.run, w, dt, V.night, this.trip.deep, q, w.stop ? R.p.to : R.want ? `${t('nextStop')} · ${t('stopping')}` : t('nextStop')); }
    else if (A) { C.flip = () => { if (C.own) { C.own = false; C.picked.set('carferry', 0); } else if (C.n >= C.seats.length - 1) C.own = true; else C.nextSeat(); }; C.look(inp, dt); if (C.own) C.car(this.mine.model, this.mine.car, this.me, dt, V.night, false); else C.ship(A.S, T, now, dt, V.night, A.to === 1 ? 1 : -1, true); }
    else if (this.me && this.trip.mode === 'car' && this.mine) C.car(this.mine.model, this.mine.car, this.me, dt, V.night, under);
    else C.leave();
  }
  slopeOf(s) { const ux = Math.sin(s.yaw) * 0.6, uz = Math.cos(s.yaw) * 0.6, a = this.net.at(s.x + ux, s.z + uz, s.y + 0.15, null, {}), b = this.net.at(s.x - ux, s.z - uz, s.y + 0.15, null, {}); return a && b && Math.abs(a.h - b.h) < 0.5 ? (a.h - b.h) / 1.2 : 0; }
  // whom a watcher looks at: the leader, or whoever was picked with ← →
  pickWatch(d) { if (!this.active || !this.watching) return; const ids = this.stats ? this.stats.order() : [...this.cars.keys()]; if (!ids.length) return; const i = ids.indexOf(this.watchId ?? this.leaderId()); this.watchId = ids[(i + d + ids.length) % ids.length]; this.view.cam.init = false; }
  leaderId() { if (this.stats) return this.stats.order()[0]; const c = [...this.cars.values()][0]; return c ? c.id : 0; }
  leader() { if (this.watching && this.watchId) { const c = this.cars.get(this.watchId); if (c) return c.st; this.watchId = null; } let best = null; for (const c of this.cars.values()) if (!best || c.prog > best.prog) best = c; return best && best.st; }
  marks(s, id) { const sl = Math.abs(s.slip || 0), v = Math.hypot(s.vx, s.vz), was = this.fx.last.has(id * 2), on = s.air < 0.05 && ((sl > (was ? 0.11 : 0.2) && v > 4) || (s.braking && v > (was ? 6 : 9))); this.fx.mark(id, s, on); if (on && sl > 0.2 && Math.random() < 0.7) this.fx.smoke(s); }
  laps(T, now) {
    const me = this.me, len = this.course.len, lap = Math.floor(me.prog / len); this.mine.prog = me.prog;
    if (lap > this.lastLap) { const time = T * 1000 - this.lapAt; this.lapAt = T * 1000; const first = !this.best, rec = !this.best || time < this.best; if (rec) this.best = time; this.lastLap = lap; if (lap >= this.settings.laps) { this.finished = T * 1000; this.link.sendBinary(encodePose(me, this.msg.no, T)); this.link.send({ t: 'finish', time: T * 1000, best: this.best }); setTimeout(() => this.link && this.link.send({ t: 'finish', time: this.finished, best: this.best }), 600); this.fx.confetti(me.x, me.y, me.z); } else { this.audio.lap(); this.hud.flash(`${t('lap')} ${lap + 1}<small>${rec && !first ? t('newBest') : ''}</small>`, 1400); } }
    // going the wrong way
    const p = this.course.place(me.s), dot = me.vx * p.dx + me.vz * p.dz; this.wrongT = dot < -1.5 && !me.braking ? this.wrongT + 1 / 60 : 0;
    void now;
  }
  reset() {
    if (this.aboard) return; if (this.trip.away) { this.trip.fetch(); return; }
    const now = performance.now(); if (!this.me || now < this.resetAt || this.t < 0) return; this.resetAt = now + 1500;
    if (this.course) { const p = this.course.place(this.me.s); putOn(this.me, p); } else putOn(this.me, this.safe); this.me.lost = 0; this.view.cam.init = false; this.fx.smoke(this.me, 2);
  }
  discover(m) {
    if (!this.found) { try { this.found = new Set(JSON.parse(localStorage.getItem('nanoprix.found') || '[]')); } catch { this.found = new Set(); } this.foundOf = this.view.world.marks.filter((k) => k.hero).length; }
    if (m.skip || this.found.has(m.id)) return; this.found.add(m.id); try { localStorage.setItem('nanoprix.found', JSON.stringify([...this.found])); } catch { /* */ }
    this.hud.flash(`<small>${esc(m.name)}<br>${t('found')} ${this.found.size}/${this.foundOf}</small>`, 2600); this.audio.simit();
  }
  // the car ferries: drive to the end of the apron while she lies there, and you are aboard; on the other side you drive off
  ferry(now, T, me) {
    const F = this.view.world.fleet; if (!F) return; const ease = (k) => k * k * (3 - 2 * k), turn = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k, a = (this.fa ||= {}), A = this.aboard; this.ferryNote = '';
    if (!A) {
      for (const S of F.car) for (const [i, e] of [[S.a, 0], [S.b, 1]]) {
        const p = F.ports[i], d = Math.hypot(me.x - p.x, me.z - p.z); if (this.ferryOff === p) { if (d > 5) this.ferryOff = null; continue; } if (d > 30) continue; F.at(S, T, a); const to = F.ports[e ? S.a : S.b].name;
        if (a.dock === e && a.leaves > 2) { this.ferryNote = `⛴ ${to} · ${t('sails')} ${Math.ceil(a.leaves)} ${t('secs')}`; if (this.trip.TR) { const r = this.trip.carRide(S, p), q = this.card.quote(r, this.trip.c), no = q.fare > this.card.bal; this.ferryNote += ` · <b class="tl${no ? ' no' : ''}">${tl(q.fare)}</b>${q.night ? ' ☾×2' : ''}${no ? ` ${t('noMoney')}` : ''}`; if (d < 2 && T > 0) { const paid = !no && this.trip.pay(r); if (!paid) return; this.hud.banner(`<b>⛴ ${esc(to)}</b>${this.trip.said(paid)}`, 3000); } } if (d < 2 && T > 0) { if (this.auto1) this.toggleAuto(); let slot = 0; const used = [...this.cars.values()].filter((c) => !c.mine && Math.hypot(c.st.x - a.x, c.st.z - a.z) < S.L * 0.6).length; slot = used % SLOTS.length; this.aboard = { S, to: e ? 0 : 1, slot, t0: now, from: { x: me.x, y: me.y, z: me.z, yaw: me.yaw }, phase: 'on' }; me.vx = me.vz = me.vy = 0; me.air = 0; this.audio.tone && this.audio.tone(150, 900); return; } }
        else { const L = S.cycle, next = this.nextDock(F, S, e, T); this.ferryNote = `⛴ ${to} · ${t('lands')} ${next} ${t('secs')}`; void L; }
      }
      return;
    }
    const S = A.S; F.at(S, T, a); const sl = SLOTS[A.slot], sx = Math.sin(a.yaw), sz = Math.cos(a.yaw), W = this.view.world, deck = { x: a.x + sz * sl[0] + sx * sl[1], z: a.z - sx * sl[0] + sz * sl[1], y: DECK + (W.sea ? W.sea(a.x, a.z) : 0), yaw: A.to === 1 ? a.yaw : a.yaw + Math.PI }, k = Math.min(1, (now - A.t0) / 2000), E = ease(k);
    me.lost = 0; me.air = 0; me.drift = false; me.slip = 0; me.slope = 0; me.steer = 0; this.finishedAt = 0;
    if (A.phase === 'on') { Object.assign(me, { x: A.from.x + (deck.x - A.from.x) * E, z: A.from.z + (deck.z - A.from.z) * E, y: A.from.y + (deck.y - A.from.y) * E, yaw: turn(A.from.yaw, deck.yaw, E) }); me.vx = Math.sin(me.yaw) * 2.4 * (k < 1 ? 1 : 0); me.vz = Math.cos(me.yaw) * 2.4 * (k < 1 ? 1 : 0); if (k >= 1) A.phase = 'sail'; } else if (A.phase === 'sail') { Object.assign(me, deck); me.vx = sx * a.v * a.sign; me.vz = sz * a.v * a.sign; me.speed = 0; if (a.dock === A.to && a.leaves < S.dwell - 1) { A.phase = 'off'; A.t0 = now; A.from = { x: me.x, y: me.y, z: me.z, yaw: me.yaw }; const p = F.ports[A.to ? S.b : S.a]; A.port = p; A.end = { x: p.x - p.ox * 2.2, z: p.z - p.oz * 2.2, yaw: Math.atan2(-p.ox, -p.oz) }; const q = this.net.at(A.end.x, A.end.z, 0.5, null, {}); A.end.y = q ? q.h : 0.42; } } else { Object.assign(me, { x: A.from.x + (A.end.x - A.from.x) * E, z: A.from.z + (A.end.z - A.from.z) * E, y: A.from.y + (A.end.y - A.from.y) * E, yaw: turn(A.from.yaw, A.end.yaw, E) }); me.vx = Math.sin(me.yaw) * 2.2; me.vz = Math.cos(me.yaw) * 2.2; if (k >= 1) { this.aboard = null; this.ferryOff = A.port; this.safe = { x: me.x, y: me.y, z: me.z, yaw: me.yaw }; this.safeAt = now; this.hud.flash(`<span style="font-size:44px">${esc(A.port.name)}</span>`, 1800); } }
    this.ferryNote = A.phase === 'off' ? '' : a.dock >= 0 && A.phase !== 'off' ? `⛴ ${t('sails')} ${Math.ceil(a.leaves)} ${t('secs')}` : `⛴ ${F.ports[A.to ? S.b : S.a].name} · ${Math.ceil(a.left)} ${t('secs')}`;
  }
  nextDock(F, S, e, T) { const b = (this.fb ||= {}); F.at(S, T, b); if (b.dock === e) return Math.ceil(b.leaves); if (b.dock >= 0) return Math.ceil(b.leaves + S.T); return Math.ceil(b.to === e ? b.left : b.left + S.dwell + S.T); }
  // what the timing screen calls out: a fastest lap, one's own sectors
  announce() { const E = this.stats.events; for (; this.seen < E.length; this.seen++) { const e = E[this.seen], c = this.stats.cars.get(e.id); if (e.kind === 'fastest' && this.stats.cars.size > 1 && e.lap + 1 <= this.stats.laps) this.hud.banner(`<i style="background:${c.color}"></i><b>${t('fastestLap')}</b> ${esc(c.name)} <em>${e.time >= 60 ? `${Math.floor(e.time / 60)}:` : ''}${(e.time % 60).toFixed(3).padStart(e.time >= 60 ? 6 : 1, '0')}</em>`); } }
  nextMode() { const i = MODES.indexOf(this.hud.mode); this.hud.mode = MODES[(i + 1) % MODES.length]; this.hud.cache.mode = null; this.painted = 0; return this.hud.mode; }
  showFull(on = !this.full) { if (!this.stats || !this.active) return; this.full = on; this.hud.full.hidden = !on; this.fullAt = 0; }
  toggleNight() { this.override = this.view.night > 0.5 ? 0 : 1; }
  paint(focus, now) {
    if (now - (this.painted || 0) < 33) return; this.painted = now;
    const fly = this.fly && this.fly.on, me = this.me, list = [...this.cars.values()].map((c) => ({ c, p: c.done ? 1e7 - c.done / 1000 : c.mine ? (this.finished ? 1e6 : c.st.prog) : c.prog })).sort((a, b) => b.p - a.p), my = list.findIndex((o) => o.c === this.mine), myP = me ? me.prog : 0;
    const q = this.net.at(focus.x, focus.z, focus.y, null, {}); let near = '', bd = 1e9; for (const m of this.view.world.marks) { const d = Math.hypot(m.x - focus.x, m.z - focus.z) - m.r; if (this.free && !fly && m.hero && d < 16) this.discover(m); if (d < 14 && d + (m.hero ? -6 : 0) < bd) { bd = d + (m.hero ? -6 : 0); near = m.name; } }
    const turn = this.free && this.auto1 && this.pilot.turn && this.pilot.left < 60 ? this.pilot.turn : null, sub = this.free ? (this.auto1 ? `${t('auto1')} · ${this.pilot.red ? '🔴' : this.pilot.obey ? t('atLimit') : `${Math.round(this.pilot.speed * KMH)} km/h`}` : '') : '', way = turn ? `${turn.uturn ? '↩' : Math.abs(turn.a) < 0.5 ? '↑' : turn.a > 0 ? '↱' : '↰'} ${esc(turn.r.name)} · ` : '';
    if (this.free && !this.found) this.discover({ id: '', name: '' , skip: true });
    let limit = 0; if (q && me && !fly && !this.trip.away && this.net.streets) { const a = q.i * 3, dir = Math.sin(me.yaw) * (q.road.p[a + 3] - q.road.p[a]) + Math.cos(me.yaw) * (q.road.p[a + 4] - q.road.p[a + 1]) >= 0 ? 1 : -1; limit = this.net.streets.limit(q.road, q.road.s[q.i], dir); }
    const me0 = this.mine ? this.myId : this.watchId ?? this.leaderId(); if (this.watching && !this.ferryNote) { const c = this.cars.get(me0); this.watchNote = c ? `👁 ${esc(c.name)} · ← →` : ''; } if (this.full && now - (this.fullAt || 0) > 500) { this.fullAt = now; this.hud.set('full', `<h3>${esc(this.course.def.name.tr)} <small>${t('lap')} ${Math.min(this.settings.laps, (me ? Math.max(0, me.lap) : 0) + 1)}/${this.settings.laps}</small></h3>${board(this.stats, me0)}${gapChart(this.stats, me0, { w: 760, h: 230 })}`); }
    this.hud.draw({ tower: this.stats ? tower(this.stats, me0, this.hud.mode) : '', mode: this.stats ? t(this.hud.mode === 'top' ? 'topSpeed' : this.hud.mode === 'last' ? 'lastLap' : this.hud.mode) : '', sec: this.stats && (me || this.cars.has(me0)) && this.stats.cars.has(me0) ? sectors(this.stats, me0) : '', pedals: me && !fly && !this.trip.away ? [this.ctl ? this.ctl.gas : 0, this.ctl ? this.ctl.brake : 0] : null, limit, sub, free: this.free, pos: this.free || !me ? 0 : my + 1, n: list.length, lap: me && !this.free ? me.lap : 0, laps: this.free ? 0 : this.settings.laps, time: this.finished || (this.t * 1000 - (this.free ? 0 : 0)), best: this.best, list: this.free ? [] : list.slice(0, 8).map((o) => ({ name: o.c.name, color: o.c.color, me: o.c.mine, gap: me && !o.c.done && !this.finished ? o.c.prog - myP : undefined })), speed: fly ? focus.speed : me && !this.trip.away ? me.speed : Math.hypot(focus.vx, focus.vz), turbo: me ? me.turbo : 0, boosting: me && me.boosting, road: q && !this.trip.deep ? esc(q.road.name) : '', near: fly ? `✈ ${Math.round(focus.y * 10)} m${near ? ` · ${esc(near)}` : ''}${this.fly.locked ? '' : ` · ${t('flyClick')}`}` : this.trip.note || this.ferryNote || (this.watching && this.watchNote) || way + esc(near), cars: list.filter((o) => fly || !o.c.mine).map((o) => ({ x: o.c.st.x, z: o.c.st.z, color: o.c.color })), me: focus, yaw: focus.yaw, wrong: this.wrongT > 0.7, zoom: 1.15 });
  }
}
