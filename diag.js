/**
 * Quick diagnostic — ทดสอบ API ปัจจุบัน
 */
const axios = require('axios');

const API_URL = 'https://prodbackadvice.advice.in.th/api/v1.0.0/product/get';
const ADVICE_HOME = 'https://www.advice.co.th/product/search?keyword=iphone';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function main() {
  console.log('=== Step 1: GET token from cookie ===');
  let token = null;
  let cookies = {};
  let cookieStr = '';
  try {
    const r = await axios.get(ADVICE_HOME, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'th-TH,th;q=0.9' },
      timeout: 20000, maxRedirects: 5,
    });
    const setCookies = r.headers['set-cookie'] || [];
    for (const c of setCookies) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      if (idx < 0) continue;
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      cookies[key] = val;
    }
    cookieStr = Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join('; ');
    token = cookies['user_token'];
    console.log('user_token found:', !!token);
    if (token) console.log('token prefix:', token.slice(0, 50) + '...');
  } catch(e) {
    console.log('GET advice.co.th FAILED:', e.message);
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://www.advice.co.th',
    'Referer': 'https://www.advice.co.th/product/search?keyword=iphone',
    'User-Agent': UA,
  };

  const categories = [
    { name: 'iphone',  body: { category: 'iphone',      keyword: '', take: 3, skip: 0 } },
    { name: 'android', body: { category: 'smart-phone', keyword: '', take: 3, skip: 0 } },
    { name: 'ipad',    body: { category: 'ipad',        keyword: '', take: 3, skip: 0 } },
    { name: 'macbook', body: { category: 'search',      keyword: 'macbook', take: 3, skip: 0 } },
  ];

  const baseBody = {
    category_sub: '', product: '', refSearch: '', page: 'product',
    arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [],
    arr_filter_cate: [], addView: false,
  };

  console.log('\n=== Step 2: Test each category ===');
  for (const cat of categories) {
    const body = { ...baseBody, ...cat.body };
    for (const [authLabel, authHeader] of [
      ['Bearer token', token ? `Bearer ${token}` : null],
      ['Raw token',    token],
      ['No auth',      null],
    ]) {
      if (!authHeader) continue;
      try {
        const resp = await axios.post(API_URL, body, {
          headers: { ...headers, 'Authorization': authHeader },
          timeout: 15000,
          validateStatus: () => true,
        });
        const status = resp.data?.status;
        const count  = resp.data?.data?.count_product;
        const prod   = resp.data?.data?.product;
        let n = 0;
        if (prod && typeof prod === 'object') {
          for (const v of Object.values(prod)) {
            if (Array.isArray(v?.product)) n += v.product.length;
          }
        } else if (Array.isArray(prod)) {
          for (const g of prod) if (Array.isArray(g?.product)) n += g.product.length;
        }
        console.log(`[${cat.name}] ${authLabel}: HTTP ${resp.status} | status=${status} | count_product=${count} | items=${n}`);
        if (status === 'SUCCESS') break; // ได้แล้วข้ามได้เลย
      } catch(e) {
        console.log(`[${cat.name}] ${authLabel}: ERROR ${e.message}`);
      }
    }
  }

  console.log('\n=== Step 3: Check response structure (iphone) ===');
  if (token) {
    try {
      const resp = await axios.post(API_URL,
        { ...baseBody, category: 'iphone', keyword: '', take: 3, skip: 0 },
        { headers: { ...headers, 'Authorization': `Bearer ${token}` }, timeout: 15000 }
      );
      console.log('status:', resp.data?.status);
      console.log('data keys:', Object.keys(resp.data?.data || {}));
      const prod = resp.data?.data?.product;
      console.log('product type:', typeof prod, Array.isArray(prod) ? 'array' : '');
      if (prod && typeof prod === 'object' && !Array.isArray(prod)) {
        console.log('product obj keys (first 3):', Object.keys(prod).slice(0, 3));
        const firstKey = Object.keys(prod)[0];
        if (firstKey) {
          console.log('product[0] keys:', Object.keys(prod[firstKey] || {}));
          const sample = prod[firstKey]?.product?.[0];
          if (sample) console.log('sample product keys:', Object.keys(sample));
        }
      } else if (Array.isArray(prod)) {
        console.log('product array length:', prod.length);
        if (prod[0]) console.log('prod[0] keys:', Object.keys(prod[0]));
      }
    } catch(e) {
      console.log('ERROR:', e.message);
    }
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
