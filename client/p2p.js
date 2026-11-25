// Serverless rooms: the player who creates a room runs the authoritative Room
// (the very same code the Node server runs) inside their browser; everyone else
// connects to them directly with WebRTC.
//
//  * Signalling (the WebRTC handshake) goes through the free public PeerJS
//    broker, with PeerJS's STUN and TURN relay servers for networks that
//    block direct connections; after that all traffic is peer-to-peer. Our
//    Cloudflare Worker (cloud/, a PeerJS-compatible broker handing out
//    Cloudflare TURN credentials) can take that over (CLOUD_SIGNALLING in
//    client/cloud.js).
//  * Each guest gets two channels on one connection: PeerJS's reliable,
//    ordered channel for lobby JSON, and our own negotiated unordered,
//    zero-retransmit channel for inputs, snapshots and pings - the same
//    unreliable transport the dedicated server uses, so the prediction /
//    rollback netcode is unchanged.
//  * The host's simulation is clocked from a Web Worker, because page timers
//    are throttled hard in background tabs while worker timers are not.
//  * Who can join a room open to others (the host can change it while it's
//    open): anyone – it's in the public room list (lobby.js); people with its
//    password – listed as locked; or only people with the invite link, which
//    carries a random key – private, never listed (it still counts towards
//    the cap on people online). Guests send the password or key with their
//    connection request and the host lets them in or turns them away before
//    they leave their own warm-up. So does online play being full.

import { Transport } from './net.js';
import { Room, sanitizeProfile, MAX_MEMBERS } from '../shared/room.js';
import { cleanRoomName } from '../shared/names.js';
import { MSG, TICK_RATE, encodePong } from '../shared/protocol.js';
import { signallingUrl, cloudEndpoint } from './cloud.js';
import { PublicListing, readPeerRooms } from './peer-directory.js';
import { LobbyLink } from './lobby.js';

const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
const PEERJS_SRI = 'sha384-x0YgkOr/3UOZP2CRDxGW9e0Q+2Qjyr3uJrm4xU32Y7ZCNAo7Cc7bjhrZMi/dwczu';
const PEER_PREFIX = 'nanoprix-v1-';
const GAME_CHANNEL = { negotiated: true, id: 100, ordered: false, maxRetransmits: 0 };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TICK_MS = 1000 / TICK_RATE;

let peerLib = null;
export function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!peerLib) {
    peerLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.integrity = PEERJS_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS failed to load')));
      s.onerror = () => { peerLib = null; reject(new Error('could not load PeerJS')); };
      document.head.appendChild(s);
    });
  }
  return peerLib;
}

// PeerJS options: its public servers, or our Worker as the broker with its
// STUN/TURN servers
let iceOnce = null;
async function peerOptions() {
  const base = signallingUrl();
  if (!base) return { debug: 0 };
  const u = new URL(base);
  const secure = u.protocol === 'https:';
  const opts = { debug: 0, host: u.hostname, port: Number(u.port) || (secure ? 443 : 80), path: u.pathname.replace(/\/?$/, '/'), secure, key: 'peerjs' };
  if (!iceOnce) {
    iceOnce = fetch(cloudEndpoint(base, 'ice'), { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (Array.isArray(j.iceServers) && j.iceServers.length ? j.iceServers : null))
      .catch(() => null);
  }
  const ice = await iceOnce;
  if (!ice) iceOnce = null; // try again next time
  opts.config = { iceServers: ice || [{ urls: 'stun:stun.cloudflare.com:3478' }] };
  return opts;
}

// A guest's peer id carries the room code, so the broker can route it.
function guestId(code) {
  return `${PEER_PREFIX}${code}-${Math.random().toString(36).slice(2, 10)}`;
}

async function openPeer(Peer, id) {
  const opts = await peerOptions();
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, opts);
    const timer = setTimeout(() => { peer.destroy(); reject(Object.assign(new Error('signalling timeout'), { type: 'timeout' })); }, 12000);
    const failed = (error) => { clearTimeout(timer); peer.destroy(); reject(error); };
    peer.once('error', failed);
    peer.once('open', () => { clearTimeout(timer); peer.off('error', failed); resolve(peer); });
  });
}

