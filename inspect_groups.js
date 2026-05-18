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
  await browser.close();

  const resp = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
    category: 'search', category_sub: '', product: '', keyword: 'iphone',
    take: 20, skip: 0, refSearch: '', page: 'product',
    arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false
  }, { headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'Authorization': token } });

  const groups = resp.data.data.product;
  console.log('Number of product groups:', groups.length);
  
  groups.forEach((group, i) => {
    // Show all keys except product array
    const info = {};
    Object.keys(group).forEach(k => {
      if (k !== 'product') info[k] = group[k];
    });
    console.log(`\n=== Group ${i+1} ===`);
    console.log('Info:', JSON.stringify(info, null, 2).substring(0, 500));
    console.log('Products count:', group.product ? group.product.length : 0);
    if (group.product && group.product.length > 0) {
      console.log('First product:', group.product[0].product);
      console.log('Last product:', group.product[group.product.length - 1].product);
    }
  });

  // Check categories
  const cats = resp.data.data.category;
  if (cats) {
    console.log('\n=== Categories ===');
    cats.forEach(c => {
      console.log(`  ${c.category_name || c.name}: ${c.count || c.total || 'N/A'}`);
    });
  }
})();
