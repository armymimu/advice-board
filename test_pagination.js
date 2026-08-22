/**
 * ทดสอบ pagination สำหรับ keyword search
 * - มี count_product ไหม?
 * - skip ทำงานได้ไหม?
 * - ดึงได้กี่รุ่นสูงสุด?
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

async function fetch(token, category, keyword, take, skip) {
  const r = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
    category, category_sub: '', product: '', keyword,
    take, skip, refSearch: '', page: 'product',
    arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false,
  }, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'User-Agent': UA, 'Authorization': token },
    timeout: 20000, validateStatus: () => true,
  });
  return r.data;
}

function countFromData(data, filterSlug) {
  const prod = data?.data?.product;
  if (!prod) return { n: 0, totalCount: 0, groups: [] };
  let n = 0;
  let totalCount = 0;
  const groups = [];
  if (Array.isArray(prod)) {
    for (const group of prod) {
      const slug = group.category_slug || '';
      const matchSlug = !filterSlug || filterSlug.some(s => slug.toLowerCase().includes(s));
      const items = Array.isArray(group.product) ? group.product : [];
      groups.push({ slug, count: group.count_product, items: items.length, matches: matchSlug });
      if (matchSlug) {
        n += items.length;
        totalCount = group.count_product || 0;
      }
    }
  } else if (typeof prod === 'object') {
    for (const v of Object.values(prod)) {
      if (Array.isArray(v?.product)) n += v.product.length;
    }
    totalCount = data?.data?.count_product || n;
  }
  return { n, totalCount, groups };
}

async function main() {
  const token = await getToken();
  console.log('Token OK\n');

  // ===== Test 1: iPhone - ดู count_product และ skip =====
  console.log('=== iPhone: test take/skip ===');
  for (const [take, skip] of [[15,0],[15,15],[15,30],[100,0],[200,0]]) {
    const d = await fetch(token, 'smartphone', 'iphone', take, skip);
    const { n, totalCount, groups } = countFromData(d, ['apple-product']);
    const groupSummary = groups.map(g => `${g.slug}(${g.items}/${g.count})`).join(', ');
    console.log(`  take=${take} skip=${skip}: apple_items=${n}, totalCount=${totalCount}, groups=[${groupSummary}]`);
  }

  // ===== Test 2: Android (smartphone no keyword) - pagination =====
  console.log('\n=== Android (smartphone): test take/skip ===');
  for (const [take, skip] of [[100,0],[100,100],[100,200]]) {
    const d = await fetch(token, 'smartphone', '', take, skip);
    const { n, totalCount, groups } = countFromData(d, null);
    const ct = d?.data?.count_product;
    console.log(`  take=${take} skip=${skip}: items=${n}, count_product=${ct}`);
  }

  // ===== Test 3: MacBook (notebook keyword) =====
  console.log('\n=== MacBook: test take/skip ===');
  for (const [take, skip] of [[100,0],[100,100]]) {
    const d = await fetch(token, 'notebook', 'macbook', take, skip);
    const { n, totalCount, groups } = countFromData(d, ['apple-product']);
    const ct = d?.data?.count_product;
    const groupSummary = groups.map(g => `${g.slug}(${g.items}/${g.count})`).join(', ');
    console.log(`  take=${take} skip=${skip}: items=${n}, count_product=${ct}, groups=[${groupSummary}]`);
  }

  // ===== Test 4: ลอง take ใหญ่ๆ สำหรับ iPhone =====
  console.log('\n=== iPhone: ลอง take ใหญ่มาก ===');
  for (const take of [50, 100, 150, 500]) {
    const d = await fetch(token, 'smartphone', 'iphone', take, 0);
    const { n, totalCount } = countFromData(d, ['apple-product']);
    console.log(`  take=${take}: apple_items=${n}, totalCount=${totalCount}`);
  }
}

main().catch(console.error);