const directoryPeer = async (id) => openPeer(await loadPeer(), id);
export const publicPeerRooms = () => readPeerRooms(directoryPeer);

function openGameChannel(pc, onMessage) {
  const dc = pc.createDataChannel('game', GAME_CHANNEL);
  dc.binaryType = 'arraybuffer';
  dc.onmessage = (e) => { if (e.data instanceof ArrayBuffer) onMessage(e.data); };
  return dc;
}

function toView(b) {
  return b instanceof ArrayBuffer ? new DataView(b) : new DataView(b.buffer, b.byteOffset, b.byteLength);
}

// ---------------------------------------------------------------- host

const cleanName = (n) => cleanRoomName(n) || 'Room';
export const cleanPass = (p) => String(p || '').trim().slice(0, 20);
const cleanWho = (w) => (typeof w === 'string' && /^[a-z0-9]{8,24}$/.test(w) ? w : '');
// This browser's random id (kept): what a host's ban goes by – nothing else.
let whoAmI = '';
export function browserId() {
  if (whoAmI) return whoAmI;
  try { whoAmI = cleanWho(localStorage.getItem('nanoprix.who')); } catch { /* storage unavailable */ }
  if (!whoAmI) {
    whoAmI = newKey() + newKey().slice(0, 6);
    try { localStorage.setItem('nanoprix.who', whoAmI); } catch { /* this session only */ }
  }
  return whoAmI;
}
// a private room's key (in its invite link)
function newKey() {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => 'abcdefghijkmnpqrstuvwxyz23456789'[x & 31]).join('');
}

export class HostSession {
  constructor() {
    this.peer = null;
    this.room = null;
    this.code = null;
    this.guests = new Set();
    this.nextId = 2; // 1 is the host's own client
    this.closed = false;
    this.access = 'public'; // who can join: 'public', 'password' or 'private' (invite link only)
    this.pass = '';    // the password, or the private room's key ('' none)
    this.lobby = null; // its place in the room list while it's open
    this.view = null;  // the host's own screen, playing the room's world itself (NetGame)
    this.paused = false; // (developer mode's marking: the room stands still)
    this.local = new LocalNet(this);
    this.net = null; // the road network, for the room's bots
  }

  async start(roomName) {
    this.startLocal(roomName);
    await this.goOnline(roomName);
    return this.code;
  }

  // A room only this tab plays in (solo warm-up): no network at all.
  startLocal(roomName) {
    this.room = new Room('', cleanName(roomName), this.net);
    // someone the host sent out: their connection closes once the news is out
    this.room.onKicked = (client) => setTimeout(() => this.drop(client), 300);
    this.startTicker();
  }

  get online() { return !!this.peer; }

  // Open the room to others, keeping what's on the pitch: it gets a code,
  // becomes reachable through the broker and is listed – unless online play
  // is full, then it stays as it was.
  async goOnline(roomName, access = 'public', pass = '') {
    const lobby = new LobbyLink();
    const listed = await lobby.open();
    if (listed === 'full') {
      lobby.close();
      throw Object.assign(new Error('online play is full'), { type: 'full', cap: lobby.cap });
    }
    let err = null;
    try {
      const Peer = await loadPeer();
      for (let i = 0; i < 5 && !this.peer; i++) {
        let code = '';
        for (let k = 0; k < 4; k++) code += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
        try {
          this.peer = await openPeer(Peer, PEER_PREFIX + code);
          this.code = code;
        } catch (e) {
          err = e;
          if (e.type !== 'unavailable-id') break;
        }
      }
    } catch (e) { err = e; }
    if (!this.peer) { lobby.close(); throw err || new Error('could not open a room'); }
    if (this.closed) { this.peer.destroy(); lobby.close(); throw new Error('Room closed'); }
    this.attachPeer(this.peer);
    this.room.openToFriends(this.code);
    if (roomName) this.room.name = cleanName(roomName);
    this.lobby = lobby;
    this.room.onChange = () => this.announce();
    this.setAccess(access, pass); // (announces the room)
    this.listed = listed; // ('busy': open, but not in the list)
    return this.code;
  }

