/**
 * แกะ structure จริงๆ ของ keyword search response
 */
const axios = require('axios');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function getToken() {
  const r = await axios.get('https://www.advice.co.th/product/iphone', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' }, timeout: 20000, maxRedirects: 5,
  });
  for (const c of (r.headers['set-cookie'] || [])) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx >= 0 && pair.slice(0, idx).trim() === 'user_token')
      return `Bearer ${pair.slice(idx + 1).trim()}`;
  }
}

function deepExtract(obj, depth = 0, path = 'root') {
  if (depth > 5) return;
  if (Array.isArray(obj)) {
    console.log(`${' '.repeat(depth*2)}${path}: Array[${obj.length}]`);
    if (obj.length > 0) {
      const first = obj[0];
      if (typeof first === 'object' && first !== null) {
        const keys = Object.keys(first);
        console.log(`${' '.repeat(depth*2+2)}[0] keys: ${keys.join(', ')}`);
        if (keys.includes('product') || keys.includes('price_sale') || keys.includes('price')) {
          console.log(`${' '.repeat(depth*2+2)}[0] PRODUCT sample: brand=${first.brand} price=${first.price_sale||first.price} name=${(first.product||first.name||'').slice(0,50)}`);
        } else if (keys.includes('count_product') || keys.includes('category')) {
          // เป็น group — ขุดลงไปอีก
          deepExtract(first, depth + 1, `${path}[0]`);
        }
      }
    }
  } else if (obj && typeof obj === 'object') {
    const keys = Object.keys(obj);
    console.log(`${' '.repeat(depth*2)}${path}: Object{${keys.slice(0,8).join(', ')}}`);
    if (keys.includes('product') || keys.includes('price_sale')) {
      console.log(`${' '.repeat(depth*2+2)}PRODUCT: brand=${obj.brand} price=${obj.price_sale} name=${(obj.product||'').slice(0,50)}`);
      return;
    }
    for (const k of keys.slice(0, 5)) {
      const v = obj[k];
      if (Array.isArray(v) || (v && typeof v === 'object' && Object.keys(v).length > 0)) {
        deepExtract(v, depth + 1, `${path}.${k}`);
      }
    }
  }
}

async function main() {
  const token = await getToken();
  console.log('Token OK\n');

  // ดึง iphone keyword search - take=5 แค่นั้น
  const r = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
    category: 'smartphone', category_sub: '', product: '', keyword: 'iphone 16',
    take: 5, skip: 0, refSearch: '', page: 'product',
    arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false,
  }, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://www.advice.co.th', 'User-Agent': UA, 'Authorization': token },
    timeout: 15000, validateStatus: () => true,
  });

  const data = r.data;
  console.log('status:', data.status);
  console.log('data.data keys:', Object.keys(data?.data || {}));
  
  const prod = data?.data?.product;
  console.log('\n=== product structure ===');
  console.log('type:', typeof prod, Array.isArray(prod) ? `Array[${prod.length}]` : '');
  
  if (Array.isArray(prod)) {
    for (let i = 0; i < Math.min(prod.length, 3); i++) {
      const item = prod[i];
      console.log(`\nprod[${i}]:`, typeof item, Array.isArray(item) ? `Array[${item.length}]` : '');
      if (typeof item === 'object' && item) {
        console.log('  keys:', Object.keys(item).join(', '));
        // ดูว่ามี product array ใน item ไหม
        for (const [k, v] of Object.entries(item)) {
          if (Array.isArray(v)) {
            console.log(`  ${k}: Array[${v.length}]`);
            if (v[0] && typeof v[0] === 'object') {
              console.log(`    [0] keys:`, Object.keys(v[0]).join(', '));
              if (v[0].price_sale !== undefined || v[0].product) {
                console.log(`    [0] PRODUCT: brand=${v[0].brand} price=${v[0].price_sale} name=${(v[0].product||'').slice(0,50)}`);
              }
            }
          } else if (v && typeof v === 'object') {
            console.log(`  ${k}: Object{${Object.keys(v).slice(0,5).join(',')}}`);
          } else if (k === 'count_product' || k === 'category' || k === 'category_slug') {
            console.log(`  ${k}:`, v);
          }
        }
      }
    }
  }
  
  // แสดง full JSON sample (จำกัด 2000 chars)
  console.log('\n=== Raw JSON (first 3000 chars) ===');
  console.log(JSON.stringify(data?.data?.product).slice(0, 3000));
}

main().catch(console.error);
