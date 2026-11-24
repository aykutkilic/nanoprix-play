// The soundtrack: the main theme first, then the rest, round and round. It starts with
// the first touch (browsers ask for one), stops while the page is away, and goes with
// the sound: no sound, no music.
const BASE = new URL('../assets/music/', import.meta.url), TRACKS = [['chiptune-remix.mp3', 'Chiptune (Remix)'], ['echoes-of-solitude.mp3', 'Echoes of Solitude']], VOL = 0.34;
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(`nanoprix.${k}`); localStorage.setItem(`nanoprix.${k}`, v); } catch { /* */ } return null; };
export class Music {
  constructor(audio) {
    this.audio = audio; this.on = store('music') !== '0'; this.i = 0; this.el = null; this.told = () => {};
    const go = () => this.play(); addEventListener('pointerdown', go); addEventListener('keydown', go); document.addEventListener('visibilitychange', () => { if (document.hidden) { if (this.el) this.el.pause(); } else this.play(); });
  }
  get name() { return TRACKS[this.i][1]; }
  get playing() { return !!this.el && !this.el.paused; }
  make() { // (nothing is fetched before it is wanted)
    const e = (this.el = document.createElement('audio')); e.preload = 'auto'; e.volume = VOL; e.addEventListener('ended', () => this.next(true)); e.addEventListener('error', () => { if (++this.bad < TRACKS.length) this.next(true); }); e.addEventListener('playing', () => { this.bad = 0; if (this.shown !== this.i) { this.shown = this.i; this.told(this.name); } }); this.bad = 0; this.load();
  }
  load() { this.el.src = new URL(TRACKS[this.i][0], BASE).href; }
  play() { if (!this.on || !this.audio.on || document.hidden) return; if (!this.el) this.make(); if (this.el.paused) this.el.play().catch(() => { /* not yet allowed: at the next touch */ }); }
  next() { this.i = (this.i + 1) % TRACKS.length; if (this.el) { this.load(); this.play(); } }
  toggle(on) { this.on = on; store('music', on ? '1' : '0'); this.sync(); }
  sync() { if (this.on && this.audio.on) this.play(); else if (this.el) this.el.pause(); }
}