  // The room's peer on the broker. Cut off from it, nobody can join: off the
  // list until it's back – reconnected, or (PeerJS gave the peer up) a fresh
  // one under the same code, which the room's clock keeps trying (reopen).
  attachPeer(peer) {
    this.peer = peer;
    this.reachable = true;
    peer.on('connection', (conn) => { if (this.peer === peer) this.accept(conn); else conn.close(); });
    peer.on('disconnected', () => {
      if (this.closed || this.peer !== peer) return;
      this.reachable = false; this.announce();
      if (!peer.destroyed) { try { peer.reconnect(); } catch { /* given up meanwhile: reopen */ } }
    });
    peer.on('open', () => { if (this.peer === peer && !this.reachable) { this.reachable = true; this.announce(); } });
    peer.on('close', () => { if (this.peer === peer && this.reachable) { this.reachable = false; this.announce(); } });
    peer.on('error', (e) => console.warn('[host] peer error:', e.type));
  }

  async reopen() {
    this.reopening = true;
    try {
      const peer = await openPeer(await loadPeer(), PEER_PREFIX + this.code);
      if (this.closed || !this.code || !this.peer || !this.peer.destroyed) { peer.destroy(); return; }
      this.attachPeer(peer);
      this.setAccess(this.access, this.pass);
    } catch { /* not yet (the broker may still hold the old one): the clock tries again */ }
    finally { this.reopening = false; }
  }

  // Who can join: anyone ('public'), with the password ('password'), or only
  // with the invite link ('private': its key, kept while the room stays private).
  setAccess(access, pass = '') {
    const was = this.access;
    pass = cleanPass(pass);
    this.access = access === 'unlisted' ? 'unlisted' : access === 'private' || (access === 'password' && pass) ? access : 'public';
    this.pass = this.access === 'password' ? pass : this.access === 'private' ? (was === 'private' && this.pass) || newKey() : '';
    this.publicListing?.close();
    this.publicListing = null;
    this.syncPublicListing();
    this.room.broadcastRoom();
  }

  // the room's line in the room list (sent only when it changed; a private
  // room only counts its people)
  syncPublicListing() {
    const available = this.access === 'public' && this.peer && this.reachable && !this.closed;
    if (!available) { this.publicListing?.close(); this.publicListing = null; }
    else if (!this.publicListing) this.publicListing = new PublicListing(directoryPeer, this.peer, () => this.room.listing());
  }

  announce() {
    const r = this.room;
    if (!this.lobby || !this.code) return;
    this.syncPublicListing(); this.publicListing?.update();
    const hidden = this.access === 'private' || this.access === 'unlisted' || this.reachable === false;
    this.lobby.update({ mode: r.settings.mode, code: this.code, name: hidden ? '' : r.name, players: r.members.size, max: MAX_MEMBERS, locked: this.access === 'password', live: r.phase === 'race', hidden });
  }

  // The tab is closing or being frozen: off the list at once – back on if it returns.
  unlist() {
    this.publicListing?.close(); this.publicListing = null;
    if (this.lobby) this.lobby.close();
    this.lobby = null;
  }
  async relist() {
    if (!this.peer || this.lobby || this.closed) return;
    const lobby = new LobbyLink();
    if ((await lobby.open()) === 'full' || this.closed || !this.peer || this.lobby) { lobby.close(); return; }
    this.lobby = lobby;
    this.announce();
  }

