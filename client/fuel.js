// In a cruise the car runs on fuel and a wallet pays for it (and for fines): the tank empties as one drives, an empty one leaves
// only a crawl to the nearest station; stopped under its canopy the car is filled, litre by litre, at the price on the pole; and a car
// left where it may not be (not in a car park, at a station, by a car park's door) is fined, once each time it is left.
import { t } from './i18n.js';
import { carOf } from '../shared/car.js';

const TANK = { motor: 14, scooter: 0, bisiklet: 0, kaykay: 0, otobus: 250, kamyon: 160, dolmus: 70, suv: 65, limo: 80, spor: 60, simit: 0 }, EMPTY_ON = 0.0055; // (litres a unit of road at full throttle: a tank lasts some eight minutes of driving)
const tl = (v) => `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
export class Fuel {
  constructor(game) { this.game = game; this.el = null; this.on = false; }
  // a cruise begins: a full tank, 5000 TL
  start() { const G = this.game; this.on = !!G.free; const type = (G.me && G.me.type) || (G.mine && G.mine.car); this.type = type; this.cap = TANK[type] ?? 50; this.l = this.cap; this.wallet = 5000; this.fines = 0; this.left = null; this.filling = null; this.diesel = /otobus|kamyon|dolmus|suv/.test(type || ''); this.show(); }
  stop() { this.on = false; this.begun = false; if (this.el) this.el.hidden = true; }
  get price() { const P = this.game.view.world.A.parking.prices; return this.diesel ? P.motorin : P.benzin; }
  // the controls, before the car is stepped: an empty tank lets it only crawl
  limit(me, ctl) { if (!this.begun) { this.begun = true; this.start(); } if (me.type !== this.type) { const k = this.cap ? this.l / this.cap : 1; this.type = me.type; this.cap = TANK[me.type] ?? 50; this.l = this.cap * k; this.diesel = /otobus|kamyon|dolmus|suv/.test(me.type || ''); } if (!this.on || !this.cap) return; if (this.l <= 0) { const v = Math.abs(me.speed); ctl.gas = v < 2.6 ? Math.min(ctl.gas, 0.35) : 0; ctl.turbo = false; } }
  frame(dt, now, me, ctl, away) {
    if (!this.on) return; const G = this.game, W = G.view.world;
    if (!away && this.cap) { const v = Math.abs(me.speed); this.l = Math.max(0, this.l - (v * (0.25 + 0.75 * (ctl.gas || 0)) * EMPTY_ON + 0.0004) * dt * (carOf(me.type).mass || 1)); if (this.l <= 0 && !this.warned) { this.warned = true; G.hud.flash(`⛽<small>${t('fuelOut')}</small>`, 3500); } if (this.l > 0) this.warned = false;
      // at the pumps, stopped: filled, a litre at a time, while one stays
      const s = W.atPump && Math.abs(me.speed) < 0.4 ? W.atPump(me.x, me.z) : null; if (s && this.l < this.cap - 0.05 && this.wallet > 0) { if (!this.filling || this.filling.s !== s) this.filling = { s, at: now, l: 0, tl: 0 }; if (now - this.filling.at > 900) { const dl = Math.min(this.cap - this.l, dt * 6, this.wallet / this.price); this.l += dl; this.filling.l += dl; this.filling.tl += dl * this.price; this.wallet -= dl * this.price; } } else if (this.filling && (!s || this.l >= this.cap - 0.05)) { if (this.filling.l > 0.5) G.hud.flash(`⛽ ${this.filling.s.brand}<small>${this.filling.l.toFixed(1).replace('.', ',')} L · ${tl(this.filling.tl)}</small>`, 2600); this.filling = null; } }
    // left where it may not be: a fine, once, a while after
    if (away && G.me && this.left === null) this.left = { at: now, x: G.me.x, z: G.me.z, ok: W.parkedOk ? W.parkedOk(G.me.x, G.me.z) : true, fined: false };
    if (!away) this.left = null; else if (this.left && !this.left.ok && !this.left.fined && now - this.left.at > 45000) { this.left.fined = true; const F = W.A.parking.fine; this.wallet -= F; this.fines += F; G.hud.flash(`🅿️ ${t('parkFine')}<small>−${tl(F)}</small>`, 4200); G.audio.tone && G.audio.tone(180, 300); }
    this.show(now);
  }
  show(now = 0) {
    if (!this.on) return; if (!this.el) { const e = (this.el = document.createElement('div')); e.className = 'fuel'; e.style.cssText = 'position:absolute;right:14px;bottom:122px;font:600 13px/1.25 system-ui,sans-serif;color:#fff;background:rgba(14,12,10,.55);border-radius:10px;padding:6px 10px;text-align:right;pointer-events:none;min-width:150px'; this.game.hud.el.appendChild(e); }
    this.el.hidden = false; if (now - (this.drawn || 0) < 200) return; this.drawn = now; const k = this.cap ? this.l / this.cap : 1, bar = this.cap ? `<span style="display:inline-block;width:70px;height:7px;border-radius:4px;background:rgba(255,255,255,.2);vertical-align:middle;margin:0 6px"><i style="display:block;height:100%;width:${(k * 100).toFixed(0)}%;border-radius:4px;background:${k < 0.15 ? '#e0313a' : k < 0.3 ? '#f0a020' : '#2fd07a'}"></i></span>${this.l.toFixed(1).replace('.', ',')} L` : t('noFuel');
    const near = this.cap && k < 0.25 ? this.nearest() : ''; this.el.innerHTML = `⛽${bar}<br>💳 ${tl(this.wallet)}${this.fines ? `<br><small style="color:#ffb0a0">🅿️ ${t('fines')} ${tl(this.fines)}</small>` : ''}${this.filling && this.filling.l > 0 ? `<br><small>${t('filling')} ${this.filling.l.toFixed(1).replace('.', ',')} L · ${tl(this.filling.tl)}</small>` : near}`;
  }
  // the nearest station, when it is time to think of one
  nearest() { const G = this.game, me = G.me, S = G.view.world.stations; if (!me || !S) return ''; let b = null, d = 1e9; for (const s of S) { const e = Math.hypot(s.x - me.x, s.z - me.z); if (e < d) { d = e; b = s; } } if (!b) return ''; const a = Math.atan2(b.x - me.x, b.z - me.z) - me.yaw, arrow = '↑↗→↘↓↙←↖'[(Math.round((-a / (Math.PI * 2)) * 8) % 8 + 8) % 8]; return `<br><small>${arrow} ${b.brand} · ${(d * 10 / 1000).toFixed(1).replace('.', ',')} km</small>`; }
}
