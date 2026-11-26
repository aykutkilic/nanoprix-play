import { homeHtml, action, store } from './home.js';
import { assetsReady, reportStage, pendingChoice, onChoice, finishStartup } from './start-screen.js';
import { Network, Course } from '../shared/track.js';
import { Streets } from '../shared/streets.js';
import { COURSES } from '../shared/courses.js';
import { CARS, RACERS } from '../shared/car.js';
import { PLACE, STARTS } from '../shared/places.js';
import { COLOURS, sanitizeProfile } from '../shared/room.js';
import { View } from './view.js';
import { buildWorld } from './world.js';
import { Hud, fmt, esc } from './hud.js';
import { Game } from './game.js';
import { Fx } from './fx.js';
import { Weather } from './weather.js';
import { CHOICES, WEATHER, mixWeather } from '../shared/weather.js';
import { Audio } from './audio.js';
import { Nav, NextSign } from './nav.js';
import { Fly } from './fly.js';
import { Music } from './music.js';
import { Input } from './input.js';
import { Net } from './net.js';
import { FirstRaceHints, FerryOuting, journalHtml, readBest, recordTrial } from './activities.js';
import { QUICK_RACE, TIME_TRIAL, TRIAL_CAR } from '../shared/events.js';
import { HostSession, PeerNet, publicPeerRooms } from './p2p.js';
import { makeCarModel } from './carmodels.js';
import { t, lang, setLang, err } from './i18n.js';
import { board, lapTable, gapChart, placeChart, hover, clearCharts } from './statsview.js';

const $ = (s, e = document) => e.querySelector(s), ui = $('#ui'), hudEl = $('#hud');
let tt = 0; const toast = (s, ms = 3200) => { const e = $('#toast'); e.textContent = s; e.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('show'), ms); };
setLang(lang());
let profile; try { profile = JSON.parse(store('profile') || '{}'); } catch { profile = {}; }
profile = sanitizeProfile({ name: profile.name || ['Taksici', 'Simitçi', 'Kaptan', 'Vapurcu'][Math.floor(Math.random() * 4)] + Math.floor(Math.random() * 90 + 10), car: profile.car || RACERS[Math.floor(Math.random() * RACERS.length)].id, color: profile.color || COLOURS[Math.floor(Math.random() * 6)] });
const saveProfile = () => store('profile', JSON.stringify(profile));

// ---------------------------------------------------------------- loading

let A, net, view, game, hud, audio, music, fx, input, weather;
{
  A = await assetsReady;
  net = new Network(A.roads); new Streets(net, A.streets); view = new View($('#gl')); await new Promise((r) => setTimeout(r, 20));
  const prioritize = () => {
    const kind = pendingChoice()?.action;
    const id = kind === 'quick' || kind === 'trial' ? COURSES.find(c => c.id === QUICK_RACE.course).hubs[0] : kind === 'free' ? 'taksim' : null;
    const hub = net.hubs.get(id);
    if (hub) A.stream.pin([{ x: hub.x, z: hub.z, r: 100 }]);
  };
  const stopListening = onChoice(prioritize);
  prioritize();
  view.world = await buildWorld(view.scene, A, net, reportStage);
  stopListening();
  A.stream.deliver(); view.applyNight(0);
  hud = new Hud(hudEl, A, net); audio = new Audio(); music = new Music(audio); music.later = () => !music.el && (A.stream.holds.length > 0 || A.stream.share < 0.35); music.told = (n) => toast(`♪ ${n}`, 2600); fx = new Fx(view.scene); input = new Input(document.body); weather = new Weather(view.scene, view.world, fx, audio); view.world.sea = (x, z) => weather.sea(x, z); game = new Game({ view, net, hud, audio, fx, input, weather }); game.fly = new Fly(game, view.renderer.domElement); game.nav = new Nav(game, $('#find')); game.nextSign = new NextSign(hud, view.world.signs, net); view.warm();
}

