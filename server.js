const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_FILE = path.join(__dirname, '.product_cache.json');
const CACHE_TTL = 30 * 60 * 1000; // 30 min — mobile hits cache more often

app.use(cors());
app.use(express.static('.'));

// ─── Cache ───
let productCache = {};

function loadProductCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      productCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Cache load error:', e.message);
  }
}

function saveProductCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(productCache, null, 2), 'utf8');
  } catch (e) {
    console.error('Cache save error:', e.message);
  }
}

loadProductCache();

// ─── Token ───
let cachedApiToken = null;

async function getApiToken() {
  if (cachedApiToken) return cachedApiToken;
  const res = await axios.get('https://www.advice.co.th/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    timeout: 12000
  });
  const tokenCookie = res.headers['set-cookie']?.find(c => c.startsWith('user_token='));
  if (tokenCookie) {
    cachedApiToken = tokenCookie.split(';')[0].split('=')[1];
    return cachedApiToken;
  }
  throw new Error('No user_token cookie from advice.co.th');
}

// ─── Keywords per category ───
const KEYWORDS = {
  iphone: [
    'iphone 17 pro max', 'iphone 17 pro', 'iphone 17 plus', 'iphone 17', 'iphone 17e',
    'iphone 16 pro max', 'iphone 16 pro', 'iphone 16 plus', 'iphone 16',
    'iphone 15 pro max', 'iphone 15 pro', 'iphone 15 plus', 'iphone 15',
    'iphone 14 pro max', 'iphone 14 pro', 'iphone 14 plus', 'iphone 14',
    'iphone 13', 'iphone se'
  ],
  ipad: [
    'ipad pro 11', 'ipad pro 13', 'ipad pro 12.9',
    'ipad air 11', 'ipad air 13', 'ipad air 10.9',
    'ipad mini 7', 'ipad mini 6',
    'ipad 10.9', 'ipad 10.2', 'ipad a16'
  ],
  macbook: [
    'macbook pro 14', 'macbook pro 16', 'macbook pro 13',
    'macbook air 15', 'macbook air 13', 'macbook air m1',
    'imac 24', 'mac mini', 'mac studio'
  ]
};

const BAD_WORDS = [
  'case', 'เคส', 'film', 'ฟิล์ม', 'กระจก', 'cable', 'สายชาร์จ',
  'adapter', 'หัวชาร์จ', 'อะแดปเตอร์', 'wallet', 'pencil', 'ปากกา',
  'keyboard', 'คีย์บอร์ด', 'folio', 'mouse', 'เมาส์', 'trackpad',
  'hub', 'dongle', 'dock', 'ซอง', 'กระเป๋า', 'bag', 'sleeve',
  'airpods', 'earpods', 'watch', 'strap', 'สายนาฬิกา', 'apple tv',
  'care+', 'applecare', 'ประกัน', 'warranty', 'airtag',
  'ลำโพง', 'speaker', 'ขาตั้ง', 'stand', 'หูฟัง', 'headphone', 'earbud',
  'charger', 'power bank', 'แบตสำรอง', 'magsafe battery'
];

// ─── Fetch one keyword via search API ───
async function searchOne(keyword, token) {
  const res = await axios.post(
    'https://www.advice.co.th/_advice-api/api/v1.0.0/product/search',
    { keyword, sort: 'desc', order: 'popular' },
    {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 15000
    }
  );
  const groups = res.data?.data?.product || [];
  return groups.flatMap(g => g.product || []);
}

// ─── Fetch android via paginated /get API ───
async function fetchAndroid(token) {
  const allRaw = [];
  const skips = [0, 100, 200, 300, 400, 500, 600, 700, 800];
  for (const skip of skips) {
    try {
      const res = await axios.post(
        'https://www.advice.co.th/_advice-api/api/v1.0.0/product/get',
        { category: 'smartphone-tablet', category_sub: 'smartphone', group_end: true, take: 100, skip, page: 'product' },
        {
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0',
          },
          timeout: 15000
        }
      );
      const pObj = res.data?.data?.product;
      if (!pObj) break;
      const groups = Array.isArray(pObj) ? pObj : Object.values(pObj);
      const items = groups.flatMap(g => g.product || []);
      if (items.length === 0) break;
      allRaw.push(...items);
      if (items.length < 100) break;
    } catch (e) {
      break;
    }
  }
  return allRaw;
}

