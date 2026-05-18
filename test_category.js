const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  
  let token = '';
  const apiRequests = [];
  
  page.on('request', (request) => {
    if (request.url().includes('prodbackadvice') && request.method() === 'POST') {
      const h = request.headers();
      if (h['authorization'] && !token) token = h['authorization'];
      try {
        const body = JSON.parse(request.postData());
        apiRequests.push({ url: request.url(), body });
      } catch(e) {}
    }
  });

  // Navigate to iPhone category page directly
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('https://www.advice.co.th/product/iphone', {waitUntil: 'networkidle2'});
  
  try { await page.waitForSelector('.list-product', { timeout: 10000 }); } catch(e) {}
  
  console.log('=== API Requests from /product/iphone page ===');
  apiRequests.forEach((r, i) => {
    if (r.url.includes('product/get')) {
      console.log(`\nRequest ${i}:`);
      console.log('Body:', JSON.stringify(r.body, null, 2));
    }
  });
  
  await browser.close();

  // Now try the category approach
  const headers = { 'Content-Type': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'Authorization': token };

  console.log('\n=== Category iPhone with take=100 ===');
  try {
    const body = apiRequests.find(r => r.url.includes('product/get'))?.body || {
      category: 'iphone', category_sub: '', product: '', keyword: '',
      take: 100, skip: 0, refSearch: '', page: 'product',
      arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false
    };
    body.take = 100;
    body.skip = 0;
    
    const r1 = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', body, { headers });
    const d = r1.data.data;
    
    if (d.product && Array.isArray(d.product)) {
      let total = 0;
      d.product.forEach(g => {
        if (g.product) total += g.product.length;
      });
      console.log('Groups:', d.product.length, 'Total products:', total);
      d.product.forEach((g,i) => console.log(`  Group ${i}: ${g.category} - count:${g.count_product} returned:${g.product?.length}`));
    } else {
      console.log('Response structure:', JSON.stringify(d, null, 2).substring(0, 1000));
    }
  } catch(e) { console.log('Error:', e.message); }

  // Try page 2
  console.log('\n=== Category iPhone page 2 (skip=100) ===');
  try {
    const body = apiRequests.find(r => r.url.includes('product/get'))?.body || {};
    body.take = 100;
    body.skip = 100;
    
    const r2 = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', body, { headers });
    const d = r2.data.data;
    
    if (d.product && Array.isArray(d.product)) {
      let total = 0;
      d.product.forEach(g => {
        if (g.product) total += g.product.length;
      });
      console.log('Groups:', d.product.length, 'Total products:', total);
      d.product.forEach((g,i) => console.log(`  Group ${i}: ${g.category} - count:${g.count_product} returned:${g.product?.length}`));
    }
  } catch(e) { console.log('Error:', e.message); }
})();
