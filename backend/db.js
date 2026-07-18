// =============================================
// Dayı Katık — Dual Database Layer
// Automatically uses PostgreSQL (cloud) or SQLite (local)
// based on DATABASE_URL environment variable
// =============================================

const path = require('path');
const fs = require('fs');

// ── DATABASE DRIVER SELECTION ──
const DATABASE_URL = process.env.DATABASE_URL;
let dbDriver;

if (DATABASE_URL) {
  // ── POSTGRESQL MODE (Cloud / Production) ──
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  dbDriver = {
    type: 'pg',
    
    query(sql, params = []) {
      return pool.query(sql, params);
    },
    
    async all(sql, params = []) {
      const result = await pool.query(sql, params);
      return result.rows;
    },
    
    async get(sql, params = []) {
      const result = await pool.query(sql, params);
      return result.rows[0] || null;
    },
    
    async run(sql, params = []) {
      const result = await pool.query(sql, params);
      return { changes: result.rowCount };
    },
    
    async exec(sql) {
      await pool.query(sql);
    }
  };

  console.log('[DB] Using PostgreSQL (cloud mode)');
} else {
  // ── SQLITE MODE (Local Development) ──
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(__dirname, 'dayikatik.db');
  const sqliteDb = new DatabaseSync(dbPath);

  dbDriver = {
    type: 'sqlite',
    
    async all(sql, params = []) {
      const pgSql = sqliteToPgRevert(sql);
      const stmt = sqliteDb.prepare(pgSql);
      return stmt.all(...params);
    },
    
    async get(sql, params = []) {
      const pgSql = sqliteToPgRevert(sql);
      const stmt = sqliteDb.prepare(pgSql);
      return stmt.get(...params) || null;
    },
    
    async run(sql, params = []) {
      const pgSql = sqliteToPgRevert(sql);
      const stmt = sqliteDb.prepare(pgSql);
      const result = stmt.run(...params);
      return { changes: result.changes };
    },
    
    async exec(sql) {
      // Convert PG syntax back to SQLite where needed
      const pgSql = sqliteToPgRevert(sql);
      sqliteDb.exec(pgSql);
    }
  };

  // Convert PostgreSQL $1,$2 params back to ? for SQLite
  function sqliteToPgRevert(sql) {
    return sql.replace(/\$(\d+)/g, '?');
  }

  console.log(`[DB] Using SQLite (local mode) at: ${path.join(__dirname, 'dayikatik.db')}`);
}

// ── MIGRATIONS ──
async function runMigrations() {
  console.log('[DB] Running migrations...');

  if (dbDriver.type === 'pg') {
    // PostgreSQL DDL
    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name_tr TEXT NOT NULL,
        name_en TEXT,
        description_tr TEXT,
        description_en TEXT,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        image TEXT,
        portion_tr TEXT,
        portion_en TEXT,
        ingredients_tr TEXT,
        ingredients_en TEXT,
        calories REAL DEFAULT 0,
        protein REAL DEFAULT 0,
        carbs REAL DEFAULT 0,
        fat REAL DEFAULT 0,
        saturated_fat REAL DEFAULT 0,
        sugars REAL DEFAULT 0,
        fiber REAL DEFAULT 0,
        salt REAL DEFAULT 0,
        allergens TEXT,
        katki_maddesi_icermez INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name_tr TEXT NOT NULL,
        name_en TEXT,
        sort_order INTEGER DEFAULT 0,
        icon TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        people INTEGER NOT NULL,
        note TEXT,
        status TEXT DEFAULT 'pending',
        created_at BIGINT,
        updated_at BIGINT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS translations (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        tr TEXT,
        en TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        image TEXT,
        icon TEXT,
        url TEXT,
        target TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        scheduled_at TEXT,
        sent_at TEXT,
        status TEXT DEFAULT 'pending',
        success_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        created_by TEXT,
        priority TEXT DEFAULT 'normal',
        ttl INTEGER DEFAULT 24,
        tag TEXT,
        collapse_key TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        token TEXT NOT NULL UNIQUE,
        device TEXT,
        browser TEXT,
        platform TEXT,
        language TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        enabled INTEGER DEFAULT 1
      );
    `);
  } else {
    // SQLite DDL (same as original)
    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name_tr TEXT NOT NULL,
        name_en TEXT,
        description_tr TEXT,
        description_en TEXT,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        image TEXT,
        portion_tr TEXT,
        portion_en TEXT,
        ingredients_tr TEXT,
        ingredients_en TEXT,
        calories REAL DEFAULT 0,
        protein REAL DEFAULT 0,
        carbs REAL DEFAULT 0,
        fat REAL DEFAULT 0,
        saturated_fat REAL DEFAULT 0,
        sugars REAL DEFAULT 0,
        fiber REAL DEFAULT 0,
        salt REAL DEFAULT 0,
        allergens TEXT,
        katki_maddesi_icermez INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name_tr TEXT NOT NULL,
        name_en TEXT,
        sort_order INTEGER DEFAULT 0,
        icon TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        people INTEGER NOT NULL,
        note TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER,
        updated_at INTEGER
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS translations (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        tr TEXT,
        en TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        image TEXT,
        icon TEXT,
        url TEXT,
        target TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        scheduled_at TEXT,
        sent_at TEXT,
        status TEXT DEFAULT 'pending',
        success_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        created_by TEXT,
        priority TEXT DEFAULT 'normal',
        ttl INTEGER DEFAULT 24,
        tag TEXT,
        collapse_key TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        token TEXT NOT NULL UNIQUE,
        device TEXT,
        browser TEXT,
        platform TEXT,
        language TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
        enabled INTEGER DEFAULT 1
      );
    `);
  }

  console.log('[DB] Migrations completed successfully.');
}

