// The Cloudflare Worker (cloud/): the room list and the cap on people online
// (its Lobby, see lobby.js). 'self': the game is served by that Worker. Empty:
// the public browser uses the peer directory. `?cloud=<url>` or
// localStorage 'nanoprix.cloud' overrides it for testing.
//
// Connecting players (the WebRTC handshake and the relay for networks that
// block direct connections) uses PeerJS's free public servers, as the game
// always has. CLOUD_SIGNALLING moves that to the Worker too (its broker and
// Cloudflare TURN – set up its TURN keys first, see cloud/README.md);
// `?signal=cloud` / `?signal=peerjs` (kept in localStorage 'nanoprix.signal')
// overrides it for testing.
export const CLOUD_URL = ''; // Optional Worker integration.
export const CLOUD_SIGNALLING = false;
// The room pill's counts (people online, rooms): a file the Lobby rewrites in
// R2 when they change, read through Cloudflare's cache – never through the
// Worker (cloud/README.md). `?online=<url>` overrides it for testing; empty:
// no counts.
export const ONLINE_URL = '';

function override(param, key) {
  let v = '';
  try { v = new URLSearchParams(location.search).get(param) || ''; } catch { /* no location */ }
  try { if (v) localStorage.setItem(key, v); else v = localStorage.getItem(key) || ''; } catch { /* storage unavailable */ }
  return v;
}
// (read as the page loads, before the game tidies the address bar)
const CLOUD = override('cloud', 'nanoprix.cloud') || CLOUD_URL;
const SIGNAL = override('signal', 'nanoprix.signal');
const ONLINE = override('online', 'nanoprix.online') || ONLINE_URL;
export const onlineUrl = () => ONLINE;

export function cloudUrl() {
  return CLOUD === 'self' ? location.origin : CLOUD;
}

// One of the Worker's endpoints ('rooms', 'lobby', ...), below its address –
// which may have a path (https://klic.games/caput).
export function cloudEndpoint(base, name) {
  return new URL(name, base.endsWith('/') ? base : base + '/');
}

// the Worker to connect through, or '' for PeerJS's public servers
export function signallingUrl() {
  return (SIGNAL ? SIGNAL === 'cloud' : CLOUD_SIGNALLING) ? cloudUrl() : '';
}
