const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { db, initDatabase, resetDatabase } = require('./db');
const webpush = require('web-push');

// Generate or load VAPID keys
const vapidPath = path.join(__dirname, '..', 'data', 'vapid.json');
let vapidKeys;
if (fs.existsSync(vapidPath)) {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(vapidPath, 'utf8'));
  } catch (e) {
    console.error('[SERVER] Failed to parse vapid.json, generating new keys:', e);
  }
}

if (!vapidKeys) {
  vapidKeys = webpush.generateVAPIDKeys();
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys, null, 2), 'utf8');
    console.log('[SERVER] Generated new VAPID keys and saved to data/vapid.json');
  } catch (err) {
    console.error('[SERVER] Failed to save VAPID keys:', err);
  }
}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || (vapidKeys && vapidKeys.publicKey);
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || (vapidKeys && vapidKeys.privateKey);

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@dayikatik.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.error('[SERVER] VAPID keys are missing! Web Push functionality will fail.');
}

const app = express();
const PORT = process.env.PORT || 12000;

// Enable CORS with robust origin support for Netlify subdomains, previews, and local development
const allowedOrigins = [
  'https://dayikatik.netlify.app',
  'https://hasacadesign.netlify.app',
  'https://dayikatikornek.netlify.app',
  'https://resonant-elf-d2b58b.netlify.app',
  'https://glittering-raindrop-435319.netlify.app',
  'http://localhost:12000',
  'http://127.0.0.1:12000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) || 
                      origin.endsWith('.netlify.app') || 
                      origin.endsWith('.netlify.com');
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Cache-control middleware to prevent caching of dynamic and static data
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Helper to build parameterized queries for both PG ($1) and SQLite (?)
const isPg = !!process.env.DATABASE_URL;
function p(n) {
  // Returns $n for PostgreSQL or ? for SQLite
  return isPg ? `$${n}` : '?';
}
function params(...args) {
  return args;
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

  return {
    id: row.id,
    name: row.name_tr,
    name_en: row.name_en,
    category: row.category,
    price: row.price,
    description: row.description_tr,
    description_en: row.description_en,
    image: row.image,
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
    alerjenler: allergens,
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
    const rows = await db.all('SELECT * FROM products ORDER BY created_at DESC');
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

    const id = body.id || `prod-${Date.now()}`;
    const category = body.category || 'diger';
    const price = parseFloat(body.price || 0);
    const image = body.image || '';
    const allergens = JSON.stringify(body.allergens || body.alerjenler || []);
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
    const price = parseFloat(body.price || 0);
    const image = body.image || '';
    const allergens = JSON.stringify(body.allergens || body.alerjenler || []);
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
    const { name_tr, name_en, sort_order, icon } = req.body;

    let result;
    if (isPg) {
      result = await db.run(
        'UPDATE categories SET name_tr=$1, name_en=$2, sort_order=$3, icon=$4 WHERE id=$5',
        [name_tr, name_en, sort_order, icon, id]
      );
    } else {
      result = await db.run(
        'UPDATE categories SET name_tr=?, name_en=?, sort_order=?, icon=? WHERE id=?',
        [name_tr, name_en, sort_order, icon, id]
      );
    }

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
    timestamp: row.created_at
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
app.post('/api/reservations', async (req, res) => {
  try {
    const body = req.body;
    const id = body.id || `rez-${Date.now()}`;
    const customer_name = body.name || '';
    const phone = body.phone || '';
    const date = body.date || '';
    const time = body.time || '';
    const people = parseInt(body.pax || 1);
    const note = body.note || '';
    const status = (body.read === true || body.status === 'confirmed') ? 'confirmed' : 'pending';
    const timestamp = body.timestamp || Date.now();

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

    const id = `trans-${Date.now()}`;
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
const ipCounts = {};
setInterval(() => {
  for (const ip in ipCounts) delete ipCounts[ip];
}, 60000);

function rateLimiter(limit = 60) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    ipCounts[ip] = (ipCounts[ip] || 0) + 1;
    if (ipCounts[ip] > limit) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== 'Bearer dayikatik123') {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication required.' });
  }
  next();
}

function validateImageFile(imageStr) {
  if (!imageStr) return true;
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
    
    const options = {
      TTL: (notif.ttl || 24) * 3600,
      urgency: notif.priority === 'critical' ? 'high' : (notif.priority || 'normal'),
      topic: notif.collapse_key || undefined
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
    await db.run(updateSql, [notif.id]);
  }
}

// Background scheduler loop (every 30 seconds)
setInterval(async () => {
  try {
    const nowStr = new Date().toISOString();
    const sql = isPg 
      ? "SELECT * FROM notifications WHERE status = 'pending' AND scheduled_at <= $1" 
      : "SELECT * FROM notifications WHERE status = 'pending' AND scheduled_at <= ?";
    const pendingNotifications = await db.all(sql, [nowStr]);
    
    for (const notif of pendingNotifications) {
      const updateSql = isPg
        ? "UPDATE notifications SET status = 'sending' WHERE id = $1"
        : "UPDATE notifications SET status = 'sending' WHERE id = ?";
      await db.run(updateSql, [notif.id]);
      
      await sendPushNotificationInternal(notif);
    }
  } catch (err) {
    console.error('[SCHEDULER ERROR] Failed to process scheduled notifications:', err);
  }
}, 30000);

// ==========================================
// WEB PUSH NOTIFICATION APIs
// ==========================================

// GET /api/notifications/vapid-public-key
app.get('/api/notifications/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || '' });
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
      const id = `sub-${Date.now()}`;
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
    res.json(rows);
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
    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/notifications/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/send (Admin Only - Send Immediately)
app.post('/api/notifications/send', adminAuth, rateLimiter(10), async (req, res) => {
  try {
    const { title, body, image, icon, url, target, priority, ttl, tag, collapse_key, created_by } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }
    
    if (!validateImageFile(image)) {
      return res.status(400).json({ error: 'Invalid image format or size exceeds 5MB' });
    }
    
    const id = `notif-${Date.now()}`;
    const nowStr = new Date().toISOString();
    
    const insertSql = isPg
      ? 'INSERT INTO notifications (id, title, body, image, icon, url, target, created_at, sent_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,0,0)'
      : 'INSERT INTO notifications (id, title, body, image, icon, url, target, created_at, sent_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0)';
    
    await db.run(insertSql, [
      id, title, body, image || '', icon || '', url || '', target || 'all', nowStr, nowStr, 'sending',
      priority || 'normal', parseInt(ttl || 24), tag || '', collapse_key || '', created_by || 'admin'
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
    const { title, body, image, icon, url, target, priority, ttl, tag, collapse_key, created_by, scheduled_at } = req.body;
    
    if (!title || !body || !scheduled_at) {
      return res.status(400).json({ error: 'Title, body, and scheduled_at are required' });
    }
    
    if (!validateImageFile(image)) {
      return res.status(400).json({ error: 'Invalid image format or size exceeds 5MB' });
    }
    
    const id = `notif-${Date.now()}`;
    const nowStr = new Date().toISOString();
    
    const insertSql = isPg
      ? 'INSERT INTO notifications (id, title, body, image, icon, url, target, created_at, scheduled_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,0,0)'
      : 'INSERT INTO notifications (id, title, body, image, icon, url, target, created_at, scheduled_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0)';
    
    await db.run(insertSql, [
      id, title, body, image || '', icon || '', url || '', target || 'all', nowStr, scheduled_at, 'pending',
      priority || 'normal', parseInt(ttl || 24), tag || '', collapse_key || '', created_by || 'admin'
    ]);
    
    res.json({ success: true, message: 'Notification scheduled successfully', id });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/schedule:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/test (Admin Only - Send to single subscriber for testing)
app.post('/api/notifications/test', adminAuth, rateLimiter(20), async (req, res) => {
  try {
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

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(rootDir, 'admin.html'));
});

app.use(express.static(rootDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});


// ==========================================
// STARTUP: Init DB then start server
// ==========================================
initDatabase().then(() => {
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
