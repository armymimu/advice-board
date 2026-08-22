/**
 * ทดสอบการ filter by brand สำหรับ iPhone และ iPad
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

function extractProducts(data) {
  const prod = data?.data?.product;
  if (!prod) return [];
  let results = [];
  if (typeof prod === 'object' && !Array.isArray(prod)) {
    for (const v of Object.values(prod)) {
      if (Array.isArray(v?.product)) results.push(...v.product);
      else if (Array.isArray(v)) results.push(...v);
    }
  } else if (Array.isArray(prod)) results = prod;
  return results;
}

async function fetchCat(token, category, keyword, filterBrands = [], take = 100) {
  const r = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
    category, category_sub: '', product: '', keyword,
    take, skip: 0, refSearch: '', page: 'product',
    arr_filter_brand: filterBrands,
    arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false,
  }, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/product/iphone', 'User-Agent': UA, 'Authorization': token },
    timeout: 15000, validateStatus: () => true,
  });
  return r.data;
}

async function main() {
  const token = await getToken();
  console.log('Token OK\n');

  // ดึง filter_bar จาก smartphone เพื่อหา brand list
  console.log('=== ดึง filter_bar จาก smartphone ===');
  const smData = await fetchCat(token, 'smartphone', '', [], 1);
  const filterBar = smData?.data?.filter_bar || smData?.data?.filtercategory;
  if (filterBar) {
    const brands = filterBar.brand || filterBar.filter_brand;
    if (brands) {
      console.log('Brands available:');
      const arr = Array.isArray(brands) ? brands : Object.values(brands);
      arr.slice(0,20).forEach(b => console.log(`  ${b.brand_id || b.id} = ${b.brand_name || b.name || JSON.stringify(b).slice(0,40)}`));
    } else {
      console.log('filter_bar keys:', Object.keys(filterBar));
      console.log('filter_bar sample:', JSON.stringify(filterBar).slice(0,500));
    }
  } else {
    // ดู data keys
    console.log('data keys:', Object.keys(smData?.data || {}));
  }

  // ทดสอบ filter brands ต่างๆ
  console.log('\n=== ทดสอบ arr_filter_brand ===');
  const brandTests = [
    ['smartphone', '', ['APPLE'], 'smartphone + APPLE'],
    ['smartphone', '', ['Apple'], 'smartphone + Apple'],
    ['smartphone', '', [1], 'smartphone + brand_id=1'],
    ['notebook', '', ['APPLE'], 'notebook + APPLE'],
    ['notebook', '', ['Apple'], 'notebook + Apple'],
    ['smartphone', 'iphone', [], 'smartphone + keyword=iphone'],
    ['notebook', 'macbook', [], 'notebook + keyword=macbook'],
    ['notebook', 'ipad', [], 'notebook + keyword=ipad'],
    ['smartphone', 'ipad', [], 'smartphone + keyword=ipad'],
  ];

  for (const [cat, kw, brands, label] of brandTests) {
    const data = await fetchCat(token, cat, kw, brands);
    const products = extractProducts(data);
    const appleProducts = products.filter(p => (p.brand||'').toUpperCase() === 'APPLE');
    const sampleBrands = [...new Set(products.slice(0,5).map(p=>p.brand))].join(', ');
    const mark = products.length > 0 ? '✅' : '❌';
    console.log(`${mark} [${label}]: total=${products.length} apple=${appleProducts.length} brands=[${sampleBrands}]`);
    if (products[0]) console.log(`   sample: ${(products[0].product||'').slice(0,60)} price=${products[0].price_sale}`);
  }
}

main().catch(console.error);
