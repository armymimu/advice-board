const axios = require('axios');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function getToken() {
  const r = await axios.get('https://www.advice.co.th/product/search?keyword=iphone', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' }, timeout: 20000, maxRedirects: 5,
  });
  for (const c of (r.headers['set-cookie'] || [])) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx >= 0 && pair.slice(0, idx).trim() === 'user_token')
      return `Bearer ${pair.slice(idx + 1).trim()}`;
  }
  throw new Error('No token');
}

async function tryCategory(token, category, keyword = '', take = 3) {
  try {
    const r = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
      category, category_sub: '', product: '', keyword,
      take, skip: 0, refSearch: '', page: 'product',
      arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false,
    }, {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'User-Agent': UA, 'Authorization': token },
      timeout: 10000, validateStatus: () => true,
    });
    const d = r.data;
    const prod = d?.data?.product;
    let n = 0, sampleBrand = '', sampleName = '';
    if (prod && typeof prod === 'object' && !Array.isArray(prod)) {
      for (const v of Object.values(prod)) {
        const arr = Array.isArray(v?.product) ? v.product : [];
        n += arr.length;
        if (!sampleName && arr[0]) { sampleName = (arr[0].product||'').slice(0,40); sampleBrand = arr[0].brand||''; }
      }
    }
    return { status: d?.status, count: d?.data?.count_product, items: n, sampleName, sampleBrand };
  } catch(e) { return { error: e.message.slice(0,50) }; }
}

async function main() {
  const token = await getToken();
  
  // category slugs ที่น่าจะถูก — ดูจาก URL บนเว็บ advice.co.th
  const slugs = [
    // iPhone slugs
    ['apple', ''],
    ['apple-iphone', ''],
    ['iphone', ''],
    ['iphone-16', ''],
    ['mobile-iphone', ''],
    // iPad slugs  
    ['apple-ipad', ''],
    ['ipad', ''],
    // Android
    ['smartphone', ''],
    ['android-smartphone', ''],
    ['samsung', ''],
    // MacBook
    ['notebook', ''],
    ['apple-macbook', ''],
    ['macbook', ''],
    ['notebook-apple', ''],
  ];

  console.log('Testing category slugs...\n');
  console.log('category'.padEnd(25), 'status'.padEnd(10), 'count'.padEnd(8), 'items'.padEnd(8), 'sample');
  console.log('-'.repeat(90));

  for (const [cat, kw] of slugs) {
    const r = await tryCategory(token, cat, kw);
    if (r.error) {
      console.log(cat.padEnd(25), 'ERROR'.padEnd(10), ''.padEnd(8), '0'.padEnd(8), r.error);
    } else {
      const mark = r.items > 0 ? '✅' : r.status === 'SUCCESS' ? '(empty)' : '❌';
      console.log(cat.padEnd(25), (r.status||'').padEnd(10), String(r.count||'').padEnd(8), String(r.items).padEnd(8), mark, r.sampleBrand, r.sampleName);
    }
  }
}
main().catch(console.error);