// ---------------------------------------------------------------- rooms
// where this game will begin: its houses and sights first
const startOf = (S) => { if (S.mode === 'cruise') { const h = net.hubs.get(S.start); return h ? { x: h.x, z: h.z, r: 100 } : null; } const c = COURSES.find((q) => q.id === S.course); if (!c) return null; const h = net.hubs.get(c.hubs[0]); return { x: h.x, z: h.z, r: 100 }; };
let starting = 0, startingLink = null, pill = '';
async function begin(settings = room?.settings) {
  if (starting || !link || !settings) return;
  const transport = link, area = startOf(settings);
  starting = 1; startingLink = transport;
  const progress = (fraction) => {
    if (transport !== startingLink) return;
    starting = 1 + fraction;
    const button = $('[data-do=start]');
    if (button) {
      button.textContent = `${t('comes')} ${Math.round(fraction * 100)}%`;
      button.style.setProperty('--v', `${fraction * 100}%`); button.classList.add('wait');
    }
  };
  if (screen === 'room') draw();
  try {
    if (area && A.stream.part(area.x, area.z, area.r) < 1) {
      await A.stream.ready(area.x, area.z, area.r, { on: progress });
    }
    if (link === transport && room && !game.active) transport.send({ t: 'start', trial: soloEvent === 'trial' });
  } finally {
    if (startingLink === transport) {
      starting = 0; startingLink = null;
      if (screen === 'room') draw();
    }
  }
}
let raceStats = null, statsMe = 0, resTab = 'classification', soloEvent = '', link = null, host = null, room = null, results = null, screen = 'home', myId = 0, busy = false;
function attach(l) {
  link = l;
  l.on('msg', (m) => {
    if (l !== link) return;
    switch (m.t) {
      case 'welcome': {
        myId = m.id;
        const useRacer = soloEvent === 'quick' && !RACERS.some((c) => c.id === profile.car);
        l.send({ t: 'hello', profile: useRacer ? { ...profile, car: TRIAL_CAR } : profile });
        break;
      }
      case 'room': {
        const first = !room;
        room = m; myId = m.you;
        const area = startOf(m.settings); A.stream.pin(area ? [area] : []);
        if (!host) busy = false;
        if (first && !game.active) go('room'); else if (screen === 'room') draw();
        if (first && soloEvent && m.hostId === myId) {
          const preset = soloEvent === 'trial' ? TIME_TRIAL : soloEvent === 'quick' ? QUICK_RACE : { mode: 'cruise', light: 'cycle', start: soloEvent === 'outing' ? 'eminonu' : 'taksim' };
          l.send({ t: 'set', settings: preset }); begin({ ...m.settings, ...preset });
        }
        break;
      }
      case 'race':
        paused = settingsOpen = journalOpen = false; results = null; comparison = null;
        game.race(m, myId, l); go('race');
        if (soloEvent === 'outing' && game.free && game.mine) game.outing = new FerryOuting(game, store);
        if (soloEvent === 'quick' && !store('learned') && game.mine) {
          game.hints = new FirstRaceHints(game);
          game.hud.keys.style.opacity = 0;
        }
        break;
      case 'deadline': if (game.msg) game.msg.endAt = m.endAt; break;
      case 'finished': if (game.active) { game.msg.endAt = m.endAt; game.someoneFinished(m); } break;
      case 'car': if (game.active) game.enter(m.car); break;
      case 'gone': game.gone(m.id); break;
      case 'startAt': if (game.msg) game.msg.startAt = m.startAt; break;
      case 'weather': game.wx = m.wx; toast(t(`w_${m.wx.to}`), 1600); if (paused) draw(); break;
      case 'results': results = m; if (game.active) {
        const mine = m.list.find((r) => r.id === myId);
        if (game.msg.trial) comparison = recordTrial(store, mine, m.settings);
        if (game.hints && mine?.time) store('learned', '1');
        setTimeout(() => { if (results === m) { raceStats = game.stats; statsMe = myId; resTab = 'classification'; game.clear(); go('results'); } }, game.finished ? 300 : 900); } break;
      case 'stopped': results = null; if (soloEvent) l.send({ t: 'profile', profile }); soloEvent = ''; paused = settingsOpen = journalOpen = false; game.clear(); go('room'); break;
      case 'error': toast(err(m.text)); if (busy && m.text === 'Room not found' && l instanceof Net && joiningCode) { const code = joiningCode; leave(); joinP2p(code); } else if (!l.connected || (!room && busy)) { leave(); } else if (m.kicked || /closed|sent you/.test(m.text)) leave(); break;
      default:
    }
  });
  l.on('poses', (p) => { if (l === link) game.poses(p); });
  l.on('close', () => { if (l !== link) return; if (room) toast(t('lost')); leave(); });
}
function leave() {
  starting = 0; startingLink = null;
  const l = link, h = host; soloEvent = ''; paused = settingsOpen = journalOpen = false; link = null; host = null; room = null; results = null; busy = false; A.stream.pin([]); game.clear();
  if (l) { try { l.close(); } catch { /* */ } } if (h) h.destroy();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search); go('home');
}
function solo(kind = '') {
  if (link || busy) return;
  soloEvent = kind;
  host = new HostSession();
  host.net = net; host.startLocal(profile.name);
  attach(host.local); host.local.connect();
}
async function openRoom(listed = false) {
  if (!host || busy) return;
  const session = host;
  busy = true; draw(); toast(t('opening'));
  try {
    const code = await session.goOnline(profile.name, listed ? 'public' : 'unlisted');
    if (host === session) history.replaceState(null, '', `#p-${code}`);
  } catch (error) {
    if (host === session) toast(`${t('failed')}: ${error.type || error.message}`);
  } finally {
    if (host === session) { busy = false; draw(); }
  }
}
// A dedicated server, if one answers at /ws
async function serverLink() {
  if (new URLSearchParams(location.search).has('p2p')) return null;
  const transport = new Net();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (!value) transport.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 1500);
    transport.on('msg', (msg) => {
      if (msg.t === 'welcome') { transport.welcome = msg; finish(transport); }
    });
    transport.on('close', () => finish(null));
    try { transport.connect(); } catch { finish(null); }
  });
}
async function create(listed = false) {
  if (busy || link) return;
  busy = true; draw();
  const transport = await serverLink();
  if (transport) {
    attach(transport); myId = transport.welcome.id;
    transport.send({ t: 'create', name: profile.name, profile, public: listed });
    return;
  }
  busy = false; solo(); await openRoom(listed);
}
let joiningCode = '';
async function join(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); if (code.length !== 4 || busy) return; joiningCode = code; busy = true; draw(); toast(t('joining'));
  const transport = await serverLink();
  if (!transport) { joinP2p(code); return; }
  attach(transport); myId = transport.welcome.id;
  transport.send({ t: 'join', code, profile });
}
function joinP2p(code) { busy = true; const n = new PeerNet(code); attach(n); n.connect(); }
addEventListener('pageshow', (e) => { if (e.persisted && host) host.relist(); });
addEventListener('pagehide', () => { if (host) host.unlist(); if (link && !host) { try { link.send({ t: 'leave' }); } catch { /* */ } } });

