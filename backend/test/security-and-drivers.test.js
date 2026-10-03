const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createSqliteDriver, createPgDriver } = require('../database-drivers');
const { createAdminAuth } = require('../security');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('expired admin sessions stop authorizing requests', () => {
  let now = 1000;
  const password = 'isolated-test-password';
  const auth = createAdminAuth(password, { ttlMs: 10, now: () => now });
  let data, status;
  const res = { json(value) { data = value; return this; }, status(value) { status = value; return this; } };
  auth.login({ body: { password } }, res);
  const req = { headers: { authorization: `Bearer ${data.token}` } };
  let allowed = false;
  auth.requireAdmin(req, res, () => { allowed = true; });
  assert.equal(allowed, true);
  now += 11; allowed = false;
  auth.requireAdmin(req, res, () => { allowed = true; });
  assert.equal(allowed, false);
  assert.equal(status, 401);
});

test('SQLite concurrent reads cannot observe or join a transaction that rolls back', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const db = createSqliteDriver(sqlite);
  await db.exec('CREATE TABLE sample (value TEXT)');
  let inserted, continueTransaction;
  const ready = new Promise(resolve => { inserted = resolve; });
  const release = new Promise(resolve => { continueTransaction = resolve; });
  const transaction = db.transaction(async () => {
    await db.run('INSERT INTO sample VALUES (?)', ['uncommitted']);
    inserted(); await release;
    throw new Error('failure');
  });
  const rejected = assert.rejects(transaction, /failure/);
  await ready;
  let readFinished = false;
  const otherRead = db.all('SELECT * FROM sample').then(rows => { readFinished = true; return rows; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(readFinished, false);
  continueTransaction(); await rejected;
  assert.deepEqual(await otherRead, []);
  sqlite.close();
});

test('PostgreSQL transactions keep all queries on the checked-out connection and release after rollback', async () => {
  const calls = [];
  const client = { async query(sql) { calls.push(sql); return { rows: [{ ok: true }], rowCount: 1 }; }, release() { calls.push('RELEASE'); } };
  const db = createPgDriver({ async connect() { return client; }, query() { throw new Error('Escaped transaction through pool'); } });
  await db.transaction(async () => {
    await db.run('INSERT'); await db.get('SELECT'); await db.all('SELECT ALL');
  });
  assert.deepEqual(calls, ['BEGIN', 'INSERT', 'SELECT', 'SELECT ALL', 'COMMIT', 'RELEASE']);
  calls.length = 0;
  await assert.rejects(db.transaction(async () => { await db.run('INSERT'); throw new Error('failure'); }), /failure/);
  assert.deepEqual(calls, ['BEGIN', 'INSERT', 'ROLLBACK', 'RELEASE']);
});

test('inline browser scripts parse and public build allowlist excludes internal directories', () => {
  const root = path.resolve(__dirname, '../..');
  for (const name of ['index.html', 'admin.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(match => !/application\/ld\+json|\bsrc\s*=/i.test(match[1])).map(match => match[2]);
    assert.doesNotThrow(() => new vm.Script(scripts.join('\n'), { filename: name }));
  }
  const { files, directories } = require('../public-files');
  for (const entry of [...files, ...directories]) {
    assert.ok(!/^(backend|backup|scratch|logs|\.git)/.test(entry));
    assert.ok(!entry.includes('vapid'));
    assert.ok(fs.existsSync(path.join(root, entry)));
  }
});

test('browser session attaches token only to its API and clears it after logout', async () => {
  const requests = [];
  const window = {
    location: { href: 'https://shop.example/admin.html' }, API_BASE: 'https://api.example',
    async fetch(url, options) {
      requests.push({ url, options });
      return { ok: true, status: 200, async json() { return { token: 'test-session-token', expiresAt: Date.now() + 100000 }; } };
    }
  };
  const context = vm.createContext({ window, URL, Headers, Request, Date, document: { getElementById() { return null; } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/admin-auth.js'), 'utf8'), context);
  // The HTML interceptor resolves relative API paths before the shared session wrapper.
  const sessionFetch = window.fetch;
  window.fetch = (url, options) => sessionFetch(url.startsWith('/api/') ? window.API_BASE + url : url, options);
  await window.adminSession.login('password');
  await window.fetch('/api/orders');
  assert.equal(requests.at(-1).options.headers.get('Authorization'), 'Bearer test-session-token');
  await window.fetch('https://other.example/api/orders');
  assert.equal(requests.at(-1).options, undefined);
  await window.adminSession.logout();
  await window.fetch('/api/orders');
  assert.equal(requests.at(-1).options.headers.get('Authorization'), null);
  assert.equal(window.escapeHtml('<img onerror="bad">'), '&lt;img onerror=&quot;bad&quot;&gt;');
});

test('admin order refresh skips hidden tabs, logged-out users, and overlapping requests', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../../admin.html'), 'utf8');
  const code = html.slice(html.indexOf('let ordersLoading = false;'), html.indexOf('function updateOrdersBadge()'));
  let active = true, calls = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const document = { hidden: true };
  const context = vm.createContext({ document, window: { adminSession: { active: () => active } },
    ADMIN_AUTH_HEADER: {}, console,
    async fetch() { calls++; await pending; return { ok: true, async json() { return []; } }; },
    renderAdminOrdersList() {}, updateOrdersBadge() {}
  });
  vm.runInContext(code, context);
  await context.loadOrders(); assert.equal(calls, 0);
  document.hidden = false; active = false;
  await context.loadOrders(); assert.equal(calls, 0);
  active = true;
  const first = context.loadOrders();
  await context.loadOrders(); assert.equal(calls, 1);
  release(); await first;
  await context.loadOrders(); assert.equal(calls, 2);
});

test('admin panel refreshes only on server notices, defers while hidden, and never overlaps', async () => {
  for (const name of ['admin.html', 'index.html']) {
    const html = fs.readFileSync(path.join(__dirname, '../..', name), 'utf8');
    assert.ok(!/setInterval\((loadOrders|loadReservations|pollReservations)/.test(html), name + ' must not poll');
    const code = html.slice(html.indexOf('// ── LIVE ADMIN UPDATES ──'), html.indexOf('let seciliPax'));
    let release, orders = 0, reservations = 0, listener;
    let pending = new Promise(resolve => { release = resolve; });
    const document = { hidden: true, addEventListener(type, fn) { listener = fn; } };
    const sounds = [];
    const context = vm.createContext({ document, window: { adminSound: { play: type => sounds.push(type) } },
      async loadReservations() { reservations++; await pending; },
      async loadOrders() { orders++; } });
    vm.runInContext(code, context);
    context.handleAdminDataChange('reservations');
    assert.equal(reservations, 0, name); // hidden tab: deferred, no request
    document.hidden = false; listener();
    assert.equal(reservations, 1, name);
    context.handleAdminDataChange('reservations'); // arrives while the first load runs
    assert.equal(reservations, 1, name);
    const done = new Promise(resolve => setTimeout(resolve, 0));
    release(); await done; await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(reservations, 2, name); // queued notice is applied once afterwards
    context.handleAdminDataChange('resync');
    assert.equal(orders, 1, name);
    // Every customer notice rings, even from a hidden tab; a reconnect resync stays silent.
    assert.deepEqual(sounds, ['reservations', 'reservations'], name);
  }
});

test('live update listener reports pushed notices and stops on logout', async () => {
  const encoder = new TextEncoder();
  let push, close;
  const body = new ReadableStream({ start(controller) {
    push = text => controller.enqueue(encoder.encode(text));
    close = () => controller.close();
  } });
  const window = {
    location: { href: 'https://shop.example/admin.html' }, API_BASE: '',
    async fetch(url, options) {
      if (url.endsWith('/api/admin/events')) {
        options.signal.addEventListener('abort', () => { try { close(); } catch {} });
        return { ok: true, status: 200, body };
      }
      return { ok: true, status: 200, async json() { return { token: 'a'.repeat(64), expiresAt: Date.now() + 100000 }; } };
    }
  };
  const context = vm.createContext({ window, URL, Headers, Request, Date, AbortController, TextDecoder, setTimeout,
    document: { getElementById() { return null; } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/admin-auth.js'), 'utf8'), context);
  await window.adminSession.login('password');
  const seen = [];
  const listening = window.adminSession.listen(type => seen.push(type));
  push('event: ready\ndata: {}\n\n: ping\n\nevent: orders\ndata: {}\n\nevent: reserv');
  push('ations\ndata: {}\n\n');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(seen, ['orders', 'reservations']);
  await window.adminSession.logout();
  await listening;
  assert.deepEqual(seen, ['orders', 'reservations']);
});

test('category names use the stored English name in English mode', () => {
  for (const name of ['admin.html', 'index.html']) {
    const html = fs.readFileSync(path.join(__dirname, '../..', name), 'utf8');
    const code = html.slice(html.indexOf('// Legacy names from before categories'), html.indexOf('function updateFormCategoryOptions()'));
    const context = vm.createContext({});
    vm.runInContext(code + `
      var categoriesMap = {
        tavuk: { name: 'Tavuk Ürünleri', name_en: 'Chicken Products' },
        yeni: { name: 'Tatlılar', name_en: 'Tatlılar' },
        eski: { name: 'Et Döner', name_en: 'Et Döner' }
      };`, context);
    assert.equal(vm.runInContext("getCategoryTranslatedName('tavuk', 'en')", context), 'Chicken Products', name);
    assert.equal(vm.runInContext("getCategoryTranslatedName('tavuk', 'tr')", context), 'Tavuk Ürünleri', name);
    assert.equal(vm.runInContext("getCategoryTranslatedName('eski', 'en')", context), 'Beef Doner', name);
    assert.equal(vm.runInContext("getCategoryTranslatedName('yeni', 'en')", context), 'Tatlılar', name);
  }
});

test('alert chime plays only after unlock, when enabled, with distinct order and reservation tones', () => {
  const store = new Map();
  const tones = [];
  class FakeAudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    resume() {}
    createOscillator() {
      return { type: '', frequency: { setValueAtTime: hz => tones.push(hz) }, connect: node => node, start() {}, stop() {} };
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: node => node }; }
  }
  const window = { location: { href: 'https://shop.example/admin.html' }, AudioContext: FakeAudioContext, async fetch() {} };
  const localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const context = vm.createContext({ window, localStorage, URL, Headers, Request, Date, document: { getElementById() { return null; } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/admin-auth.js'), 'utf8'), context);
  assert.equal(window.adminSound.play('orders'), false); // not unlocked by a user action yet
  window.adminSound.unlock();
  assert.equal(window.adminSound.play('orders'), true);
  assert.equal(tones.length, 3);
  assert.equal(window.adminSound.play('reservations'), true);
  assert.equal(tones.length, 5);
  window.adminSound.setEnabled(false);
  assert.equal(window.adminSound.play('orders'), false);
  assert.equal(store.get('adminSoundEnabled'), 'off');
});
