const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('.'));
app.use(express.json());

// ==========================================
// TOKEN SYSTEM v2 — HTTP-only, No Puppeteer
// ==========================================
// วิธีทำงาน:
//   1. GET advice.co.th → ได้ user_token cookie (anonymous JWT)
//   2. ใช้ user_token เป็น Authorization: Bearer header
//   3. Token หมดอายุใน ~24 ชม — รีเฟรชก่อนหมดอายุ 30 นาที
//   4. ไม่ใช้ไฟล์เลย — เก็บใน memory + process.env เท่านั้น
// ==========================================

const ADVICE_HOME = 'https://www.advice.co.th/product/search?keyword=iphone';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

let cachedToken = process.env.ADVICE_TOKEN || null;
let tokenExpiry = cachedToken ? Date.now() + (23 * 60 * 60 * 1000) : 0;
let isRefreshing = false;
let refreshTimer = null;
let lastTokenError = null;
let tokenFetchCount = 0;

// ─── ดึง token ใหม่ผ่าน HTTP GET (ไม่ต้องใช้ Puppeteer) ───
async function fetchTokenViaHttp() {
  console.log('🌐 กำลังดึง Token ผ่าน HTTP GET advice.co.th...');
  const r = await axios.get(ADVICE_HOME, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
    },
    timeout: 20000,
    maxRedirects: 5,
  });

  const setCookies = r.headers['set-cookie'] || [];
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key === 'user_token' && val && val.length > 20) {
      return `Bearer ${val}`;
    }
  }
  throw new Error('ไม่พบ user_token ใน cookie จาก advice.co.th');
}

// ─── Auto refresh ───
async function autoRefreshToken() {
  if (isRefreshing) {
    console.log('⏳ กำลังรีเฟรชอยู่แล้ว รอสักครู่...');
    // รอให้รีเฟรชเสร็จ (max 30 วิ)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (!isRefreshing && cachedToken) return true;
    }
    return !!cachedToken;
  }

  isRefreshing = true;
  tokenFetchCount++;
  console.log(`🔄 รีเฟรช Token ครั้งที่ ${tokenFetchCount}...`);

  try {
    const token = await fetchTokenViaHttp();
    cachedToken = token;
    // JWT จาก advice มี exp ~24 ชม — set expiry 23 ชม เพื่อความปลอดภัย
    tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
    lastTokenError = null;
    console.log(`✅ Token ใหม่พร้อมใช้งาน! (หมดอายุใน 23 ชม)`);
    scheduleNextRefresh();
    isRefreshing = false;
    return true;
  } catch (e) {
    lastTokenError = e.message;
    console.error('❌ รีเฟรช Token ล้มเหลว:', e.message);
    // Retry หลัง 2 นาที
    setTimeout(() => autoRefreshToken(), 2 * 60 * 1000);
    isRefreshing = false;
    return false;
  }
}

// ─── schedule refresh 30 นาทีก่อนหมดอายุ ───
function scheduleNextRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  const timeLeft = tokenExpiry - Date.now();
  const refreshIn = Math.max(timeLeft - (30 * 60 * 1000), 5 * 60 * 1000);
  console.log(`⏰ จะรีเฟรช Token อีกครั้งใน ${Math.round(refreshIn / 60000)} นาที`);
  refreshTimer = setTimeout(() => autoRefreshToken(), refreshIn);
}

// ─── Get token (รีเฟรชถ้าหมดอายุ) ───
async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  console.log('🔑 Token หมดอายุหรือไม่มี — กำลังรีเฟรช...');
  const ok = await autoRefreshToken();
  if (ok && cachedToken) return cachedToken;
  throw new Error('ไม่สามารถดึง Token ได้ กรุณารอสักครู่แล้วลองใหม่');
}

// ==========================================
// Studio7 Cache
// ==========================================
let studio7Cache = [];
let studio7LastUpdate = 0;

// ==========================================
// API Routes: Token Management
// ==========================================
app.post('/api/set-token', (req, res) => {
  const { token, secret } = req.body;
  if (secret !== (process.env.TOKEN_SECRET || 'armymimu2024')) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  if (!token) return res.status(400).json({ error: 'Token required' });
  cachedToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
  scheduleNextRefresh();
  console.log('✅ Token อัพเดทจาก API');
  res.json({ success: true, expiresAt: new Date(tokenExpiry).toISOString() });
});

app.post('/api/refresh-token', async (req, res) => {
  console.log('🔄 ได้รับคำสั่ง refresh token จาก UI...');
  const ok = await autoRefreshToken();
  if (ok) {
    res.json({ success: true, expiresAt: new Date(tokenExpiry).toISOString() });
  } else {
    res.status(500).json({ error: lastTokenError || 'ไม่สามารถรีเฟรชได้' });
  }
});

// ==========================================
// Advice API
// ==========================================
const API_URL = 'https://prodbackadvice.advice.in.th/api/v1.0.0/product/get';

