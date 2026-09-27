const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN_FILE = path.join(__dirname, '.token_cache.json');
const CACHE_FILE = path.join(__dirname, '.product_cache.json');

app.use(cors());
app.use(express.static('.'));

// ==========================================
// Token Management
// ==========================================
let cachedToken = process.env.ADVICE_TOKEN || null;
let tokenExpiry = cachedToken ? Date.now() + (90 * 60 * 1000) : 0;

// Product Cache (persist across restarts)
let productCache = {};  // { iphone: { items: [], fetchedAt: timestamp }, ... }
let studio7Cache = [];
let studio7LastUpdate = 0;

// Load persisted token on startup
if (!cachedToken) {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (saved.token && saved.expiry && Date.now() < saved.expiry) {
        cachedToken = saved.token;
        tokenExpiry = saved.expiry;
        console.log('✅ โหลด Token จากแคช หมดอายุ:', new Date(tokenExpiry).toISOString());
      } else {
        console.log('⚠️ Token ในแคชหมดอายุแล้ว');
      }
    }
  } catch (e) {
    console.log('⚠️ โหลด Token จากแคชไม่สำเร็จ:', e.message);
  }
}

// Load persisted product cache
try {
  if (fs.existsSync(CACHE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (saved.products) productCache = saved.products;
    if (saved.studio7) { studio7Cache = saved.studio7; studio7LastUpdate = saved.studio7Updated || 0; }
    const cats = Object.keys(productCache).filter(k => productCache[k].items?.length > 0);
    if (cats.length > 0) {
      console.log('✅ โหลดแคชสินค้า:', cats.map(c => `${c}(${productCache[c].items.length})`).join(', '));
    }
  }
} catch (e) { /* ignore */ }

function saveTokenToFile(token, expiry) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, expiry }), 'utf8');
  } catch (e) {
    console.log('⚠️ บันทึก Token ลงแคชไม่สำเร็จ:', e.message);
  }
}

function saveProductCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      products: productCache,
      studio7: studio7Cache,
      studio7Updated: studio7LastUpdate
    }), 'utf8');
  } catch (e) { /* ignore */ }
}

async function getToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // Try direct API without token
  console.log('🔑 พยายามเรียก API โดยตรง...');
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
      console.log('✅ API ใช้ได้โดยตรง');
      return cachedToken;
    }
  } catch (e) { /* continue */ }

  // Try auto-refresh with Puppeteer (if available)
  if (!cachedToken || Date.now() >= tokenExpiry) {
    console.log('🔄 พยายาม Auto-Refresh Token ด้วย Puppeteer...');
    try {
      const newToken = await autoRefreshToken();
      if (newToken) return newToken;
    } catch (e) {
      console.log('⚠️ Auto-refresh ล้มเหลว:', e.message);
    }
  }

  if (cachedToken) {
    console.log('⚠️ ใช้ Token เก่าลองเรียก API...');
    return cachedToken;
  }

  throw new Error('ไม่มี Token - ใช้ /api/set-token หรือ refresh-token script');
}

// ==========================================
// Auto-Refresh Token with Puppeteer
// ==========================================
let isRefreshing = false;

async function autoRefreshToken() {
  if (isRefreshing) {
    console.log('⏳ กำลัง refresh อยู่แล้ว...');
    return cachedToken;
  }

  let puppeteer;
  try {
    puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());
  } catch (e) {
    // Puppeteer not available, try plain puppeteer
    try {
      puppeteer = require('puppeteer');
    } catch (e2) {
      console.log('⚠️ Puppeteer ไม่พร้อมใช้งาน - ต้อง set token ด้วยมือ');
      return null;
    }
  }

  isRefreshing = true;
  console.log('🌐 เปิดเบราว์เซอร์ดึง Token...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--single-process'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });

    const page = await browser.newPage();
    let adviceToken = '';

    page.on('request', r => {
      if (r.url().includes('prodbackadvice') && r.url().includes('product/get') && r.method() === 'POST') {
        const h = r.headers();
        if (h.authorization && !adviceToken) {
          adviceToken = h.authorization;
        }
      }
    });

    await page.goto('https://www.advice.co.th/product/iphone', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    try { await page.waitForSelector('.list-product, .product-item, [class*="product"]', { timeout: 15000 }); }
    catch (e) { /* continue anyway */ }

    // Wait a bit for the API call to happen
    await new Promise(r => setTimeout(r, 3000));

    if (adviceToken) {
      cachedToken = adviceToken;
      tokenExpiry = Date.now() + (90 * 60 * 1000);
      saveTokenToFile(adviceToken, tokenExpiry);
      console.log('✅ Auto-Refresh Token สำเร็จ! หมดอายุ:', new Date(tokenExpiry).toISOString());
    } else {
      console.log('⚠️ ไม่สามารถดึง Token อัตโนมัติได้');
    }

    await browser.close();
    isRefreshing = false;
    return adviceToken || null;

  } catch (e) {
    console.error('❌ Auto-refresh error:', e.message);
    if (browser) try { await browser.close(); } catch (_) {}
    isRefreshing = false;
    return null;
  }
}

