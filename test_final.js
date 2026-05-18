const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');
const fs = require('fs');

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

  // Get all iPhones with large take
  const resp = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
    category: 'iphone', category_sub: '', product: '', keyword: '',
    take: 100, skip: 0, refSearch: '', page: 'product',
    arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false
  }, { headers });

  const d = resp.data.data;
  const product = d.product;
  
  // Product is an object with numeric keys
  const allProducts = [];
  
  for (const [pageKey, pageData] of Object.entries(product)) {
    console.log(`\nPage ${pageKey}:`);
    console.log(`  Category: ${pageData.category?.category_name}`);
    console.log(`  Products count: ${pageData.product?.length}`);
    
    if (pageData.product) {
      pageData.product.forEach(p => {
        allProducts.push({
          name: p.product,
          code: p.code,
          price_sale: p.price_sale,
          price_srp: p.price_srp,
          spec: p.spec,
          brand: p.brand,
          type: p.type,
          url: p.product_url
        });
      });
    }
  }
  
  console.log(`\n=== Total products: ${allProducts.length} ===`);
  console.log(`count_product from API: ${d.count_product}`);
  
  allProducts.forEach((p, i) => {
    console.log(`${i+1}. ${p.name} → ฿${p.price_sale?.toLocaleString()}`);
  });
})();
