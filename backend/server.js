const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { db, initDatabase, resetDatabase } = require('./db');
const webpush = require('web-push');
const { randomUUID, randomBytes } = require('node:crypto');
const { rateLimiter, createAdminAuth } = require('./security');
const { createNotificationScheduler } = require('./notification-scheduler');

// Never load the compromised, formerly public data/vapid.json key pair.
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
if (!VAPID_PUBLIC_KEY && !VAPID_PRIVATE_KEY && !process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
  const privateDir = path.join(__dirname, '.private');
  const vapidPath = path.join(privateDir, 'vapid.json');
  fs.mkdirSync(privateDir, { recursive: true });
  const keys = fs.existsSync(vapidPath)
    ? JSON.parse(fs.readFileSync(vapidPath, 'utf8')) : webpush.generateVAPIDKeys();
  fs.writeFileSync(vapidPath, JSON.stringify(keys), { mode: 0o600 });
  VAPID_PUBLIC_KEY = keys.publicKey;
  VAPID_PRIVATE_KEY = keys.privateKey;
}
if (!!VAPID_PUBLIC_KEY !== !!VAPID_PRIVATE_KEY) throw new Error('Both VAPID keys must be configured together');
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:support@dayikatik.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('[SERVER] Push disabled until new VAPID keys are configured.');
}

const app = express();
const PORT = process.env.PORT || 12000;
// Trust only explicitly configured proxy addresses/subnets, never arbitrary forwarded headers.
app.set('trust proxy', process.env.TRUST_PROXY ? process.env.TRUST_PROXY.split(',').map(s => s.trim()).filter(Boolean) : false);
const auth = createAdminAuth(process.env.ADMIN_PASSWORD);
const adminAuth = auth.requireAdmin;

