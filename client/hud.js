import { t } from './i18n.js';
import { KMH } from '../shared/units.js';
export const fmt = (ms) => { if (!ms || ms < 0) return '–:––.–––'; const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60; return `${m}:${String(s).padStart(2, '0')}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export { esc };
export class Hud {
  constructor(el, A, net) {
    this.el = el; el.innerHTML = '<div class="pos"></div><div class="lap"></div><ol class="order"></ol><div class="tw"><div class="mode"></div><ol class="tower"></ol></div><div class="secs"><div class="sec0"></div></div><div class="ban"></div><div class="ped"><i></i><i></i><b></b></div><div class="full" hidden></div><div class="time"></div><div class="keys"></div><div class="big"></div><div class="warn" hidden></div><div class="road"></div><div class="limit"></div><div class="turbo"><i></i></div><div class="speed"></div><canvas width="380" height="380"></canvas>';
    for (const k of ['pos', 'lap', 'order', 'time', 'keys', 'big', 'warn', 'road', 'turbo', 'speed', 'limit', 'tower', 'mode', 'full', 'ped']) this[k] = el.querySelector(`.${k}`);
    this.sec = el.querySelector('.sec0'); this.ban = el.querySelector('.ban'); this.modeEl = this.mode; this.mode = 'interval'; this.tw = el.querySelector('.tw');
    this.cv = el.querySelector('canvas'); this.g = this.cv.getContext('2d'); this.cache = {};
    // the whole map, once
    const { w, h, step, x0, z0 } = A.map.grid, S = (this.S = 0.9), W = Math.ceil(w * step * S), H = Math.ceil(h * step * S), c = (this.map = document.createElement('canvas')); this.x0 = x0; this.z0 = z0; c.width = W; c.height = H; const g = c.getContext('2d'), im = g.createImageData(w, h);
    for (let k = 0; k < w * h; k++) { const land = A.shore[k] > 127, p = A.park[k] / 255; im.data.set(land ? [66 - p * 20, 62 + p * 14, 52 - p * 14, 255] : [24, 66, 88, 255], k * 4); }
    const q = document.createElement('canvas'); q.width = w; q.height = h; q.getContext('2d').putImageData(im, 0, 0); g.drawImage(q, 0, 0, W, H); g.lineJoin = g.lineCap = 'round';
    for (const r of [...net.spurs, ...net.main]) { if (r.spur) { g.setLineDash([]); g.beginPath(); for (let i = 0; i < r.n; i++) g.lineTo((r.p[i * 3] - x0) * S, (r.p[i * 3 + 1] - z0) * S); g.strokeStyle = 'rgba(214,206,190,.42)'; g.lineWidth = 1.3; g.stroke(); continue; } g.setLineDash(r.tunnel ? [5, 4] : []); g.beginPath(); for (let i = 0; i < r.n; i++) g.lineTo((r.p[i * 3] - x0) * S, (r.p[i * 3 + 1] - z0) * S); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = r.hw * 2 * S + 2.5; g.stroke(); g.strokeStyle = r.style === 'motorway' ? '#b08a4a' : '#a39c8e'; g.lineWidth = r.hw * 1.8 * S; g.stroke(); }
  }
  set(k, html) { if (this.cache[k] !== html) { this.cache[k] = html; this[k].innerHTML = html; } }
  banner(html, ms = 4200) { this.ban.innerHTML = html; this.ban.classList.remove('in'); void this.ban.offsetWidth; this.ban.classList.add('in'); clearTimeout(this.bt); this.bt = setTimeout(() => this.ban.classList.remove('in'), ms); }
  flash(html, ms = 900) { this.big.classList.remove('pop'); void this.big.offsetWidth; this.set('big', html); this.big.classList.add('pop'); clearTimeout(this.ft); if (ms) this.ft = setTimeout(() => this.set('big', ''), ms); }
  course(c) { this.path = null; if (!c) return; const p = new Path2D(); for (let i = 0; i <= c.n; i++) { const k = i % c.n; p.lineTo((c.x[k] - this.x0) * this.S, (c.z[k] - this.z0) * this.S); } this.path = p; this.start = c.place(0); }
  draw(d) { // { pos, n, lap, laps, time, best, list, speed, turbo, boosting, road, near, cars, me, wrong, yaw }
    this.set('pos', d.pos ? `${d.pos}<small>/${d.n}</small>` : ''); this.set('lap', d.laps ? `${t('lap')} ${Math.max(1, Math.min(d.laps, d.lap + 1))}/${d.laps}` : d.free ? `${t('cruise')}<br><small style="font-weight:600;opacity:.85">${d.sub || ''}</small>` : '');
    this.set('time', d.laps ? `${fmt(Math.max(0, d.time))}${d.best ? `<small>${t('best')} ${fmt(d.best)}</small>` : ''}` : '');
    this.set('tower', d.tower || ''); this.set('sec', d.sec || ''); if (this.cache.mode !== d.mode) { this.cache.mode = d.mode; this.modeEl.innerHTML = d.mode ? `${esc(d.mode)} <kbd>T</kbd>` : ''; } this.tw.style.display = d.tower ? '' : 'none';
    { const p = d.pedals, v = Math.abs(d.speed), gear = !p ? '' : d.speed < -0.2 ? 'R' : v < 0.4 ? 'N' : v < 4 ? 1 : v < 7 ? 2 : v < 10 ? 3 : v < 13 ? 4 : v < 16 ? 5 : 6; this.ped.style.display = p ? '' : 'none'; if (p) { const [a, b, c] = this.ped.children; a.style.setProperty('--k', p[0].toFixed(2)); b.style.setProperty('--k', p[1].toFixed(2)); if (c.textContent !== String(gear)) c.textContent = gear; } }
    this.set('order', d.tower ? '' : (d.list || []).map((o, i) => `<li class="${o.me ? 'me' : ''}"><i style="background:${o.color}"></i>${i + 1}. ${esc(o.name)}${o.gap !== undefined && !o.me ? `<em>${o.gap > 0 ? '+' : ''}${Math.round(o.gap * 10)} m</em>` : ''}</li>`).join(''));
    this.set('speed', `${Math.round(Math.abs(d.speed) * KMH)}<small>km/h</small>`); this.set('road', `${d.road || ''}<small>${d.near || ''}</small>`);
    this.set('limit', d.limit ? String(d.limit) : ''); this.limit.style.display = d.limit ? '' : 'none'; this.limit.classList.toggle('over', !!d.free && Math.abs(d.speed) * KMH > d.limit + 5);
    this.turbo.firstChild.style.transform = `scaleX(${d.turbo.toFixed(3)})`; this.turbo.classList.toggle('hot', !!d.boosting);
    if (this.warn.hidden === !!d.wrong) { this.warn.hidden = !d.wrong; this.warn.textContent = t('wrong'); }
    const g = this.g, N = 380, z = d.zoom || 1.15, S = this.S; g.save(); g.clearRect(0, 0, N, N); g.beginPath(); g.arc(N / 2, N / 2, N / 2, 0, 7); g.clip(); g.fillStyle = '#184258'; g.fillRect(0, 0, N, N);
    g.translate(N / 2, N / 2); g.rotate(d.yaw - Math.PI); g.scale(z, z); g.translate(-(d.me.x - this.x0) * S, -(d.me.z - this.z0) * S); g.drawImage(this.map, 0, 0);
    if (this.path) { g.lineJoin = g.lineCap = 'round'; g.strokeStyle = '#ffcf4a'; g.lineWidth = 3.4; g.stroke(this.path); g.fillStyle = '#fff'; g.beginPath(); g.arc((this.start.x - this.x0) * S, (this.start.z - this.z0) * S, 4, 0, 7); g.fill(); }
    for (const c of d.cars) { g.fillStyle = c.color; g.strokeStyle = '#000'; g.lineWidth = 1.2; g.beginPath(); g.arc((c.x - this.x0) * S, (c.z - this.z0) * S, 4.6, 0, 7); g.fill(); g.stroke(); }
    g.translate((d.me.x - this.x0) * S, (d.me.z - this.z0) * S); g.rotate(-d.yaw + Math.PI); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.beginPath(); g.moveTo(0, -8.5); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
}
