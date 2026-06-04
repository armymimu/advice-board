const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Only require puppeteer if available (for auto token refresh)
let puppeteer, StealthPlugin;
try {
  puppeteer = require('puppeteer-extra');
  StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
} catch (e) {
  console.log('⚠️ puppeteer ไม่ได้ติดตั้ง — จะใช้ manual token เท่านั้น');
}

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN_FILE = path.join(__dirname, '.token_cache.json');

app.use(cors());
app.use(express.static('.'));
app.use(express.json());

// ==========================================
// Token Management — Full Auto-Refresh
// ==========================================
let cachedToken = process.env.ADVICE_TOKEN || null;
let tokenExpiry = cachedToken ? Date.now() + (90 * 60 * 1000) : 0;
let isRefreshing = false;
let refreshTimer = null;

// Load persisted token on startup
if (!cachedToken) {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (saved.token && saved.expiry && Date.now() < saved.expiry) {
        cachedToken = saved.token;
        tokenExpiry = saved.expiry;
        const minsLeft = Math.round((tokenExpiry - Date.now()) / 60000);
        console.log(`✅ โหลด Token จากไฟล์ (เหลือ ${minsLeft} นาที)`);
      } else {
        console.log('⏳ Token ในไฟล์หมดอายุแล้ว — จะรีเฟรชอัตโนมัติ');
      }
    }
  } catch (e) {
    console.log('⚠️ โหลด Token จากไฟล์ไม่สำเร็จ:', e.message);
  }
}

function saveTokenToFile(token, expiry) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, expiry }), 'utf8');
  } catch (e) { /* ignore */ }
}

// ─── AUTO TOKEN REFRESH via Puppeteer ───
async function autoRefreshToken() {
  if (!puppeteer) {
    console.log('⚠️ ไม่สามารถรีเฟรช Token อัตโนมัติได้ (ไม่มี puppeteer)');
    return false;
  }

  if (isRefreshing) {
    console.log('⏳ กำลังรีเฟรชอยู่แล้ว...');
    return false;
  }

  isRefreshing = true;
  console.log('\n🔄 กำลังรีเฟรช Token อัตโนมัติ...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    let token = '';
    page.on('request', (request) => {
      if (request.url().includes('prodbackadvice') &&
          request.url().includes('product/get') &&
          request.method() === 'POST') {
        const h = request.headers();
        if (h['authorization'] && !token) {
          token = h['authorization'];
        }
      }
    });

    await page.setViewport({ width: 1366, height: 768 });
    await page.goto('https://www.advice.co.th/product/search?keyword=iphone', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    try {
      await page.waitForSelector('.list-product', { timeout: 15000 });
    } catch (e) { /* token might still be captured */ }

    await browser.close();
    browser = null;

    if (token) {
      cachedToken = token;
      tokenExpiry = Date.now() + (90 * 60 * 1000); // 90 minutes
      saveTokenToFile(token, tokenExpiry);
      console.log(`✅ Token รีเฟรชสำเร็จ! หมดอายุ: ${new Date(tokenExpiry).toLocaleString('th-TH')}`);
      scheduleNextRefresh();
      isRefreshing = false;
      return true;
    } else {
      console.log('❌ ไม่สามารถดึง Token ได้ — จะลองใหม่ใน 5 นาที');
      setTimeout(() => autoRefreshToken(), 5 * 60 * 1000);
      isRefreshing = false;
      return false;
    }
  } catch (e) {
    console.error('❌ Token refresh error:', e.message);
    if (browser) try { await browser.close(); } catch (_) {}
    // Retry after 5 minutes on error
    setTimeout(() => autoRefreshToken(), 5 * 60 * 1000);
    isRefreshing = false;
    return false;
  }
}

// ─── Schedule next refresh 10 minutes before expiry ───
function scheduleNextRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);

  const timeUntilExpiry = tokenExpiry - Date.now();
  // Refresh 10 minutes before expiry, minimum 1 minute
  const refreshIn = Math.max(timeUntilExpiry - (10 * 60 * 1000), 60 * 1000);
  const refreshMins = Math.round(refreshIn / 60000);

  console.log(`⏰ จะรีเฟรช Token อัตโนมัติใน ${refreshMins} นาที`);

  refreshTimer = setTimeout(() => {
    console.log('⏰ ถึงเวลารีเฟรช Token อัตโนมัติ!');
    autoRefreshToken();
  }, refreshIn);
}

