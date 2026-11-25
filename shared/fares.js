// What a ride costs, and the İstanbulkart it is paid with. The tariff is the one in force from 20 July 2026 (decision
// 813 of the İBB council, 17 July 2026: tuhim.ibb.gov.tr, “Ücret Tarifeleri – İstanbulkart”), full fare, a card in its
// holder's name (only those get transfers and refunds). In kuruş; the time is the city's (shared/clock.js), in seconds.
export const START = 100000; // what is on the card: 1000 TL
export const tl = (k) => { const a = Math.abs(Math.round(k)); return `${k < 0 ? '−' : ''}₺${Math.floor(a / 100)},${String(a % 100).padStart(2, '0')}`; };
export const WINDOW = 120 * 60, SAME = 30 * 60; // a transfer's time is 120 minutes; at one and the same place none, for 30
const LAND = [4620, 3440, 2642, 1718, 1718, 1718], SEA = [0, 4143, 3428, 2992, 2992, 2992], T6 = [3740, 2658, 2017, 1275, 1275, 1275];
// by how many stations one goes: the longest is taken as one gets in, and what was not ridden given back as one gets off
const MBUS = [[1, 3308], [2, 3957], [3, 4620], [9, 5281], [15, 5800], [21, 6069], [27, 6267], [33, 6403], [99, 6859]];
const MARMARAY = [[7, 3740], [14, 4774], [21, 5511], [28, 6356], [35, 7424], [99, 8217]];
const M11 = [[3, 3740], [6, 4234], [8, 4789], [10, 5374], [12, 5990], [14, 6639], [99, 7319]];
export const BANDS = { mbus: MBUS, marmaray: MARMARAY, m11: M11 };
export const band = (id, n) => BANDS[id].find(([m]) => n <= m)[1], most = (id) => BANDS[id][BANDS[id].length - 1][1];
const BACK = { mbus: 120 * 60, marmaray: 240 * 60, m11: 240 * 60 }; // how long after it is given back (M11: as Marmaray, the same operator; not stated)
// a station of the line that is not the game's: [between, and, how many more]
const GAPS = { mbus: [['15 Temmuz Şehitler Köprüsü', 'Altunizade', 1]] }; // (Burhaniye)
// buses outside the usual tariff (its part 13): the fare, does it take a transfer, and the stop from which it is an ordinary fare, by where it goes
const BUSES = {
  '16D': { fare: 4620, takes: false }, '25G': { fare: 9240, takes: false }, 40: { fare: 9240, takes: false },
  '121A': { fare: 9240, takes: false, then: { takes: true, from: { Mecidiyeköy: 'Fabrikalar', Beykoz: '*' } } }, // (its stops in the game on the way to Beykoz are all after the Kavacık bridge)
  '129T': { fare: 9240, takes: false, then: { takes: true, from: { Üstbostancı: '15 Temmuz Şehitler Köprüsü' } } },
  251: { fare: 9240, takes: false, then: { takes: false, from: { Mecidiyeköy: 'Köprülü Kavşak', Pendik: '15 Temmuz Şehitler Köprüsü' } } },
};
const FREE = [['16D', '4']]; // free from the one to the other (rule 14)
const fold = (s) => String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/[^a-zçğıöşüâîû0-9]/g, '');
// ---------------------------------------------------------------- the ferries: named in the tariff; else by the mile, along the line through those that are
const FERRY = [['Üsküdar', 'Eminönü', 5852], ['Ortaköy', 'Üsküdar', 5181], ['Ortaköy', 'Kadıköy', 7107], ['Üsküdar', 'Kadıköy', 6270], ['Kadıköy', 'Eminönü', 6521], ['Kadıköy', 'Karaköy', 6521], ['Beşiktaş', 'Üsküdar', 5015], ['Kabataş', 'Üsküdar', 5181], ['Kadıköy', 'Beşiktaş', 6521], ['Kadıköy', 'Kabataş', 6270], ['Beykoz', 'Yeniköy', 5097], ['Anadolu Hisarı', 'Küçüksu', 5015], ['Anadolu Hisarı', 'Aşiyan', 5015], ['Küçüksu', 'Aşiyan', 5015], ['Aşiyan', 'Üsküdar', 6853], ['Beykoz', 'Sarıyer', 6104], ['Çengelköy', 'Kabataş', 6185], ['İstinye', 'Çubuklu', 5015], ['Sirkeci', 'Harem', 5433]].map(([a, b, f]) => [fold(a), fold(b), f]);
const SEABUS = 17470; // Avcılar – Bakırköy – Yenikapı – Kadıköy
const LEAST = 5015, MILE = 640, FROM = 0.9; // the least there is, what a mile more than that adds (fitted to the named lines)
export function ferryFare(a, b, miles, kind) {
  if (kind === 'seabus') return { fare: SEABUS, est: false };
  const x = fold(a), y = fold(b), hit = (p, q) => p.startsWith(q), f = FERRY.find(([p, q]) => (hit(x, p) && hit(y, q)) || (hit(x, q) && hit(y, p)));
  return f ? { fare: f[2], est: false } : { fare: Math.round(LEAST + Math.max(0, miles - FROM) * MILE), est: true };
}
// the car ferries: a car with whoever drives it. Sirkeci – Harem by the tariff; İstinye – Çubuklu by the council's of September 2026
const CARS = { harem: { car: 26000, jeep: 29000, minibus: 35000, moto: 11000 }, istinye: { car: 22000, jeep: 25000, minibus: 32000, moto: 10000 } };
export const carFare = (line, kind) => CARS[/harem|sirkeci/i.test(line) ? 'harem' : 'istinye'][{ dolmus: 'minibus', minibus: 'minibus', suv: 'jeep', simit: 'moto' }[kind] || 'car'];
export const night = (c) => { const s = ((c % 86400) + 86400) % 86400; return s >= 1800 && s < 19800; }; // 00:30 – 05:30: twice the fare
// ---------------------------------------------------------------- a ride, from what one gets on
// { id: what tariff, place: where one touches the card, sea, takes: does it take a transfer, fare | band, … }
export function rideOf(p, q, run = 0) {
  const w = p.way, i = p.stops[q], name = w.stops[i] ? w.stops[i].name : '', base = { name, ref: p.ref, place: fold(name), way: w, stop: i, area: w.kind !== 'bus' && w.kind !== 'old' };
  if (w.kind === 'mbus') return { ...base, id: 'mbus', band: 'mbus', takes: false };
  if (w.kind === 'rail') return { ...base, id: 'marmaray', band: 'marmaray', takes: false };
  if (w.id === 'm11') return { ...base, id: 'm11', band: 'm11', takes: true, ladder: T6 };
  if (w.id === 't6') return { ...base, id: 't6', fare: T6[0], ladder: T6, takes: true };
  if (w.kind !== 'bus') return { ...base, id: 'land', fare: LAND[0], ladder: LAND, takes: true };
  const b = BUSES[p.ref], place = `bus:${w.id}:${run}`; if (!b) return { ...base, id: 'land', place, fare: LAND[0], ladder: LAND, takes: true };
  const from = b.then && Object.entries(b.then.from).find(([to]) => fold(p.to).startsWith(fold(to))), k = !from ? -1 : from[1] === '*' ? 0 : p.stops.findIndex((s) => fold(w.stops[s].name) === fold(from[1])), late = k >= 0 && q >= k;
  return late ? { ...base, id: 'land', place, fare: LAND[0], ladder: LAND, takes: b.then.takes } : { ...base, id: 'land', place, fare: b.fare, ladder: LAND, takes: b.takes };
}
export const ferryRide = (a, b, miles, kind) => ({ id: 'sea', sea: true, ref: '⛴', name: a, place: `sea:${fold(a)}`, ...ferryFare(a, b, miles, kind), ladder: SEA, takes: kind !== 'seabus' });
export const carRide = (line, name, kind) => ({ id: 'car', sea: true, ref: '🚗⛴', name, place: `car:${fold(name)}`, fare: carFare(line, kind), takes: false, vehicle: true });
// how many stations between two of a line
export function stations(ride, to) { const w = ride.way, a = ride.stop, b = to; let n = Math.abs(a - b); for (const [x, y, more] of GAPS[ride.band] || []) { const i = w.stops.findIndex((s) => s.name === x), j = w.stops.findIndex((s) => s.name === y); if (i >= 0 && j >= 0 && Math.min(a, b) <= Math.min(i, j) && Math.max(a, b) >= Math.max(i, j)) n += more; } return n; }
// ---------------------------------------------------------------- the card
export class Card {
  constructor(kurus = START) { this.bal = kurus; this.log = []; this.chain = null; this.open = null; this.spent = 0; this.rides = 0; }
  // what it would cost: { fare, k: which transfer (0: none), night, est, free, max }
  quote(ride, c) {
    const L = this.chain, x2 = night(c) && ride.id !== 'mbus' ? 2 : 1, out = { fare: 0, k: 0, night: x2 > 1, est: !!ride.est, free: false, max: !!ride.band };
    const o = this.open; if (o && o.area && ride.area && o.shut && o.ride.way === ride.way && Math.abs(o.out - ride.stop) < 1 && c - o.outAt < SAME) { out.free = true; out.again = true; out.fare = o.back; return out; } // (one had not left the platform: the same ride goes on)
    const full = ride.band ? most(ride.band) : ride.fare;
    if (L && !ride.vehicle && c - L.at <= WINDOW && L.ref && FREE.some((f) => f.includes(L.ref) && f.includes(ride.ref) && L.ref !== ride.ref)) { out.free = true; out.k = L.k; return out; }
    if (!ride.vehicle && ride.takes && L && c - L.at <= WINDOW && L.k < 5 && L.place !== ride.place) {
      const k = (out.k = L.k + 1); let f = ride.ladder[k] + (ride.band ? full - ride.ladder[0] : 0);
      if ((ride.sea || L.sea) && !out.night) f = Math.round(f / 2); // (from land to sea, sea to land and sea to sea: half)
      out.fare = Math.min(full, f) * x2; return out;
    }
    out.fare = full * x2; return out;
  }
  // touch the card: the quote, ok if there was enough
  pay(ride, c) {
    const q = this.quote(ride, c); q.ok = q.fare <= this.bal; if (!q.ok) return q; this.bal -= q.fare; this.spent += q.fare;
    if (q.again) { Object.assign(this.open, { shut: false, paid: this.open.paid + q.fare, back: 0 }); this.note(ride, -q.fare, c, q); return q; }
    this.rides++; const L = this.chain; if (!ride.vehicle) this.chain = q.k > 0 || q.free ? { ...L, k: q.k, place: ride.place, sea: !!ride.sea, ref: ride.ref } : { at: c, k: 0, place: ride.place, sea: !!ride.sea, ref: ride.ref }; // (a full fare begins anew)
    this.open = { ride, at: c, paid: q.fare, k: q.k, x2: q.night ? 2 : 1, shut: false, back: 0, area: true }; this.note(ride, -q.fare, c, q); return q;
  }
  // off at a stop of the line: what is given back
  off(stop, c) {
    const o = this.open; if (!o || o.shut) return 0; o.shut = true; o.out = stop; o.outAt = c; o.back = 0; const r = o.ride; if (!r.band) return 0;
    const h = ((c % 86400) + 86400) % 86400, n = stations(r, stop); if (n < 1 || c - o.at > BACK[r.band] || (r.band === 'mbus' && h >= 3600 && h < 21600)) return 0;
    const b = Math.max(0, (most(r.band) - band(r.band, n)) * o.x2); if (!b) return 0; o.back = Math.min(b, o.paid); this.bal += o.back; this.spent -= o.back; this.note(r, o.back, c, { n }); return o.back;
  }
  // up to the street: the ride is over
  leave() { if (this.open) this.open.area = false; }
  note(ride, amount, c, q) { this.log.unshift({ ref: ride.ref, name: ride.name, amount, c, k: q.k || 0, n: q.n || 0, night: !!q.night, est: !!q.est, free: !!q.free && !q.again }); this.log.length = Math.min(this.log.length, 12); }
}