  closeListing() {
    this.publicListing?.close(); this.publicListing = null;
    if (this.lobby) this.lobby.close();
    this.lobby = null;
    if (this.room) this.room.onChange = null;
  }

  // Close the room to others but play on: the guests are sent back to their
  // own warm-up and the room loses its code.
  goOffline() {
    const peer = this.peer;
    if (!peer) return;
    for (const g of [...this.guests]) {
      g.sendText(JSON.stringify({ t: 'error', text: 'The host closed the room' }));
      this.drop(g);
    }
    this.closeListing();
    this.peer = null;
    this.code = null;
    this.access = 'public';
    this.pass = '';
    setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } }, 200);
    this.room.code = '';
    this.room.broadcastRoom();
  }

  // The room's clock: woken once for each tick that's due – the Web Worker
  // waits as long as it's told to (the page can't, in a background tab) –
  // rather than polling, so a phone hosting a room gets to idle between ticks.
  startTicker() {
    this.nextTick = performance.now() + TICK_MS;
    this.lastWatch = performance.now();
    let wake = (ms) => setTimeout(run, ms);
    const run = () => {
      if (this.closed) return;
      const now = performance.now();
      let n = 0;
      const ms = TICK_MS;
      if (this.paused) this.nextTick = now + ms;
      while (now >= this.nextTick && n < 8) {
        this.room.tick();
        this.nextTick += ms; n++;
      }
      if (now - this.nextTick > 250) this.nextTick = now + ms;
      if (now - this.lastWatch > 1000) { this.lastWatch = now; this.dropSilentGuests(now); }
      if (this.lobby) this.lobby.beat();
      this.publicListing?.heartbeat(now);
      // (cut off from the broker – a frozen tab, a network blip – and the one
      // reconnect PeerJS tries didn't take, or it gave the peer up: again every
      // 5 s, until it's back)
      const peer = this.peer;
      if (peer && !this.closed && (peer.disconnected || peer.destroyed) && !this.reopening && now - (this.retryAt || 0) > 5000) {
        this.retryAt = now;
        if (peer.destroyed) this.reopen();
        else { try { peer.reconnect(); } catch { /* given up: reopen next time */ } }
      }
      wake(Math.max(0, this.nextTick - performance.now()));
    };
    try {
      const src = 'onmessage = (e) => setTimeout(() => postMessage(0), e.data);';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      try { this.worker = new Worker(url); }
      finally { URL.revokeObjectURL(url); }
      this.worker.onmessage = run;
      wake = (ms) => this.worker.postMessage(ms);
    } catch { /* no workers: page timers (throttled in a background tab) */ }
    wake(TICK_MS);
  }

  accept(conn) {
    const client = {
      id: this.nextId++, room: null, profile: sanitizeProfile(null), conn, dc: null, lastSeen: performance.now(),
      sendText: (s) => { if (conn.open) { try { conn.send(s); } catch { /* closed */ } } },
      sendBinary: (b) => {
        const dc = client.dc;
        if (dc && dc.readyState === 'open' && dc.bufferedAmount < 256 * 1024) { try { dc.send(b); } catch { /* closed */ } }
      },
    };
    conn.on('open', () => {
      const given = conn.metadata && typeof conn.metadata.pass === 'string' ? cleanPass(conn.metadata.pass) : '';
      client.who = cleanWho(conn.metadata && conn.metadata.who);
      const wrongPass = !!this.pass && given !== this.pass;
      const why = this.closed ? 'Room closed'
        : this.room.refusal(client.who) ? this.room.refusal(client.who)
        : this.room.members.size >= MAX_MEMBERS ? 'Room is full'
        : wrongPass && this.access === 'private' ? 'This room is private – only its invite link gets in'
        : wrongPass ? (given ? 'Wrong password' : 'This room has a password')
        : this.lobby && this.lobby.full ? 'Online play is full right now – try again in a little while' : '';
      if (why) {
        client.sendText(JSON.stringify({ t: 'error', text: why, pass: (wrongPass && this.access === 'password') || undefined }));
        setTimeout(() => conn.close(), 300);
        return;
      }
      this.guests.add(client);
      client.dc = openGameChannel(conn.peerConnection, (ab) => this.binary(client, ab));
      client.sendText(JSON.stringify({ t: 'welcome', id: client.id, p2p: true }));
    });
    conn.on('data', (d) => this.text(client, d));
    conn.on('close', () => this.drop(client));
    conn.on('error', () => this.drop(client));
  }

  // Only who was let in (accept) joins – not someone turned away whose
  // connection is still closing, nor one just sent out.
  admitted(client) {
    if (client === this.local.client) return true;
    return this.guests.has(client) && !this.room.refusal(client.who) && this.room.members.size < MAX_MEMBERS;
  }

  text(client, raw) {
    let msg = raw;
    if (typeof raw === 'string') { try { msg = JSON.parse(raw); } catch { return; } }
    if (!msg || typeof msg.t !== 'string') return;
    try {
      if (msg.t === 'hello' || msg.t === 'profile') {
        client.profile = sanitizeProfile(msg.profile);
        if (!client.room) {
          if (this.admitted(client)) this.room.join(client);
          else if (this.guests.has(client) && this.room.members.size >= MAX_MEMBERS) {
            // (someone else took the last place since they were let in)
            client.sendText(JSON.stringify({ t: 'error', text: 'Room is full' }));
            setTimeout(() => this.drop(client), 300);
          }
          return;
        }
      }
      if (msg.t === 'leave') { client.sendText(JSON.stringify({ t: 'left' })); this.drop(client); return; }
      if (client.room) this.room.handleText(client, msg);
    } catch (e) { console.error('[host] message failed', msg.t, e); }
  }

  binary(client, data) {
    client.lastSeen = performance.now();
    try {
      const dv = toView(data);
      const type = dv.getUint8(0);
      if (type === MSG.PING && dv.byteLength >= 9) {
        client.sendBinary(new Uint8Array(encodePong(dv.getFloat64(1), performance.now())));
      } else if (type === MSG.POSE && client.room) {
        const m = this.room.members.get(client.id);
        if (m) this.room.onPose(m, dv);
      }
    } catch { /* malformed packet */ }
  }

  drop(client) {
    if (!this.guests.has(client) && !client.room) return;
    this.guests.delete(client);
    if (client.room) this.room.leave(client);
    try { if (client.dc) client.dc.close(); } catch { /* ignore */ }
    try { client.conn.close(); } catch { /* ignore */ }
  }

  // a guest whose browser vanished without closing the connection
  dropSilentGuests(now) {
    for (const g of this.guests) if (now - g.lastSeen > 20000) this.drop(g);
  }

  destroy() {
    if (this.closed) return;
    this.closed = true;
    this.closeListing();
    if (this.worker) this.worker.terminate();
    for (const g of [...this.guests]) {
      g.sendText(JSON.stringify({ t: 'error', text: 'The host closed the room' }));
      this.drop(g);
    }
    if (this.peer) setTimeout(() => { try { this.peer.destroy(); } catch { /* ignore */ } }, 200);
  }
}

