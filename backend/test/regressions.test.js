const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const webpush = require('web-push');
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dayikatik-regression-'));
const dbPath = path.join(temp, 'test.db');
const base = 'http://127.0.0.1:12109';
const password = '482619'; // Test-only password at the six-character minimum.
const vapid = webpush.generateVAPIDKeys();
let child, headers, sql;
async function start(overrides = {}) {
  child = spawn(process.execPath, [path.join(root, 'backend/server.js')], {
    env: { ...process.env, PORT: '12109', DATABASE_URL: '', SQLITE_DB_PATH: dbPath,
      NODE_ENV: 'production', ADMIN_PASSWORD: password, TRUST_PROXY: 'loopback',
      VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey,
      ...overrides }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try { if ((await fetch(base + '/api/products')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server did not start: ' + output);
}
async function stop() {
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
}
async function call(url, method = 'GET', body, extraHeaders = {}) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
async function login() {
  const res = await call('/api/auth/login', 'POST', { password });
  assert.equal(res.status, 200);
  headers = { Authorization: `Bearer ${res.data.token}` };
}
before(async () => { await start(); await login(); sql = new DatabaseSync(dbPath); });
after(async () => {
  if (sql) sql.close();
  await stop();
  if (path.dirname(temp) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('dayikatik-regression-')) throw new Error('Unsafe temporary path');
  fs.rmSync(temp, { recursive: true, force: true });
});

test('public catalog works; all management paths reject unauthenticated writes and reads', async () => {
  for (const route of ['/api/products', '/api/categories', '/api/translations']) assert.equal((await call(route)).status, 200);
  const protectedRoutes = [
    ['POST', '/api/products'], ['PUT', '/api/products/x'], ['DELETE', '/api/products/x'], ['POST', '/api/products/reset'],
    ['POST', '/api/categories'], ['PUT', '/api/categories/x'], ['DELETE', '/api/categories/x'],
    ['GET', '/api/reservations'], ['PUT', '/api/reservations/x'], ['DELETE', '/api/reservations/x'],
    ['POST', '/api/translations'], ['POST', '/api/save-menu'], ['GET', '/api/orders'],
    ['GET', '/api/orders/x'], ['PATCH', '/api/orders/x'], ['PATCH', '/api/orders/x/read'], ['DELETE', '/api/orders/x'],
    ['GET', '/api/subscriptions'], ['DELETE', '/api/subscriptions/x'], ['GET', '/api/notifications'],
    ['POST', '/api/notifications/send'], ['POST', '/api/notifications/schedule'], ['POST', '/api/notifications/test'],
    ['POST', '/api/notifications/upload-image'], ['DELETE', '/api/notifications/x']
  ];
  for (const [method, route] of protectedRoutes) {
    const res = await call(route, method, method === 'GET' ? undefined : {});
    assert.equal(res.status, 401, `${method} ${route}`);
  }
  assert.equal((await call('/api/orders', 'GET', undefined, { Authorization: 'Bearer dayikatik123' })).status, 401);
  assert.equal((await call('/api/orders', 'GET', undefined, headers)).status, 200);
});

test('wrong passwords fail; logout revokes the session token', async () => {
  assert.equal((await call('/api/auth/login', 'POST', { password: 'wrong' })).status, 401);
  const previous = headers;
  assert.equal((await call('/api/auth/logout', 'POST', undefined, headers)).status, 204);
  assert.equal((await call('/api/auth/session', 'GET', undefined, previous)).status, 401);
  await login();
});

test('private files and directory traversal are not published', async () => {
  for (const route of ['/backend/server.js', '/backend/dayikatik.db', '/backend/.private/vapid.json',
    '/data/vapid.json', '/.git/config', '/.env', '/backup_before_push_notifications/index.html',
    '/images/%2e%2e%2fbackend%2fserver.js', '/logs/changelog.md']) {
    const result = await call(route);
    assert.ok([403, 404].includes(result.status), `${route}: ${result.status}`);
  }
  for (const route of ['/', '/admin.html', '/assets/admin-auth.js', '/manifest.json', '/data/menu.json']) {
    assert.equal((await call(route)).status, 200, route);
  }
  for (const route of ['/', '/admin.html']) {
    const page = (await call(route)).data;
    assert.ok(!page.includes('dayikatik123'));
    assert.ok(!page.includes('api.telegram.org/bot'));
    assert.ok(page.includes('/assets/admin-auth.js'));
  }
});

test('authenticated product create and update preserve images and reject invalid data', async () => {
  const body = { id: 'regression-product', name: 'Test Product', category: 'diger', price: 125, image: '/images/products/test.webp' };
  const created = await call('/api/products', 'POST', body, headers);
  assert.equal(created.status, 201);
  assert.equal(created.data.image, body.image);
  const changed = await call('/api/products/' + body.id, 'PUT', { ...body, price: 135, image: 'https://example.com/test.png' }, headers);
  assert.equal(changed.status, 200);
  assert.equal(changed.data.price, 135);
  assert.equal(changed.data.image, 'https://example.com/test.png');
  assert.equal((await call('/api/products', 'POST', { ...body, id: 'bad-image', image: {} }, headers)).status, 400);
  assert.equal((await call('/api/products', 'POST', { ...body, id: 'bad-price', price: -1 }, headers)).status, 400);
});

test('reservations are public to create but private to read and manage', async () => {
  const saved = await call('/api/reservations', 'POST', {
    id: "untrusted');alert(1);//", name: 'Synthetic Customer', phone: '05320000000', date: '1 Ekim 2026', time: '12:00', pax: 2, read: true
  });
  assert.equal(saved.status, 201);
  assert.match(saved.data.id, /^rez-[a-f0-9-]+$/);
  assert.equal(saved.data.read, false);
  const listed = await call('/api/reservations', 'GET', undefined, headers);
  assert.ok(listed.data.some(item => item.id === saved.data.id));
  assert.equal((await call('/api/reservations/' + saved.data.id, 'PUT', { read: true }, headers)).status, 200);
  assert.equal((await call('/api/reservations/' + saved.data.id, 'DELETE', undefined, headers)).status, 200);
});

test('PATCH preflight permits order updates from approved frontend and rejects arbitrary tenants', async () => {
  const requestHeaders = { Origin: 'https://dayikatik.netlify.app', 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization,content-type' };
  const res = await call('/api/orders/example', 'OPTIONS', undefined, requestHeaders);
  assert.equal(res.status, 204);
  assert.ok(res.headers.get('access-control-allow-methods').split(',').includes('PATCH'));
  assert.equal((await call('/api/orders/example', 'OPTIONS', undefined, { ...requestHeaders, Origin: 'https://untrusted-tenant.netlify.app' })).status, 403);
});

function order(items, key) {
  return { customer_name: 'Test Customer', customer_phone: '05320000000', customer_address: 'Synthetic address',
    payment_method: 'cash', items, idempotency_key: key };
}
test('failed second item rolls back everything; retry and concurrent retries create one complete order', async () => {
  const products = (await call('/api/products')).data.slice(0, 2);
  const items = products.map(product => ({ product_id: product.id, quantity: 1 }));
  const key = 'regression-atomic';
  const escapedId = products[1].id.replaceAll("'", "''");
  sql.exec(`CREATE TRIGGER fail_item BEFORE INSERT ON order_items WHEN NEW.product_id = '${escapedId}' BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`);
  const failed = await call('/api/orders', 'POST', order(items, key));
  assert.equal(failed.status, 500);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM orders WHERE idempotency_key=?').get(key).n, 0);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM order_items').get().n, 0);
  sql.exec('DROP TRIGGER fail_item');
  const retries = await Promise.all(Array.from({ length: 4 }, () => call('/api/orders', 'POST', order(items, key))));
  assert.equal(retries.filter(result => result.status === 201).length, 1);
  assert.equal(new Set(retries.map(result => result.data.id)).size, 1);
  for (const result of retries) {
    assert.ok([200, 201].includes(result.status));
    assert.equal(result.data.items.length, 2);
    assert.equal(result.data.total, products[0].price + products[1].price);
  }
});

test('rate limits separate endpoints and clients behind a trusted proxy', async () => {
  const first = { 'X-Forwarded-For': '198.51.100.21' };
  const second = { 'X-Forwarded-For': '198.51.100.22' };
  for (let i = 0; i < 31; i++) assert.equal((await call('/api/notifications/click', 'POST', { id: 'none' }, first)).status, 200);
  assert.equal((await call('/api/orders', 'POST', {}, first)).status, 400);
  for (let i = 1; i < 30; i++) await call('/api/orders', 'POST', {}, first);
  assert.equal((await call('/api/orders', 'POST', {}, first)).status, 429);
  assert.equal((await call('/api/orders', 'POST', {}, second)).status, 400);
});

test('restart preserves edited prices and deletions, even an intentionally empty catalog', async () => {
  const products = (await call('/api/products')).data;
  const deletedId = products.find(product => product.id !== 'tavuklu-pilav').id;
  assert.equal((await call('/api/products/' + deletedId, 'DELETE', undefined, headers)).status, 200);
  const pilav = products.find(product => product.id === 'tavuklu-pilav');
  assert.equal((await call('/api/products/tavuklu-pilav', 'PUT', { ...pilav, price: 275 }, headers)).status, 200);
  await stop(); await start(); await login();
  const restarted = (await call('/api/products')).data;
  assert.ok(!restarted.some(product => product.id === deletedId));
  assert.equal(restarted.find(product => product.id === 'tavuklu-pilav').price, 275);
  sql.exec('DELETE FROM products');
  await stop(); await start(); await login();
  assert.deepEqual((await call('/api/products')).data, []);
  assert.equal((await call('/api/products/reset', 'POST', {}, headers)).status, 200);
  assert.ok((await call('/api/products')).data.length > 0);
});

test('production without configured secrets fails closed while public catalog stays available', async () => {
  await stop(); await start({ ADMIN_PASSWORD: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' });
  assert.equal((await call('/api/auth/login', 'POST', { password })).status, 503);
  assert.equal((await call('/api/orders', 'GET', undefined, headers)).status, 401);
  assert.equal((await call('/api/products')).status, 200);
  assert.equal((await call('/api/notifications/vapid-public-key')).status, 503);
});
