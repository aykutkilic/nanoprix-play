const FLYING = /^(Escape|Tab|Key[NVMT])$/; // what keys still do in airplane mode, besides flying
// Keyboard, gamepad, touch → { steer, gas, brake, drift, turbo, horn, back }
export class Input {
  constructor(el) {
    this.keys = new Set(); this.handlers = {}; this.touch = { steer: 0, gas: 0, brake: 0, drift: false, turbo: false }; this.out = { steer: 0, gas: 0, brake: 0, drift: false, turbo: false, horn: false, back: false };
    const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    addEventListener('keydown', (e) => { if (typing(e)) return; if (/^(Arrow|Space)/.test(e.code) && document.activeElement?.tagName !== 'BUTTON') e.preventDefault(); if (!e.repeat) { if (!e.metaKey) this.keys.add(e.code); const h = this.flying && !FLYING.test(e.code) ? null : this.handlers[e.code]; if (h) h(e); } });
    addEventListener('keyup', (e) => { if (/^Meta/.test(e.code)) this.keys.clear(); else this.keys.delete(e.code); }); /* (a Mac does not say what is let go of while ⌘ is down) */ addEventListener('blur', () => this.keys.clear());
    if (matchMedia('(pointer: coarse)').matches) this.buildTouch(el);
  }
  on(code, fn) { this.handlers[code] = fn; }
  // a pad to steer with at the left, the pedals at the right; what is seldom needed over the pad.
  // (Nothing is pressed for one: no finger on the gas, no gas. ⚡ is gas and turbo at once, and a thumb that
  // slides from the gas on to ⚡ or ↷ keeps the gas.)
  buildTouch(el) {
    const w = document.createElement('div'); w.className = 'touch'; w.hidden = true; w.innerHTML = '<div class="acts"><b data-k="KeyE">🚶</b><b data-k="KeyG">A</b><b data-k="KeyR">↺</b></div><div class="pad"><i></i></div><div class="peds"><b data-k="drift">↷</b><b data-k="turbo">⚡</b><b data-k="brake">▼</b><b data-k="gas">▲</b></div>'; el.appendChild(w); this.touchEl = w; w.addEventListener('contextmenu', (e) => e.preventDefault()); w.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false }); /* (a finger lifted once a menu has come is not a tap on the menu) */
    const q = this.touch, pad = w.querySelector('.pad'), knob = pad.firstChild; let id = null, x0 = 0;
    const steer = (v) => { q.steer = v; knob.style.transform = v ? `translateX(${v * 34}px)` : ''; };
    pad.addEventListener('pointerdown', (e) => { if (id !== null) return; id = e.pointerId; x0 = e.clientX; pad.setPointerCapture(id); e.preventDefault(); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) steer(Math.max(-1, Math.min(1, (e.clientX - x0) / 46))); });
    const off = (e) => { if (e.pointerId === id) { id = null; steer(0); } }; for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(n, off);
    for (const b of w.querySelectorAll('.acts b')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); const h = this.handlers[b.dataset.k]; if (h) h(e); });
    // the pedals: what each finger is on
    const peds = w.querySelector('.peds'), on = new Map(), btns = [...peds.children];
    const sum = () => { const k = new Set([...on.values()].flatMap((f) => [f.k, f.gas && f.k !== 'brake' ? 'gas' : ''])); q.brake = k.has('brake') ? 1 : 0; q.drift = k.has('drift'); q.turbo = k.has('turbo'); q.gas = k.has('gas') || q.turbo ? 1 : 0; for (const b of btns) b.classList.toggle('on', k.has(b.dataset.k)); };
    const over = (e) => { const b = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.peds b'); return b ? b.dataset.k : ''; };
    peds.addEventListener('pointerdown', (e) => { const b = e.target.closest('b'); if (!b) return; e.preventDefault(); peds.setPointerCapture(e.pointerId); on.set(e.pointerId, { k: b.dataset.k, gas: b.dataset.k === 'gas' }); sum(); });
    peds.addEventListener('pointermove', (e) => { const f = on.get(e.pointerId); if (!f) return; const k = over(e); if (!k || k === f.k) return; f.k = k; if (k === 'gas') f.gas = true; sum(); });
    const up = (e) => { if (on.delete(e.pointerId)) sum(); }; for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) peds.addEventListener(n, up);
    this.letGo = () => { id = null; steer(0); on.clear(); sum(); }; addEventListener('blur', this.letGo); document.addEventListener('visibilitychange', this.letGo);
  }
  showTouch(on) { if (this.touchEl && this.touchEl.hidden === on) { this.touchEl.hidden = !on; this.letGo(); } }
  // what one is doing: race | car (a cruise) | walk | ride
  context(mode, auto) { const w = this.touchEl; if (!w) return; if (w.dataset.mode !== mode) { w.dataset.mode = mode; w.querySelector('[data-k=KeyR]').textContent = mode === 'walk' ? '🚗' : '↺'; } if (this.autoOn !== !!auto) { this.autoOn = !!auto; w.querySelector('[data-k=KeyG]').classList.toggle('on', !!auto); } }
  read() {
    if (this.flying) return Object.assign(this.out, { steer: 0, gas: 0, brake: 0, drift: false, turbo: false, horn: false, back: false });
    const k = this.keys, o = this.out, has = (...c) => c.some((x) => k.has(x));
    let s = (has('ArrowRight', 'KeyD') ? 1 : 0) - (has('ArrowLeft', 'KeyA') ? 1 : 0), g = has('ArrowUp', 'KeyW') ? 1 : 0, b = has('ArrowDown', 'KeyS') ? 1 : 0, d = has('Space'), t = has('ShiftLeft', 'ShiftRight'), h = has('KeyH'), back = has('KeyB');
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    for (const p of pads) { const a = p.axes[0] || 0; if (Math.abs(a) > 0.12) s = Math.sign(a) * ((Math.abs(a) - 0.12) / 0.88) ** 1.4; const B = (i) => (p.buttons[i] ? p.buttons[i].value : 0); g = Math.max(g, B(7), B(0)); b = Math.max(b, B(6), B(1)); d = d || B(5) > 0.5 || B(2) > 0.5; t = t || B(4) > 0.5; h = h || B(3) > 0.5; if (B(10) > 0.5 && !this._fo && this.handlers.KeyE) this.handlers.KeyE(); this._fo = B(10) > 0.5; if (B(8) > 0.5 && !this._se && this.handlers.KeyG) this.handlers.KeyG(); this._se = B(8) > 0.5; if (B(9) > 0.5 && !this._st && this.handlers.Escape) this.handlers.Escape(); this._st = B(9) > 0.5; }
    if (this.touchEl) { const q = this.touch; if (Math.abs(q.steer) > 0.02) s = q.steer; g = Math.max(g, q.gas); b = Math.max(b, q.brake); d = d || q.drift; t = t || q.turbo; }
    o.steer = s; o.gas = g; o.brake = b; o.drift = d; o.turbo = t; o.horn = h; o.back = back; return o;
  }
}
