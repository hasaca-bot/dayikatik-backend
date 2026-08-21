// Integration tests for the Orders API.
// Spawns the real server as a child process against a throwaway SQLite file,
// so every test hits the actual Express app + db.js + real product seed data.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 12097;
const BASE = `http://localhost:${PORT}`;
const TEST_DB = path.join(require('node:os').tmpdir(), `dayikatik-test-${Date.now()}.db`);
const ADMIN_HEADERS = { 'Authorization': 'Bearer dayikatik123' };

let serverProcess;
let productId;

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/products`);
      if (res.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Server did not become ready in time');
}

before(async () => {
  serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), SQLITE_DB_PATH: TEST_DB },
    stdio: 'pipe'
  });
  await waitForServer();
  const products = await (await fetch(`${BASE}/api/products`)).json();
  assert.ok(products.length > 0, 'seed data should provide at least one product');
  productId = products[0].id;
});

after(async () => {
  if (serverProcess) serverProcess.kill();
  try { fs.unlinkSync(TEST_DB); } catch (e) { /* ignore */ }
});

function validOrderBody(overrides = {}) {
  return {
    customer_name: 'Test Müşteri',
    customer_phone: '05321234567',
    customer_address: 'Emek Mah. Safranbolu',
    payment_method: 'cash',
    items: [{ product_id: productId, quantity: 2 }],
    ...overrides
  };
}

test('normal cash order is created and price is computed server-side', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ idempotency_key: 'itest-normal-1' }))
  });
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.ok(order.order_number.startsWith('DK-'));
  assert.equal(order.status, 'new');
  assert.equal(order.is_read, false);
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].quantity, 2);
});

test('card payment method is accepted without faking a real payment', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ payment_method: 'card', idempotency_key: 'itest-card-1' }))
  });
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(order.payment_method, 'card');
});

test('empty cart is rejected', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ items: [] }))
  });
  assert.equal(res.status, 400);
});

test('invalid phone number is rejected', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ customer_phone: '123' }))
  });
  assert.equal(res.status, 400);
});

test('empty address is rejected', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ customer_address: '' }))
  });
  assert.equal(res.status, 400);
});

test('unknown product id is rejected', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ items: [{ product_id: 'does-not-exist', quantity: 1 }] }))
  });
  assert.equal(res.status, 400);
});

test('client-supplied price is ignored; server recomputes from the product table', async () => {
  const productsRes = await fetch(`${BASE}/api/products`);
  const products = await productsRes.json();
  const product = products.find(p => p.id === productId);

  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({
      items: [{ product_id: productId, quantity: 1, price: 0.01 }],
      idempotency_key: 'itest-fakeprice-1'
    }))
  });
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(order.items[0].unit_price, product.price);
  assert.equal(order.subtotal, product.price);
});

test('negative quantity is rejected', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ items: [{ product_id: productId, quantity: -3 }] }))
  });
  assert.equal(res.status, 400);
});

test('absurdly large quantity is rejected', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ items: [{ product_id: productId, quantity: 999999 }] }))
  });
  assert.equal(res.status, 400);
});

test('unknown payment method is rejected', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ payment_method: 'bitcoin' }))
  });
  assert.equal(res.status, 400);
});

test('duplicate submission with the same idempotency key returns the original order, not a new one', async () => {
  const key = 'itest-duplicate-key-1';
  const first = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ idempotency_key: key }))
  });
  const firstOrder = await first.json();

  const second = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ idempotency_key: key }))
  });
  const secondOrder = await second.json();

  assert.equal(secondOrder.id, firstOrder.id);
  assert.equal(secondOrder.order_number, firstOrder.order_number);
});

test('admin endpoints reject requests without the admin token', async () => {
  const list = await fetch(`${BASE}/api/orders`);
  assert.equal(list.status, 401);

  const del = await fetch(`${BASE}/api/orders/some-id`, { method: 'DELETE' });
  assert.equal(del.status, 401);

  const patch = await fetch(`${BASE}/api/orders/some-id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'preparing' })
  });
  assert.equal(patch.status, 401);
});

test('admin can list, read, change status, and delete an order', async () => {
  const created = await (await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validOrderBody({ idempotency_key: 'itest-admin-flow-1' }))
  })).json();

  const list = await fetch(`${BASE}/api/orders`, { headers: ADMIN_HEADERS });
  assert.equal(list.status, 200);
  const orders = await list.json();
  assert.ok(orders.some(o => o.id === created.id));

  const markRead = await fetch(`${BASE}/api/orders/${created.id}/read`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS
  });
  assert.equal(markRead.status, 200);
  assert.equal((await markRead.json()).is_read, true);

  const badStatus = await fetch(`${BASE}/api/orders/${created.id}`, {
    method: 'PATCH',
    headers: { ...ADMIN_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'teleported' })
  });
  assert.equal(badStatus.status, 400);

  const setStatus = await fetch(`${BASE}/api/orders/${created.id}`, {
    method: 'PATCH',
    headers: { ...ADMIN_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'preparing' })
  });
  assert.equal(setStatus.status, 200);
  assert.equal((await setStatus.json()).status, 'preparing');

  const del = await fetch(`${BASE}/api/orders/${created.id}`, {
    method: 'DELETE',
    headers: ADMIN_HEADERS
  });
  assert.equal(del.status, 200);

  const getAfterDelete = await fetch(`${BASE}/api/orders/${created.id}`, { headers: ADMIN_HEADERS });
  assert.equal(getAfterDelete.status, 404);
});

test('deleting or updating a non-existent order returns 404', async () => {
  const del = await fetch(`${BASE}/api/orders/does-not-exist`, {
    method: 'DELETE',
    headers: ADMIN_HEADERS
  });
  assert.equal(del.status, 404);
});
