const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  
  let token = '';
  page.on('request', (request) => {
    if (request.url().includes('prodbackadvice') && request.url().includes('product/get') && request.method() === 'POST') {
      const h = request.headers();
      if (h['authorization'] && !token) token = h['authorization'];
    }
  });

  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('https://www.advice.co.th/product/search?keyword=iphone', {waitUntil: 'networkidle2'});
  await page.waitForSelector('.list-product');
  
  // Also intercept the actual request body to see refSearch
  let capturedRefSearch = '';
  page.on('request', (request) => {
    if (request.url().includes('product/get') && request.method() === 'POST') {
      try {
        const body = JSON.parse(request.postData());
        if (body.refSearch) capturedRefSearch = body.refSearch;
      } catch(e) {}
    }
  });
  
  await browser.close();

  console.log('RefSearch:', capturedRefSearch);

  // Try direct category access for iphone
  const headers = { 'Content-Type': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'Authorization': token };

  // Method 1: Try category-based search
  console.log('\n=== Method 1: category=iphone ===');
  try {
    const r1 = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
      category: 'iphone', category_sub: '', product: '', keyword: '',
      take: 100, skip: 0, refSearch: '', page: 'product',
      arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false
    }, { headers });
    const d = r1.data.data;
    let total = 0;
    d.product.forEach(g => { total += g.product ? g.product.length : 0; });
    console.log('Groups:', d.product.length, 'Total products:', total);
    d.product.forEach((g,i) => console.log(`  Group ${i}: ${g.category} - ${g.count_product} total, ${g.product?.length} returned`));
  } catch(e) { console.log('Error:', e.message); }

  // Method 2: Try larger take
  console.log('\n=== Method 2: take=1000 ===');
  try {
    const r2 = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
      category: 'search', category_sub: '', product: '', keyword: 'iphone',
      take: 1000, skip: 0, refSearch: '', page: 'product',
      arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false
    }, { headers });
    const d = r2.data.data;
    let total = 0;
    d.product.forEach(g => { total += g.product ? g.product.length : 0; });
    console.log('Groups:', d.product.length, 'Total products:', total);
    d.product.forEach((g,i) => console.log(`  Group ${i}: ${g.category} - ${g.count_product} total, ${g.product?.length} returned`));
  } catch(e) { console.log('Error:', e.message); }

  // Method 3: Filter by Apple brand
  console.log('\n=== Method 3: arr_filter_cate with APPLE PRODUCTS ===');
  try {
    const r3 = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
      category: 'search', category_sub: '', product: '', keyword: 'iphone',
      take: 100, skip: 0, refSearch: '', page: 'product',
      arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], 
      arr_filter_cate: ['APPLE PRODUCTS'], addView: false
    }, { headers });
    const d = r3.data.data;
    let total = 0;
    d.product.forEach(g => { total += g.product ? g.product.length : 0; });
    console.log('Groups:', d.product.length, 'Total products:', total);
    d.product.forEach((g,i) => console.log(`  Group ${i}: ${g.category} - ${g.count_product} total, ${g.product?.length} returned`));
  } catch(e) { console.log('Error:', e.message); }
})();
