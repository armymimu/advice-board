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

  console.log('Token obtained');

  // Test with take=20, skip=0
  const test1 = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
    category: 'search', category_sub: '', product: '', keyword: 'iphone',
    take: 20, skip: 0, refSearch: '', page: 'product',
    arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false
  }, { headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'Authorization': token } });

  const d1 = test1.data.data;
  console.log('\n=== Page 1 (take=20, skip=0) ===');
  console.log('Keys:', Object.keys(d1));
  console.log('Product groups:', d1.product?.length);
  let count1 = 0;
  if (d1.product) d1.product.forEach(g => { if (g.product) count1 += g.product.length; });
  console.log('Total products in response:', count1);
  if (d1.count_product !== undefined) console.log('count_product:', d1.count_product);
  if (d1.total !== undefined) console.log('total:', d1.total);
  if (d1.totalPage !== undefined) console.log('totalPage:', d1.totalPage);

  // Test with take=20, skip=20
  const test2 = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
    category: 'search', category_sub: '', product: '', keyword: 'iphone',
    take: 20, skip: 20, refSearch: '', page: 'product',
    arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false
  }, { headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'Authorization': token } });

  const d2 = test2.data.data;
  console.log('\n=== Page 2 (take=20, skip=20) ===');
  let count2 = 0;
  if (d2.product) d2.product.forEach(g => { if (g.product) count2 += g.product.length; });
  console.log('Total products in response:', count2);
  if (d2.product && d2.product[0] && d2.product[0].product && d2.product[0].product[0]) {
    console.log('First product:', d2.product[0].product[0].product);
  }

  // Test page 3
  const test3 = await axios.post('https://prodbackadvice.advice.in.th/api/v1.0.0/product/get', {
    category: 'search', category_sub: '', product: '', keyword: 'iphone',
    take: 20, skip: 40, refSearch: '', page: 'product',
    arr_filter_brand: [], arr_filter_ict: [], arr_filter_price_ict: [], arr_filter_cate: [], addView: false
  }, { headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.advice.co.th', 'Referer': 'https://www.advice.co.th/', 'Authorization': token } });

  const d3 = test3.data.data;
  console.log('\n=== Page 3 (take=20, skip=40) ===');
  let count3 = 0;
  if (d3.product) d3.product.forEach(g => { if (g.product) count3 += g.product.length; });
  console.log('Total products in response:', count3);
  
  console.log('\n=== Total across pages ===');
  console.log('Total:', count1 + count2 + count3);
})();