// ─── Parallel keyword fetch (batch 4 at a time) ───
async function fetchInBatches(keywords, token, batchSize = 4) {
  const allRaw = [];
  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(kw => searchOne(kw, token)));
    results.forEach(r => { if (r.status === 'fulfilled') allRaw.push(...r.value); });
    // 400ms pause between batches to avoid rate limit
    if (i + batchSize < keywords.length) await new Promise(r => setTimeout(r, 400));
  }
  return allRaw;
}

// ─── Filter & dedup raw items ───
function processItems(rawItems, categoryKey) {
  const seen = new Set();
  const result = [];

  for (const p of rawItems) {
    if (categoryKey === 'android' && (p.brand || '').toUpperCase() === 'APPLE') continue;

    const code = p.code || '';
    if (code && seen.has(code)) continue;

    const nameLow = (p.product || p.name || '').toLowerCase();
    if (!nameLow) continue;
    if (BAD_WORDS.some(w => nameLow.includes(w))) continue;

    if (categoryKey === 'iphone'  && !nameLow.includes('iphone')) continue;
    if (categoryKey === 'ipad'    && !nameLow.includes('ipad')) continue;
    if (categoryKey === 'macbook' && !['macbook', 'imac', 'mac mini', 'mac studio', 'mac pro'].some(w => nameLow.includes(w))) continue;
    if (categoryKey === 'android' && (nameLow.includes('iphone') || nameLow.includes('ipad'))) continue;

    if (code) seen.add(code);
    result.push({
      model:     p.product || p.name || '',
      spec:      p.spec || '',
      price:     p.price_sale || p.price || 0,
      priceSrp:  p.price_srp || 0,
      modelCode: code || '-',
      brand:     p.brand || '',
      image:     p.pic_url || p.image || '',
      url:       p.product_url ? 'https://www.advice.co.th/product/' + p.product_url : '',
      inStock:   p.type === 'instock',
      promotion: p.product_promotion || ''
    });
  }
  return result;
}

// ─── Main fetch per category ───
async function fetchAdviceCategory(categoryKey) {
  let allProducts = [];
  const token = await getApiToken();
  if (!token) throw new Error('ไม่สามารถขอ Token จากระบบได้');

  let retryCount = 0;
  const isSearchApi = ['iphone', 'ipad', 'macbook'].includes(categoryKey);
  
  let keywords = [categoryKey];
  if (categoryKey === 'iphone') {
    keywords = ['iphone 17 pro max', 'iphone 17 pro', 'iphone 17 plus', 'iphone 17', 'iphone 16 pro max', 'iphone 16 pro', 'iphone 16 plus', 'iphone 16', 'iphone 15 pro max', 'iphone 15 pro', 'iphone 15 plus', 'iphone 15', 'iphone 14', 'iphone 13', 'iphone se'];
  } else if (categoryKey === 'ipad') {
    keywords = ['ipad pro 11', 'ipad pro 13', 'ipad pro 12.9', 'ipad pro m5', 'ipad pro m4', 'ipad air 11', 'ipad air 13', 'ipad air 10.9', 'ipad air m4', 'ipad 11', 'ipad 10.9', 'ipad 10.2', 'ipad mini 7', 'ipad mini 6'];
  } else if (categoryKey === 'macbook') {
    keywords = ['macbook pro 14', 'macbook pro 16', 'macbook pro 13', 'macbook air 15', 'macbook air 13', 'macbook air m4', 'macbook air m3', 'macbook air m2', 'macbook air m1', 'imac', 'mac mini', 'mac studio'];
  }

  // If android, we use standard pagination loop
  let paginationList = isSearchApi ? keywords : [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];

  for (let param of paginationList) {
    try {
      let endpoint = 'https://www.advice.co.th/_advice-api/api/v1.0.0/product/get';
      let reqPayload = {};
      
      if (isSearchApi) {
        endpoint = 'https://www.advice.co.th/_advice-api/api/v1.0.0/product/search';
        reqPayload = {
          keyword: param,
          sort: 'price_desc', // THIS IS CRITICAL TO PUSH PHONES ABOVE CASES!
          order: 'popular'
        };
      } else {
        reqPayload = {
          category: 'smartphone-tablet',
          category_sub: 'smartphone',
          group_end: true,
          take: 100,
          skip: param,
          page: 'product'
        };
      }

      await new Promise(r => setTimeout(r, 1000));
      
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
      if (!data || !data.data || !data.data.product) {
         if (!isSearchApi) break; else continue;
      }
      
      const pObj = data.data.product;
      const groups = Object.values(pObj);
      if (groups.length === 0) {
         if (!isSearchApi) break; else continue;
      }
      
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
          });
        }
      });
      
      if (!isSearchApi && itemsReturnedThisPage === 0) break;
      if (!isSearchApi && itemsReturnedThisPage < 100 && param !== 0) break;
      
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
async function fetchAdviceCategory(categoryKey) {
  const token = await getApiToken();
  let rawItems;

  if (categoryKey === 'android') {
    rawItems = await fetchAndroid(token);
  } else {
    const keywords = KEYWORDS[categoryKey] || [categoryKey];
    rawItems = await fetchInBatches(keywords, token, 4);
  }

  const items = processItems(rawItems, categoryKey);
  console.log(`  [${categoryKey}] raw=${rawItems.length} → filtered=${items.length}`);
  return items;
}