// The hosting player's own client: an in-memory loopback into the Room.
export class LocalNet extends Transport {
  constructor(host) {
    super('local');
    this.host = host;
    this.client = {
      id: 1, room: null, profile: sanitizeProfile(null), lastSeen: Infinity, direct: true, // (no snapshots: see NetGame)
      sendText: (s) => queueMicrotask(() => { if (this.connected) this.emit('msg', JSON.parse(s)); }),
      sendBinary: (b) => {
        const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
        queueMicrotask(() => { if (this.connected) this.onBinary(ab); });
      },
    };
  }

  connect() {
    this.connected = true;
    queueMicrotask(() => {
      this.emit('msg', { t: 'welcome', id: this.client.id, p2p: true, host: true });
      this.emit('open');
      this.schedulePing(0);
    });
  }

  send(obj) { queueMicrotask(() => this.host.text(this.client, obj)); }

  sendBinary(buf) {
    this.bytesOut += buf.byteLength;
    const ab = buf instanceof ArrayBuffer ? buf.slice(0) : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    queueMicrotask(() => this.host.binary(this.client, ab));
  }

  close() {
    if (!this.connected) return;
    this.connected = false;
    this.stopPing();
    this.host.destroy();
    this.emit('close', { wasOpen: true });
  }
}

// ---------------------------------------------------------------- guest

