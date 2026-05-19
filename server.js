const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('.'));

// ==========================================
// Token Management (Auto-refresh with Puppeteer)
// ==========================================
let cachedToken = process.env.ADVICE_TOKEN || null;
let tokenExpiry = cachedToken ? Date.now() + (30 * 60 * 1000) : 0;
let isRefreshing = false;

async function refreshTokenWithPuppeteer() {
  if (isRefreshing) return cachedToken;
  isRefreshing = true;

  console.log('🔑 กำลังขอ Token ใหม่ด้วย Puppeteer...');
  let browser = null;

  try {
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--single-process',
        '--no-zygote',
        '--js-flags=--max-old-space-size=128'
      ]
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Block heavy resources to save memory
    await page.setRequestInterception(true);
    let token = '';

    page.on('request', (req) => {
      // Capture token
      if (req.url().includes('prodbackadvice') && req.url().includes('product/get') && req.method() === 'POST') {
        const h = req.headers();
        if (h['authorization'] && !token) {
          token = h['authorization'];
          console.log('🔑 Token captured!');
        }
      }
      // Block images/css/fonts
      const rt = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(rt)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setViewport({ width: 800, height: 600 });
    await page.goto('https://www.advice.co.th/product/iphone', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    try {
      await page.waitForSelector('.list-product', { timeout: 15000 });
    } catch (e) {
      // Token might still be captured
    }

    await browser.close();
    browser = null;

    if (token) {
      cachedToken = token;
      tokenExpiry = Date.now() + (90 * 60 * 1000);
      console.log('✅ Token ได้รับแล้ว! หมดอายุ:', new Date(tokenExpiry).toISOString());
      return cachedToken;
    } else {
      throw new Error('ไม่สามารถจับ Token ได้');
    }
  } catch (err) {
    console.error('❌ Puppeteer refresh failed:', err.message);
    throw err;
  } finally {
    isRefreshing = false;
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

async function getToken() {
  // Return cached if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // Token expired or missing - try to refresh
  console.log('⚠️ Token expired, attempting auto-refresh...');
  return await refreshTokenWithPuppeteer();
}

// Endpoint to update token remotely (backup method)
app.post('/api/set-token', express.json(), (req, res) => {
  const { token, secret } = req.body;
  if (secret !== (process.env.TOKEN_SECRET || 'armymimu2024')) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  if (!token) return res.status(400).json({ error: 'Token required' });

  cachedToken = token;
  tokenExpiry = Date.now() + (90 * 60 * 1000);
  console.log('✅ Token อัพเดทจากภายนอกแล้ว');
  res.json({ success: true, expiresAt: new Date(tokenExpiry).toISOString() });
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

async function fetchAllProducts(config) {
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
  }

  return allProducts;
}

// ==========================================
// API Route
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

    // If 401, clear token so next request triggers auto-refresh
    if (error.response && error.response.status === 401) {
      cachedToken = null;
      tokenExpiry = 0;
    }

    res.status(500).json({ error: 'เกิดข้อผิดพลาด - กำลังขอ Token ใหม่ กรุณาลองอีกครั้ง' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasToken: !!cachedToken,
    tokenExpires: tokenExpiry > 0 ? new Date(tokenExpiry).toISOString() : 'none',
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// ==========================================
// Keep-Alive Self-Ping (prevents Render sleep)
// ==========================================
function startKeepAlive() {
  const INTERVAL = 14 * 60 * 1000; // 14 minutes
  const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

  setInterval(async () => {
    try {
      const resp = await axios.get(`${selfUrl}/api/health`, { timeout: 10000 });
      console.log(`💓 Keep-alive ping OK (token: ${resp.data.hasToken ? '✅' : '❌'})`);

      // Auto-refresh token if it will expire within 30 minutes
      if (cachedToken && tokenExpiry - Date.now() < 30 * 60 * 1000) {
        console.log('🔄 Token จะหมดอายุเร็วๆ นี้ กำลัง refresh...');
        try {
          await refreshTokenWithPuppeteer();
        } catch (e) {
          console.log('⚠️ Auto-refresh failed, will retry next cycle');
        }
      }
    } catch (e) {
      console.log('⚠️ Keep-alive ping failed:', e.message);
    }
  }, INTERVAL);
}

// ==========================================
// Startup
// ==========================================
app.listen(PORT, async () => {
  console.log(`🚀 API Server รันแล้วที่ port ${PORT}`);

  // Try to get token on startup
  if (!cachedToken || Date.now() >= tokenExpiry) {
    console.log('📡 กำลังขอ Token ตอนเริ่มระบบ...');
    try {
      await refreshTokenWithPuppeteer();
      console.log('✅ พร้อมใช้งาน!');
    } catch (e) {
      console.log('⚠️ ยังไม่มี Token - จะขอใหม่อัตโนมัติเมื่อมีคำขอ');
    }
  } else {
    console.log('✅ Token จาก ENV พร้อมใช้งาน!');
  }

  // Start keep-alive ping
  startKeepAlive();
  console.log('💓 Keep-alive ทำงานทุก 14 นาที');
});
