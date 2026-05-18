const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  
  let token = '';
  page.on('request', (request) => {
    if (request.url().includes('prodbackadvice') && request.method() === 'POST') {
      const h = request.headers();
      if (h['authorization'] && !token) token = h['authorization'];
    }
  });

  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('https://www.advice.co.th/product/iphone', {waitUntil: 'networkidle2'});
  try { await page.waitForSelector('.list-product', { timeout: 10000 }); } catch(e) {}
  await browser.close();

  const headers = { 'Content-Type': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'Authorization': token };

  const resp = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
    category: 'iphone', category_sub: '', product: '', keyword: '',
    take: 20, skip: 0, refSearch: '', page: 'product',
    arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false
  }, { headers });

  const d = resp.data.data;
  const product = d.product;
  
  console.log('Product type:', typeof product);
  console.log('Product keys:', Object.keys(product));
  
  // Show first few chars of each key
  for (const [key, val] of Object.entries(product)) {
    const type = typeof val;
    if (Array.isArray(val)) {
      console.log(`  ${key}: Array[${val.length}]`);
      if (val.length > 0) {
        const first = val[0];
        if (typeof first === 'object') {
          console.log(`    First element keys: ${Object.keys(first).join(', ')}`);
          if (first.product) console.log(`    First product: ${first.product}`);
          if (first.code) console.log(`    First code: ${first.code}`);
          if (first.price_sale) console.log(`    First price: ${first.price_sale}`);
        }
      }
    } else {
      console.log(`  ${key}: ${type} = ${JSON.stringify(val).substring(0, 100)}`);
    }
  }
})();