// ─── Category configs (ทดสอบแล้วกับ API จริง สิงหาคม 2026) ───
// API limit 15 items per group — ต้อง loop หลาย keyword เพื่อให้ครบ
const categoryConfigs = {
  iphone: {
    label: 'iPhone',
    // ดึงทีละ series — แต่ละ keyword ได้ ~15 Apple products
    queries: [
      { category: 'smartphone', keyword: 'iphone 17' },
      { category: 'smartphone', keyword: 'iphone 16' },
      { category: 'smartphone', keyword: 'iphone 15' },
      { category: 'smartphone', keyword: 'iphone 14' },
      { category: 'smartphone', keyword: 'iphone 13' },
      { category: 'smartphone', keyword: 'iphone 12' },
      { category: 'smartphone', keyword: 'iphone 11' },
      { category: 'smartphone', keyword: 'iphone se' },
      { category: 'smartphone', keyword: 'iphone air' },
    ],
    filterSlug: ['apple-product'],
    filterBrandInclude: 'APPLE',
  },
  ipad: {
    label: 'iPad',
    queries: [
      { category: 'smartphone', keyword: 'ipad pro' },
      { category: 'smartphone', keyword: 'ipad air' },
      { category: 'smartphone', keyword: 'ipad mini' },
      { category: 'smartphone', keyword: 'ipad 10' },
      { category: 'smartphone', keyword: 'ipad' },
    ],
    filterSlug: ['apple-product'],
    filterBrandInclude: 'APPLE',
  },
  macbook: {
    label: 'MacBook',
    queries: [
      { category: 'notebook', keyword: 'macbook pro' },
      { category: 'notebook', keyword: 'macbook air' },
      { category: 'notebook', keyword: 'mac mini' },
      { category: 'notebook', keyword: 'mac studio' },
      { category: 'notebook', keyword: 'imac' },
    ],
    filterSlug: ['apple-product'],
    filterBrandInclude: 'APPLE',
  },
  android: {
    label: 'Android',
    queries: [
      { category: 'smartphone', keyword: 'samsung' },
      { category: 'smartphone', keyword: 'xiaomi' },
      { category: 'smartphone', keyword: 'oppo' },
      { category: 'smartphone', keyword: 'vivo' },
      { category: 'smartphone', keyword: 'realme' },
      { category: 'smartphone', keyword: 'google pixel' },
      { category: 'smartphone', keyword: 'motorola' },
      { category: 'smartphone', keyword: '' }, // no keyword = all smartphones
    ],
    excludeBrand: 'APPLE',
  },
};


// ─── แกะ products ออกจาก response ที่มีได้หลาย structure ───
function extractProductsFromResponse(data, config) {
  const prod = data?.data?.product;
  if (!prod) return [];

  // Structure ใหม่: Array of category groups
  // [{ product: [...], category: "APPLE PRODUCTS", category_slug: "apple-product" }, ...]
  if (Array.isArray(prod)) {
    let results = [];
    for (const group of prod) {
      if (!group || typeof group !== 'object') continue;
      const groupItems = group.product;
      if (!Array.isArray(groupItems)) continue;

      // filter by slug ถ้ากำหนดไว้
      if (config.filterSlug && config.filterSlug.length > 0) {
        const slug = (group.category_slug || '').toLowerCase();
        if (!config.filterSlug.some(s => slug.includes(s))) continue;
      }

      // filter by brand include
      let items = groupItems;
      if (config.filterBrandInclude) {
        items = groupItems.filter(p => (p.brand || '').toUpperCase() === config.filterBrandInclude.toUpperCase());
      }

      results.push(...items);
    }
    return results;
  }


  // Structure เดิม: Object { "id": { category, product: [...] } }
  if (typeof prod === 'object') {
    const results = [];
    for (const v of Object.values(prod)) {
      if (Array.isArray(v?.product)) results.push(...v.product);
      else if (Array.isArray(v)) results.push(...v);
    }
    return results;
  }

  return [];
}

async function fetchAllProducts(config, retryOnAuth = true) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',

    'Accept-Language': 'th-TH,th;q=0.9',
    'Origin': 'https://www.advice.co.th',
    'Referer': 'https://www.advice.co.th/product/search?keyword=iphone',
    'User-Agent': UA,
    'Authorization': token,
  };

  const seenCodes = new Set();
  const allProducts = [];

  // ดึงจากทุก query ใน config.queries (multi-keyword approach)
  const queries = config.queries || [{ category: config.category || 'smartphone', keyword: config.keyword || '' }];

  for (const q of queries) {
    let skip = 0;
    while (true) {
      const body = {
        category: q.category,
        category_sub: '',
        product: '',
        keyword: q.keyword || '',
        take: 100,
        skip,
        refSearch: '',
        page: 'product',
        arr_filter_brand: [],
        arr_filter_ict: [],
        arr_filter_price_ict: [],
        arr_filter_cate: [],
        addView: false,
      };

      try {
        const resp = await axios.post(API_URL, body, { headers, timeout: 25000 });
        const data = resp.data;
        if (data.status !== 'SUCCESS' || !data.data) break;

        const pageProducts = extractProductsFromResponse(data, config);
        if (pageProducts.length === 0) break;

        // dedup ด้วย code
        let added = 0;
        for (const p of pageProducts) {
          const key = p.code || p.product;
          if (key && !seenCodes.has(key)) {
            seenCodes.add(key);
            allProducts.push(p);
            added++;
          }
        }
        console.log(`   [${q.keyword || 'all'}] +${added} → รวม ${allProducts.length} รายการ`);

        // keyword search ได้ครบในครั้งเดียว (pagination ไม่ทำงาน)
        break;

      } catch (err) {
        if (err.response?.status === 401 && retryOnAuth) {
          console.log('🔄 Token 401 — รีเฟรชและลองใหม่...');
          cachedToken = null; tokenExpiry = 0;
          const ok = await autoRefreshToken();
          if (ok) return fetchAllProducts(config, false);
        }
        console.error(`   [${q.keyword}] error: ${err.message}`);
        break;
      }
    }
  }

  return allProducts;

}

