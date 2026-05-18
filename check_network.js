const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  
  page.on('response', async (response) => {
    if (response.url().includes('api') || response.url().includes('search')) {
      if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
        console.log('API Request:', response.url());
      }
    }
  });

  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('https://www.advice.co.th/product/search?keyword=iphone', {waitUntil: 'networkidle2'});
  await page.waitForSelector('.list-product');
  await browser.close();
})();
