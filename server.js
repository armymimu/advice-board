const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_FILE = path.join(__dirname, '.product_cache.json');

app.use(cors());
app.use(express.static('.'));

// ==========================================
// Caching Management
// ==========================================
let productCache = {};

function loadProductCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      productCache = JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load product cache:', error.message);
  }
}

function saveProductCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(productCache, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save product cache:', error.message);
  }
}

loadProductCache();

// ==========================================
// Advice API Fetching (Axios - No Puppeteer needed)
// ==========================================
const categoryConfigs = {
  iphone:  { payload: { category: 'apple-product', category_sub: 'iphone', group_end: true }, label: 'iPhone' },
  ipad:    { payload: { category: 'apple-product', category_sub: 'ipad', group_end: true }, label: 'iPad' },
  macbook: { payload: { category: 'apple-product', category_sub: 'mac', group_end: true }, label: 'Mac' },
  android: { payload: { category: 'smartphone-tablet', category_sub: 'smartphone', group_end: true }, label: 'Smart Phone' }
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
  
  while (true) {
    try {
      const reqPayload = {
        ...config.payload,
        take: 100,
        skip: skip,
        page: 'product'
      };

      const res = await axios.post('https://www.advice.co.th/_advice-api/api/v1.0.0/product/get', reqPayload, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      const data = res.data;
      if (!data || !data.data || !data.data.product) break;
      
      const pObj = data.data.product;
      const groups = Object.values(pObj);
      if (groups.length === 0) break;
      
      let itemsAddedThisPage = 0;
      let itemsReturnedThisPage = 0;
      
      groups.forEach(group => {
        if (group.product && Array.isArray(group.product)) {
          itemsReturnedThisPage += group.product.length;
          group.product.forEach(p => {
            if (categoryKey === 'android' && (p.brand || '').toUpperCase() === 'APPLE') return;
            
            const modelCode = p.code || '-';
            if (allProducts.some(existing => existing.modelCode === modelCode && modelCode !== '-')) return;
            
            const nameLow = (p.name || p.product || '').toLowerCase();
            if (categoryKey === 'iphone' && !nameLow.includes('iphone')) return;
            if (categoryKey === 'ipad' && !nameLow.includes('ipad')) return;
            if (categoryKey === 'macbook' && !(nameLow.includes('macbook') || nameLow.includes('mac ') || nameLow.includes('imac') || nameLow.includes('mac mini') || nameLow.includes('mac studio'))) return;
            if (categoryKey === 'iphone' && (nameLow.includes('case') || nameLow.includes('magsafe') || nameLow.includes('cable') || nameLow.includes('adapter') || nameLow.includes('wallet') || nameLow.includes('film') || nameLow.includes('glass'))) return;
            if (categoryKey === 'ipad' && (nameLow.includes('case') || nameLow.includes('pencil') || nameLow.includes('keyboard') || nameLow.includes('folio') || nameLow.includes('film') || nameLow.includes('glass'))) return;
            
            allProducts.push({
              model: p.name || p.product || '',
              spec: p.description || p.spec || '-',
              modelCode: modelCode,
              price: p.price_sale || p.price || 0,
              priceSrp: p.price_srp || p.price || 0,
              brand: p.brand || '',
              image: p.image || p.pic_url || '',
              url: p.product_url ? 'https://www.advice.co.th/product/' + p.product_url : '',
              inStock: p.stock > 0 || p.type === 'instock'
            });
            itemsAddedThisPage++;
          });
        }
      });
      
      if (itemsReturnedThisPage === 0) break; // End of pagination
      if (itemsReturnedThisPage < 100 && skip !== 0) break; // Reached last page
      
      skip += 100;
      if (skip >= 1000) break; // Safety net
      
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
      console.log('\\n🔄 กำลังดึงข้อมูลสด ' + config.label + ' เบื้องหลัง...');
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
    console.log('\\n🔍 ไม่มีแคช กำลังดึงข้อมูล ' + config.label + ' ครั้งแรก...');
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

// Force update route
app.post('/api/update', async (req, res) => {
  try {
    const categoryConfigsKeys = Object.keys(categoryConfigs);
    const results = {};
    
    for (const cat of categoryConfigsKeys) {
      try {
        const items = await fetchAdviceCategory(cat);
        if (items && items.length > 0) {
          productCache[cat] = { items, fetchedAt: Date.now() };
          results[cat] = items.length;
        }
      } catch (err) {
        console.error('Update error for ' + cat + ':', err);
      }
    }
    
    saveProductCache();
    res.json({ success: true, updated: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('🚀 API Server รันแล้วที่ port ' + PORT);
});