// ==========================================
// API Routes: Prices
// ==========================================
app.get('/api/prices/:category', async (req, res) => {
  const category = req.params.category;
  const config = categoryConfigs[category];
  if (!config) return res.status(400).json({ error: 'ไม่พบหมวดหมู่นี้' });

  try {
    console.log(`\n🔍 กำลังดึงข้อมูล ${config.label}...`);
    const rawProducts = await fetchAllProducts(config);

    // กรอง brand ตาม config
    let filtered = rawProducts;
    if (config.filterBrand) {
      filtered = rawProducts.filter(p => (p.brand || '').toUpperCase() === config.filterBrand.toUpperCase());
    } else if (config.excludeBrand) {
      filtered = rawProducts.filter(p => (p.brand || '').toUpperCase() !== config.excludeBrand.toUpperCase());
    }

    const items = filtered.map(p => {
      let model = p.product || '';
      let modelCode = '-';
      const match = model.match(/\(([^)]+)\)\s*$/);
      if (match) {
        modelCode = match[1];
        model = model.replace(/\s*\([^)]+\)\s*$/, '').trim();
      }
      return {
        model,
        spec: p.spec || '-',
        modelCode,
        price: p.price_sale || p.price_srp || 0,
        priceSrp: p.price_srp || 0,
        brand: p.brand || '',
        image: p.pic_url || '',
        url: p.product_url ? `https://www.advice.co.th/product/${p.product_url}` : '',
        inStock: p.type === 'instock',
        promotion: p.product_promotion || '',
      };
    });

    console.log(`✅ ${config.label}: ได้ ${items.length} รุ่น`);
    res.json({ items, total: items.length });

  } catch (error) {
    console.error(`❌ Error fetching ${category}:`, error.message);
    if (error.response?.status === 401) { cachedToken = null; tokenExpiry = 0; }
    res.status(500).json({
      error: 'เกิดข้อผิดพลาด กรุณารอสักครู่แล้วลองใหม่',
      detail: error.message,
      status: error.response?.status || null,
    });
  }
});

app.get('/api/prices-studio7', (req, res) => {
  res.json({
    items: studio7Cache,
    lastUpdate: studio7LastUpdate > 0 ? new Date(studio7LastUpdate).toISOString() : 'none',
  });
});

app.post('/api/set-studio7', (req, res) => {
  const { products, secret } = req.body;
  if (secret !== (process.env.TOKEN_SECRET || 'armymimu2024')) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  if (!Array.isArray(products)) return res.status(400).json({ error: 'Products array required' });
  studio7Cache = products;
  studio7LastUpdate = Date.now();
  console.log(`✅ Studio7 อัพเดทแล้ว ${products.length} รายการ`);
  res.json({ success: true, count: products.length });
});

// ==========================================
// Health check
// ==========================================
app.get('/api/health', (req, res) => {
  const minsLeft = cachedToken && tokenExpiry > Date.now()
    ? Math.round((tokenExpiry - Date.now()) / 60000) : 0;
  res.json({
    status: 'ok',
    hasToken: !!cachedToken,
    tokenValid: !!(cachedToken && Date.now() < tokenExpiry),
    tokenExpires: tokenExpiry > 0 ? new Date(tokenExpiry).toISOString() : 'none',
    tokenMinutesLeft: minsLeft,
    tokenSource: 'http-cookie',
    autoRefresh: true,
    fetchCount: tokenFetchCount,
    uptime: Math.floor(process.uptime()) + 's',
    lastTokenError,
  });
});

// ==========================================
// Startup
// ==========================================
app.listen(PORT, async () => {
  console.log(`🚀 Server รันแล้วที่ port ${PORT}`);
  console.log('🌐 Token system: HTTP GET (ไม่ต้องใช้ Puppeteer)');

  if (cachedToken && Date.now() < tokenExpiry) {
    console.log(`✅ Token พร้อมจาก env var`);
    scheduleNextRefresh();
  } else {
    console.log('📡 กำลังดึง Token อัตโนมัติ...');
    await autoRefreshToken();
  }
});
