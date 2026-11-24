// The weather: what each kind is made of, and which it is at a moment – a pure
// function of the race's clock, so a room shares it without a word.
// grip: what the tyres hold; cloud, fog, rain, snowing: in the air; wet, snow: on
// the ground; wind: strength (units a second²); swell: how high the waves run.
export const KINDS = ['clear', 'rain', 'fog', 'snow', 'storm'];
export const CHOICES = [...KINDS, 'changing'];
export const WEATHER = {
  clear: { grip: 1, cloud: 0, fog: 0, rain: 0, snowing: 0, wet: 0, snow: 0, wind: 0, swell: 0.04, flash: 0 },
  rain: { grip: 0.84, cloud: 0.86, fog: 0.0024, rain: 0.6, snowing: 0, wet: 1, snow: 0, wind: 0.25, swell: 0.14, flash: 0 },
  fog: { grip: 0.95, cloud: 0.72, fog: 0.021, rain: 0, snowing: 0, wet: 0.3, snow: 0, wind: 0, swell: 0.02, flash: 0 },
  snow: { grip: 0.66, cloud: 0.8, fog: 0.0055, rain: 0, snowing: 1, wet: 0.15, snow: 1, wind: 0.2, swell: 0.08, flash: 0 },
  storm: { grip: 0.76, cloud: 1, fog: 0.0042, rain: 1, snowing: 0, wet: 1, snow: 0, wind: 1.5, swell: 1, flash: 1 },
};
const KEYS = Object.keys(WEATHER.clear);
export function mixWeather(a, b, k, out = {}) { for (const q of KEYS) out[q] = a[q] + (b[q] - a[q]) * k; return out; }
const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 2246822519); n = Math.imul(n ^ (n >>> 13), 3266489917); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const SPELL = 70, TURN = 14; // seconds a spell lasts, and takes to turn
// the spells of changing weather: never the same twice running
function spell(seed, n) { let k = Math.floor(hash(seed) * KINDS.length); for (let i = 1; i <= n; i++) k = (k + 1 + Math.floor(hash(seed + i * 101) * (KINDS.length - 1))) % KINDS.length; return KINDS[k]; }
// wx: { to, from, at } – what it is, what it was before the host changed it, and when (s)
export function weatherAt(wx, seed, t, out = {}) {
  const pure = (w) => { if (w !== 'changing') return WEATHER[w] || WEATHER.clear; const q = Math.max(0, t) / SPELL, n = Math.floor(q), a = WEATHER[spell(seed, n)]; return mixWeather(n ? WEATHER[spell(seed, n - 1)] : a, a, n ? ease(((q - n) * SPELL) / TURN) : 1); };
  if (!wx.from) return mixWeather(pure(wx.to), pure(wx.to), 1, out);
  return mixWeather(pure(wx.from), pure(wx.to), ease((t - wx.at) / 9), out);
}
// gusts: a push in the world, stronger and weaker, always from the south-west (the lodos)
export function gust(w, t, x, z) { const s = w.wind * (0.35 + 0.65 * Math.max(0, Math.sin(t * 0.9 + x * 0.02) * Math.sin(t * 0.37 + z * 0.03 + 1.3))); return [s * 0.78, -s * 0.62]; }
// the swell: sums of sines [direction x, z, length, height, speed]; the sea's shader has the same
export const WAVES = [[0.78, -0.62, 31, 0.30, 5.2], [0.95, -0.30, 19, 0.17, 4.1], [0.45, -0.89, 13, 0.10, 3.5], [0.2, 0.98, 8.5, 0.05, 2.6]];
export function swellAt(x, z, t, k) { let h = 0; for (const [dx, dz, L, a, v] of WAVES) { const p = ((dx * x + dz * z - v * t) * 6.28319) / L, s = 0.5 + 0.5 * Math.sin(p); h += a * (2 * s * s - 0.75); } return h * k; }