export class PeerNet extends Transport {
  constructor(code, pass = '') {
    super('webrtc p2p');
    this.code = String(code).toUpperCase();
    this.pass = cleanPass(pass);
    this.done = false;
    this.lastRecv = 0;
  }

  async connect() {
    try {
      const Peer = await loadPeer();
      this.peer = await openPeer(Peer, guestId(this.code));
      const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'raw', metadata: { pass: this.pass || undefined, who: browserId() } });
      this.conn = conn;
      let timer = setTimeout(() => this.fail('Could not reach the host (a strict firewall can block peer-to-peer).', false, true), 20000);
      // connected – but in only once the host lets us in (its welcome);
      // turned away (room full, password, online play full) we stay where we were
      conn.on('open', () => {
        clearTimeout(timer);
        this.dc = openGameChannel(conn.peerConnection, (ab) => this.onBinary(ab));
        timer = setTimeout(() => this.fail('The host did not answer', false, true), 10000);
      });
      const admitted = () => {
        clearTimeout(timer);
        this.connected = true;
        this.lastRecv = performance.now();
        this.emit('open');
        this.schedulePing(0);
        this.watchdog = setInterval(() => {
          if (performance.now() - this.lastRecv > 8000) this.fail('Lost connection to the host');
        }, 1000);
      };
      conn.on('data', (d) => {
        if (typeof d !== 'string') return;
        this.bytesIn += d.length;
        let msg;
        try { msg = JSON.parse(d); } catch { return; }
        if (!this.connected) {
          if (msg.t === 'error') { this.fail(msg.text, msg.pass); return; }
          if (msg.t === 'welcome') admitted();
        }
        this.emit('msg', msg);
      });
      conn.on('close', () => this.closed());
      conn.on('error', () => this.closed());
      this.peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') this.fail('Room not found – is the host still online?', false, true);
        else if (!this.connected) this.fail(`Connection failed (${e.type})`);
      });
    } catch (e) {
      this.fail(`Could not start peer-to-peer (${e.type || e.message})`);
    }
  }

  onBinary(ab) {
    this.lastRecv = performance.now();
    super.onBinary(ab);
  }

  // pass: the host wants (the right) password; gone: the room couldn't be reached
  fail(text, pass = false, gone = false) {
    if (this.done) return;
    this.emit('msg', { t: 'error', text, pass: pass || undefined, code: this.code, unreachable: gone && !this.connected ? this.code : undefined });
    this.closed();
  }

  closed() {
    if (this.done) return;
    this.done = true;
    const wasOpen = this.connected;
    this.connected = false;
    this.stopPing();
    clearInterval(this.watchdog);
    try { if (this.dc) this.dc.close(); } catch { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch { /* ignore */ }
    this.emit('close', { wasOpen });
  }

  send(obj) {
    if (!this.conn || !this.conn.open) return;
    const s = JSON.stringify(obj);
    this.bytesOut += s.length;
    try { this.conn.send(s); } catch { /* closed */ }
  }

  sendBinary(buf) {
    this.bytesOut += buf.byteLength;
    const dc = this.dc;
    if (dc && dc.readyState === 'open' && dc.bufferedAmount < 64 * 1024) { try { dc.send(buf); } catch { /* closed */ } }
  }

  close() {
    try { if (this.conn) this.conn.close(); } catch { /* ignore */ }
    this.closed();
  }
}
