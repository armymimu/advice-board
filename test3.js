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
  
  await page.goto('https://www.advice.co.th/product/search?keyword=iphone', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.list-product');
  
  const html = await page.evaluate(() => {
    return document.querySelector('.list-product').innerHTML;
  });
  
  console.log(html);
  await browser.close();
})();
