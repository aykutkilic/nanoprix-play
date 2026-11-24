// Keyboard, gamepad, touch → { steer, gas, brake, drift, turbo, horn, back }
export class Input {
  constructor(el) {
    this.keys = new Set(); this.handlers = {}; this.touch = { steer: 0, gas: 0, brake: 0, drift: false, turbo: false }; this.out = { steer: 0, gas: 0, brake: 0, drift: false, turbo: false, horn: false, back: false };
    const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    addEventListener('keydown', (e) => { if (typing(e)) return; if (/^(Arrow|Space)/.test(e.code) && document.activeElement?.tagName !== 'BUTTON') e.preventDefault(); if (!e.repeat) { this.keys.add(e.code); const h = this.handlers[e.code]; if (h) h(e); } });
    addEventListener('keyup', (e) => this.keys.delete(e.code)); addEventListener('blur', () => this.keys.clear());
    if (matchMedia('(pointer: coarse)').matches) this.buildTouch(el);
  }
  on(code, fn) { this.handlers[code] = fn; }
  buildTouch(el) {
    const w = document.createElement('div'); w.className = 'touch'; w.innerHTML = '<div class="pad" data-k="steer"><i></i></div><div class="btns"><b data-k="auto">A</b><b data-k="turbo">⚡</b><b data-k="drift">↷</b><b data-k="brake">▼</b></div>'; el.appendChild(w); this.touchEl = w;
    const pad = w.querySelector('.pad'), knob = pad.firstChild; let id = null, x0 = 0;
    pad.addEventListener('pointerdown', (e) => { id = e.pointerId; x0 = e.clientX; pad.setPointerCapture(id); this.touch.gas = 1; e.preventDefault(); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; const s = Math.max(-1, Math.min(1, (e.clientX - x0) / 55)); this.touch.steer = s; knob.style.transform = `translateX(${s * 42}px)`; });
    const up = (e) => { if (e.pointerId !== id) return; id = null; this.touch.steer = 0; knob.style.transform = ''; }; pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    for (const b of w.querySelectorAll('b')) { const k = b.dataset.k, set = (v) => { if (k === 'auto') { if (v && this.handlers.KeyG) this.handlers.KeyG(); return; } this.touch[k] = k === 'brake' ? (v ? 1 : 0) : v; }; b.addEventListener('pointerdown', (e) => { set(true); e.preventDefault(); }); for (const n of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(n, () => set(false)); }
  }
  // (touch: the gas is on by itself while racing)
  read() {
    const k = this.keys, o = this.out, has = (...c) => c.some((x) => k.has(x));
    let s = (has('ArrowRight', 'KeyD') ? 1 : 0) - (has('ArrowLeft', 'KeyA') ? 1 : 0), g = has('ArrowUp', 'KeyW') ? 1 : 0, b = has('ArrowDown', 'KeyS') ? 1 : 0, d = has('Space'), t = has('ShiftLeft', 'ShiftRight'), h = has('KeyH'), back = has('KeyB');
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    for (const p of pads) { const a = p.axes[0] || 0; if (Math.abs(a) > 0.12) s = Math.sign(a) * ((Math.abs(a) - 0.12) / 0.88) ** 1.4; const B = (i) => (p.buttons[i] ? p.buttons[i].value : 0); g = Math.max(g, B(7), B(0)); b = Math.max(b, B(6), B(1)); d = d || B(5) > 0.5 || B(2) > 0.5; t = t || B(4) > 0.5; h = h || B(3) > 0.5; if (B(8) > 0.5 && !this._se && this.handlers.KeyG) this.handlers.KeyG(); this._se = B(8) > 0.5; if (B(9) > 0.5 && !this._st && this.handlers.Escape) this.handlers.Escape(); this._st = B(9) > 0.5; }
    if (this.touchEl) { const q = this.touch; if (Math.abs(q.steer) > 0.02) s = q.steer; g = Math.max(g, this.racing ? 1 - q.brake : 0); b = Math.max(b, q.brake); d = d || q.drift; t = t || q.turbo; }
    o.steer = s; o.gas = g; o.brake = b; o.drift = d; o.turbo = t; o.horn = h; o.back = back; return o;
  }
}
