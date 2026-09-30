const { AsyncLocalStorage } = require('node:async_hooks');

function createPgDriver(pool) {
  const context = new AsyncLocalStorage();
  const query = (sql, params = []) => (context.getStore() || pool).query(sql, params);
  const driver = {
    type: 'pg', query,
    async all(sql, params) { return (await query(sql, params)).rows; },
    async get(sql, params) { return (await query(sql, params)).rows[0] || null; },
    async run(sql, params) { return { changes: (await query(sql, params)).rowCount }; },
    async exec(sql) { await query(sql); },
    async transaction(work) {
      if (context.getStore()) throw new Error('Nested transactions are not supported');
      const client = await pool.connect();
      let releaseError;
      try {
        await client.query('BEGIN');
        const result = await context.run(client, () => work(driver));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; }
        throw error;
      } finally { client.release(releaseError); }
    }
  };
  return driver;
}

function createSqliteDriver(sqlite) {
  const context = new AsyncLocalStorage();
  let queue = Promise.resolve();
  const exclusive = (work) => {
    if (context.getStore()) return Promise.resolve().then(work);
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  const convert = sql => sql.replace(/\$(\d+)/g, '?');
  const driver = {
    type: 'sqlite',
    all(sql, params = []) { return exclusive(() => sqlite.prepare(convert(sql)).all(...params)); },
    get(sql, params = []) { return exclusive(() => sqlite.prepare(convert(sql)).get(...params) || null); },
    run(sql, params = []) { return exclusive(() => ({ changes: sqlite.prepare(convert(sql)).run(...params).changes })); },
    exec(sql) { return exclusive(() => sqlite.exec(convert(sql))); },
    transaction(work) {
      if (context.getStore()) return Promise.reject(new Error('Nested transactions are not supported'));
      return exclusive(() => context.run(true, async () => {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const result = await work(driver);
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      }));
    }
  };
  return driver;
}

module.exports = { createPgDriver, createSqliteDriver };