// ─── Get token (auto-refresh if needed) ───
async function getToken() {
  // If token is valid, return it
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // Token expired or not available — try auto-refresh
  console.log('🔑 Token หมดอายุหรือไม่มี — เริ่มรีเฟรชอัตโนมัติ...');
  const success = await autoRefreshToken();
  if (success && cachedToken) {
    return cachedToken;
  }

  // Try direct API without token as fallback
  try {
    const testResp = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
      category: 'iphone', category_sub: '', product: '', keyword: '',
      take: 1, skip: 0, refSearch: '', page: 'product',
      arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [],
      arr_filter_cate: [], addView: false
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.advice.co.th',
        'Referer': 'https://www.advice.co.th/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });
    if (testResp.data?.status === 'SUCCESS') {
      cachedToken = 'DIRECT';
      tokenExpiry = Date.now() + (60 * 60 * 1000);
      console.log('✅ API ใช้ได้โดยตรง ไม่ต้องใช้ Token');
      return cachedToken;
    }
  } catch (e) { /* continue */ }

  // If still have an old cached token, try it
  if (cachedToken) return cachedToken;

  throw new Error('ไม่สามารถดึง Token ได้ — กรุณาลองรีสตาร์ท server');
}

// Studio7 Cache
let studio7Cache = [];
let studio7LastUpdate = 0;

// Endpoint to update token remotely (still works for manual override)
app.post('/api/set-token', (req, res) => {
  const { token, secret } = req.body;
  if (secret !== (process.env.TOKEN_SECRET || 'armymimu2024')) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  if (!token) return res.status(400).json({ error: 'Token required' });

  cachedToken = token;
  tokenExpiry = Date.now() + (90 * 60 * 1000);
  saveTokenToFile(token, tokenExpiry);
  scheduleNextRefresh();
  console.log('✅ Token อัพเดทจาก API! หมดอายุ:', new Date(tokenExpiry).toLocaleString('th-TH'));
  res.json({ success: true, expiresAt: new Date(tokenExpiry).toISOString() });
});

// Force refresh token endpoint
app.post('/api/refresh-token', async (req, res) => {
  console.log('🔄 ได้รับคำสั่งรีเฟรช Token จาก UI...');
  const success = await autoRefreshToken();
  if (success) {
    res.json({ success: true, expiresAt: new Date(tokenExpiry).toISOString() });
  } else {
    res.status(500).json({ error: 'ไม่สามารถรีเฟรช Token ได้' });
  }
});

// Endpoint to update Studio7 prices remotely
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
// Advice API
// ==========================================
const API_URL = 'https://prodbackadvice.advice.in.th/api/v1.0.0/product/get';

const categoryConfigs = {
  iphone: { category: 'iphone', label: 'iPhone' },
  ipad:   { category: 'ipad',   label: 'iPad' },
  macbook:{ category: 'macbook', label: 'MacBook' },
  android:{ category: 'smart-phone', label: 'Smart Phone' }
};

