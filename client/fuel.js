// In a cruise the car runs on fuel and a wallet pays for it (and for fines): the tank empties as one drives, an empty one leaves
// only a crawl to the nearest station; stopped under its canopy the car is filled, litre by litre, at the price on the pole; and a car
// left where it may not be (not in a car park, at a station, by a car park's door) is fined, once each time it is left.
import { t, lang } from './i18n.js';
import { esc } from './hud.js';
import { carOf } from '../shared/car.js';

const TANK = { motor: 14, scooter: 0, bisiklet: 0, kaykay: 0, otobus: 250, kamyon: 160, dolmus: 70, suv: 65, limo: 80, spor: 60, simit: 0 }, EMPTY_ON = 0.0055; // (litres a unit of road at full throttle: a tank lasts some eight minutes of driving)
// what the market sells, at its till (client/rooms.js makeMarket): [name, price TL]
export const SHOP = [['Su 0,5 L', 'Water 0.5 L', 10], ['Simit', 'Simit', 20], ['Ayran', 'Ayran', 25], ['Çay', 'Tea', 15], ['Çikolata', 'Chocolate', 40], ['Cips', 'Crisps', 45], ['Tost', 'Toastie', 90], ['Cam suyu', 'Screen wash', 120], ['Motor yağı 1 L', 'Engine oil 1 L', 650]];
const PICK = [null, 1000, 500, 200]; // (at the pump: a full tank, or so many lira's worth)
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
      // at a pump, stopped: what one asks for (1 a full tank, 2–4 so many lira's worth: key()), filled by the pompacı a litre at a time, paid as it goes
      const s = W.atPump && Math.abs(me.speed) < 0.4 ? W.atPump(me.x, me.z) : null; this.offer = s && this.l < this.cap - 0.05 ? s : null; const F = this.filling;
      if (F && s === F.s) { if (now - F.at > 1200) { const want = F.want === null ? this.cap - this.l : Math.max(0, (F.want - F.tl) / this.price), dl = Math.min(this.cap - this.l, dt * 6, this.wallet / this.price, want); this.l += dl; F.l += dl; F.tl += dl * this.price; this.wallet -= dl * this.price; if (dl < 1e-4 || this.l >= this.cap - 0.05 || (F.want !== null && F.tl >= F.want - 0.01) || this.wallet <= 0.01) this.done(); } }
      else if (F) this.done(); }
    // left where it may not be: a fine, once, a while after
    if (away && G.me && this.left === null) this.left = { at: now, x: G.me.x, z: G.me.z, ok: W.parkedOk ? W.parkedOk(G.me.x, G.me.z) : true, fined: false };
    if (!away) this.left = null; else if (this.left && !this.left.ok && !this.left.fined && now - this.left.at > 45000) { this.left.fined = true; const F = W.A.parking.fine; this.wallet -= F; this.fines += F; G.hud.flash(`🅿️ ${t('parkFine')}<small>−${tl(F)}</small>`, 4200); G.audio.tone && G.audio.tone(180, 300); }
    this.show(now);
  }
  show(now = 0) {
    if (!this.on) return; if (!this.el) { const e = (this.el = document.createElement('div')); e.className = 'fuel'; e.style.cssText = 'position:absolute;right:14px;bottom:122px;font:600 13px/1.35 system-ui,sans-serif;color:#fff;background:rgba(14,12,10,.62);border-radius:10px;padding:6px 10px;text-align:right;pointer-events:none;min-width:170px'; this.game.hud.el.appendChild(e); }
    this.el.hidden = false; if (now && now - (this.drawn || 0) < 200) return; this.drawn = now; const k = this.cap ? this.l / this.cap : 1, bar = this.cap ? `<span style="display:inline-block;width:70px;height:7px;border-radius:4px;background:rgba(255,255,255,.2);vertical-align:middle;margin:0 6px"><i style="display:block;height:100%;width:${(k * 100).toFixed(0)}%;border-radius:4px;background:${k < 0.15 ? '#e0313a' : k < 0.3 ? '#f0a020' : '#2fd07a'}"></i></span>${this.l.toFixed(1).replace('.', ',')} L` : null; // (what needs none shows only the wallet)
    const near = this.cap && k < 0.25 ? this.nearest() : '', T = this.game.trip, M = T && T.mall, kb = (n) => `<b style="display:inline-block;min-width:15px;padding:0 3px;border-radius:4px;background:#fff;color:#111;text-align:center">${n}</b>`, row = (a, b) => `<div style="display:flex;justify-content:space-between;gap:12px">${a}<span>${b}</span></div>`;
    let more = this.filling ? `<br><small>${t('filling')} ${this.filling.l.toFixed(1).replace('.', ',')} L · ${tl(this.filling.tl)}</small>` : near;
    if (!this.filling && this.offer && T && T.mode === 'car') { const kind = this.diesel ? 'Motorin' : 'Benzin', full = (this.cap - this.l) * this.price; more = `<div style="margin-top:6px;text-align:left;font-weight:500">${row(`⛽ ${this.offer.brand} · ${kind}`, `${this.price.toFixed(2).replace('.', ',')} TL/L`)}${row(`${kb(1)} ${t('fillFull')}`, `≈ ${tl(Math.min(full, this.wallet))}`)}${PICK.slice(1).map((v, i) => row(`${kb(i + 2)} ${tl(v).replace(',00', '')}`, `${(v / this.price).toFixed(1).replace('.', ',')} L`)).join('')}</div>`; }
    if (M && M.shop && T.me) more = M.atCounter(T.me.x, T.me.z) ? `<div style="margin-top:6px;text-align:left;font-weight:500">${row(`🛒 ${esc(M.name)}`, '')}${SHOP.map((it, i) => row(`${kb(i + 1)} ${esc(lang() === 'tr' ? it[0] : it[1])}`, tl(it[2]))).join('')}${this.bag && this.bag.size ? `<small>🛍 ${[...this.bag].map(([n, c]) => `${esc(n)}${c > 1 ? ` ×${c}` : ''}`).join(', ')}</small>` : ''}</div>` : `<br><small>${t('goTill')}</small>`;
    this.el.innerHTML = `${bar === null ? '' : `⛽${bar}<br>`}💳 ${tl(this.wallet)}${this.fines ? `<br><small style="color:#ffb0a0">🅿️ ${t('fines')} ${tl(this.fines)}</small>` : ''}${more}`;
  }
  // the receipt
  done() { const F = this.filling; this.filling = null; if (F && F.l > 0.05) this.game.hud.flash(`⛽ ${F.s.brand}<small>${F.l.toFixed(1).replace('.', ',')} L · ${tl(F.tl)}</small>`, 2800); }
  // a number key: at a pump what to fill; at the market's till what to buy
  key(n) { if (!this.on) return; const G = this.game, T = G.trip;
    if (T.mode === 'car' && this.offer && !this.filling && n >= 1 && n <= PICK.length) { this.filling = { s: this.offer, at: performance.now(), want: PICK[n - 1], l: 0, tl: 0 }; G.audio.beep && G.audio.beep(true); return; }
    const M = T.mall; if (M && M.shop && T.me && M.atCounter(T.me.x, T.me.z)) { const it = SHOP[n - 1]; if (!it) return; if (this.wallet < it[2]) { G.hud.flash(`💳<small>${t('noMoney')}</small>`, 1600); return; } this.wallet -= it[2]; this.bag = this.bag || new Map(); this.bag.set(it[0], (this.bag.get(it[0]) || 0) + 1); G.hud.flash(`🛍 ${esc(lang() === 'tr' ? it[0] : it[1])}<small>−${tl(it[2])}</small>`, 1500); this.drawn = 0; } }
  // the nearest station, when it is time to think of one
  nearest() { const G = this.game, me = G.me, S = G.view.world.stations; if (!me || !S) return ''; let b = null, d = 1e9; for (const s of S) { const e = Math.hypot(s.x - me.x, s.z - me.z); if (e < d) { d = e; b = s; } } if (!b) return ''; const a = Math.atan2(b.x - me.x, b.z - me.z) - me.yaw, arrow = '↑↗→↘↓↙←↖'[(Math.round((-a / (Math.PI * 2)) * 8) % 8 + 8) % 8]; return `<br><small>${arrow} ${b.brand} · ${(d * 10 / 1000).toFixed(1).replace('.', ',')} km</small>`; }
}
