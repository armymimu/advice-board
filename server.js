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
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"' },
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
  let allProducts = [];
  const token = await getApiToken();
  if (!token) throw new Error('ไม่สามารถขอ Token จากระบบได้');

  let skip = 0;
  let retryCount = 0;
  const isSearchApi = ['iphone', 'ipad', 'macbook'].includes(categoryKey);

  while (true) {
    try {
      let endpoint = 'https://www.advice.co.th/_advice-api/api/v1.0.0/product/get';
      let reqPayload = {};
      
      if (isSearchApi) {
        endpoint = 'https://www.advice.co.th/_advice-api/api/v1.0.0/product/search';
        reqPayload = {
          keyword: categoryKey === 'macbook' ? 'macbook' : categoryKey,
          sort: 'desc',
          order: 'popular',
          take: 20,
          skip: skip
        };
      } else {
        reqPayload = {
          category: 'smartphone-tablet',
          category_sub: 'smartphone',
          group_end: true,
          take: 100,
          skip: skip,
          page: 'product'
        };
      }

      await new Promise(r => setTimeout(r, 1500));
      
      const res = await axios.post(endpoint, reqPayload, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
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
            
            const badWords = ['case', 'เคส', 'film', 'ฟิล์ม', 'glass', 'กระจก', 'magsafe', 'cable', 'สายชาร์จ', 'สาย', 'adapter', 'หัวชาร์จ', 'อะแดปเตอร์', 'อะแดปปเตอร์', 'wallet', 'pencil', 'ปากกา', 'keyboard', 'คีย์บอร์ด', 'folio', 'mouse', 'เมาส์', 'trackpad', 'แทร็คแพด', 'hub', 'dongle', 'dock', 'ซอง', 'กระเป๋า', 'bag', 'sleeve', 'airpods', 'earpods', 'watch', 'strap', 'สายนาฬิกา', 'apple tv', 'care+', 'applecare', 'ประกัน', 'warranty', 'smart tag', 'airtag', 'ซิม', 'sim', 'ลำโพง', 'speaker', 'ขาตั้ง', 'stand', 'ชาร์จไร้สาย', 'wireless charger', 'หูฟัง', 'headphone', 'earbud'];
            if (badWords.some(w => nameLow.includes(w))) return;

            if (categoryKey === 'iphone' && !nameLow.includes('iphone')) return;
            if (categoryKey === 'ipad' && !nameLow.includes('ipad')) return;
            if (categoryKey === 'macbook' && !(nameLow.includes('macbook') || nameLow.includes('mac ') || nameLow.includes('imac') || nameLow.includes('mac mini') || nameLow.includes('mac studio'))) return;
            
            allProducts.push({
              model: p.name || p.product || '',
              spec: p.spec || '',
              price: p.price_sale || p.price || 0,
              modelCode: modelCode,
              brand: p.brand || '',
              image: p.image || p.pic_url || '',
              url: p.product_url ? 'https://www.advice.co.th/product/' + p.product_url : '',
              inStock: p.stock > 0 || p.type === 'instock'
            });
            itemsAddedThisPage++;
          });
        }
      });
      
      if (itemsReturnedThisPage === 0) break;
      if (itemsReturnedThisPage < (isSearchApi ? 20 : 100) && skip !== 0) break;
      
      skip += (isSearchApi ? 20 : 100);
      if (skip >= (isSearchApi ? 1000 : 2000)) break;
      
    } catch(err) {
      if (err.response && err.response.status === 401) {
        cachedApiToken = null; 
      }
      retryCount++;
      if (retryCount > 3) throw err;
      await new Promise(r => setTimeout(r, 2000));
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

  const triggerBackgroundRefresh = async () => {
    try {
      console.log('\\n🔄 กำลังดึงข้อมูลสด ' + config.label + ' เบื้องหลัง...');
      const items = await fetchAdviceCategory(category);

      if (items && items.length > 0) {
        productCache[category] = { items, fetchedAt: Date.now(), lastError: null };
        saveProductCache();
        console.log('✅ อัปเดต ' + config.label + ' เบื้องหลังสำเร็จ: ' + items.length + ' รุ่น');
      } else {
        productCache[category] = { items: [], fetchedAt: Date.now(), lastError: 'API returned 0 items' };
      }
    } catch (error) {
      console.error('❌ Background fetch error for ' + category + ':', error.message);
      productCache[category] = { items: [], fetchedAt: Date.now(), lastError: error.message };
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
      res.status(500).json({ error: newCache && newCache.lastError ? newCache.lastError : 'ดึงข้อมูลไม่สำเร็จ' });
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


app.get('/api/debug', async (req, res) => {
  try {
    const r1 = await axios.get('https://www.advice.co.th/', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
    res.json({ success: true, status: r1.status, headers: r1.headers['set-cookie'] ? 'Has Cookies' : 'No Cookies' });
  } catch (e) {
    res.json({ success: false, error: e.message, code: e.code, status: e.response ? e.response.status : null });
  }
});

app.listen(PORT, () => {
  console.log('🚀 API Server รันแล้วที่ port ' + PORT);
});