// ── SEEDS ──
async function runSeeds() {
  const { defaultCategoriesMap, defaultItemTranslations, i18nData } = require('./seedData');

  // Check categories
  const catRow = await dbDriver.get(
    dbDriver.type === 'pg' 
      ? 'SELECT COUNT(*)::int as count FROM categories' 
      : 'SELECT COUNT(*) as count FROM categories'
  );
  const categoryCount = catRow ? parseInt(catRow.count) : 0;

  if (categoryCount === 0) {
    console.log('[DB] Seeding categories... (Table is empty)');
    let index = 1;
    for (const [slug, data] of Object.entries(defaultCategoriesMap)) {
      let nameEn = data.name;
      if (slug === 'tavuk') nameEn = 'Chicken Products';
      if (slug === 'et') nameEn = 'Meat Products';
      if (slug === 'tantuni') nameEn = 'Tantuni Products';
      if (slug === 'diger') nameEn = 'Drinks & Sides';

      if (dbDriver.type === 'pg') {
        await dbDriver.run(
          'INSERT INTO categories (id, name_tr, name_en, sort_order, icon) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
          [slug, data.name, nameEn, index++, data.icon]
        );
      } else {
        await dbDriver.run(
          'INSERT OR IGNORE INTO categories (id, name_tr, name_en, sort_order, icon) VALUES (?, ?, ?, ?, ?)',
          [slug, data.name, nameEn, index++, data.icon]
        );
      }
    }
    console.log('[DB] Seeded categories successfully.');
  } else {
    console.log(`[DB] Skipping categories seed. Existing count: ${categoryCount}`);
  }

  // Check translations
  const transRow = await dbDriver.get(
    dbDriver.type === 'pg'
      ? 'SELECT COUNT(*)::int as count FROM translations'
      : 'SELECT COUNT(*) as count FROM translations'
  );
  const transCount = transRow ? parseInt(transRow.count) : 0;

  if (transCount === 0) {
    console.log('[DB] Seeding static UI translations... (Table is empty)');
    let index = 1;
    const trKeys = Object.keys(i18nData.tr);
    for (const key of trKeys) {
      const trVal = i18nData.tr[key];
      const enVal = i18nData.en[key] || trVal;
      if (dbDriver.type === 'pg') {
        await dbDriver.run(
          'INSERT INTO translations (id, key, tr, en) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING',
          [`trans-${index++}`, key, trVal, enVal]
        );
      } else {
        await dbDriver.run(
          'INSERT OR IGNORE INTO translations (id, key, tr, en) VALUES (?, ?, ?, ?)',
          [`trans-${index++}`, key, trVal, enVal]
        );
      }
    }
    console.log(`[DB] Seeded ${trKeys.length} UI translations successfully.`);
  } else {
    console.log(`[DB] Skipping translations seed. Existing count: ${transCount}`);
  }

  // Check products
  const prodRow = await dbDriver.get(
    dbDriver.type === 'pg'
      ? 'SELECT COUNT(*)::int as count FROM products'
      : 'SELECT COUNT(*) as count FROM products'
  );
  const productCount = prodRow ? parseInt(prodRow.count) : 0;

  if (productCount === 0) {
    console.log('[DB] Seeding products... (Table is empty)');

    let menuPath = path.join(__dirname, '..', 'data', 'menu.json');
    if (!fs.existsSync(menuPath)) {
      menuPath = path.join(__dirname, '..', 'data', 'menu_default.json');
    }

    if (fs.existsSync(menuPath)) {
      try {
        const menuData = JSON.parse(fs.readFileSync(menuPath, 'utf8'));

        for (const item of menuData) {
          const translation = defaultItemTranslations[item.id] || {};

          const nameTr = item.name || '';
          const nameEn = item.name_en || translation.name || nameTr;
          const descTr = item.description || '';
          const descEn = item.description_en || translation.description || descTr;
          const portionTr = (item.besin_degerleri && item.besin_degerleri.porsiyon) || '1 Porsiyon';
          const portionEn = item.portion_en || translation.portion || portionTr.replace('Menü', 'Menu').replace('Porsiyon', 'Portion');
          const ingTr = item.icindekiler || '';
          const ingEn = item.ingredients_en || translation.ingredients || ingTr;
          const cal = (item.besin_degerleri && item.besin_degerleri.enerji) !== undefined ? item.besin_degerleri.enerji : null;
          const prot = (item.besin_degerleri && item.besin_degerleri.protein) !== undefined ? item.besin_degerleri.protein : null;
          const carb = (item.besin_degerleri && item.besin_degerleri.karbonhidrat) !== undefined ? item.besin_degerleri.karbonhidrat : null;
          const fat = (item.besin_degerleri && item.besin_degerleri.yag) !== undefined ? item.besin_degerleri.yag : null;
          const sfat = (item.besin_degerleri && item.besin_degerleri.doymus_yag) || 0;
          const sugar = (item.besin_degerleri && item.besin_degerleri.sekerler) || 0;
          const fiber = (item.besin_degerleri && item.besin_degerleri.lif) || 0;
          const salt = (item.besin_degerleri && item.besin_degerleri.tuz) || 0;
          const allergensStr = JSON.stringify(item.alerjenler || []);
          const noAdditives = item.katki_maddesi_icermez ? 1 : 0;

          if (dbDriver.type === 'pg') {
            await dbDriver.run(`
              INSERT INTO products (
                id, name_tr, name_en, description_tr, description_en, category, price, image,
                portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
                saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
              ON CONFLICT (id) DO NOTHING
            `, [item.id, nameTr, nameEn, descTr, descEn, item.category, item.price, item.image,
                portionTr, portionEn, ingTr, ingEn, cal, prot, carb, fat, sfat, sugar, fiber, salt,
                allergensStr, noAdditives]);
          } else {
            await dbDriver.run(`
              INSERT OR IGNORE INTO products (
                id, name_tr, name_en, description_tr, description_en, category, price, image,
                portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
                saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [item.id, nameTr, nameEn, descTr, descEn, item.category, item.price, item.image,
                portionTr, portionEn, ingTr, ingEn, cal, prot, carb, fat, sfat, sugar, fiber, salt,
                allergensStr, noAdditives]);
          }
        }
        console.log(`[DB] Seeded ${menuData.length} products successfully.`);
      } catch (err) {
        console.error('[DB ERROR] Failed to seed products:', err);
      }
    } else {
      console.warn('[DB] No menu.json or menu_default.json found for seeding products.');
    }
  } else {
    console.log(`[DB] Skipping products seed. Existing count: ${productCount}`);
  }
}

// ── RESET DATABASE ──
async function resetDatabase() {
  console.log('[DB] Resetting database to default...');
  await dbDriver.exec('DELETE FROM products');
  await dbDriver.exec('DELETE FROM categories');
  await dbDriver.exec('DELETE FROM translations');
  await runSeeds();
  console.log('[DB] Database successfully reset and seeded.');
}

// ── INIT (async) ──
async function initDatabase() {
  await runMigrations();
  await runSeeds();
}

module.exports = { db: dbDriver, initDatabase, resetDatabase };