// ---------------------------------------------------------------- screens
function go(s) {
  const previous = screen;
  if (screen !== s && (screen === 'race' || screen === 'results')) clearCharts();
  if (s !== 'results') raceStats = null;
  clearTimeout(directoryTimer); screen = s; hudEl.hidden = s !== 'race'; draw();
  if (s === 'home' && ['garage', 'directory', 'journal'].includes(previous)) {
    ui.querySelector(`[data-do="${previous}"]`)?.focus({ preventScroll: true });
  } else if (s === 'garage' && !input.touchEl) {
    ui.querySelector('#name')?.focus({ preventScroll: true });
  }
}
const seg = (id, opts, v) => `<div class="row seg" data-seg="${id}">${opts.map(([k, n]) => `<button data-v="${k}" class="${String(k) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
let comparison = null, directoryTimer, directoryGeneration = 0, rows = [], listStatus = '', directoryTransport = '';
async function browse() {
  const generation = ++directoryGeneration;
  if (screen !== 'directory') { listStatus = 'looking'; rows = []; go('directory'); }
  try {
    let list;
    if (directoryTransport !== 'peer' && !new URLSearchParams(location.search).has('p2p')) {
      const response = await fetch(new URL('../rooms.json', import.meta.url), { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        list = await response.json(); directoryTransport = 'server';
      }
    }
    if (!list) { directoryTransport = 'peer'; list = await publicPeerRooms(); }
    if (screen !== 'directory' || generation !== directoryGeneration) return;
    rows = list; listStatus = rows.length ? '' : 'noRooms';
  } catch {
    if (screen !== 'directory' || generation !== directoryGeneration) return;
    rows = []; listStatus = 'directoryError';
  }
  draw(); clearTimeout(directoryTimer);
  directoryTimer = setTimeout(browse, 10000);
}
function directoryHtml() {
  return `<div class="panel center"><h2>${t('publicRooms')}</h2>
    ${listStatus ? `<p role="status">${t(listStatus)}</p>` : ''}
    <ul class="room-list">${rows.map((r) => `<li><button data-join="${esc(r.code)}" ${busy || r.players >= r.max ? 'disabled' : ''}>${esc(r.name)} · ${r.players}/${r.max}<small>${t(r.mode === 'cruise' ? 'cruise' : 'play')} · ${t(r.live ? r.mode === 'cruise' ? 'liveCruise' : 'liveRace' : 'lobby')}</small></button></li>`).join('')}</ul>
    <div class="col">${action('public', 'hostPublic', true)}${action('quick', 'quick')}${action('refresh', 'refresh')}${action('back', 'back')}</div></div>`;
}
let settingsOpen = false, journalOpen = false, paused = false, drawn = '';
const nightBtn = () => `<button data-do="night">${view.night > 0.5 ? '☀️' : '🌙'}</button>`, keysHtml = () => (input.touchEl ? '' : `<p class="desc">${t('controls')}</p>`);
function draw() {
  if (host?.room) {
    const freeze = screen === 'race' && !game.free && (paused || settingsOpen) && host.room.localSolo;
    host.room.pauseSolo(freeze);
    if (freeze && !input.menu) { input.keys.clear(); game.audio.quiet(); }
  }
  input.menu = screen === 'race' && (paused || settingsOpen);
  const menu = screen !== 'race' || paused || settingsOpen;
  const at = `${screen}:${settingsOpen}:${paused}:${journalOpen}`;
  const same = at === drawn;
  const panel = $('.panel', ui);
  const top = same ? panel?.scrollTop : 0;
  const active = document.activeElement;
  let selector;
  if (same && ui.contains(active)) {
    const segment = active.closest('[data-seg]');
    const key = Object.keys(active.dataset)[0];
    if (active.id) selector = '#' + CSS.escape(active.id);
    else if (key) selector = (segment ? `[data-seg="${CSS.escape(segment.dataset.seg)}"] ` : '') +
      `[data-${key}="${CSS.escape(active.dataset[key])}"]`;
  }
  drawn = at;
  document.body.classList.toggle('driving', screen === 'race');
  input.showTouch(!menu);
  paint();
  if (top && $('.panel', ui)) $('.panel', ui).scrollTop = top;
  if (selector) ui.querySelector(selector)?.focus({ preventScroll: true });
}
function paint() {
  const race = screen === 'race', corner = input.touchEl ? (settingsOpen || (race && paused) ? '' : `<div class="corner">${race ? `${game.free && game.mine ? '<button data-do="find">🔎</button>' : ''}<button data-do="seat" hidden>💺</button><button data-do="cam">🎥</button><button data-do="menu">☰</button>` : `${nightBtn()}<button data-do="settings">⚙</button>`}</div>`) : `<div class="corner">${screen === 'race' && game.free && game.mine ? '<button data-do="find">🔎</button>' : ''}<button data-do="cam">🎥</button>${nightBtn()}<button data-do="settings">⚙</button></div>`;
  if (settingsOpen) { ui.innerHTML = corner + settingsHtml(); return; }
  if (screen === 'directory') { ui.innerHTML = corner + directoryHtml(); return; }
  if (screen === 'journal' || journalOpen) { ui.innerHTML = corner + journalHtml(game, store); return; }
  if (screen === 'garage') { ui.innerHTML = corner + `<div class="panel"><h2>${t('garage')}</h2>${profileHtml()}<div class="col">${action('back', 'back', true)}</div></div>`; return; }
  if (screen === 'home') ui.innerHTML = corner + homeHtml(); else if (screen === 'room') ui.innerHTML = corner + roomHtml(); else if (screen === 'results') ui.innerHTML = corner + resultsHtml(); else ui.innerHTML = corner + (paused ? pauseHtml() : '');
}
const profileHtml = () => `<label for="name">${t('name')}</label><input type="text" id="name" maxlength="16" value="${esc(profile.name)}" autocomplete="off"><label>${t('car')}</label><div class="row seg" style="flex-wrap:wrap">${CARS.map((c) => `<button data-car="${c.id}" aria-pressed="${c.id === profile.car}" style="flex:1 0 30%" class="${c.id === profile.car ? 'on' : ''}">${c.name[lang()]}</button>`).join('')}</div><label>${t('color')}</label><div class="row">${COLOURS.map((c) => `<button class="sw ${c === profile.color ? 'on' : ''}" data-color="${c}" aria-pressed="${c === profile.color}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>`;
const lens = new Map(), lenOf = (c) => { if (!lens.has(c.id)) lens.set(c.id, net.pathRoads(c.hubs).reduce((s, [r]) => s + r.len, 0) / 100); return lens.get(c.id); };
function roomHtml() {
  if (!room) return ''; const meNow = room.members.find((m) => m.id === myId), S = room.settings, am = room.hostId === myId, cr = S.mode === 'cruise', c = COURSES.find((q) => q.id === S.course), dis = am ? '' : 'style="pointer-events:none;opacity:.85"', on = !!room.code;
  if (starting && soloEvent && !on) return `<div class="panel center"><p role="status" data-do="start">${t('comes')} ${Math.round((starting - 1) * 100)}%</p></div>`;
  const trialBest = readBest(store, S);
  const trialButton = !on && !cr && !meNow?.watch ? `<button data-do="courseTrial">${t('trial')} · ${esc(c.name[lang()])}${trialBest ? ` · ${fmt(trialBest)}` : ''}</button>` : '';
  return `<div class="panel"><div class="row"><h2 class="grow" style="flex:1">${esc(on ? room.name : t('play'))}</h2>${on ? `<span class="code">${room.code}</span>` : ''}</div><div class="opts" ${dis}>
  ${seg('mode', [['race', t('raceMode')], ['cruise', t('cruise')]], S.mode)}<div style="height:10px"></div>
  ${cr ? `<p class="desc" style="margin:0">${t('cruiseText')}</p><label>${t('from')}</label><div class="courses">${STARTS.map((q) => `<button data-start="${q}" class="${q === S.start ? 'on' : ''}">${PLACE[q]}</button>`).join('')}</div>` : `<div class="courses">${COURSES.map((q) => `<button data-course="${q.id}" class="${q.id === S.course ? 'on' : ''}">${q.name[lang()]}<small>${lenOf(q).toFixed(1)} ${t('km')}</small></button>`).join('')}</div><p class="desc">${c.text[lang()]}</p>
  <div class="row"><div style="flex:1"><label>${t('laps')}</label>${seg('laps', [1, 2, 3, 5].map((n) => [n, n]), S.laps)}</div><div style="flex:1"><label>${t('reverse')}</label>${seg('reverse', [[false, '→'], [true, '←']], S.reverse)}</div></div>`}
  <label>${t('weather')}</label>${seg('weather', CHOICES.map((k) => [k, t(`w_${k}`)]), S.weather)}
  <label>${t('light')}</label>${seg('light', [['day', t('day')], ['night', t('night')], ['cycle', t('cycle')]], S.light)}
  ${cr ? '' : `<div class="row"><div style="flex:1"><label>${t('bots')}</label>${seg('bots', [0, 3, 5, 7].map((n) => [n, n]), S.bots)}</div><div style="flex:1"><label>${t('level')}</label>${seg('level', [0, 1, 2].map((n) => [n, t(`l${n}`)]), S.level)}</div></div>`}
  <label>${t('traffic')}</label>${seg('traffic', [0, 1, 2].map((n) => [n, t(`t${n}`)]), S.traffic)}</div>
  ${on ? `<label>${room.members.length}/${room.max}</label><ul class="members">${room.members.map((m) => `<li><i style="background:${m.color}"></i>${esc(m.name)} <em>${m.id === room.hostId ? t('host') : ''} ${m.id === myId ? `· ${t('you')}` : ''} ${m.wins ? `· ${m.wins}★` : ''} ${m.watch ? `· 👁 ${t('watcher')}` : ''} ${m.ready ? '✓' : ''}</em>${am && m.id !== myId ? `<button data-kick="${m.id}">${t('kick')}</button>` : ''}</li>`).join('')}</ul>` : ''}
  <label>${t('asWhat')}</label><div class="row seg"><button data-watch="0" class="${meNow && meNow.watch ? '' : 'on'}">🏎 ${t('driver')}</button><button data-watch="1" class="${meNow && meNow.watch ? 'on' : ''}">👁 ${t('watcher')}</button></div>
  <div class="col">${am ? `<button class="main${starting ? ' wait' : ''}" data-do="start" style="--v:${Math.max(0, starting - 1) * 100}%">${starting ? `${t('comes')} ${Math.round(Math.max(0, starting - 1) * 100)}%` : t('start')}</button>` : `<button class="main" data-do="ready">${t('ready')}</button><div class="fine" style="margin:0">${t('waiting')}</div>`}${trialButton}<div class="row">${on ? `<button class="grow" data-do="invite">${t('invite')}</button>` : `<button class="grow" data-do="open" ${busy ? 'disabled' : ''}>${busy ? t('opening') : t('openOnline')}</button>`}<button data-do="leave">${t('leave')}</button></div></div></div>`;
}
function resultsHtml() {
  const R = results; if (!R) return ''; const st = raceStats || null, won = st && st.fastest && st.cars.get(st.fastest.id);
  const cls = `<table class="res">${R.list.map((r, i) => `<tr class="${r.id === myId ? 'me' : ''}"><td>${r.place}</td><td><i style="background:${r.color}"></i>${esc(r.name)}${r.bot ? ` <em style="opacity:.5;font-style:normal;font-size:12px">${t('bot')}</em>` : ''}${st && st.fastest && st.fastest.id === r.id ? ' <u class="fl"></u>' : ''}</td><td>${r.time ? (i && R.list[0].time ? `+${((r.time - R.list[0].time) / 1000).toFixed(3)}` : fmt(r.time)) : t('dnf')}</td><td>${st && st.cars.get(r.id) && st.cars.get(r.id).best ? st.cars.get(r.id).best.toFixed(3) : r.best ? (r.best / 1000).toFixed(3) : ''}</td></tr>`).join('')}</table>${won ? `<p class="flap"><u class="fl"></u> ${t('fastestLap')}: <b>${esc(won.name)}</b> ${fmt(st.fastest.time * 1000)} · ${t('lap')} ${st.fastest.lap + 1}</p>` : ''}`;
  const tab = !st || resTab === 'classification' ? cls : resTab === 'lapTimes' ? lapTable(st, statsMe) : resTab === 'timing' ? board(st, statsMe) : `${gapChart(st, statsMe, { w: 820, h: 260 })}${placeChart(st, statsMe, { w: 820, h: 240 })}`;
  const delta = comparison?.delta;
  const comparisonText = comparison ? `<p><b>${t('personal')} · ${fmt(comparison.best)}</b>${comparison.previous ? ` · ${delta ? `${(Math.abs(delta) / 1000).toFixed(3)} s ${t(delta < 0 ? 'faster' : 'slower')}` : t('tied')}` : ''}</p>` : '';
  return `<div class="panel center wide"><h2>${t('results')} – ${COURSES.find((c) => c.id === R.course).name[lang()]}</h2>${comparisonText}${st ? `<div class="row seg" style="margin-bottom:14px">${['classification', 'lapTimes', 'timing', 'charts'].map((k) => `<button data-tab="${k}" class="${k === resTab ? 'on' : ''}">${t(k)}</button>`).join('')}</div>` : ''}<div class="tabbody">${tab}</div><div class="col">${room?.hostId === myId ? action('retry', 'retry', true) : ''}${action('room', 'again')}</div></div>`;
}
function settingsHtml() { return `<div class="panel center opts"><h2>${t('settings')}</h2><label>${t('graphics')}</label>${seg('gfx', ['auto', 'high', 'medium', 'low'].map((k) => [k, t(k)]), view.gfx)}<label>${t('tilt')}</label>${seg('tilt', [[true, '✓'], [false, '✕']], view.tiltOn)}<label>${t('sound')}</label>${seg('sound', [[true, '✓'], [false, '✕']], audio.on)}<label>${t('music')}</label>${seg('music', [[true, '✓'], [false, '✕']], music.on)}<div class="row"><button class="grow" data-do="track">♪ ${t('nextTrack')}</button></div><label>${t('lang')}</label>${seg('lang', [['tr', 'Türkçe'], ['en', 'English']], lang())}${keysHtml()}<div class="col"><button class="main" data-do="settings">${t('resume')}</button></div></div>`; }
function pauseHtml() { const am = room && room.hostId === myId; return `<div class="panel center"><h2>NANOPRIX</h2><p class="desc">${t('controls')}</p><div class="col"><button class="main" data-do="resume">${t('resume')}</button>${input.touchEl ? `<div class="row">${nightBtn()}${am ? `<button class="grow" data-do="weather">${t('weather')}: ${t(`w_${game.wx.to}`)}</button>` : ''}<button class="grow" data-do="settings">⚙ ${t('settings')}</button></div>` : ''}${am ? `<button data-do="stop">${t(game.free ? 'again' : 'quit')}</button>` : ''}${game.free && game.mine ? action('journal', 'journal') : ''}${room && room.code ? `<button data-do="invite">${t('invite')} · ${room.code}</button>` : host && !game.msg?.trial ? `<button data-do="open" ${busy ? 'disabled' : ''}>${busy ? t('opening') : t('openOnline')}</button>` : ''}<button data-do="leave">${t('leave')}</button></div></div>`; }
const set = (o) => link && link.send({ t: 'set', settings: { ...room.settings, ...o } });
const sendProfile = () => { saveProfile(); if (link && room) link.send({ t: 'profile', profile }); };
ui.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (button) handleButton(button);
});
async function handleButton(b) {
  if (busy && (screen === 'home' || screen === 'directory')) return;
  const d = b.dataset;
  if (d.join) { if (!busy) directoryTransport === 'peer' ? joinP2p(d.join) : join(d.join); return; }
  if (d.car || d.color) {
    const key = d.car ? 'car' : 'color';
    profile[key] = d[key];
    sendProfile();
    showCar();
    for (const option of ui.querySelectorAll(`[data-${key}]`)) {
      const selected = option.dataset[key] === d[key];
      option.classList.toggle('on', selected);
      option.setAttribute('aria-pressed', String(selected));
    }
    return;
  }
  if (d.course) { const c = COURSES.find((q) => q.id === d.course); set({ course: c.id, laps: c.laps }); return; } if (d.tab) { resTab = d.tab; draw(); return; } if (d.watch) { link.send({ t: 'watch', on: d.watch === '1' }); return; } if (d.start) { set({ start: d.start }); return; } if (d.kick) { link.send({ t: 'kick', id: +d.kick }); return; }
  const sg = b.closest('[data-seg]'); if (sg) { const k = sg.dataset.seg, v = d.v === 'true' ? true : d.v === 'false' ? false : Number.isNaN(+d.v) ? d.v : +d.v; if (k === 'gfx') view.chooseQuality(v); else if (k === 'tilt') { view.tiltOn = v; store('tilt', v ? '1' : '0'); } else if (k === 'sound') { audio.toggle(v); music.sync(); } else if (k === 'music') music.toggle(v); else if (k === 'lang') setLang(v); else { set({ [k]: v }); return; } draw(); return; }
  switch (d.do) {
    case 'quick': case 'trial': solo(d.do); break;
    case 'outing':
      if (journalOpen && game.free && game.mine) {
        journalOpen = paused = false; game.outing = new FerryOuting(game, store); draw();
      } else solo('outing');
      break;
    case 'courseTrial': if (!starting && !room.code && !game.active) { soloEvent = 'trial'; begin(); } break;
    case 'retry': if (!starting && room?.hostId === myId) begin(); break;
    case 'directory': case 'refresh': if (!busy) browse(); break;
    case 'public': create(true); break;
    case 'garage': go('garage'); break;
    case 'journal': if (game.active) { journalOpen = true; draw(); } else go('journal'); break;
    case 'back': if (journalOpen) { journalOpen = false; draw(); } else if (!busy) go('home'); break;
    case 'solo': solo(); break; case 'create': create(); break; case 'join': join($('#code').value); break; case 'open': openRoom(); break; case 'leave': paused = false; leave(); break; case 'start': begin(); break;
    case 'ready': { const me = room.members.find((m) => m.id === myId); link.send({ t: 'ready', on: !me.ready }); break; }
    case 'free': solo('free'); break; case 'room': soloEvent = ''; if (link) link.send({ t: 'profile', profile }); results = null; go('room'); break; case 'resume': paused = false; draw(); break; case 'menu': paused = true; draw(); break; case 'seat': game.cabin.turn(); break; case 'weather': nextWeather(); break;
    case 'stop': paused = false; link.send({ t: 'lobby' }); break;
    case 'invite': { const u = `${location.origin}${location.pathname}#${host || link instanceof PeerNet ? 'p-' : ''}${room.code}`; try { await navigator.clipboard.writeText(u); toast(t('copied')); } catch { toast(u, 8000); } break; }
    case 'track': if (!music.on) music.toggle(true); music.next(); draw(); break;
    case 'find': game.nav.show(); break; case 'settings': settingsOpen = !settingsOpen; draw(); break; case 'cam': cam(); break; case 'night': if (game.active) game.toggleNight(); else menuNight = menuNight ? 0 : 1; setTimeout(draw, 900); break; default:
  }
}
ui.addEventListener('input', (e) => { if (e.target.id === 'name') { const p = sanitizeProfile({ ...profile, name: e.target.value }); profile.name = p.name; sendProfile(); } });
ui.addEventListener('keydown', (e) => { if (e.key === 'Escape') escapeMenu(); else if (e.key === 'Enter' && e.target.id === 'code') join(e.target.value); e.stopPropagation(); });
const cam = (e) => { if (e && e.preventDefault) e.preventDefault(); if (game.active && !game.fly.on) toast(t(view.nextCam()), 900); };
input.on('F2', cam); input.on('KeyC', cam); input.on('ArrowLeft', () => game.pickWatch(-1)); input.on('ArrowRight', () => game.pickWatch(1)); input.on('KeyX', () => { if (game.active && game.cabin) game.cabin.turn(); }); input.on('KeyG', () => game.toggleAuto()); input.on('KeyE', () => game.trip.act()); input.on('KeyF', (e) => game.nav.show(e)); input.on('Slash', (e) => game.nav.show(e)); input.on('KeyQ', () => { if (game.active && game.trip.hall) game.trip.up(); }); input.on('Tab', (e) => { if (!game.active || !game.stats) return; e.preventDefault(); if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); game.showFull(); }); input.on('KeyT', () => { if (game.active && game.stats) game.nextMode(); });
ui.addEventListener('pointermove', hover); ui.addEventListener('pointerleave', hover);
const nextWeather = () => { if (!game.active || !room || room.hostId !== myId) return; const i = CHOICES.indexOf(game.wx.to); link.send({ t: 'weather', weather: CHOICES[(i + 1) % CHOICES.length] }); };
input.on('KeyV', nextWeather); if (input.touchEl) hudEl.addEventListener('click', (e) => { if (!game.active) return; if (e.target.closest('.tw')) game.nextMode(); else if (e.target.closest('.time, .secs, .full')) game.showFull(); }); input.on('KeyN', () => { if (game.active) game.toggleNight(); else menuNight = menuNight ? 0 : 1; }); input.on('KeyR', () => game.reset()); for (let k = 1; k <= 9; k++) input.on(`Digit${k}`, () => { if (game.active && game.fuel) game.fuel.key(k); }); // (at the pump, at the till)
input.on('KeyM', () => { music.toggle(!music.on); toast(music.on ? `♪ ${music.name}` : '♪ ✕', 1600); if (settingsOpen) draw(); });
function escapeMenu() {
  if (settingsOpen) settingsOpen = false;
  else if (journalOpen) journalOpen = false;
  else if (['directory', 'journal', 'garage'].includes(screen) && !busy) return go('home');
  else if (screen === 'race') paused = !paused;
  draw();
}
input.on('Escape', escapeMenu);

