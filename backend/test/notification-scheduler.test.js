const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createSqliteDriver } = require('../database-drivers');
const { createNotificationScheduler } = require('../notification-scheduler');

function clock() {
  let time = Date.parse('2030-01-01T00:00:00Z');
  const timers = new Set();
  return {
    now: () => time,
    timers,
    setTimer(fn, delay) { const timer = { fn, at: time + delay }; timers.add(timer); return timer; },
    clearTimer(timer) { timers.delete(timer); },
    async tick(ms) {
      const until = time + ms;
      for (let i = 0; i < 1000; i++) {
        const next = [...timers].filter(timer => timer.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!next) { time = until; return; }
        timers.delete(next); time = next.at; await next.fn();
      }
      throw new Error('Unexpected recurring timer');
    }
  };
}

function fixture(t, enabled = true) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE notifications (id TEXT PRIMARY KEY, status TEXT, scheduled_at TEXT)');
  const driver = createSqliteDriver(sqlite);
  const calls = [];
  const db = { type: 'sqlite' };
  for (const name of ['all', 'get', 'run']) db[name] = (...args) => { calls.push(name); return driver[name](...args); };
  const timer = clock();
  const sent = [];
  const errors = [];
  const options = { db, enabled, now: timer.now, setTimer: timer.setTimer, clearTimer: timer.clearTimer,
    onError: (...args) => errors.push(args),
    send: async notification => {
      sent.push(notification.id);
      await db.run("UPDATE notifications SET status = 'sent' WHERE id = ?", [notification.id]);
    }
  };
  const scheduler = createNotificationScheduler(options);
  const add = (id, delay) => {
    const scheduled_at = new Date(timer.now() + delay).toISOString();
    sqlite.prepare("INSERT INTO notifications VALUES (?, 'pending', ?)").run(id, scheduled_at);
    return { id, scheduled_at };
  };
  t.after(() => { scheduler.stop(); sqlite.close(); });
  return { sqlite, db, calls, timer, sent, errors, scheduler, add, options };
}

test('empty scheduler makes only one startup read and zero queries over a month idle', async t => {
  const f = fixture(t);
  await f.scheduler.start();
  assert.deepEqual(f.calls, ['all']);
  await f.timer.tick(31 * 86400000);
  assert.deepEqual(f.calls, ['all']);
  assert.equal(f.timer.timers.size, 0);
});

test('without push configuration the scheduler never queries or arms timers', async t => {
  const f = fixture(t, false);
  const job = f.add('disabled', 1000);
  await f.scheduler.start(); f.scheduler.schedule(job);
  await f.timer.tick(86400000);
  assert.deepEqual(f.calls, []);
  assert.equal(f.timer.timers.size, 0);
});

test('new jobs wake at their deadline, send once, then return to zero-query idle', async t => {
  const f = fixture(t);
  await f.scheduler.start();
  f.scheduler.schedule(f.add('future', 3600000));
  await f.timer.tick(3599999);
  assert.deepEqual(f.calls, ['all']);
  await f.timer.tick(1);
  assert.deepEqual(f.sent, ['future']);
  const queries = f.calls.length;
  await f.timer.tick(86400000);
  assert.equal(f.calls.length, queries);
  assert.equal(f.timer.timers.size, 0);
});

test('restart restores overdue and future jobs, including stored timezone offsets', async t => {
  const f = fixture(t);
  f.add('overdue', -60000);
  f.sqlite.prepare('UPDATE notifications SET scheduled_at=? WHERE id=?').run('2030-01-01T02:59:00+03:00', 'overdue');
  f.add('later', 60000);
  await f.scheduler.start();
  await f.timer.tick(0);
  assert.deepEqual(f.sent, ['overdue']);
  await f.timer.tick(60000);
  assert.deepEqual(f.sent, ['overdue', 'later']);
});

test('deleting a scheduled job cancels its timer and avoids a later database wake', async t => {
  const f = fixture(t);
  f.add('cancelled', 1000);
  await f.scheduler.start();
  f.sqlite.prepare('DELETE FROM notifications WHERE id=?').run('cancelled');
  f.scheduler.cancel('cancelled');
  await f.timer.tick(86400000);
  assert.deepEqual(f.calls, ['all']);
  assert.deepEqual(f.sent, []);
});

test('delays exceeding Node timer capacity wait in memory without early sends or reads', async t => {
  const f = fixture(t);
  const delay = 40 * 86400000;
  f.add('long-delay', delay);
  await f.scheduler.start();
  await f.timer.tick(delay - 1);
  assert.deepEqual(f.calls, ['all']);
  assert.deepEqual(f.sent, []);
  await f.timer.tick(1);
  assert.deepEqual(f.sent, ['long-delay']);
});

test('two scheduler instances claim a pending job only once', async t => {
  const f = fixture(t);
  const other = createNotificationScheduler(f.options);
  t.after(() => other.stop());
  f.add('shared', 1000);
  await Promise.all([f.scheduler.start(), other.start()]);
  await f.timer.tick(1000);
  assert.deepEqual(f.sent, ['shared']);
});

test('temporary database failure retries the real job after ten minutes, not every thirty seconds', async t => {
  const f = fixture(t);
  f.add('retry', 1000);
  const get = f.db.get;
  let fail = true;
  f.db.get = (...args) => { if (fail) { fail = false; return Promise.reject(new Error('offline')); } return get(...args); };
  await f.scheduler.start();
  await f.timer.tick(1000);
  assert.equal(f.errors.length, 1);
  const count = f.calls.length;
  await f.timer.tick(599999);
  assert.equal(f.calls.length, count);
  assert.deepEqual(f.sent, []);
  await f.timer.tick(1);
  assert.deepEqual(f.sent, ['retry']);
});
