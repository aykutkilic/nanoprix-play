import { t, touch } from './i18n.js';
import { esc } from './format.js';
import { TRIAL_CAR, TIME_TRIAL, trialRecordKey } from '../shared/events.js';

export function readBest(store, settings = TIME_TRIAL) {
  const ms = Number(store(trialRecordKey(settings, TRIAL_CAR)));
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}
export function recordTrial(store, result, settings) {
  if (!result || result.car !== TRIAL_CAR || !Number.isFinite(result.time) || result.time <= 0) return null;
  const previous = readBest(store, settings);
  const best = previous ? Math.min(previous, result.time) : result.time;
  if (best !== previous) store(trialRecordKey(settings, result.car), String(best));
  return { previous, best, delta: result.time - previous };
}

export function journalHtml(game, store) {
  let found;
  try { found = new Set(JSON.parse(store('found') || '[]')); } catch { found = new Set(); }
  const sights = game.view.world.marks.filter((mark) => mark.hero);
  const names = sights.filter((mark) => found.has(mark.id)).map((mark) => mark.name).sort((a, b) => a.localeCompare(b, 'tr'));
  return `<div class="panel center"><h2>${t('journal')}</h2><h3>${t('outings')}</h3>
    <p>Sirkeci → Harem ${store('outing.sirkeci') ? '✓' : ''}</p><p class="desc">${t('outingDesc')}</p>
    <button data-do="outing" class="main">${t('startOuting')}</button>
    <h3>${t('found')} · ${names.length}/${sights.length}</h3>
    ${names.length ? `<ul>${names.map((name) => `<li>${esc(name)}</li>`).join('')}</ul>` : `<p class="desc">${t('journalEmpty')}</p>`}
    <button data-do="back">${t('back')}</button></div>`;
}

export class FerryOuting {
  constructor(game, store) {
    this.game = game;
    this.store = store;
    const fleet = game.view.world.fleet;
    this.ship = fleet.car.find((ship) => ship.line.id === 'w24235295');
    this.originEnd = fleet.ports[this.ship.a].name === 'Sirkeci' ? 0 : 1;
    this.origin = fleet.ports[this.originEnd ? this.ship.b : this.ship.a];
    this.destination = fleet.ports[this.originEnd ? this.ship.a : this.ship.b];
    game.nav.go(this.origin);
  }

  landed(ship, port) {
    if (ship !== this.ship || port !== this.destination) return;
    this.done = true;
    this.store('outing.sirkeci', '1');
    this.game.hud.way(null);
    this.game.hud.banner(t('outingDone'), 6500);
  }

  update() {
    const game = this.game;
    if (this.done) return '';
    const aboard = (game.aboard?.S === this.ship && game.aboard.to !== this.originEnd)
      || (game.trip.ride?.ship === this.ship && game.trip.ride.end === this.originEnd);
    if (aboard && !this.sailing) {
      game.nav.stop();
      const points = [];
      for (let i = 0; i < this.ship.p.length; i += 2) points.push([this.ship.p[i], this.ship.p[i + 1]]);
      game.hud.way(points, this.destination);
    }
    if (this.sailing && !aboard) game.hud.way(null);
    this.sailing = aboard;
    if (aboard) return t('crossing');
    const focus = game.trip.away ? game.trip.me : game.me;
    if (!game.nav.way && game.hud.goal !== this.origin) game.hud.way([[focus.x, focus.z], [this.origin.x, this.origin.z]], this.origin);
    if (Math.hypot(focus.x - this.origin.x, focus.z - this.origin.z) > 12) return t('drivePier');
    const fleet = game.view.world.fleet;
    const state = fleet.at(this.ship, game.t);
    const atPier = state.dock === this.originEnd;
    const seconds = atPier ? Math.ceil(state.leaves) : game.nextDock(fleet, this.ship, this.originEnd, game.t) + this.ship.dwell;
    return `${atPier ? t(game.trip.away ? 'boardFoot' : 'boardCar') : t('waitPier')} · ${t('sails')} ${seconds} ${t('secs')}`;
  }
}

export class FirstRaceHints {
  constructor(game) { this.game = game; this.step = 0; this.after = -10; }
  update() {
    const { me, t: time, course } = this.game;
    if (!me || this.step >= 3 || time < this.after) return;
    let hint;
    if (this.step === 0) hint = 'steerHint';
    if (this.step === 1 && me.speed > 4 && course.vmax[course.idx(me.s + 9)] < 17) hint = 'driftHint';
    if (this.step === 2 && me.turbo > 0.15 && me.speed > 3) hint = 'boostHint';
    if (!hint) return;
    this.step++;
    this.after = Math.max(0, time) + 5;
    this.game.hud.banner(t(hint + (touch ? 'Touch' : '')), 4500);
  }
}
