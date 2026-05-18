const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: allow Netlify frontend
const allowedOrigins = [
  'http://localhost:3000',
  'https://subtle-sunflower-2d64f3.netlify.app'
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) cb(null, true);
    else cb(null, true); // allow all for now
  }
}));
app.use(express.static('.'));

// ==========================================
// Token Management
// ==========================================
let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  console.log('🔑 กำลังขอ Token ใหม่...');
  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--no-first-run',
      '--single-process',
      '--no-zygote',
      '--js-flags=--max-old-space-size=256'
    ]
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  // Block images/CSS/fonts to save memory + capture token from API requests
  await page.setRequestInterception(true);
  let token = '';
  page.on('request', (req) => {
    // Capture token from Advice API calls
    if (req.url().includes('prodbackadvice') && req.url().includes('product/get') && req.method() === 'POST') {
      const h = req.headers();
      if (h['authorization'] && !token) {
        token = h['authorization'];
        console.log('🔑 Token captured from request');
      }
    }
    // Block heavy resources
    const rt = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(rt)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.setViewport({ width: 800, height: 600 });
  await page.goto('https://www.advice.co.th/product/iphone', { waitUntil: 'networkidle2' });

  try {
    await page.waitForSelector('.list-product', { timeout: 15000 });
  } catch (e) {
    // Token might still be captured even on timeout
  }

  await browser.close();

  if (token) {
    cachedToken = token;
    tokenExpiry = Date.now() + (90 * 60 * 1000); // Cache for 90 minutes
    console.log('✅ Token ได้รับแล้ว');
  } else {
    throw new Error('ไม่สามารถขอ Token ได้');
  }

  return cachedToken;
}

// ==========================================
// Advice API
// ==========================================
const API_URL = 'https://prodbackadvice.advice.in.th/api/v1.0.0/product/get';

// Category slug → API category parameter
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
    'Authorization': token,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
  };

  const allProducts = [];
  let skip = 0;
  let totalFromAPI = null;

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

    // Get total count on first request
    if (totalFromAPI === null) {
      // For category mode, count_product in the response tells us how many were returned in this page
      // The actual total might need us to check the full grouped response
      // Let's just collect and paginate
    }

    // Category API returns product as an object with numeric keys (pages)
    // Each value has { category: {...}, product: [...] }
    const productObj = d.product;
    let pageProducts = [];

    if (productObj && typeof productObj === 'object' && !Array.isArray(productObj)) {
      // Object with numeric keys (category mode)
      for (const [key, pageData] of Object.entries(productObj)) {
        if (pageData.product && Array.isArray(pageData.product)) {
          pageProducts.push(...pageData.product);
        }
      }
    } else if (Array.isArray(productObj)) {
      // Array mode (search mode) - groups of products
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

    // If returned less than requested, we've reached the end
    if (d.count_product !== undefined && d.count_product <= 100) break;
    if (pageProducts.length < 100) break;
    
    // Safety limit
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

    // For Android, exclude Apple products
    let filtered = rawProducts;
    if (category === 'android') {
      filtered = rawProducts.filter(p => (p.brand || '').toUpperCase() !== 'APPLE');
    }

    // Map to clean format
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

    console.log(`✅ ${config.label}: ได้ ${items.length} รุ่น (จากทั้งหมด ${rawProducts.length} รายการ)`);
    res.json({ items, total: items.length });

  } catch (error) {
    console.error(`❌ Error fetching ${category}:`, error.message);

    if (error.response && error.response.status === 401) {
      cachedToken = null;
      tokenExpiry = 0;
    }

    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลจากเว็บ' });
  }
});

// Pre-warm token
app.listen(PORT, async () => {
  console.log(`🚀 API Server รันแล้วที่ http://localhost:${PORT}`);
  console.log('📡 กำลังเตรียม Token...');
  try {
    await getToken();
    console.log('✅ พร้อมใช้งาน!');
  } catch (e) {
    console.log('⚠️ Token ยังไม่พร้อม จะขอใหม่ตอนมีคำขอแรก');
  }
});