// ---------------------------------------------------------------- behind the menus: a slow flight round the course, the car turning in front
let menuNight = 0, menuCourse = null, menuId = '', shown = null;
function showCar() { if (shown) shown.userData.dispose(); shown = makeCarModel(profile.car, profile.color); view.scene.add(shown); }
showCar();
const mw = { ...WEATHER.clear };
function menu(dt, now) {
  mixWeather({ ...mw }, WEATHER[room ? room.settings.weather : 'clear'] || WEATHER.rain, Math.min(1, dt * 0.8), mw); weather.update(dt, now, mw, view.camera.position, view.night); view.setWeather(mw, weather.flash);
  view.usePersp(); view.look = null;
  const id = room ? room.settings.course : 'taksim'; if (id !== menuId) { menuId = id; menuCourse = new Course(net, COURSES.find((c) => c.id === id)); }
  const want = room ? (room.settings.light === 'night' ? 1 : menuNight) : menuNight; if (Math.abs(view.night - want) > 0.001) view.applyNight(view.night + Math.sign(want - view.night) * Math.min(Math.abs(want - view.night), dt * 0.7));
  shown.visible = screen === 'home' || screen === 'garage';
  if (shown.visible) { const r = net.byId.get('galata'), gi = (r.n >> 1) * 3, p = { x: r.p[gi], y: r.p[gi + 2], z: r.p[gi + 1] }, a = now / 9200; shown.position.set(p.x, p.y + 0.04, p.z); shown.rotation.y = now / 2600; const cx = p.x + Math.sin(a) * 3.1, cz = p.z + Math.cos(a) * 3.1; view.camera.position.set(cx, p.y + 1.25, cz); const off = innerWidth > 900 ? 0.95 : 0; view.camera.lookAt(p.x - Math.cos(a) * off, p.y + 0.3, p.z + Math.sin(a) * off); view.shadowAt(p.x, p.y, p.z, 34); view.post.focus = 3.4; view.post.tilt = view.tiltOn ? 0.8 : 0; if (view.camera.fov !== 46) { view.camera.fov = 46; view.camera.updateProjectionMatrix(); } view.lightCar({ x: p.x, y: p.y, z: p.z, yaw: shown.rotation.y }); } else { const s = (now / 1000) * 9, p = menuCourse.place(s), q = menuCourse.place(s + 26); view.camera.position.lerp({ x: p.x - p.dx * 6, y: Math.max(p.y + 7.5, view.world.height(p.x, p.z) + 6), z: p.z - p.dz * 6 }, Math.min(1, dt * 1.6)); if (view.camera.position.distanceTo({ x: p.x, y: p.y, z: p.z }) > 80) view.camera.position.set(p.x, p.y + 8, p.z); view.camera.lookAt(q.x, q.y + 1, q.z); view.shadowAt(q.x, q.y, q.z, 44); view.post.focus = 22; view.post.tilt = view.tiltOn ? 0.7 : 0; if (view.camera.fov !== 50) { view.camera.fov = 50; view.camera.updateProjectionMatrix(); } view.headlight.intensity = 0; }
}
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop); const dt = Math.min(0.1, Math.max(0.0005, (now - last) / 1000)); last = now;
  if (game.active) {
    shown.visible = false;
    const localRace = host?.room?.race;
    if (localRace?.pausedAt != null) { input.read(); return; }
    game.frame(dt, now - (localRace?.pausedMs || 0));
    game.hints?.update();
    if (game.outing) hud.set('activity', game.outing.update());
    else if (game.msg.endAt && !game.finished) hud.set('activity', `${t('finishWindow')} · ${Math.max(0, Math.ceil((game.msg.endAt - link.hostNow()) / 1000))} s`);
    else hud.set('activity', '');
  } else menu(dt, now);
  { const b = input.touchEl && game.active && $('[data-do=seat]', ui); if (b) b.hidden = !(game.cabin && game.cabin.on && game.trip.mode === 'car'); }
  if (now - (loop.at || 0) > 300) { loop.at = now; const k = game.active ? 1 : A.stream.share, s = k < 0.995 ? `${t('comes')} ${Math.round(k * 100)}%` : ''; if (s !== pill) { pill = s; const e = $('#pill'); e.textContent = s; e.hidden = !s; } }
  fx.update(dt, innerHeight * view.renderer.getPixelRatio(), view.night); view.render(dt, now);
}
const launch = finishStartup();
go('home');
$('#code').value = launch.code;
if (launch.focus) ui.querySelector(launch.focus)?.focus({ preventScroll: true });
requestAnimationFrame(loop);
function followInvite() {
  const match = /^#(p-)?([a-z]{4})$/i.exec(location.hash);
  if (!match || busy) return;
  const code = match[2].toUpperCase();
  if (room?.code === code) return;
  if (link) {
    leave();
    history.replaceState(null, '', match[0]);
  }
  if (match[1]) joinP2p(code); else join(code);
}
addEventListener('hashchange', followInvite);
followInvite();
if (launch.action && !location.hash.match(/^#(p-)?[a-z]{4}$/i)) {
  const button = ui.querySelector(`[data-do="${launch.action}"]`);
  if (button) handleButton(button);
}
window.nanoprix = { view, game, net, stream: A.stream, music, get room() { return room; }, get link() { return link; } };
