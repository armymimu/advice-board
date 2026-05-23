const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('.'));

// ==========================================
// Token Management (Auto-refresh on 401)
// ==========================================
let cachedToken = process.env.ADVICE_TOKEN || null;
let tokenExpiry = cachedToken ? Date.now() + (90 * 60 * 1000) : 0;

// Studio7 Cache
let studio7Cache = [];
let studio7LastUpdate = 0;

async function getToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // Try direct API without token (sometimes Advice allows it)
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

  // If still have a cached token (even possibly expired), return it to try
  if (cachedToken) {
    console.log('⚠️ ใช้ Token เก่าลองเรียก API...');
    return cachedToken;
  }

  throw new Error('ไม่มี Token - ใช้ /api/set-token หรือ refresh-token script');
}

// Endpoint to update token remotely
app.post('/api/set-token', express.json(), (req, res) => {
  const { token, secret } = req.body;
  if (secret !== (process.env.TOKEN_SECRET || 'armymimu2024')) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  if (!token) return res.status(400).json({ error: 'Token required' });

  cachedToken = token;
  tokenExpiry = Date.now() + (90 * 60 * 1000);
  console.log('✅ Token อัพเดทแล้ว หมดอายุ:', new Date(tokenExpiry).toISOString());
  res.json({ success: true, expiresAt: new Date(tokenExpiry).toISOString() });
});

// Endpoint to update Studio7 prices remotely
app.post('/api/set-studio7', express.json(), (req, res) => {
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
      // If 401 and we haven't retried yet, try refreshing token
      if (err.response && err.response.status === 401 && retryOnAuth) {
        console.log('🔄 Token 401 - ลองขอ Token ใหม่...');
        cachedToken = null;
        tokenExpiry = 0;
        return fetchAllProducts(config, false);
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
    }

    res.status(500).json({ error: 'Token หมดอายุ กรุณากด "Refresh Token" หรือรอสักครู่' });
  }
});

// Get Studio7 prices
app.get('/api/prices-studio7', (req, res) => {
  res.json({
    items: studio7Cache,
    lastUpdate: studio7LastUpdate > 0 ? new Date(studio7LastUpdate).toISOString() : 'none'
  });
});

// Health check (also used by keep-alive services)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasToken: !!cachedToken,
    tokenValid: cachedToken && Date.now() < tokenExpiry,
    tokenExpires: tokenExpiry > 0 ? new Date(tokenExpiry).toISOString() : 'none',
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// ==========================================
// Startup
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 API Server รันแล้วที่ port ${PORT}`);
  if (cachedToken) {
    console.log('✅ Token จาก ENV พร้อมใช้งาน!');
  } else {
    console.log('⚠️ ยังไม่มี Token - รอการ set-token หรือ refresh');
  }
  console.log('💡 ใช้ refresh-token.bat บนเครื่อง local เพื่ออัพเดท Token อัตโนมัติ');
});