// ==========================================
// API Endpoints — Token Management
// ==========================================
app.post('/api/set-token', express.json(), (req, res) => {
  const { token, secret } = req.body;
  if (secret !== (process.env.TOKEN_SECRET || 'armymimu2024')) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  if (!token) return res.status(400).json({ error: 'Token required' });

  cachedToken = token;
  tokenExpiry = Date.now() + (90 * 60 * 1000);
  saveTokenToFile(token, tokenExpiry);
  console.log('✅ Token อัพเดทแล้ว หมดอายุ:', new Date(tokenExpiry).toISOString());
  res.json({ success: true, expiresAt: new Date(tokenExpiry).toISOString() });
});

app.post('/api/refresh-token', async (req, res) => {
  try {
    const token = await autoRefreshToken();
    if (token) {
      res.json({ success: true, expiresAt: new Date(tokenExpiry).toISOString() });
    } else {
      res.status(500).json({ success: false, error: 'ไม่สามารถ refresh token ได้' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/set-studio7', express.json(), (req, res) => {
  const { products, secret } = req.body;
  if (secret !== (process.env.TOKEN_SECRET || 'armymimu2024')) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  if (!Array.isArray(products)) return res.status(400).json({ error: 'Products array required' });

  studio7Cache = products;
  studio7LastUpdate = Date.now();
  saveProductCache();
  console.log(`✅ Studio7 อัพเดทแล้ว ${products.length} รายการ`);
  res.json({ success: true, count: products.length });
});

// ==========================================
// Advice API — Product Fetching (FIXED)
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
  let totalExpected = Infinity;  // Will be updated from API response

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
      const resp = await axios.post(API_URL, body, { headers, timeout: 25000 });
      const data = resp.data;

      if (data.status !== 'SUCCESS' || !data.data) {
        console.log(`   ⚠️ API ตอบ status: ${data.status}`);
        break;
      }

      const d = data.data;

      // Update total expected count from API response
      if (d.count_product !== undefined && d.count_product > 0) {
        totalExpected = d.count_product;
      }

      // Extract products from the nested response structure
      const productObj = d.product;
      let pageProducts = [];

      if (productObj && typeof productObj === 'object' && !Array.isArray(productObj)) {
        // Response format: { product: { "0": { product: [...] }, "1": { product: [...] } } }
        for (const [key, pageData] of Object.entries(productObj)) {
          if (pageData && pageData.product && Array.isArray(pageData.product)) {
            pageProducts.push(...pageData.product);
          } else if (Array.isArray(pageData)) {
            // Sometimes the value is directly an array
            pageProducts.push(...pageData);
          }
        }
      } else if (Array.isArray(productObj)) {
        for (const group of productObj) {
          if (group && group.product && Array.isArray(group.product)) {
            pageProducts.push(...group.product);
          } else if (typeof group === 'object' && group.product_url) {
            // Direct product object
            pageProducts.push(group);
          }
        }
      }

      // Also check if products are directly in data.data.products (alternate response format)
      if (pageProducts.length === 0 && Array.isArray(d.products)) {
        pageProducts = d.products;
      }

      if (pageProducts.length === 0) {
        console.log(`   ⚠️ ไม่มีสินค้าเพิ่มเติมที่ skip=${skip}`);
        break;
      }

      allProducts.push(...pageProducts);
      skip += 100;

      console.log(`   ดึงแล้ว ${allProducts.length}/${totalExpected === Infinity ? '?' : totalExpected} รายการ (batch: ${pageProducts.length})`);

      // Stop conditions — FIXED: check against totalExpected properly
      if (allProducts.length >= totalExpected) break;
      if (pageProducts.length < 100) break;    // Last page
      if (allProducts.length > 5000) break;     // Safety limit increased from 2000

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      if (err.response && err.response.status === 401 && retryOnAuth) {
        console.log('🔄 Token 401 - ลองขอ Token ใหม่...');
        cachedToken = null;
        tokenExpiry = 0;
        try { fs.unlinkSync(TOKEN_FILE); } catch (_) {}
        return fetchAllProducts(config, false);
      }
      console.error(`   ❌ Error at skip=${skip}:`, err.message);
      // If we already have some products, return what we have instead of failing
      if (allProducts.length > 0) {
        console.log(`   ⚠️ ส่งคืนข้อมูลที่มี ${allProducts.length} รายการ (ไม่ครบ)`);
        break;
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

  const cached = productCache[category];
  const CACHE_TTL = 5 * 60 * 1000;
  
  const hasCache = cached && cached.items && cached.items.length > 0;
  const isFresh = hasCache && (Date.now() - cached.fetchedAt) < CACHE_TTL;

  // Background refresh function
  const triggerBackgroundRefresh = async () => {
    try {
      console.log(`\n🔄 กำลังดึงข้อมูลสด ${config.label} เบื้องหลัง...`);
      const rawProducts = await fetchAllProducts(config);
      
      let filtered = rawProducts;
      if (category === 'android') {
        filtered = rawProducts.filter(p => (p.brand || '').toUpperCase() !== 'APPLE');
      }

      const items = filtered.map(p => {
        let model = p.product || p.name || '';
        let modelCode = '-';
        const match = model.match(/\(([^)]+)\)\s*$/);
        if (match) {
          modelCode = match[1];
          model = model.replace(/\s*\([^)]+\)\s*$/, '').trim();
        }

        return {
          model: model,
          spec: p.spec || p.description || '-',
          modelCode: modelCode,
          price: p.price_sale || p.price_srp || p.price || 0,
          priceSrp: p.price_srp || p.price || 0,
          brand: p.brand || '',
          image: p.pic_url || p.image || '',
          url: p.product_url ? `https://www.advice.co.th/product/${p.product_url}` : '',
          inStock: p.type === 'instock' || p.stock > 0,
          promotion: p.product_promotion || p.promotion || ''
        };
      });

      productCache[category] = { items, fetchedAt: Date.now() };
      saveProductCache();
      console.log(`✅ อัปเดต ${config.label} เบื้องหลังสำเร็จ: ${items.length} รุ่น`);
    } catch (error) {
      console.error(`❌ Background fetch error for ${category}:`, error.message);
      if (error.response && error.response.status === 401) {
        cachedToken = null; tokenExpiry = 0;
        try { fs.unlinkSync(TOKEN_FILE); } catch (_) {}
      }
    }
  };

  // 1. If cache exists (even if stale), return it INSTANTLY
  if (hasCache) {
    if (!isFresh) {
      // Trigger background refresh but don't await it
      triggerBackgroundRefresh();
    }
    return res.json({ 
      items: cached.items, 
      total: cached.items.length, 
      cached: true, 
      stale: !isFresh,
      fetchedAt: cached.fetchedAt 
    });
  }

  // 2. No cache at all -> Must block and wait for the first fetch
  try {
    console.log(`\n🔍 ไม่มีแคช กำลังดึงข้อมูล ${config.label} ครั้งแรก (อาจใช้เวลา)...`);
    await triggerBackgroundRefresh();
    
    // Return newly fetched cache
    const newCache = productCache[category];
    if (newCache && newCache.items) {
      res.json({ items: newCache.items, total: newCache.items.length, cached: false, stale: false, fetchedAt: newCache.fetchedAt });
    } else {
      res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ' });
    }
  } catch (error) {
    const isNoToken = error.message && error.message.includes('ไม่มี Token');
    res.status(500).json({
      error: isNoToken
        ? 'ยังไม่มี Token กรุณารัน refresh-token.bat'
        : 'เชื่อมต่อ Advice ไม่สำเร็จ กรุณาลองใหม่'
    });
  }
});

app.get('/api/prices-studio7', (req, res) => {
  res.json({
    items: studio7Cache,
    lastUpdate: studio7LastUpdate > 0 ? new Date(studio7LastUpdate).toISOString() : 'none'
  });
});

app.get('/api/health', (req, res) => {
  const tokenMinutesLeft = cachedToken && tokenExpiry > 0
    ? Math.max(0, Math.round((tokenExpiry - Date.now()) / 60000))
    : 0;

  res.json({
    status: 'ok',
    hasToken: !!cachedToken,
    tokenValid: cachedToken && Date.now() < tokenExpiry,
    tokenExpires: tokenExpiry > 0 ? new Date(tokenExpiry).toISOString() : 'none',
    tokenMinutesLeft,
    autoRefresh: hasPuppeteer(),
    uptime: Math.floor(process.uptime()) + 's',
    cachedCategories: Object.keys(productCache).filter(k => productCache[k].items?.length > 0),
    studio7Count: studio7Cache.length
  });
});

function hasPuppeteer() {
  try { require.resolve('puppeteer-extra'); return true; } catch (_) {
    try { require.resolve('puppeteer'); return true; } catch (_2) { return false; }
  }
}

// ==========================================
// Auto-Refresh Scheduler
// ==========================================
const REFRESH_INTERVAL = 60 * 60 * 1000; // 60 minutes

function scheduleTokenRefresh() {
  setInterval(async () => {
    if (!cachedToken || Date.now() > tokenExpiry - (10 * 60 * 1000)) {
      console.log('\n⏰ Token หมดเร็วๆ นี้ — Auto-Refresh...');
      try {
        await autoRefreshToken();
      } catch (e) {
        console.error('❌ Scheduled refresh failed:', e.message);
      }
    }
  }, REFRESH_INTERVAL);
  console.log(`⏰ Auto-refresh Token ทุก ${REFRESH_INTERVAL / 60000} นาที`);
}

// ==========================================
// Keep-Alive (Prevent Render Free Tier Sleep)
// ==========================================
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;

function startKeepAlive() {
  if (!RENDER_URL) {
    console.log('💤 ไม่มี RENDER_EXTERNAL_URL - ข้าม keep-alive');
    return;
  }
  const INTERVAL = 14 * 60 * 1000; // 14 minutes (Render sleeps after 15)
  setInterval(async () => {
    try {
      const resp = await axios.get(`${RENDER_URL}/api/health`, { timeout: 10000 });
      console.log(`💓 Keep-alive ping OK (uptime: ${resp.data.uptime})`);
    } catch (e) {
      console.log('💓 Keep-alive ping failed:', e.message);
    }
  }, INTERVAL);
  console.log(`💓 Keep-alive ping ทุก 14 นาที -> ${RENDER_URL}`);
}

// ==========================================
// Startup
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 API Server รันแล้วที่ port ${PORT}`);
  if (cachedToken) {
    console.log('✅ Token พร้อมใช้งาน!');
  } else {
    console.log('⚠️ ยังไม่มี Token - รอการ set-token หรือ refresh');
  }

  // Start keep-alive
  startKeepAlive();

  // Auto-refresh token scheduler
  if (hasPuppeteer()) {
    console.log('🌐 Puppeteer พร้อม - รองรับ auto-refresh token');
    scheduleTokenRefresh();

    // If no token, try to get one immediately
    if (!cachedToken || Date.now() >= tokenExpiry) {
      setTimeout(() => {
        console.log('\n🔄 Startup: พยายาม auto-refresh token...');
        autoRefreshToken().catch(e => console.log('⚠️ Startup refresh failed:', e.message));
      }, 5000);
    }
  } else {
    console.log('💡 ใช้ refresh-token.bat บนเครื่อง local เพื่ออัพเดท Token');
  }
});