// ─── Background refresh ───
const refreshing = new Set();

async function backgroundRefresh(category) {
  if (refreshing.has(category)) return;
  refreshing.add(category);
  try {
    console.log(`\n🔄 Refreshing ${category}...`);
    const items = await fetchAdviceCategory(category);
    if (items.length > 0) {
      productCache[category] = { items, fetchedAt: Date.now(), lastError: null };
      saveProductCache();
      console.log(`✅ ${category}: ${items.length} items cached`);
    } else {
      if (!productCache[category]) {
        productCache[category] = { items: [], fetchedAt: Date.now(), lastError: 'API returned 0 items' };
      }
      console.log(`⚠️  ${category}: 0 items returned (kept old cache)`);
    }
  } catch (e) {
    console.error(`❌ ${category} fetch error:`, e.message);
    if (!productCache[category]) {
      productCache[category] = { items: [], fetchedAt: Date.now(), lastError: e.message };
    }
  } finally {
    refreshing.delete(category);
  }
}

// ─── Startup warm-up: refresh any stale/missing cache ───
async function warmupCache() {
  console.log('\n🚀 Warming up cache on startup...');
  const categories = ['iphone', 'ipad', 'macbook', 'android'];
  for (const cat of categories) {
    const cached = productCache[cat];
    const isStale = !cached || !cached.items?.length || (Date.now() - cached.fetchedAt) > CACHE_TTL;
    if (isStale) {
      await backgroundRefresh(cat);
    } else {
      console.log(`  [${cat}] cache ok (${cached.items.length} items)`);
    }
  }
  console.log('✅ Warmup done\n');
}

// ─── Routes ───
const CATEGORIES = { iphone: 'iPhone', ipad: 'iPad', macbook: 'Mac', android: 'Smart Phone' };

app.get('/api/prices/:category', async (req, res) => {
  const category = req.params.category;
  if (!CATEGORIES[category]) return res.status(400).json({ error: 'ไม่พบหมวดหมู่นี้' });

  const cached = productCache[category];
  const hasCache = cached?.items?.length > 0;
  const isFresh = hasCache && (Date.now() - cached.fetchedAt) < CACHE_TTL;

  if (hasCache) {
    if (!isFresh) backgroundRefresh(category); // fire-and-forget, update in background
    return res.json({ items: cached.items, total: cached.items.length, cached: true, stale: !isFresh, fetchedAt: cached.fetchedAt });
  }

  // No cache at all — must wait for first fetch (happens at startup, should be rare)
  await backgroundRefresh(category);
  const newCache = productCache[category];
  if (newCache?.items?.length > 0) {
    return res.json({ items: newCache.items, total: newCache.items.length, cached: false, stale: false, fetchedAt: newCache.fetchedAt });
  }
  return res.status(500).json({ error: newCache?.lastError || 'ดึงข้อมูลไม่สำเร็จ กรุณาลองใหม่' });
});

app.get('/api/health', (req, res) => {
  const summary = {};
  Object.keys(CATEGORIES).forEach(cat => {
    const c = productCache[cat];
    summary[cat] = { count: c?.items?.length || 0, age: c ? Math.round((Date.now() - c.fetchedAt) / 1000) + 's' : 'none' };
  });
  res.json({ status: 'ok', cache: summary, uptime: Math.floor(process.uptime()) + 's' });
});

app.post('/api/update', async (req, res) => {
  const results = {};
  for (const cat of Object.keys(CATEGORIES)) {
    await backgroundRefresh(cat);
    results[cat] = productCache[cat]?.items?.length || 0;
  }
  res.json({ success: true, updated: results });
});

app.get('/api/debug', async (req, res) => {
  try {
    const r = await axios.get('https://www.advice.co.th/', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
    res.json({ success: true, status: r.status, hasCookie: !!(r.headers['set-cookie']?.find(c => c.startsWith('user_token='))) });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
  warmupCache(); // start cache build immediately
});