// The site is served by this same Render service (dayikatik.com), so browsers call the API same-origin;
// only the known production hosts and local development need CORS.
const allowedOrigins = [
  'https://dayikatik.onrender.com',
  'https://dayikatik-claf.onrender.com',
  'https://dayikatik.com',
  'https://www.dayikatik.com',
  'http://localhost:12000',
  'http://127.0.0.1:12000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  ...(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
    if (isAllowed) {
      callback(null, true);
    } else {
      const error = new Error('Not allowed by CORS');
      error.status = 403;
      callback(error);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
// Only authenticated routes that carry base64 images may send large bodies; they are parsed after the auth gate.
const LARGE_BODY_ROUTE = /^\/api\/(products|notifications\/(upload-image|send|schedule))(\/|$)/i;
const smallJson = express.json({ limit: '100kb' });
app.use((req, res, next) => LARGE_BODY_ROUTE.test(req.path) ? next() : smallJson(req, res, next));

// Cache-control middleware to prevent caching of dynamic and static data
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.post('/api/auth/login', rateLimiter(5), auth.login);
app.post('/api/auth/logout', auth.logout);
app.get('/api/auth/session', adminAuth, (req, res) => res.json({ authenticated: true }));

// ==========================================
// LIVE ADMIN EVENTS (Server-Sent Events)
// ==========================================
// Open admin panels keep one idle HTTP stream. When a customer submits an order or
// reservation the server pushes a one-line notice and the panel fetches once, so nothing
// polls the database while the panel sits open. The stream itself never touches the DB.
const adminEventClients = new Set();
const MAX_ADMIN_EVENT_CLIENTS = 50;
function notifyAdmins(type) {
  for (const client of adminEventClients) client.write(`event: ${type}\ndata: {}\n\n`);
}
const adminEventHeartbeat = setInterval(() => {
  // Comment lines keep proxies from closing an idle stream.
  for (const client of adminEventClients) client.write(': ping\n\n');
}, 25000);
adminEventHeartbeat.unref();
app.get('/api/admin/events', adminAuth, (req, res) => {
  if (adminEventClients.size >= MAX_ADMIN_EVENT_CLIENTS) return res.status(503).json({ error: 'Too many live connections' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('event: ready\ndata: {}\n\n');
  adminEventClients.add(res);
  req.on('close', () => adminEventClients.delete(res));
});

// Public routes are explicitly enumerated; all other API routes require a session.
const publicRoutes = new Set([
  'GET /products', 'GET /categories', 'GET /translations', 'GET /notifications/vapid-public-key',
  'POST /orders', 'POST /reservations', 'POST /subscriptions', 'POST /notifications/click'
]);
app.use('/api', (req, res, next) => {
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const route = req.path.toLowerCase().replace(/\/+$/, '') || '/';
  if (publicRoutes.has(`${method} ${route}`)) return next();
  return adminAuth(req, res, next);
});
const largeJson = express.json({ limit: '10mb' });
app.use((req, res, next) => LARGE_BODY_ROUTE.test(req.path) ? largeJson(req, res, next) : next());

// Helper to build parameterized queries for both PG ($1) and SQLite (?)
const isPg = !!process.env.DATABASE_URL;
function p(n) {
  // Returns $n for PostgreSQL or ? for SQLite
  return isPg ? `$${n}` : '?';
}
function params(...args) {
  return args;
}

// Allergen standard dictionary and normalization
const ALLERGEN_DICTIONARY = {
  gluten: { id: 'gluten', name: 'Gluten içerir', name_en: 'Contains gluten', short_name: 'Gluten', short_name_en: 'Gluten' },
  sut: { id: 'sut', name: 'Süt ve süt ürünleri içerir', name_en: 'Contains milk & dairy products', short_name: 'Süt', short_name_en: 'Dairy' },
  soya: { id: 'soya', name: 'Soya içerebilir', name_en: 'May contain soy', short_name: 'Soya', short_name_en: 'Soy' },
  yumurta: { id: 'yumurta', name: 'Yumurta içerebilir', name_en: 'May contain egg', short_name: 'Yumurta', short_name_en: 'Egg' },
  hardal: { id: 'hardal', name: 'Hardal içerebilir', name_en: 'May contain mustard', short_name: 'Hardal', short_name_en: 'Mustard' },
  kereviz: { id: 'kereviz', name: 'Kereviz içerebilir', name_en: 'May contain celery', short_name: 'Kereviz', short_name_en: 'Celery' },
  susam: { id: 'susam', name: 'Susam içerebilir', name_en: 'May contain sesame', short_name: 'Susam', short_name_en: 'Sesame' }
};

function normalizeAllergens(allergens) {
  if (!Array.isArray(allergens)) return [];
  return allergens
    .filter(a => a && (typeof a === 'string' ? a.trim().length > 0 : (a.id || a.name)))
    .map(a => {
      let id = '';
      let rawName = '';
      if (typeof a === 'string') {
        id = a.toLowerCase().trim();
      } else if (a && typeof a === 'object') {
        id = (a.id || '').toLowerCase().trim();
        rawName = a.name || '';
      }

      if (!id && rawName) {
        const lower = rawName.toLowerCase();
        if (lower.includes('gluten')) id = 'gluten';
        else if (lower.includes('süt') || lower.includes('dairy') || lower.includes('milk')) id = 'sut';
        else if (lower.includes('soya') || lower.includes('soy')) id = 'soya';
        else if (lower.includes('yumurta') || lower.includes('egg')) id = 'yumurta';
        else if (lower.includes('hardal') || lower.includes('mustard')) id = 'hardal';
        else if (lower.includes('kereviz') || lower.includes('celery')) id = 'kereviz';
        else if (lower.includes('susam') || lower.includes('sesame')) id = 'susam';
      }

      const def = ALLERGEN_DICTIONARY[id];
      return {
        id: id || 'diger',
        name: (def && def.name) || rawName || id,
        name_en: (def && def.name_en) || rawName || id,
        short_name: (def && def.short_name) || rawName || id,
        short_name_en: (def && def.short_name_en) || rawName || id
      };
    });
}

// SQLite CURRENT_TIMESTAMP is UTC without a zone marker; browsers would parse it as local time.
function toIsoTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return value.replace(' ', 'T') + 'Z';
  return value;
}

// Helper: Map DB Product Row to JSON format expected by UI
function mapProductRow(row) {
  const totalMacros = (row.protein || 0) + (row.carbs || 0) + (row.fat || 0);
  const proteinPct = totalMacros > 0 ? Math.round(((row.protein || 0) / totalMacros) * 100) : 0;
  const carbsPct = totalMacros > 0 ? Math.round(((row.carbs || 0) / totalMacros) * 100) : 0;
  const fatPct = totalMacros > 0 ? Math.max(0, 100 - proteinPct - carbsPct) : 0;

  let allergens = [];
  try {
    allergens = JSON.parse(row.allergens || '[]');
  } catch (e) {
    console.error(`[SERVER] Error parsing allergens for product ${row.id}:`, e);
  }
  const normalizedAllergens = normalizeAllergens(allergens);

  const image = row.image || '';
  let thumb = image;
  if (image.startsWith('/images/products/')) {
    const filename = image.replace('/images/products/', '');
    const baseId = filename.replace(/\.(jpeg|jpg|png|webp)$/i, '');
    thumb = `/images/products/thumbs/${baseId}.webp`;
  }

  return {
    id: row.id,
    name: row.name_tr,
    name_en: row.name_en,
    category: row.category,
    price: row.price,
    description: row.description_tr,
    description_en: row.description_en,
    image: image,
    thumb: thumb,
    besin_degerleri: {
      porsiyon: row.portion_tr,
      enerji: row.calories,
      yag: row.fat,
      doymus_yag: row.saturated_fat,
      karbonhidrat: row.carbs,
      sekerler: row.sugars,
      lif: row.fiber,
      protein: row.protein,
      tuz: row.salt
    },
    makrolar: {
      protein: { deger: row.protein, yuzde: proteinPct },
      karbonhidrat: { deger: row.carbs, yuzde: carbsPct },
      yag: { deger: row.fat, yuzde: fatPct }
    },
    alerjenler: normalizedAllergens,
    allergens: normalizedAllergens,
    icindekiler: row.ingredients_tr,
    ingredients_en: row.ingredients_en,
    portion_en: row.portion_en,
    katki_maddesi_icermez: row.katki_maddesi_icermez === 1
  };
}

// ==========================================
// PRODUCTS API
// ==========================================

// GET /api/products
app.get('/api/products', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM products ORDER BY created_at ASC');
    const products = rows.map(mapProductRow);
    res.json(products);
  } catch (err) {
    console.error('[API ERROR] GET /api/products:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/reset
app.post('/api/products/reset', async (req, res) => {
  try {
    await resetDatabase();
    res.json({ success: true, message: 'Database reset successfully' });
  } catch (err) {
    console.error('[API ERROR] POST /api/products/reset:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/products
app.post('/api/products', async (req, res) => {
  try {
    const body = req.body;

    const name_tr = body.name_tr || body.name || '';
    const name_en = body.name_en || name_tr;
    const description_tr = body.description_tr || body.description || '';
    const description_en = body.description_en || description_tr;
    const portion_tr = body.portion_tr || (body.besin_degerleri && body.besin_degerleri.porsiyon) || '1 Porsiyon';
    const portion_en = body.portion_en || portion_tr;
    const ingredients_tr = body.ingredients_tr || body.icindekiler || '';
    const ingredients_en = body.ingredients_en || ingredients_tr;
    const calories = parseFloat(body.calories || (body.besin_degerleri && body.besin_degerleri.enerji) || 0);
    const protein = parseFloat(body.protein || (body.besin_degerleri && body.besin_degerleri.protein) || 0);
    const carbs = parseFloat(body.carbs || (body.besin_degerleri && body.besin_degerleri.karbonhidrat) || 0);
    const fat = parseFloat(body.fat || (body.besin_degerleri && body.besin_degerleri.yag) || 0);
    const saturated_fat = parseFloat(body.saturated_fat || (body.besin_degerleri && body.besin_degerleri.doymus_yag) || 0);
    const sugars = parseFloat(body.sugars || (body.besin_degerleri && body.besin_degerleri.sekerler) || 0);
    const fiber = parseFloat(body.fiber || (body.besin_degerleri && body.besin_degerleri.lif) || 0);
    const salt = parseFloat(body.salt || (body.besin_degerleri && body.besin_degerleri.tuz) || 0);

    const id = body.id || `prod-${randomUUID()}`;
    const category = body.category || 'diger';
    const price = Number(body.price);
    const image = body.image == null ? '' : body.image;
    if (typeof image !== 'string' || (image && !image.startsWith('/images/') && !image.startsWith('/uploads/') && !validateImageFile(image))) {
      return res.status(400).json({ error: 'Geçersiz ürün görseli.' });
    }
    if (!name_tr || typeof name_tr !== 'string' || !Number.isFinite(price) || price < 0 || body.price == null || body.price === '') {
      return res.status(400).json({ error: 'Geçerli ürün adı ve fiyatı gerekli.' });
    }
    const rawAllergens = body.allergens || body.alerjenler || [];
    const allergens = JSON.stringify(normalizeAllergens(Array.isArray(rawAllergens) ? rawAllergens : []));
    const katki_maddesi_icermez = (body.katki_maddesi_icermez || body.katki_maddesi_icermez === 1) ? 1 : 0;

    const paramValues = [id, name_tr, name_en, description_tr, description_en, category, price, image,
      portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
      saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez];

    if (isPg) {
      await db.run(`
        INSERT INTO products (
          id, name_tr, name_en, description_tr, description_en, category, price, image,
          portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
          saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `, paramValues);
    } else {
      await db.run(`
        INSERT INTO products (
          id, name_tr, name_en, description_tr, description_en, category, price, image,
          portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
          saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `, paramValues);
    }

    const newRow = await db.get(
      isPg ? 'SELECT * FROM products WHERE id = $1' : 'SELECT * FROM products WHERE id = ?',
      [id]
    );
    res.status(201).json(mapProductRow(newRow));
  } catch (err) {
    console.error('[API ERROR] POST /api/products:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id
app.put('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;

    const name_tr = body.name_tr || body.name || '';
    const name_en = body.name_en || name_tr;
    const description_tr = body.description_tr || body.description || '';
    const description_en = body.description_en || description_tr;
    const portion_tr = body.portion_tr || (body.besin_degerleri && body.besin_degerleri.porsiyon) || '1 Porsiyon';
    const portion_en = body.portion_en || portion_tr;
    const ingredients_tr = body.ingredients_tr || body.icindekiler || '';
    const ingredients_en = body.ingredients_en || ingredients_tr;
    const calories = parseFloat(body.calories || (body.besin_degerleri && body.besin_degerleri.enerji) || 0);
    const protein = parseFloat(body.protein || (body.besin_degerleri && body.besin_degerleri.protein) || 0);
    const carbs = parseFloat(body.carbs || (body.besin_degerleri && body.besin_degerleri.karbonhidrat) || 0);
    const fat = parseFloat(body.fat || (body.besin_degerleri && body.besin_degerleri.yag) || 0);
    const saturated_fat = parseFloat(body.saturated_fat || (body.besin_degerleri && body.besin_degerleri.doymus_yag) || 0);
    const sugars = parseFloat(body.sugars || (body.besin_degerleri && body.besin_degerleri.sekerler) || 0);
    const fiber = parseFloat(body.fiber || (body.besin_degerleri && body.besin_degerleri.lif) || 0);
    const salt = parseFloat(body.salt || (body.besin_degerleri && body.besin_degerleri.tuz) || 0);
    const category = body.category || 'diger';
    const price = Number(body.price);
    const image = body.image == null ? '' : body.image;
    if (typeof image !== 'string' || (image && !image.startsWith('/images/') && !image.startsWith('/uploads/') && !validateImageFile(image))) {
      return res.status(400).json({ error: 'Geçersiz ürün görseli.' });
    }
    if (!name_tr || typeof name_tr !== 'string' || !Number.isFinite(price) || price < 0 || body.price == null || body.price === '') {
      return res.status(400).json({ error: 'Geçerli ürün adı ve fiyatı gerekli.' });
    }
    const rawAllergens = body.allergens || body.alerjenler || [];
    const allergens = JSON.stringify(normalizeAllergens(Array.isArray(rawAllergens) ? rawAllergens : []));
    const katki_maddesi_icermez = (body.katki_maddesi_icermez || body.katki_maddesi_icermez === 1) ? 1 : 0;

    const paramValues = [name_tr, name_en, description_tr, description_en, category, price, image,
      portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
      saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez, id];

    let result;
    if (isPg) {
      result = await db.run(`
        UPDATE products SET
          name_tr=$1, name_en=$2, description_tr=$3, description_en=$4, category=$5,
          price=$6, image=$7, portion_tr=$8, portion_en=$9, ingredients_tr=$10, ingredients_en=$11,
          calories=$12, protein=$13, carbs=$14, fat=$15, saturated_fat=$16, sugars=$17, fiber=$18,
          salt=$19, allergens=$20, katki_maddesi_icermez=$21, updated_at=CURRENT_TIMESTAMP
        WHERE id=$22
      `, paramValues);
    } else {
      result = await db.run(`
        UPDATE products SET
          name_tr=?, name_en=?, description_tr=?, description_en=?, category=?,
          price=?, image=?, portion_tr=?, portion_en=?, ingredients_tr=?, ingredients_en=?,
          calories=?, protein=?, carbs=?, fat=?, saturated_fat=?, sugars=?, fiber=?,
          salt=?, allergens=?, katki_maddesi_icermez=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `, paramValues);
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updatedRow = await db.get(
      isPg ? 'SELECT * FROM products WHERE id = $1' : 'SELECT * FROM products WHERE id = ?',
      [id]
    );
    res.json(mapProductRow(updatedRow));
  } catch (err) {
    console.error('[API ERROR] PUT /api/products:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id
app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run(
      isPg ? 'DELETE FROM products WHERE id = $1' : 'DELETE FROM products WHERE id = ?',
      [id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/products:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// CATEGORIES API
// ==========================================

// GET /api/categories
app.get('/api/categories', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM categories ORDER BY sort_order ASC');
    res.json(rows);
  } catch (err) {
    console.error('[API ERROR] GET /api/categories:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories
app.post('/api/categories', async (req, res) => {
  try {
    const { id, name_tr, name_en, sort_order, icon } = req.body;

    if (!id || !name_tr) {
      return res.status(400).json({ error: 'ID and name_tr are required' });
    }

    if (isPg) {
      await db.run(
        'INSERT INTO categories (id, name_tr, name_en, sort_order, icon) VALUES ($1, $2, $3, $4, $5)',
        [id, name_tr, name_en || name_tr, sort_order || 0, icon || '']
      );
    } else {
      await db.run(
        'INSERT INTO categories (id, name_tr, name_en, sort_order, icon) VALUES (?, ?, ?, ?, ?)',
        [id, name_tr, name_en || name_tr, sort_order || 0, icon || '']
      );
    }

    const row = await db.get(
      isPg ? 'SELECT * FROM categories WHERE id = $1' : 'SELECT * FROM categories WHERE id = ?',
      [id]
    );
    res.status(201).json(row);
  } catch (err) {
    console.error('[API ERROR] POST /api/categories:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/categories/:id
app.put('/api/categories/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { name_tr, name_en, sort_order, icon } = req.body || {};
    // Omitted fields keep their stored value instead of being written as NULL/undefined.
    const value = v => v === undefined ? null : v;
    if (name_tr !== undefined && (typeof name_tr !== 'string' || !name_tr.trim())) {
      return res.status(400).json({ error: 'name_tr must be a non-empty string' });
    }
    if (sort_order !== undefined && sort_order !== null && !Number.isFinite(Number(sort_order))) {
      return res.status(400).json({ error: 'sort_order must be a number' });
    }

    const result = await db.run(
      `UPDATE categories SET name_tr=COALESCE(${p(1)}, name_tr), name_en=COALESCE(${p(2)}, name_en),
        sort_order=COALESCE(${p(3)}, sort_order), icon=COALESCE(${p(4)}, icon) WHERE id=${p(5)}`,
      [value(name_tr), value(name_en), sort_order == null ? null : Number(sort_order), value(icon), id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const row = await db.get(
      isPg ? 'SELECT * FROM categories WHERE id = $1' : 'SELECT * FROM categories WHERE id = ?',
      [id]
    );
    res.json(row);
  } catch (err) {
    console.error('[API ERROR] PUT /api/categories:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/categories/:id
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run(
      isPg ? 'DELETE FROM categories WHERE id = $1' : 'DELETE FROM categories WHERE id = ?',
      [id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/categories:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// RESERVATIONS API
// ==========================================

function mapReservationRow(row) {
  return {
    id: row.id,
    name: row.customer_name,
    phone: row.phone,
    date: row.date,
    time: row.time,
    pax: row.people,
    note: row.note,
    read: row.status === 'confirmed' || row.status === 'read',
    // PostgreSQL returns BIGINT as a string.
    timestamp: row.created_at == null ? row.created_at : Number(row.created_at)
  };
}

// GET /api/reservations
app.get('/api/reservations', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM reservations ORDER BY created_at DESC');
    res.json(rows.map(mapReservationRow));
  } catch (err) {
    console.error('[API ERROR] GET /api/reservations:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reservations
app.post('/api/reservations', rateLimiter(15), async (req, res) => {
  try {
    const body = req.body || {};
    const fields = { name: 120, phone: 30, date: 60, time: 20, note: 1000 };
    for (const [key, max] of Object.entries(fields)) {
      if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > max)) {
        return res.status(400).json({ error: 'Geçersiz rezervasyon alanı.' });
      }
    }
    const id = `rez-${randomUUID()}`;
    const customer_name = (body.name || '').trim();
    const phone = (body.phone || '').trim();
    const date = (body.date || '').trim();
    const time = (body.time || '').trim();
    const people = body.pax == null || body.pax === '' ? 1 : Number(body.pax);
    const note = (body.note || '').trim();
    if (!customer_name || !date || !time) {
      return res.status(400).json({ error: 'Ad, tarih ve saat zorunludur.' });
    }
    if (!/^\d{10,13}$/.test(phone.replace(/\D/g, ''))) {
      return res.status(400).json({ error: 'Geçerli bir telefon numarası girin.' });
    }
    if (!Number.isInteger(people) || people < 1 || people > 50) {
      return res.status(400).json({ error: 'Geçersiz kişi sayısı.' });
    }
    const status = 'pending';
    const timestamp = Date.now();

    if (isPg) {
      await db.run(`
        INSERT INTO reservations (id, customer_name, phone, date, time, people, note, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [id, customer_name, phone, date, time, people, note, status, timestamp, Date.now()]);
    } else {
      await db.run(`
        INSERT INTO reservations (id, customer_name, phone, date, time, people, note, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `, [id, customer_name, phone, date, time, people, note, status, timestamp, Date.now()]);
    }

    const row = await db.get(
      isPg ? 'SELECT * FROM reservations WHERE id = $1' : 'SELECT * FROM reservations WHERE id = ?',
      [id]
    );
    res.status(201).json(mapReservationRow(row));
    notifyAdmins('reservations');
  } catch (err) {
    console.error('[API ERROR] POST /api/reservations:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reservations/:id
app.put('/api/reservations/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const status = (body.read === true || body.status === 'confirmed' || body.status === 'read') ? 'confirmed' : 'pending';

    let result;
    if (isPg) {
      result = await db.run('UPDATE reservations SET status=$1, updated_at=$2 WHERE id=$3', [status, Date.now(), id]);
    } else {
      result = await db.run('UPDATE reservations SET status=?, updated_at=? WHERE id=?', [status, Date.now(), id]);
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const row = await db.get(
      isPg ? 'SELECT * FROM reservations WHERE id = $1' : 'SELECT * FROM reservations WHERE id = ?',
      [id]
    );
    res.json(mapReservationRow(row));
  } catch (err) {
    console.error('[API ERROR] PUT /api/reservations/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reservations/:id
app.delete('/api/reservations/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run(
      isPg ? 'DELETE FROM reservations WHERE id = $1' : 'DELETE FROM reservations WHERE id = ?',
      [id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    res.json({ success: true, message: 'Reservation deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/reservations/:id:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// TRANSLATIONS API
// ==========================================

// GET /api/translations
app.get('/api/translations', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM translations');
    const tr = {};
    const en = {};

    rows.forEach(row => {
      tr[row.key] = row.tr;
      en[row.key] = row.en;
    });

    res.json({ tr, en });
  } catch (err) {
    console.error('[API ERROR] GET /api/translations:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/translations
app.post('/api/translations', async (req, res) => {
  try {
    const { key, tr, en } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });

    const id = `trans-${randomUUID()}`;
    if (isPg) {
      await db.run('INSERT INTO translations (id, key, tr, en) VALUES ($1,$2,$3,$4)', [id, key, tr || '', en || '']);
    } else {
      await db.run('INSERT INTO translations (id, key, tr, en) VALUES (?,?,?,?)', [id, key, tr || '', en || '']);
    }
    res.status(201).json({ id, key, tr, en });
  } catch (err) {
    console.error('[API ERROR] POST /api/translations:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// SECURITY & HELPER MIDDLEWARES
// ==========================================
function validateImageFile(imageStr) {
  if (!imageStr) return true;
  if (typeof imageStr !== 'string') return false;
  if (imageStr.startsWith('http://') || imageStr.startsWith('https://')) {
    return true;
  }
  if (imageStr.startsWith('data:image/')) {
    const matches = imageStr.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) return false;
    const ext = matches[1].toLowerCase();
    const allowed = ['png', 'jpeg', 'jpg', 'webp'];
    if (!allowed.includes(ext)) return false;
    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return false;
    return true;
  }
  return false;
}

// Helper: send Web Push payload to subscribers
async function sendPushNotificationInternal(notif) {
  try {
    let sql = 'SELECT * FROM subscriptions WHERE enabled = 1';
    let params = [];
    if (notif.target === 'test') {
      sql += " AND (user_id = 'test' OR device LIKE '%test%' OR id LIKE '%test%')";
    } else if (notif.target && notif.target !== 'all' && notif.target !== 'permitted') {
      sql += isPg ? ' AND platform = $1' : ' AND platform = ?';
      params.push(notif.target);
    }
    
    const subs = await db.all(sql, params);
    let success = 0;
    let failed = 0;
    
    const payload = JSON.stringify({
      id: notif.id,
      title: notif.title,
      body: notif.body,
      image: notif.image,
      icon: notif.icon,
      url: notif.url,
      tag: notif.tag,
      collapse_key: notif.collapse_key
    });
    
    // web-push throws for every subscriber on an unsupported urgency or a topic that is not
    // 1-32 URL-safe base64 characters, so invalid values fall back to defaults.
    const urgency = notif.priority === 'critical' ? 'high' : notif.priority;
    const options = {
      TTL: (notif.ttl || 24) * 3600,
      urgency: ['very-low', 'low', 'normal', 'high'].includes(urgency) ? urgency : 'normal',
      topic: /^[A-Za-z0-9_-]{1,32}$/.test(notif.collapse_key || '') ? notif.collapse_key : undefined
    };
    
    for (const sub of subs) {
      try {
        const subObj = JSON.parse(sub.token);
        await webpush.sendNotification(subObj, payload, options);
        success++;
      } catch (err) {
        failed++;
        console.error(`[PUSH ERROR] Failed to send to sub ${sub.id}:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          const deleteSql = isPg 
            ? 'DELETE FROM subscriptions WHERE id = $1' 
            : 'DELETE FROM subscriptions WHERE id = ?';
          await db.run(deleteSql, [sub.id]);
          console.log(`[PUSH INFO] Cleaned up expired subscription: ${sub.id}`);
        }
      }
    }
    
    const updateSql = isPg
      ? 'UPDATE notifications SET status = $1, success_count = $2, failed_count = $3, sent_at = $4 WHERE id = $5'
      : 'UPDATE notifications SET status = ?, success_count = ?, failed_count = ?, sent_at = ? WHERE id = ?';
    
    await db.run(updateSql, [
      'sent',
      success,
      failed,
      new Date().toISOString(),
      notif.id
    ]);
    
    console.log(`[PUSH ENGINE] Notification ${notif.id} sent. Success: ${success}, Failed: ${failed}`);
  } catch (err) {
    console.error(`[PUSH ENGINE ERROR] Failed to send notification ${notif.id}:`, err);
    const updateSql = isPg
      ? "UPDATE notifications SET status = 'failed' WHERE id = $1"
      : "UPDATE notifications SET status = 'failed' WHERE id = ?";
    // This function runs fire-and-forget; a rejection here would be unhandled and stop the process.
    await db.run(updateSql, [notif.id]).catch(updateErr =>
      console.error(`[PUSH ENGINE ERROR] Could not mark notification ${notif.id} as failed:`, updateErr));
  }
}

// Arm one-off timers for persisted jobs; no recurring database queries while idle.
const notificationScheduler = createNotificationScheduler({
  db, send: sendPushNotificationInternal, enabled: !!VAPID_PUBLIC_KEY
});

// ==========================================
// WEB PUSH NOTIFICATION APIs
// ==========================================

// GET /api/notifications/vapid-public-key
app.get('/api/notifications/vapid-public-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push is not configured' });
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/subscriptions (Register / Update client token)
app.post('/api/subscriptions', rateLimiter(30), async (req, res) => {
  try {
    const { token, user_id, device, browser, platform, language } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    const tokenStr = typeof token === 'object' ? JSON.stringify(token) : token;
    
    // Check if subscription already exists
    const existing = await db.get(
      isPg ? 'SELECT * FROM subscriptions WHERE token = $1' : 'SELECT * FROM subscriptions WHERE token = ?',
      [tokenStr]
    );
    
    const nowStr = new Date().toISOString();
    
    if (existing) {
      const updateSql = isPg
        ? 'UPDATE subscriptions SET last_seen = $1, enabled = 1, user_id = $2, device = $3, browser = $4, platform = $5, language = $6 WHERE id = $7'
        : 'UPDATE subscriptions SET last_seen = ?, enabled = 1, user_id = ?, device = ?, browser = ?, platform = ?, language = ? WHERE id = ?';
      await db.run(updateSql, [nowStr, user_id || existing.user_id, device || existing.device, browser || existing.browser, platform || existing.platform, language || existing.language, existing.id]);
      const updated = await db.get(
        isPg ? 'SELECT * FROM subscriptions WHERE id = $1' : 'SELECT * FROM subscriptions WHERE id = ?',
        [existing.id]
      );
      return res.json(updated);
    } else {
      const id = `sub-${randomUUID()}`;
      const insertSql = isPg
        ? 'INSERT INTO subscriptions (id, user_id, token, device, browser, platform, language, created_at, last_seen, enabled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)'
        : 'INSERT INTO subscriptions (id, user_id, token, device, browser, platform, language, created_at, last_seen, enabled) VALUES (?,?,?,?,?,?,?,?,?,1)';
      await db.run(insertSql, [id, user_id || '', tokenStr, device || '', browser || '', platform || '', language || '', nowStr, nowStr]);
      const inserted = await db.get(
        isPg ? 'SELECT * FROM subscriptions WHERE id = $1' : 'SELECT * FROM subscriptions WHERE id = ?',
        [id]
      );
      return res.status(201).json(inserted);
    }
  } catch (err) {
    console.error('[API ERROR] POST /api/subscriptions:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subscriptions (Admin Only)
app.get('/api/subscriptions', adminAuth, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM subscriptions ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('[API ERROR] GET /api/subscriptions:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/subscriptions/:id (Admin Only)
app.delete('/api/subscriptions/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run(
      isPg ? 'DELETE FROM subscriptions WHERE id = $1' : 'DELETE FROM subscriptions WHERE id = ?',
      [id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    res.json({ success: true, message: 'Subscription deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/subscriptions/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications (Admin Only)
app.get('/api/notifications', adminAuth, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM notifications ORDER BY created_at DESC');
    res.json(rows.map(row => ({ ...row, created_at: toIsoTimestamp(row.created_at) })));
  } catch (err) {
    console.error('[API ERROR] GET /api/notifications:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notifications/:id (Admin Only)
app.delete('/api/notifications/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run(
      isPg ? 'DELETE FROM notifications WHERE id = $1' : 'DELETE FROM notifications WHERE id = ?',
      [id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    notificationScheduler.cancel(id);
    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/notifications/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/send (Admin Only - Send Immediately)
app.post('/api/notifications/send', adminAuth, rateLimiter(10), async (req, res) => {
  try {
    if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push is not configured' });
    const { title, body, image, icon, url, target, priority, ttl, tag, collapse_key, created_by } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }
    
    if (!validateImageFile(image)) {
      return res.status(400).json({ error: 'Invalid image format or size exceeds 5MB' });
    }
    
    const id = `notif-${randomUUID()}`;
    const nowStr = new Date().toISOString();
    
    const insertSql = isPg
      ? 'INSERT INTO notifications (id, title, body, image, icon, url, target, created_at, sent_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,0,0)'
      : 'INSERT INTO notifications (id, title, body, image, icon, url, target, created_at, sent_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0)';
    
    await db.run(insertSql, [
      id, title, body, image || '', icon || '', url || '', target || 'all', nowStr, nowStr, 'sending',
      priority || 'normal', (parseInt(ttl, 10) || 24), tag || '', collapse_key || '', created_by || 'admin'
    ]);
    
    const notif = await db.get(
      isPg ? 'SELECT * FROM notifications WHERE id = $1' : 'SELECT * FROM notifications WHERE id = ?',
      [id]
    );
    
    // Process send asynchronously so request completes fast
    sendPushNotificationInternal(notif);
    
    res.json({ success: true, message: 'Notification send initiated', id });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/send:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/schedule (Admin Only - Schedule for later)
app.post('/api/notifications/schedule', adminAuth, rateLimiter(15), async (req, res) => {
  try {
    if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push is not configured' });
    const { title, body, image, icon, url, target, priority, ttl, tag, collapse_key, created_by, scheduled_at } = req.body;
    
    if (!title || !body || !scheduled_at) {
      return res.status(400).json({ error: 'Title, body, and scheduled_at are required' });
    }
    
    if (!validateImageFile(image)) {
      return res.status(400).json({ error: 'Invalid image format or size exceeds 5MB' });
    }
    
    const scheduledTime = typeof scheduled_at === 'string' ? Date.parse(scheduled_at) : NaN;
    if (!Number.isFinite(scheduledTime)) {
      return res.status(400).json({ error: 'Geçerli bir bildirim tarihi gerekli.' });
    }
    const scheduledAt = new Date(scheduledTime).toISOString();
    const id = `notif-${randomUUID()}`;
    const nowStr = new Date().toISOString();
    
    const insertSql = isPg
      ? 'INSERT INTO notifications (id, title, body, image, icon, url, target, created_at, scheduled_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,0,0)'
      : 'INSERT INTO notifications (id, title, body, image, icon, url, target, created_at, scheduled_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0)';
    
    await db.run(insertSql, [
      id, title, body, image || '', icon || '', url || '', target || 'all', nowStr, scheduledAt, 'pending',
      priority || 'normal', (parseInt(ttl, 10) || 24), tag || '', collapse_key || '', created_by || 'admin'
    ]);
    
    notificationScheduler.schedule({ id, scheduled_at: scheduledAt });
    res.json({ success: true, message: 'Notification scheduled successfully', id });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/schedule:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/test (Admin Only - Send to single subscriber for testing)
app.post('/api/notifications/test', adminAuth, rateLimiter(20), async (req, res) => {
  try {
    if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push is not configured' });
    const { token, title, body, image, url } = req.body;
    if (!token || !title || !body) {
      return res.status(400).json({ error: 'Token, title, and body are required' });
    }
    
    const payload = JSON.stringify({
      id: `test-${Date.now()}`,
      title,
      body,
      image: image || '',
      url: url || ''
    });
    
    const subObj = typeof token === 'string' ? JSON.parse(token) : token;
    await webpush.sendNotification(subObj, payload, { TTL: 60 });
    
    res.json({ success: true, message: 'Test notification sent successfully' });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/test:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/upload-image (Admin Only - store a push image on disk, return a small hosted URL)
// Push payloads have a ~4KB size limit, so raw base64 images can never be sent inline in the
// notification itself; the image must be hosted and referenced by URL instead.
app.post('/api/notifications/upload-image', adminAuth, rateLimiter(10), async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Valid base64 image data is required' });
    }
    const matches = image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid image data format' });
    }
    const ext = matches[1].toLowerCase();
    const allowed = ['png', 'jpeg', 'jpg', 'webp'];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: 'Unsupported image format. Use PNG, JPG or WEBP.' });
    }
    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image exceeds 5MB' });
    }

    const uploadsDir = path.join(rootDir, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const filename = `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext === 'jpeg' ? 'jpg' : ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);

    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const publicUrl = `${proto}://${req.get('host')}/uploads/${filename}`;
    res.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/upload-image:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/click (Track clicks)
app.post('/api/notifications/click', rateLimiter(100), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Notification ID is required' });
    
    const updateSql = isPg
      ? 'UPDATE notifications SET click_count = click_count + 1 WHERE id = $1'
      : 'UPDATE notifications SET click_count = click_count + 1 WHERE id = ?';
    
    await db.run(updateSql, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/click:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// ORDERS API
// ==========================================

const ORDER_STATUSES = ['new', 'preparing', 'ready', 'delivered', 'cancelled'];
const PAYMENT_METHODS = ['cash', 'card'];
const MAX_ITEM_QUANTITY = 50;

function generateOrderNumber() {
  return `DK-${randomBytes(8).toString('hex').toUpperCase()}`;
}

function mapOrderRow(row, items) {
  return {
    id: row.id,
    order_number: row.order_number,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_address: row.customer_address,
    payment_method: row.payment_method,
    subtotal: row.subtotal,
    delivery_fee: row.delivery_fee,
    total: row.total,
    status: row.status,
    is_read: !!row.is_read,
    created_at: toIsoTimestamp(row.created_at),
    updated_at: toIsoTimestamp(row.updated_at),
    items: (items || []).map(it => ({
      id: it.id,
      product_id: it.product_id,
      product_name: it.product_name_snapshot,
      unit_price: it.unit_price,
      quantity: it.quantity,
      line_total: it.line_total
    }))
  };
}

async function getOrderItems(orderId) {
  return db.all(
    isPg ? 'SELECT * FROM order_items WHERE order_id = $1' : 'SELECT * FROM order_items WHERE order_id = ?',
    [orderId]
  );
}

// POST /api/orders — public: customer places an order
app.post('/api/orders', rateLimiter(30), async (req, res) => {
  try {
    const body = req.body || {};
    if (['customer_name', 'customer_phone', 'customer_address', 'idempotency_key'].some(key => body[key] != null && typeof body[key] !== 'string')) {
      return res.status(400).json({ error: 'Geçersiz sipariş alanı.' });
    }
    const customer_name = (body.customer_name || '').trim();
    const customer_phone = (body.customer_phone || '').trim();
    const customer_address = (body.customer_address || '').trim();
    const payment_method = body.payment_method;
    const idempotency_key = (body.idempotency_key || '').trim();
    const requestedItems = Array.isArray(body.items) ? body.items : [];

    if (!customer_name) {
      return res.status(400).json({ error: 'Ad soyad zorunludur.' });
    }
    const phoneDigits = customer_phone.replace(/\D/g, '');
    if (!/^0?5\d{9}$/.test(phoneDigits)) {
      return res.status(400).json({ error: 'Geçerli bir telefon numarası girin.' });
    }
    if (!customer_address) {
      return res.status(400).json({ error: 'Adres zorunludur.' });
    }
    if (!PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({ error: 'Geçersiz ödeme yöntemi.' });
    }
    if (requestedItems.length === 0) {
      return res.status(400).json({ error: 'Sepet boş olamaz.' });
    }
    for (const it of requestedItems) {
      const qty = Number(it?.quantity);
      if (!it || typeof it.product_id !== 'string' || !it.product_id || !Number.isInteger(qty) || qty <= 0 || qty > MAX_ITEM_QUANTITY) {
        return res.status(400).json({ error: 'Geçersiz ürün miktarı.' });
      }
    }

    const result = await db.transaction(async () => {
      // Idempotency: if this exact checkout attempt already produced an order, return it instead of duplicating
      if (idempotency_key) {
        const existing = await db.get(
          isPg ? 'SELECT * FROM orders WHERE idempotency_key = $1' : 'SELECT * FROM orders WHERE idempotency_key = ?',
          [idempotency_key]
        );
        if (existing) {
          const items = await getOrderItems(existing.id);
          return { status: 200, body: mapOrderRow(existing, items) };
        }
      }

      // Re-validate every product against the database — never trust client-sent prices/names
      const lineItems = [];
      let subtotal = 0;
      for (const it of requestedItems) {
        const productRow = await db.get(
          isPg ? 'SELECT * FROM products WHERE id = $1' : 'SELECT * FROM products WHERE id = ?',
          [it.product_id]
        );
        if (!productRow) {
          return { status: 400, body: { error: `Ürün bulunamadı: ${it.product_id}` } };
        }
        const quantity = Number(it.quantity);
        const unitPrice = productRow.price;
        const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
        subtotal += lineTotal;
        lineItems.push({
          product_id: productRow.id,
          product_name_snapshot: productRow.name_tr,
          unit_price: unitPrice,
          quantity,
          line_total: lineTotal
        });
      }
      subtotal = Math.round(subtotal * 100) / 100;
      const delivery_fee = 0;
      const total = Math.round((subtotal + delivery_fee) * 100) / 100;

      const orderId = `order-${randomUUID()}`;
      const orderNumber = generateOrderNumber();

      const insertOrderSql = isPg
        ? `INSERT INTO orders (id, order_number, customer_name, customer_phone, customer_address, payment_method, subtotal, delivery_fee, total, status, is_read, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',0,$10) ON CONFLICT (idempotency_key) DO NOTHING`
        : `INSERT INTO orders (id, order_number, customer_name, customer_phone, customer_address, payment_method, subtotal, delivery_fee, total, status, is_read, idempotency_key)
           VALUES (?,?,?,?,?,?,?,?,?,'new',0,?) ON CONFLICT (idempotency_key) DO NOTHING`;
      const inserted = await db.run(insertOrderSql, [
        orderId, orderNumber, customer_name, customer_phone, customer_address,
        payment_method, subtotal, delivery_fee, total, idempotency_key || null
      ]);

      if (inserted.changes === 0) {
        const existing = await db.get(`SELECT * FROM orders WHERE idempotency_key = ${p(1)}`, [idempotency_key]);
        return { status: 200, body: mapOrderRow(existing, await getOrderItems(existing.id)) };
      }

      for (const li of lineItems) {
        const itemId = `oi-${randomUUID()}`;
        const insertItemSql = isPg
          ? `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, unit_price, quantity, line_total) VALUES ($1,$2,$3,$4,$5,$6,$7)`
          : `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, unit_price, quantity, line_total) VALUES (?,?,?,?,?,?,?)`;
        await db.run(insertItemSql, [itemId, orderId, li.product_id, li.product_name_snapshot, li.unit_price, li.quantity, li.line_total]);
      }

      const createdOrder = await db.get(
        isPg ? 'SELECT * FROM orders WHERE id = $1' : 'SELECT * FROM orders WHERE id = ?',
        [orderId]
      );
      const items = await getOrderItems(orderId);
      return { status: 201, body: mapOrderRow(createdOrder, items) };
    });
    res.status(result.status).json(result.body);
    if (result.status === 201) notifyAdmins('orders');
  } catch (err) {
    console.error('[API ERROR] POST /api/orders:', err);
    res.status(500).json({ error: 'Sipariş oluşturulamadı. Lütfen tekrar deneyin.' });
  }
});

// GET /api/orders (Admin Only)
app.get('/api/orders', adminAuth, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM orders ORDER BY created_at DESC');
    const result = [];
    for (const row of rows) {
      const items = await getOrderItems(row.id);
      result.push(mapOrderRow(row, items));
    }
    res.json(result);
  } catch (err) {
    console.error('[API ERROR] GET /api/orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id (Admin Only)
app.get('/api/orders/:id', adminAuth, async (req, res) => {
  try {
    const row = await db.get(
      isPg ? 'SELECT * FROM orders WHERE id = $1' : 'SELECT * FROM orders WHERE id = ?',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Order not found' });
    const items = await getOrderItems(row.id);
    res.json(mapOrderRow(row, items));
  } catch (err) {
    console.error('[API ERROR] GET /api/orders/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/read (Admin Only)
app.patch('/api/orders/:id/read', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const updateSql = isPg
      ? 'UPDATE orders SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1'
      : 'UPDATE orders SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    const result = await db.run(updateSql, [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
    const row = await db.get(
      isPg ? 'SELECT * FROM orders WHERE id = $1' : 'SELECT * FROM orders WHERE id = ?',
      [id]
    );
    const items = await getOrderItems(id);
    res.json(mapOrderRow(row, items));
  } catch (err) {
    console.error('[API ERROR] PATCH /api/orders/:id/read:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id (Admin Only) — update status
app.patch('/api/orders/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Geçersiz sipariş durumu.' });
    }
    const updateSql = isPg
      ? 'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2'
      : 'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    const result = await db.run(updateSql, [status, id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
    const row = await db.get(
      isPg ? 'SELECT * FROM orders WHERE id = $1' : 'SELECT * FROM orders WHERE id = ?',
      [id]
    );
    const items = await getOrderItems(id);
    res.json(mapOrderRow(row, items));
  } catch (err) {
    console.error('[API ERROR] PATCH /api/orders/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id (Admin Only)
app.delete('/api/orders/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.transaction(async () => {
      await db.run(`DELETE FROM order_items WHERE order_id = ${p(1)}`, [id]);
      return db.run(`DELETE FROM orders WHERE id = ${p(1)}`, [id]);
    });
    if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/orders/:id:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// RETRO COMPATIBILITY FOR PREVIOUS SAVE API
// ==========================================
app.post('/api/save-menu', (req, res) => {
  try {
    console.log('[SERVER API] Retro-compatibility endpoint /api/save-menu invoked.');
    res.json({ success: true, message: 'Deprecated. Database is now individual REST API.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ==========================================
// STATIC FRONTEND SERVING (for local dev)
// ==========================================
const rootDir = path.join(__dirname, '..');

app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(rootDir, 'admin.html'));
});

const publicFiles = require('./public-files');
for (const filename of publicFiles.files) {
  app.get('/' + filename, (req, res) => res.sendFile(path.join(rootDir, filename)));
}
for (const directory of [...publicFiles.directories, 'uploads']) {
  app.use('/' + directory, express.static(path.join(rootDir, directory), { dotfiles: 'deny', fallthrough: false }));
}
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================
// Catches anything that reaches next(err) unhandled (e.g. a rejected CORS
// origin) and returns clean JSON instead of Express's default HTML crash
// page, so a misconfigured origin shows up as a normal API error rather
// than a blank "Internal Server Error" page for the visitor.
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  if (res.headersSent) return next(err);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status === 404 ? 'Not found' : 'İstek işlenemedi. Lütfen tekrar deneyin.' });
});


// ==========================================
// STARTUP: Init DB then start server
// ==========================================
initDatabase().then(() => notificationScheduler.start()).then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================`);
    console.log(` Dayı Katık Web App Server is running!`);
    console.log(` Port: ${PORT}`);
    console.log(` Local:  http://localhost:${PORT}`);
    console.log(` Mode:   ${process.env.DATABASE_URL ? 'PRODUCTION (PostgreSQL)' : 'DEVELOPMENT (SQLite)'}`);
    console.log(`==================================================`);
  });
}).catch(err => {
  console.error('[FATAL] Failed to initialize database:', err);
  process.exit(1);
});
