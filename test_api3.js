const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  
  let token = '';
  
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('prodbackadvice') && url.includes('product/get') && request.method() === 'POST') {
      const h = request.headers();
      if (h['authorization'] && !token) {
        token = h['authorization'];
      }
    }
  });

  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('https://www.advice.co.th/product/search?keyword=iphone', {waitUntil: 'networkidle2'});
  await page.waitForSelector('.list-product');
  
  console.log('Token:', token);
  
  // Now call API with axios using the token
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
      'Authorization': token,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
    }
  });

  const data = resp.data;
  console.log('\nResponse type:', typeof data);
  console.log('Response keys:', Object.keys(data));
  
  // Try to print the full structure
  const str = JSON.stringify(data, null, 2);
  console.log('Response (first 3000 chars):', str.substring(0, 3000));
  
  await browser.close();
})();
