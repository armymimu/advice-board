const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const startIdx = code.indexOf('// ==========================================\n// Advice Web Scraper');
const endIdx = code.indexOf("app.get('/api/prices-studio7',");

if (startIdx !== -1 && endIdx !== -1) {
  const newSection = `// ==========================================
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
      if (data.status !== 'SUCCESS' || !data.data || !data.data.category_content) break;
      
      const content = data.data.category_content;
      if (skip === 0) total = data.data.count_product || 0;
      if (content.length === 0) break;
      
      content.forEach(group => {
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
      if (content.length < 100) break;
      
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

`;
  code = code.substring(0, startIdx) + newSection + code.substring(endIdx);
  fs.writeFileSync('server.js', code);
  console.log('Replaced successfully');
} else {
  console.log('Could not find markers');
}
