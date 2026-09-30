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
