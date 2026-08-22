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

async function inspect(token, category, keyword, take = 5) {
  const r = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
    category, category_sub: '', product: '', keyword,
    take, skip: 0, refSearch: '', page: 'product',
    arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [],
    arr_filter_cate: [], addView: false,
  }, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'User-Agent': UA, 'Authorization': token },
    timeout: 15000, validateStatus: () => true,
  });
  return r.data;
}

function extractProducts(data) {
  const prod = data?.data?.product;
  if (!prod) return [];
  // Case 1: direct array of products
  if (Array.isArray(prod)) return prod;
  // Case 2: object { "0": { product: [...] }, "1": ... }
  if (typeof prod === 'object') {
    const results = [];
    for (const v of Object.values(prod)) {
      if (Array.isArray(v)) results.push(...v); // flat array
      else if (Array.isArray(v?.product)) results.push(...v.product);
    }
    return results;
  }
  return [];
}

async function main() {
  const token = await getToken();
  console.log('Token OK\n');

  const configs = [
    { label: 'iPhone (search)', category: 'search', keyword: 'iphone' },
    { label: 'iPad (search)', category: 'search', keyword: 'ipad' },
    { label: 'MacBook (notebook)', category: 'notebook', keyword: '' },
    { label: 'MacBook (search)', category: 'search', keyword: 'macbook' },
    { label: 'Android (smartphone)', category: 'smartphone', keyword: '' },
    { label: 'Android (search samsung)', category: 'search', keyword: 'samsung' },
  ];

  for (const cfg of configs) {
    const data = await inspect(token, cfg.category, cfg.keyword);
    const products = extractProducts(data);
    const prod = data?.data?.product;
    console.log(`\n[${cfg.label}]`);
    console.log(`  status: ${data?.status} | count_product: ${data?.data?.count_product}`);
    console.log(`  product type: ${typeof prod}${Array.isArray(prod) ? '[]' : ''}`);
    if (typeof prod === 'object' && !Array.isArray(prod)) {
      console.log(`  product keys: ${Object.keys(prod || {}).slice(0,5).join(', ')}`);
      const firstVal = Object.values(prod || {})[0];
      if (firstVal) console.log(`  product[0] type: ${typeof firstVal}, keys: ${Object.keys(firstVal).join(', ')}`);
    }
    console.log(`  extracted: ${products.length} products`);
    if (products[0]) {
      const p = products[0];
      console.log(`  sample fields: ${Object.keys(p).join(', ')}`);
      console.log(`  sample: product="${(p.product||p.name||'').slice(0,60)}" price=${p.price_sale||p.price} brand=${p.brand}`);
    }
  }
}

main().catch(console.error);
