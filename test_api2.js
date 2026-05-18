const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

(async () => {
  // Step 1: Use Puppeteer to get cookies/tokens
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  
  let authHeaders = {};
  
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('prodbackadvice') && url.includes('product/get') && request.method() === 'POST') {
      authHeaders = request.headers();
      console.log('Captured headers:', JSON.stringify(authHeaders, null, 2));
    }
  });

  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('https://www.advice.co.th/product/search?keyword=iphone', {waitUntil: 'networkidle2'});
  await page.waitForSelector('.list-product');
  
  // Step 2: Now use those headers to call API directly with take=500
  try {
    const resp = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
      category: 'search',
      category_sub: '',
      product: '',
      keyword: 'iphone',
      take: 500,
      skip: 0,
      refSearch: '',
      page: 'product',
      arr_filter_brand: [],
      arr_filter_ict: [],
      arr_filter_price_ict: [],
      arr_filter_cate: [],
      addView: false
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.advice.co.th',
        'Referer': 'https://www.advice.co.th/',
        'Authorization': authHeaders['authorization'] || '',
        'Cookie': authHeaders['cookie'] || ''
      }
    });

    const data = resp.data;
    console.log('\n=== API Response ===');
    console.log('Status:', resp.status);
    
    if (data.data) {
      if (data.data.products) {
        console.log('Products count:', data.data.products.length);
        // Show first product structure
        if (data.data.products.length > 0) {
          const p = data.data.products[0];
          console.log('\nFirst product:', JSON.stringify({
            product_name: p.product_name,
            price_sale: p.price_sale,
            price_srp: p.price_srp,
            brand: p.brand,
            spec: p.spec,
            code: p.code
          }, null, 2));
        }
      }
      if (data.data.total !== undefined) {
        console.log('Total available:', data.data.total);
      }
    }
  } catch (e) {
    console.error('API Error:', e.message);
  }
  
  await browser.close();
})();
