// The timing screens: the tower at the left, the full board, the charts and the
// tables after the race. Cars keep their own colours; as ten cars' colours cannot
// all be told apart, each line also has its own dash and its driver's code at its
// end, one's own is the bold one, everything is in the tables too, and pointing at
// a chart reads it out.
import { t } from './i18n.js';
import { KMH } from '../shared/units.js';
import { fmt, esc } from './hud.js';
const SEC = { purple: '#b95cff', green: '#2fd07a', yellow: '#f2c230' };
const INK = { '#26262a': '#8a919b', '#8e44ad': '#a967cc', '#1f6fd0': '#4a90e8', '#f2f2ee': '#e4e4de' }; // (lifted to be seen on the dark panel)
const DASH = ['14 0.1', '8 5', '1 5', '11 4 1 4', '4 4', '15 4', '11 4 1 4 1 4', '2 3 2 8'];
const dash = (st, id) => DASH[[...st.cars.keys()].indexOf(id) % DASH.length]; // (the car's own, whatever its place)
const colour = (c) => INK[c.color] || c.color;
export const code = (name) => name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toLocaleUpperCase('tr');
const s3 = (v) => (v ? (v >= 60 ? fmt(v * 1000) : v.toFixed(3)) : '–');
export const gapText = (g) => (g <= 0.0005 ? '' : `+${g >= 60 ? fmt(g * 1000) : g.toFixed(g < 10 ? 3 : 1)}`);
export const MODES = ['interval', 'leader', 'last', 'best', 'top'];
export function tower(st, me, mode) {
  const o = st.order(); return o.map((id, i) => { const c = st.cars.get(id); let v = ''; if (mode === 'interval') v = i ? gapText(st.gap(id, o[i - 1])) || '–' : t('interval'); else if (mode === 'leader') v = i ? gapText(st.gap(id, o[0])) || '–' : t('leader'); else if (mode === 'last') v = s3(st.last(id)); else if (mode === 'best') v = s3(c.best); else v = `${Math.round(c.top * KMH)}`; return `<li class="${id === me ? 'me' : ''}"><b>${i + 1}</b><i style="background:${c.color}"></i><span>${esc(code(c.name))}</span><em>${c.done ? '🏁 ' : ''}${v}</em>${st.fastest && st.fastest.id === id ? '<u></u>' : ''}</li>`; }).join('');
}
export function sectors(st, me) {
  const n = st.lapNow(me), now = [0, 1, 2].map((s) => [st.sector(me, n, s), st.colour(me, n, s)]), k = now.findIndex((x) => !x[0]); const d = st.delta(me);
  return `<div class="sec">${now.map(([v, c], s) => `<i class="${c || (s === k ? 'now' : '')}" style="${c ? `background:${SEC[c]}` : ''}">${v ? v.toFixed(3) : `S${s + 1}`}</i>`).join('')}</div>${d !== null ? `<div class="delta" style="color:${d < 0 ? SEC.green : SEC.yellow}">${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(3)}</div>` : ''}`;
}
// every car, every number
export function board(st, me) {
  const o = st.order(), bs = [0, 1, 2].map((s) => Math.min(...o.map((id) => st.bestSector(id, s) || Infinity))), top = Math.max(...o.map((id) => st.cars.get(id).top)), cell = (v, best) => `<td${v && v <= best + 1e-9 ? ' class="pur"' : ''}>${s3(v)}</td>`;
  return `<table class="board"><thead><tr><th></th><th></th><th>${t('driver')}</th><th>${t('lap')}</th><th>${t('interval')}</th><th>${t('leader')}</th><th>${t('lastLap')}</th><th>${t('best')}</th><th>S1</th><th>S2</th><th>S3</th><th>${t('topSpeed')}</th></tr></thead><tbody>${o.map((id, i) => { const c = st.cars.get(id); return `<tr class="${id === me ? 'me' : ''}"><td>${i + 1}</td><td><i style="background:${c.color}"></i></td><td>${esc(c.name)} <small>${esc(code(c.name))}</small></td><td>${c.done ? '🏁' : st.lapNow(id) + 1}</td><td>${i ? gapText(st.gap(id, o[i - 1])) : '–'}</td><td>${i ? gapText(st.gap(id, o[0])) : '–'}</td><td>${s3(st.last(id))}</td>${cell(c.best, st.fastest ? st.fastest.time : 0)}${[0, 1, 2].map((s) => cell(st.bestSector(id, s), bs[s])).join('')}<td${c.top >= top - 1e-9 ? ' class="pur"' : ''}>${Math.round(c.top * KMH)}</td></tr>`; }).join('')}</tbody></table>`;
}
export function lapTable(st, me) { const o = st.order(); return `<table class="board"><thead><tr><th>${t('lap')}</th>${o.map((id) => `<th class="${id === me ? 'me' : ''}"><i style="background:${st.cars.get(id).color}"></i> ${esc(code(st.cars.get(id).name))}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: st.laps }, (_, n) => { const best = Math.min(...o.map((id) => st.lap(id, n) || Infinity)); return `<tr><td>${n + 1}</td>${o.map((id) => { const v = st.lap(id, n); return `<td class="${v && st.fastest && v <= st.fastest.time + 1e-9 ? 'pur' : v && v <= best + 1e-9 ? 'grn' : ''}">${s3(v)}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table>`; }
// ---------------------------------------------------------------- charts
const models = new Map(); let nth = 0;
export function clearCharts() { models.clear(); }
function chart(st, me, rows, { title, flip, yMax, yMin = 0, ticks, fmtY, w = 560, h = 250 }) {
  const id = `ch${nth++ % 12}`, L = 38, R = 58, T = 30, B = 26, X = (lap) => L + (lap / st.laps) * (w - L - R), Y = (v) => (flip ? T + ((v - yMin) / (yMax - yMin)) * (h - T - B) : h - B - ((v - yMin) / (yMax - yMin)) * (h - T - B)), o = st.order();
  models.set(id, { st, rows, X, Y, w, h, T, B, fmtY, o });
  // the codes at the lines' ends, moved apart so that none covers another
  const ends = o.map((c) => { for (let k = rows.length - 1; k >= 0; k--) if (rows[k][c] !== undefined) return { c, x: X(rows[k].lap), y: Y(Math.min(yMax, rows[k][c])) }; return null; }).filter(Boolean).sort((a, b) => a.y - b.y); let last = -99; for (const e of ends) { e.ly = Math.max(e.y, last + 12); last = e.ly; } const over = last - (h - B + 4); if (over > 0) for (const e of ends) e.ly -= over;
  const path = (c) => { let d = '', pen = false; for (const r of rows) { const v = r[c]; if (v === undefined) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${X(r.lap).toFixed(1)} ${Y(Math.min(yMax, v)).toFixed(1)}`; pen = true; } return d; };
  const lines = [...o].sort((a, b) => (a === me) - (b === me)).map((c) => { const q = st.cars.get(c); return `<path d="${path(c)}" fill="none" stroke="${colour(q)}" stroke-width="${c === me ? 3.4 : 2}" stroke-opacity="${c === me ? 1 : 0.82}" stroke-dasharray="${c === me ? '' : dash(st, c)}" stroke-linejoin="round" stroke-linecap="round"/>`; }).join('');
  return `<figure><svg class="chart" data-chart="${id}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><text x="${L - 30}" y="16" class="ct">${esc(title)}</text>${ticks.map((v) => `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="gr"/><text x="${L - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${fmtY(v)}</text>`).join('')}${Array.from({ length: st.laps + 1 }, (_, n) => `<line x1="${X(n)}" x2="${X(n)}" y1="${T}" y2="${h - B}" class="gr v"/>${n < st.laps ? `<text x="${(X(n) + X(n + 1)) / 2}" y="${h - 8}" class="ax" text-anchor="middle">${t('lap')} ${n + 1}</text>` : ''}`).join('')}${lines}${ends.map((e) => `<circle cx="${e.x}" cy="${e.y}" r="4" fill="${colour(st.cars.get(e.c))}" stroke="#17140f" stroke-width="2"/><text x="${e.x + 9}" y="${e.ly + 4}" class="lb${e.c === me ? ' me' : ''}">${esc(code(st.cars.get(e.c).name))}</text>`).join('')}<g class="hv" style="display:none"><line y1="${T}" y2="${h - B}" class="cr"/></g></svg><figcaption>${o.map((c) => `<span><svg width="22" height="8"><line x1="1" x2="21" y1="4" y2="4" stroke="${colour(st.cars.get(c))}" stroke-width="${c === me ? 4 : 2.4}" stroke-dasharray="${c === me ? '' : dash(st, c)}"/></svg>${esc(st.cars.get(c).name)}</span>`).join('')}</figcaption><div class="tip" hidden></div></figure>`;
}
export function gapChart(st, me, size = {}) { const rows = st.gaps().filter((r) => r.k > 0); if (!rows.length) return ''; const o = st.order(); let max = 1; for (const r of rows) for (const c of o) if (r[c] !== undefined) max = Math.max(max, r[c]); max = Math.min(max, 60); const step = [0.5, 1, 2, 5, 10, 20].find((s) => max / s <= 5) || 20, top = Math.ceil(max / step) * step, ticks = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v); return chart(st, me, rows, { title: t('gapChart'), flip: true, yMax: top, ticks, fmtY: (v) => (v ? `+${+v.toFixed(1)}` : '0'), ...size }); }
export function placeChart(st, me, size = {}) { const rows = st.places(); if (!rows.length) return ''; const n = st.cars.size; return chart(st, me, rows, { title: t('placeChart'), flip: true, yMin: 0.6, yMax: n + 0.4, ticks: Array.from({ length: n }, (_, i) => i + 1), fmtY: (v) => `${v}.`, ...size }); }
// pointing at a chart: a hair-line, and what everyone was there
export function hover(e) {
  const svg = e.target.closest && e.target.closest('svg.chart'); for (const f of document.querySelectorAll('figure .tip')) if (!svg || !f.parentElement.contains(svg)) { f.hidden = true; const g = f.parentElement.querySelector('.hv'); if (g) g.style.display = 'none'; }
  if (!svg) return; const m = models.get(svg.dataset.chart); if (!m) return; const b = svg.getBoundingClientRect(), x = ((e.clientX - b.left) / b.width) * m.w; let best = null; for (const r of m.rows) { const d = Math.abs(m.X(r.lap) - x); if (!best || d < best.d) best = { d, r }; }
  const tip = svg.parentElement.querySelector('.tip'), g = svg.querySelector('.hv'), ln = g.querySelector('line'), X = m.X(best.r.lap); g.style.display = ''; ln.setAttribute('x1', X); ln.setAttribute('x2', X);
  tip.innerHTML = `<b>${t('lap')} ${(Math.floor(best.r.lap - 1e-6) + 1) || 1} · ${Math.round(((best.r.lap - 1e-6) % 1) * 100)}%</b>${m.o.filter((c) => best.r[c] !== undefined).sort((a, c) => best.r[a] - best.r[c]).map((c) => `<div><i style="background:${m.st.cars.get(c).color}"></i>${esc(m.st.cars.get(c).name)}<em>${Number.isInteger(best.r[c]) && m.fmtY(1) === '1.' ? `${best.r[c]}.` : best.r[c] ? `+${best.r[c].toFixed(3)}` : '–'}</em></div>`).join('')}`; tip.hidden = false; tip.style.left = `${Math.min(b.width - 170, Math.max(0, (X / m.w) * b.width + 12))}px`; tip.style.top = '34px';
}