async function fetchAllProducts(config, retryOnAuth = true) {
  const token = await getToken();

  const headers = {
    'Content-Type': 'application/json',
    'Origin': 'https://www.advice.co.th',
    'Referer': 'https://www.advice.co.th/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  };

  if (token && token !== 'DIRECT') {
    headers['Authorization'] = token;
  }

  const allProducts = [];
  let skip = 0;

  while (true) {
    const body = {
      category: config.category,
      category_sub: '',
      product: '',
      keyword: '',
      take: 100,
      skip: skip,
      refSearch: '',
      page: 'product',
      arr_filter_brand: [],
      arr_filter_ict: [],
      arr_filter_price_ict: [],
      arr_filter_cate: [],
      addView: false
    };

    try {
      const resp = await axios.post(API_URL, body, { headers, timeout: 20000 });
      const data = resp.data;

      if (data.status !== 'SUCCESS' || !data.data) break;

      const d = data.data;
      const productObj = d.product;
      let pageProducts = [];

      if (productObj && typeof productObj === 'object' && !Array.isArray(productObj)) {
        for (const [key, pageData] of Object.entries(productObj)) {
          if (pageData.product && Array.isArray(pageData.product)) {
            pageProducts.push(...pageData.product);
          }
        }
      } else if (Array.isArray(productObj)) {
        for (const group of productObj) {
          if (group.product && Array.isArray(group.product)) {
            pageProducts.push(...group.product);
          }
        }
      }

      if (pageProducts.length === 0) break;

      allProducts.push(...pageProducts);
      skip += 100;

      console.log(`   ดึงแล้ว ${allProducts.length} รายการ`);

      if (d.count_product !== undefined && d.count_product <= 100) break;
      if (pageProducts.length < 100) break;
      if (allProducts.length > 2000) break;

    } catch (err) {
      if (err.response && err.response.status === 401 && retryOnAuth) {
        console.log('🔄 Token 401 — รีเฟรชอัตโนมัติ...');
        cachedToken = null;
        tokenExpiry = 0;
        const success = await autoRefreshToken();
        if (success) {
          return fetchAllProducts(config, false);
        }
      }
      throw err;
    }
  }

  return allProducts;
}

// ==========================================
// API Routes
// ==========================================
app.get('/api/prices/:category', async (req, res) => {
  const category = req.params.category;
  const config = categoryConfigs[category];

  if (!config) return res.status(400).json({ error: 'ไม่พบหมวดหมู่นี้' });

  try {
    console.log(`\n🔍 กำลังดึงข้อมูล ${config.label}...`);
    const rawProducts = await fetchAllProducts(config);

    let filtered = rawProducts;
    if (category === 'android') {
      filtered = rawProducts.filter(p => (p.brand || '').toUpperCase() !== 'APPLE');
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
        model: model,
        spec: p.spec || '-',
        modelCode: modelCode,
        price: p.price_sale || p.price_srp || 0,
        priceSrp: p.price_srp || 0,
        brand: p.brand || '',
        image: p.pic_url || '',
        url: p.product_url ? `https://www.advice.co.th/product/${p.product_url}` : '',
        inStock: p.type === 'instock',
        promotion: p.product_promotion || ''
      };
    });

    console.log(`✅ ${config.label}: ได้ ${items.length} รุ่น`);
    res.json({ items, total: items.length });

  } catch (error) {
    console.error(`❌ Error fetching ${category}:`, error.message);

    if (error.response && error.response.status === 401) {
      cachedToken = null;
      tokenExpiry = 0;
      try { fs.unlinkSync(TOKEN_FILE); } catch (e) { /* ignore */ }
    }

    res.status(500).json({
      error: 'เกิดข้อผิดพลาด กรุณารอสักครู่แล้วลองใหม่ (ระบบจะรีเฟรช Token ให้อัตโนมัติ)'
    });
  }
});

// Get Studio7 prices
app.get('/api/prices-studio7', (req, res) => {
  res.json({
    items: studio7Cache,
    lastUpdate: studio7LastUpdate > 0 ? new Date(studio7LastUpdate).toISOString() : 'none'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  const minsLeft = cachedToken && tokenExpiry > Date.now()
    ? Math.round((tokenExpiry - Date.now()) / 60000)
    : 0;
  res.json({
    status: 'ok',
    hasToken: !!cachedToken,
    tokenValid: cachedToken && Date.now() < tokenExpiry,
    tokenExpires: tokenExpiry > 0 ? new Date(tokenExpiry).toISOString() : 'none',
    tokenMinutesLeft: minsLeft,
    autoRefresh: !!puppeteer,
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// ==========================================
// Startup — Auto refresh token immediately
// ==========================================
app.listen(PORT, async () => {
  console.log(`🚀 API Server รันแล้วที่ port ${PORT}`);
  console.log('🔄 ระบบรีเฟรช Token อัตโนมัติ: ' + (puppeteer ? '✅ เปิดใช้งาน' : '❌ ปิด (ไม่มี puppeteer)'));

  if (cachedToken && Date.now() < tokenExpiry) {
    const minsLeft = Math.round((tokenExpiry - Date.now()) / 60000);
    console.log(`✅ Token พร้อมใช้งาน (เหลือ ${minsLeft} นาที)`);
    scheduleNextRefresh();
  } else if (puppeteer) {
    // Auto-refresh on startup if no valid token
    console.log('📡 กำลังดึง Token อัตโนมัติ...');
    await autoRefreshToken();
  } else {
    console.log('⚠️ ไม่มี Token และไม่มี puppeteer — ใช้ /api/set-token หรือติดตั้ง puppeteer');
  }
});
