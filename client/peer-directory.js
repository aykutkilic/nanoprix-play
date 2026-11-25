// Static hosting has no shared database. One opt-in host holds this broker ID.
// Other hosts keep their listing alive with a connection and re-elect on loss.
const DIRECTORY = 'nanoprix-public-rooms-v1';
const ROOM = /^nanoprix-v1-([A-Z]{4})$/;
// PeerServer queues an offer to an absent peer for five seconds before its
// periodic cleanup reports it missing. Allow that reply and signaling latency.
const WAIT = 15000;

function serve(peer) {
  const listings = new Map();
  peer.on('connection', (channel) => {
    const code = ROOM.exec(channel.peer)?.[1];
    channel.on('data', (message) => {
      if (message?.type === 'list') {
        for (const [id, entry] of listings) if (Date.now() - entry.at > 45000) listings.delete(id);
        channel.send({ rooms: Array.from(listings.values(), (entry) => entry.row) });
        return;
      }
      if (!code || message?.type !== 'publish') return;
      const { name, mode, players, max, live } = message;
      if (typeof name !== 'string' || !Number.isInteger(players) || players < 1 || players > 8 || max !== 8) return;
      listings.set(code, { channel, at: Date.now(), row: { code, name: name.slice(0, 32), mode: mode === 'cruise' ? mode : 'race', players, max, live: !!live } });
    });
    const remove = () => { if (listings.get(code)?.channel === channel) listings.delete(code); };
    channel.on('close', remove);
    channel.on('error', remove);
  });
}

export class PublicListing {
  constructor(makePeer, hostPeer, describe) {
    Object.assign(this, { makePeer, hostPeer, describe });
    this.connect();
  }

  async connect() {
    try {
      const directory = await this.makePeer(DIRECTORY);
      if (this.closed) { directory.destroy(); return; }
      this.directory = directory;
      serve(directory);
      directory.on('disconnected', () => directory.destroy());
    } catch (e) {
      if (e.type !== 'unavailable-id') { this.retry(); return; }
    }
    if (this.closed) return;
    try {
      const channel = this.hostPeer.connect(DIRECTORY, { reliable: true });
      this.channel = channel;
      this.timer = setTimeout(() => this.retry(), WAIT);
      channel.on('open', () => {
        if (this.channel !== channel) return;
        clearTimeout(this.timer);
        this.update();
      });
      const lost = () => { if (this.channel === channel) this.retry(); };
      channel.on('close', lost);
      channel.on('error', lost);
    } catch { this.retry(); }
  }

  update() {
    if (!this.channel?.open) return;
    try {
      this.channel.send({ type: 'publish', ...this.describe() });
      this.lastSent = performance.now();
    } catch { this.retry(); }
  }

  heartbeat(now) { if (now - this.lastSent >= 15000) this.update(); }

  disconnect() {
    clearTimeout(this.timer);
    const channel = this.channel;
    this.channel = null;
    channel?.close();
    this.directory?.destroy();
    this.directory = null;
  }

  retry() {
    this.disconnect();
    if (!this.closed) this.timer = setTimeout(() => this.connect(), 1500 + Math.random() * 1500);
  }

  close() { this.closed = true; this.disconnect(); }
}

export async function readPeerRooms(makePeer) {
  const peer = await makePeer();
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Directory timeout')), WAIT);
      const done = (fn, value) => { clearTimeout(timer); fn(value); };
      peer.on('error', (e) => e.type === 'peer-unavailable' ? done(resolve, []) : done(reject, e));
      const channel = peer.connect(DIRECTORY, { reliable: true });
      channel.on('open', () => channel.send({ type: 'list' }));
      channel.on('data', (m) => {
        if (Array.isArray(m?.rooms)) done(resolve, m.rooms.filter((r) => /^[A-Z]{4}$/.test(r?.code) && Number.isInteger(r.players) && r.max === 8));
      });
      channel.on('error', (e) => done(reject, e));
    });
  } finally { peer.destroy(); }
}
