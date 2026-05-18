const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  
  await page.goto('https://www.advice.co.th/product/search?keyword=iphone', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 5000));
  
  await page.screenshot({ path: 'screenshot.png' });
  await browser.close();
})();
