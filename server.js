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
// Advice Web Scraper — Product Fetching (NEW)
// ==========================================
const categoryUrls = {
  iphone:  { url: 'https://www.advice.co.th/product/iphone',       label: 'iPhone' },
  ipad:    { url: 'https://www.advice.co.th/product/ipad',         label: 'iPad' },
  macbook: { url: 'https://www.advice.co.th/product/mac',          label: 'Mac' },
  android: { url: 'https://www.advice.co.th/product/smartphone',   label: 'Smart Phone' }
};

// Keep old config for backward compat with API route
const categoryConfigs = categoryUrls;

let scrapeBrowser = null;

async function getScrapeBrowser() {
  if (scrapeBrowser) {
    try {
      // Check if still usable by accessing a property
      const pages = await scrapeBrowser.pages();
      if (pages) return scrapeBrowser;
    } catch(e) {
      scrapeBrowser = null;
    }
  }
  
  let pup;
  try {
    pup = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    pup.use(StealthPlugin());
  } catch (e) {
    pup = require('puppeteer');
  }
  
  scrapeBrowser = await pup.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-first-run'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
  });
  
  return scrapeBrowser;
}

async function scrapeAdvicePage(categoryKey) {
  const config = categoryUrls[categoryKey];
  if (!config) throw new Error('ไม่พบหมวดหมู่: ' + categoryKey);
  
  console.log(`🌐 กำลัง scrape ${config.label} จาก ${config.url}...`);
  
  const browser = await getScrapeBrowser();
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for product cards to appear
    await page.waitForSelector('.list-product', { timeout: 15000 }).catch(() => {});
    
    // Scroll down to trigger lazy loading
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i++) {
        window.scrollBy(0, 800);
        await new Promise(r => setTimeout(r, 300));
      }
      window.scrollTo(0, 0);
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Extract products from the page
    const products = await page.evaluate((catKey) => {
      const items = [];
      const cards = document.querySelectorAll('.list-product');
      
      cards.forEach(card => {
        try {
          // Product name
          const nameEl = card.querySelector('.fn-name');
          const name = nameEl ? nameEl.textContent.trim() : '';
          if (!name) return;
          
          // URL
          const href = nameEl ? nameEl.getAttribute('href') : '';
          const fullUrl = href ? 'https://www.advice.co.th' + href : '';
          
          // Spec
          const specEl = card.querySelector('.item-spec');
          const spec = specEl ? specEl.textContent.trim() : '';
          
          // Price — from .item-price-sale
          const priceEl = card.querySelector('.item-price-sale');
          let price = 0;
          if (priceEl) {
            const priceText = priceEl.textContent.trim();
            price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;
          }
          
          // SRP price (original price, strikethrough)
          const srpEl = card.querySelector('.item-price-srp');
          let priceSrp = 0;
          if (srpEl) {
            const srpText = srpEl.textContent.trim();
            priceSrp = parseInt(srpText.replace(/[^0-9]/g, '')) || 0;
          }
          
          // Brand
          const brandEl = card.querySelector('.item-brand-name');
          const brand = brandEl ? brandEl.textContent.trim() : '';
          
          // Image
          const imgEl = card.querySelector('.img-product');
          const image = imgEl ? imgEl.getAttribute('src') : '';
          
          // Stock — check for out-of-stock indicators
          const hasAddCart = !!card.querySelector('.btn-add-cart');
          const outOfStockEl = card.querySelector('.item-out-of-stock, .out-of-stock, .btn-notify');
          const inStock = hasAddCart && !outOfStockEl;
          
          // Product code — try from image URL (pattern: /A0180021/)
          let code = '';
          if (image) {
            const codeMatch = image.match(/pic_product4\/(A\d+)/);
            if (codeMatch) code = codeMatch[1];
          }
          
          // Filter for Android: exclude Apple
          if (catKey === 'android' && brand.toUpperCase() === 'APPLE') return;
          
          items.push({
            model: name,
            spec: spec,
            modelCode: code || '-',
            price: price,
            priceSrp: priceSrp || price,
            brand: brand,
            image: image,
            url: fullUrl,
            inStock: inStock
          });
        } catch(e) {}
      });
      
      return items;
    }, categoryKey);
    
    console.log(`✅ ${config.label}: scrape ได้ ${products.length} รายการ`);
    
    await page.close();
    return products;
    
  } catch(err) {
    console.error(`❌ Scrape error (${config.label}):`, err.message);
    try { await page.close(); } catch(_) {}
    throw err;
  }
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
      const items = await scrapeAdvicePage(category);

      productCache[category] = { items, fetchedAt: Date.now() };
      saveProductCache();
      console.log(`✅ อัปเดต ${config.label} เบื้องหลังสำเร็จ: ${items.length} รุ่น`);
    } catch (error) {
      console.error(`❌ Background fetch error for ${category}:`, error.message);
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
