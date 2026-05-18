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
  console.log('Top-level data keys:', Object.keys(d));
  console.log('count_product:', d.count_product);
  console.log('type:', d.type);
  
  // Check product structure
  if (d.product) {
    console.log('\nproduct type:', typeof d.product, Array.isArray(d.product));
    console.log('product length:', d.product.length);
    if (d.product.length > 0) {
      const first = d.product[0];
      console.log('First element type:', typeof first);
      console.log('First element keys:', Object.keys(first));
      console.log('First element (without product):', JSON.stringify(Object.fromEntries(Object.entries(first).filter(([k]) => k !== 'product' && k !== 'bank_product')), null, 2).substring(0, 500));
      
      // Check if it has a code (flat product) or a nested product array
      if (first.code) {
        console.log('\n=> FLAT structure! First product:', first.product);
      } else if (first.product) {
        console.log('\n=> NESTED structure!');
        if (Array.isArray(first.product)) {
          console.log('Nested products count:', first.product.length);
          console.log('First nested:', first.product[0]?.product);
        }
      }
    }
  }
})();
