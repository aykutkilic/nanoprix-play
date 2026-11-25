// The city's own clock, for the timetables. It runs as fast as the city is small: a unit is 10 m and a toy's
// speed is shown as KMH, so a bus that keeps a real timetable is seen to go at a real bus' speed.
import { KMH } from './units.js';
export const RATE = 36 / KMH; // seconds of the city in one of ours (3.8)
// What day it is in İstanbul (0 Sunday … 6 Saturday), and what time the game begins: in the morning, or at night in the evening.
// (The host says it once; everybody goes by it.)
export function cityStart(ms, light) { const d = new Date(ms + 3 * 3600e3); return { dow: d.getUTCDay(), at: (light === 'night' ? 20 : 8) * 3600 }; }
export const dayType = (dow) => (dow === 6 ? 1 : dow === 0 ? 2 : 0); // weekday, Saturday, Sunday
export const hm = (c) => { const m = Math.floor((((c % 86400) + 86400) % 86400) / 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
