const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  
  const apiCalls = [];
  
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('prodbackadvice') || url.includes('advice.in.th')) {
      apiCalls.push({
        url: url,
        method: request.method(),
        postData: request.postData() || null,
        headers: request.headers()
      });
    }
  });

  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('https://www.advice.co.th/product/search?keyword=iphone', {waitUntil: 'networkidle2'});
  await page.waitForSelector('.list-product');
  
  console.log('=== API Calls Found ===');
  apiCalls.forEach((call, i) => {
    console.log(`\n--- Call ${i + 1} ---`);
    console.log('URL:', call.url);
    console.log('Method:', call.method);
    if (call.postData) {
      console.log('PostData:', call.postData.substring(0, 500));
    }
  });
  
  await browser.close();
})();
