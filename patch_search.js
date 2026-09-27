const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const startIdx = code.indexOf('const categoryConfigs');
const endIdx = code.indexOf('// ==========================================\n// API Routes');

if (startIdx !== -1 && endIdx !== -1) {
  const newSection = `const categoryConfigs = {
  iphone:  { keyword: 'iphone',       label: 'iPhone' },
  ipad:    { keyword: 'ipad',         label: 'iPad' },
  macbook: { keyword: 'macbook',      label: 'Mac' },
  android: { keyword: 'smartphone',   label: 'Smart Phone' }
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
  
  console.log('🌐 กำลังค้นหาข้อมูล ' + config.label + ' ผ่าน API...');
  
  const token = await getApiToken();
  if (!token) throw new Error('ไม่สามารถขอ Token จากระบบได้');

  let allProducts = [];
  let skip = 0;
  
  // To avoid infinite loops, set a max of 5 pages (100 items max)
  while(skip < 100) {
    try {
      const res = await axios.post('https://www.advice.co.th/_advice-api/api/v1.0.0/product/get', {
        keyword: config.keyword,
        take: 20,
        skip: skip,
        page: 'product'
      }, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      const data = res.data;
      if (!data || !data.data || !data.data.product) break;
      
      const pArray = data.data.product;
      if (!Array.isArray(pArray) || pArray.length === 0) break;
      
      let itemsAddedThisPage = 0;
      
      pArray.forEach(catGroup => {
        if (catGroup.product && Array.isArray(catGroup.product)) {
          catGroup.product.forEach(p => {
            if (categoryKey === 'android' && (p.brand || '').toUpperCase() === 'APPLE') return;
            
            // Check for duplicates
            const modelCode = p.code || '-';
            if (allProducts.some(existing => existing.modelCode === modelCode && modelCode !== '-')) return;
            
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
      
      if (itemsAddedThisPage === 0) break; // End of pagination
      skip += 20;
      
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

`;
  
  // Note: we're replacing up to `// API Routes`
  code = code.substring(0, startIdx) + newSection + code.substring(endIdx);
  fs.writeFileSync('server.js', code);
  console.log('Replaced successfully');
} else {
  console.log('Not found');
}
