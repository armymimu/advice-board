/**
 * หา category name ที่ถูกต้องจากเว็บ Advice
 */
const axios = require('axios');

const API_URL = 'https://prodbackadvice.advice.in.th/api/v1.0.0/product/get';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function getToken() {
  const r = await axios.get('https://www.advice.co.th/product/search?keyword=iphone', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
    timeout: 20000, maxRedirects: 5,
  });
  const setCookies = r.headers['set-cookie'] || [];
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    if (pair.slice(0, idx).trim() === 'user_token') {
      return `Bearer ${pair.slice(idx + 1).trim()}`;
    }
  }
  throw new Error('No user_token');
}

async function tryCategory(token, category, keyword = '') {
  try {
    const r = await axios.post(API_URL, {
      category, category_sub: '', product: '', keyword,
      take: 5, skip: 0, refSearch: '', page: 'product',
      arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [],
      arr_filter_cate: [], addView: false,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://www.advice.co.th',
        'Referer': 'https://www.advice.co.th/',
        'User-Agent': UA,
        'Authorization': token,
      },
      timeout: 10000,
      validateStatus: () => true,
    });
    const d = r.data;
    const prod = d?.data?.product;
    let n = 0;
    if (prod && typeof prod === 'object' && !Array.isArray(prod)) {
      for (const v of Object.values(prod)) {
        if (Array.isArray(v?.product)) n += v.product.length;
      }
    } else if (Array.isArray(prod)) {
      for (const g of prod) if (Array.isArray(g?.product)) n += g.product.length;
    }
    return { status: d?.status, count: d?.data?.count_product, items: n, prodType: typeof prod + (Array.isArray(prod) ? '[]' : '') };
  } catch(e) {
    return { error: e.message };
  }
}

async function main() {
  console.log('Getting token...');
  const token = await getToken();
  console.log('Token OK\n');

  // ทดลอง category names ต่างๆ
  const toTry = [
    // iPhone
    ['iphone', ''],
    ['iPhone', ''],
    ['mobile', ''],
    ['smartphone', ''],
    ['smart-phone', ''],
    ['phone', ''],
    ['search', 'iphone 16'],
    ['search', 'iphone'],
    // Android
    ['android', ''],
    ['smart-phone', ''],
    ['smartphone', ''],
    ['mobile', ''],
    ['search', 'samsung'],
    ['search', 'android'],
    // iPad
    ['ipad', ''],
    ['iPad', ''],
    ['tablet', ''],
    ['search', 'ipad'],
    // MacBook  
    ['macbook', ''],
    ['notebook', ''],
    ['laptop', ''],
    ['search', 'macbook'],
  ];

  console.log('category'.padEnd(20), 'keyword'.padEnd(15), 'status'.padEnd(10), 'count'.padEnd(8), 'items');
  console.log('-'.repeat(70));

  for (const [cat, kw] of toTry) {
    const r = await tryCategory(token, cat, kw);
    if (r.error) {
      console.log(cat.padEnd(20), kw.padEnd(15), 'ERROR'.padEnd(10), ''.padEnd(8), r.error.slice(0,40));
    } else {
      const mark = r.items > 0 ? ' ✅' : r.status === 'SUCCESS' ? ' (empty)' : ' ❌';
      console.log(cat.padEnd(20), kw.padEnd(15), (r.status||'').padEnd(10), String(r.count||'').padEnd(8), String(r.items) + mark);
    }
  }
}

main().catch(console.error);
