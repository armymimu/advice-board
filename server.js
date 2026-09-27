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

    try {
      await page.goto('https://www.advice.co.th/product/iphone', {
        waitUntil: 'domcontentloaded',
        timeout: 25000
      });
    } catch (err) {
      console.log('⚠️ Page load warning:', err.message);
    }

    try { await page.waitForSelector('.list-product, .product-item, [class*="product"]', { timeout: 10000 }); }
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
// Advice API Fetching (Axios - No Puppeteer needed)
// ==========================================
const categoryConfigs = {
  iphone:  { category: 'iphone',       label: 'iPhone' },
  ipad:    { category: 'ipad',         label: 'iPad' },
  macbook: { category: 'mac',          label: 'Mac' },
  android: { category: 'smartphone',   label: 'Smart Phone' }
};

let cachedApiToken = null;

async function getApiToken() {
  if (cachedApiToken) return cachedApiToken;
  try {
    const res = await axios.get('https://www.advice.co.th/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    if (res.headers['set-cookie']) {
      const tokenCookie = res.headers['set-cookie'].find(c => c.startsWith('user_token='));
      if (tokenCookie) {
        cachedApiToken = tokenCookie.split(';')[0].split('=')[1];
        return cachedApiToken;
      }
    }
  } catch(e) {
    console.error('Failed to get token:', e.message);
  }
  return null;
}

async function fetchAdviceCategory(categoryKey) {
  const config = categoryConfigs[categoryKey];
  if (!config) throw new Error('ไม่พบหมวดหมู่: ' + categoryKey);
  
  console.log('🌐 กำลังดึงข้อมูล ' + config.label + ' ผ่าน API...');
  
  const token = await getApiToken();
  if (!token) throw new Error('ไม่สามารถขอ Token จากระบบได้');

  let allProducts = [];
  let skip = 0;
  let total = Infinity;

  while(allProducts.length < total) {
    try {
      const res = await axios.post('https://www.advice.co.th/_advice-api/api/v1.0.0/product/get', {
        category: config.category,
        take: 100,
        skip: skip,
        page: 'product',
        group_end: false
      }, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      const data = res.data; 
      if (data.status !== 'SUCCESS' || !data.data || !data.data.product) break;
      
      const productObj = data.data.product;
      if (skip === 0) total = data.data.count_product || 0;
      if (!productObj) break;
      
      const groups = Object.values(productObj);
      if (groups.length === 0) break;
      
      groups.forEach(group => {
        if (group.product && Array.isArray(group.product)) {
          group.product.forEach(p => {
            if (categoryKey === 'android' && (p.brand || '').toUpperCase() === 'APPLE') return;
            
            allProducts.push({
              model: p.name || p.product || '',
              spec: p.description || p.spec || '-',
              modelCode: p.code || '-',
              price: p.price_sale || p.price || 0,
              priceSrp: p.price_srp || p.price || 0,
              brand: p.brand || '',
              image: p.image || p.pic_url || '',
              url: p.product_url ? 'https://www.advice.co.th/product/' + p.product_url : '',
              inStock: p.stock > 0 || p.type === 'instock'
            });
          });
        }
      });
      
      skip += 100;
      if (groups.length < 100) break;
      
    } catch(err) {
      if (err.response && err.response.status === 401) {
        cachedApiToken = null; 
      }
      console.error('❌ API Error (' + config.label + '):', err.message);
      break;
    }
  }

  console.log('✅ ' + config.label + ': ดึงได้ ' + allProducts.length + ' รายการ');
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

  const triggerBackgroundRefresh = async () => {
    try {
      console.log('\n🔄 กำลังดึงข้อมูลสด ' + config.label + ' เบื้องหลัง...');
      const items = await fetchAdviceCategory(category);

      if (items && items.length > 0) {
        productCache[category] = { items, fetchedAt: Date.now() };
        saveProductCache();
        console.log('✅ อัปเดต ' + config.label + ' เบื้องหลังสำเร็จ: ' + items.length + ' รุ่น');
      }
    } catch (error) {
      console.error('❌ Background fetch error for ' + category + ':', error.message);
    }
  };

  if (hasCache) {
    if (!isFresh) {
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

  try {
    console.log('\n🔍 ไม่มีแคช กำลังดึงข้อมูล ' + config.label + ' ครั้งแรก...');
    await triggerBackgroundRefresh();
    
    const newCache = productCache[category];
    if (newCache && newCache.items && newCache.items.length > 0) {
      res.json({ items: newCache.items, total: newCache.items.length, cached: false, stale: false, fetchedAt: newCache.fetchedAt });
    } else {
      res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
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
