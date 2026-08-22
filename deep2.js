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

async function tryAPI(token, endpoint, body) {
  const r = await axios.post(endpoint, body, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/product/iphone', 'User-Agent': UA, 'Authorization': token },
    timeout: 15000, validateStatus: () => true,
  });
  return r;
}

function countProducts(prod) {
  if (!prod) return 0;
  let n = 0;
  if (typeof prod === 'object' && !Array.isArray(prod)) {
    for (const v of Object.values(prod)) {
      if (Array.isArray(v?.product)) n += v.product.length;
      else if (Array.isArray(v)) n += v.length;
    }
  } else if (Array.isArray(prod)) n = prod.length;
  return n;
}

async function main() {
  const token = await getToken();
  console.log('Token:', token ? 'OK' : 'MISSING');

  const BASE = 'https://prodbackadvice.advice.in.th';
  const base = { category_sub:'', product:'', keyword:'', take:5, skip:0, refSearch:'', page:'product', arr_filter_brand:[], arr_filter_ict:[], arr_filter_price_ict:[], arr_filter_cate:[], addView:false };

  console.log('\n=== ลองใช้ menu_list_id แทน category ===');
  // iPhone ใน advice คือ menu_list_id บางค่า ลองหา
  const menuTry = [
    { ...base, category: 'iphone', menu_list_id: '1' },
    { ...base, category: 'iphone', menu_list_id: '2' },
    { ...base, category: 'iphone', menu_list_id: '100' },
    { ...base, category: '', menu_list_id: 'iphone' },
    { ...base, category: 'iphone', page: 'category' },
    { ...base, category: 'iphone', page: 'menu' },
    { ...base, category: 'iphone', page: 'brand' },
  ];

  for (const b of menuTry) {
    const r = await tryAPI(token, `${BASE}/api/v1.0.0/product/get`, b);
    const prod = r.data?.data?.product;
    const n = countProducts(prod);
    const extra = JSON.stringify(b).replace(/.*take.*$/,'').slice(0,60);
    console.log(`  status=${r.data?.status} count=${r.data?.data?.count_product} items=${n}  ${JSON.stringify({category:b.category, menu_list_id:b.menu_list_id, page:b.page})}`);
  }

  console.log('\n=== ลอง endpoint อื่นๆ สำหรับ iPhone ===');
  const endpoints = [
    `${BASE}/api/v1.0.0/product/iphone`,
    `${BASE}/api/v1.0.0/product/category/iphone`,
    `${BASE}/api/v1.0.0/menu/iphone`,
    `${BASE}/api/v1.0.0/product/list`,
    `${BASE}/api/v1.0.0/product/search`,
  ];
  for (const ep of endpoints) {
    try {
      const r = await axios.post(ep, { ...base, category: 'iphone' }, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://www.advice.co.th', 'User-Agent': UA, 'Authorization': token },
        timeout: 8000, validateStatus: () => true,
      });
      console.log(`  ${ep.replace(BASE,'')}: status=${r.status} data=${JSON.stringify(r.data).slice(0,100)}`);
    } catch(e) { console.log(`  ${ep.replace(BASE,'')}: ERR ${e.message.slice(0,50)}`); }
  }

  console.log('\n=== GET iPhone page — ดู network request ใน JS bundle ===');
  try {
    const r = await axios.get('https://www.advice.co.th/product/iphone', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' }, timeout: 20000,
    });
    const html = r.data;
    // หา API call pattern
    const patterns = [
      /category['":\s]+['"]([a-z0-9_-]{3,30})['"]/gi,
      /menu_list_id['":\s]+['"]?(\d+)/gi,
      /menu_id['":\s]+['"]?(\d+)/gi,
      /group_id['":\s]+['"]?(\d+)/gi,
    ];
    for (const p of patterns) {
      const found = [...html.matchAll(p)].slice(0,10).map(m => m[0]);
      if (found.length) console.log(`  Pattern /${p.source}/: `, found.join(' | '));
    }
    
    // หา __NEXT_DATA__ หรือ window.__data__
    const dataMatch = html.match(/window\.__[A-Z_]+\s*=\s*({[\s\S]{1,2000}})/);
    if (dataMatch) console.log('window data:', dataMatch[1].slice(0,300));
    
    // หา JS files
    const jsFiles = [...html.matchAll(/src="([^"]+\.js[^"]*)"/g)].map(m=>m[1]).filter(f=>f.includes('_next')).slice(0,3);
    console.log('JS files:', jsFiles);
  } catch(e) { console.log('Error:', e.message); }
}

main().catch(console.error);
