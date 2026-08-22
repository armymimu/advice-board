/**
 * หาวิธีดึง iPhone ให้ครบ 97 รุ่น
 * - ลองดึง per model series
 * - ลองใช้ category_sub
 * - ลองดึง sub-categories แล้ว loop
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

async function post(token, body) {
  const r = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', body, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://www.advice.co.th', 'User-Agent': UA, 'Authorization': token },
    timeout: 15000, validateStatus: () => true,
  });
  return r.data;
}

function getAppleItems(data) {
  const prod = data?.data?.product;
  if (!prod) return [];
  let results = [];
  if (Array.isArray(prod)) {
    for (const g of prod) {
      if ((g.category_slug||'').includes('apple-product') && Array.isArray(g.product))
        results.push(...g.product);
    }
  } else if (typeof prod === 'object') {
    for (const v of Object.values(prod)) {
      if (Array.isArray(v?.product)) results.push(...v.product);
    }
  }
  return results;
}

function getAllItems(data) {
  const prod = data?.data?.product;
  if (!prod) return [];
  let results = [];
  if (Array.isArray(prod)) {
    for (const g of prod) {
      if (Array.isArray(g.product)) results.push(...g.product);
    }
  } else if (typeof prod === 'object') {
    for (const v of Object.values(prod)) {
      if (Array.isArray(v?.product)) results.push(...v.product);
    }
  }
  return results;
}

const BASE_BODY = {
  category_sub: '', product: '', keyword: '', take: 200, skip: 0,
  refSearch: '', page: 'product', arr_filter_brand: [],
  arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false,
};

async function main() {
  const token = await getToken();
  console.log('Token OK\n');

  // === ลองดึง iPhone แต่ละ series keyword ===
  console.log('=== ดึง iPhone แต่ละ series ===');
  const series = ['iphone 16','iphone 15','iphone 14','iphone 13','iphone 12','iphone 11','iphone se'];
  const allIphones = new Map(); // code → product
  for (const kw of series) {
    const d = await post(token, { ...BASE_BODY, category: 'smartphone', keyword: kw });
    const items = getAppleItems(d);
    let added = 0;
    for (const p of items) {
      if (!allIphones.has(p.code)) { allIphones.set(p.code, p); added++; }
    }
    console.log(`  ${kw}: ${items.length} items (new: ${added}) total so far: ${allIphones.size}`);
  }

  // === ลอง category_sub จาก filter_bar ===
  console.log('\n=== ดู filter_bar ของ smartphone + keyword=iphone ===');
  const d0 = await post(token, { ...BASE_BODY, category: 'smartphone', keyword: 'iphone', take: 15 });
  const filterBar = d0?.data?.product?.[0]?.filter_bar || [];
  console.log('filter_bar length:', filterBar.length);
  filterBar.slice(0, 15).forEach(f => console.log('  filter:', JSON.stringify(f).slice(0, 100)));

  // === ลอง arr_filter_cate ===
  console.log('\n=== ลอง arr_filter_cate จาก category data ===');
  const catData = d0?.data?.product?.[0];
  console.log('category group keys:', Object.keys(catData || {}));
  const filterCate = catData?.filtercategory || catData?.filter_bar;
  if (filterCate) {
    console.log('filtercategory sample:', JSON.stringify(filterCate).slice(0, 500));
  }

  // === ลอง smartphone หลายๆ keyword เพื่อได้ Android ครบ ===
  console.log('\n=== Android brands ===');
  const androidBrands = ['samsung', 'xiaomi', 'oppo', 'vivo', 'realme', 'huawei', 'motorola', 'nokia', 'google'];
  const allAndroid = new Map();
  for (const brand of androidBrands) {
    const d = await post(token, { ...BASE_BODY, category: 'smartphone', keyword: brand });
    const items = getAllItems(d).filter(p => (p.brand||'').toUpperCase() !== 'APPLE');
    let added = 0;
    for (const p of items) {
      if (!allAndroid.has(p.code)) { allAndroid.set(p.code, p); added++; }
    }
    console.log(`  ${brand}: ${items.length} items (new: ${added}) total: ${allAndroid.size}`);
  }
  // ดึง no-keyword ด้วย
  const dNoKw = await post(token, { ...BASE_BODY, category: 'smartphone', keyword: '' });
  const noKwItems = getAllItems(dNoKw).filter(p => (p.brand||'').toUpperCase() !== 'APPLE');
  let addedNoKw = 0;
  for (const p of noKwItems) {
    if (!allAndroid.has(p.code)) { allAndroid.set(p.code, p); addedNoKw++; }
  }
  console.log(`  (no keyword): ${noKwItems.length} items (new: ${addedNoKw}) total: ${allAndroid.size}`);

  console.log('\n=== Summary ===');
  console.log(`iPhone total unique: ${allIphones.size}`);
  console.log(`Android total unique: ${allAndroid.size}`);
  
  // ตัวอย่าง iPhone
  const iphoneArr = [...allIphones.values()];
  console.log('\niPhone samples:');
  iphoneArr.slice(0,5).forEach(p => console.log(`  ${p.product} - ${p.price_sale}`));
}

main().catch(console.error);
